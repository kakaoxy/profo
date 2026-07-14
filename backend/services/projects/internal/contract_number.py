"""合同编号生成器模块.

负责生成唯一的合同编号，采用「预占式」生成保证并发安全。
格式: SH + 4位自增序号 + - + 后缀，如 SH0028-SG (代理美化) / SH0028-DL (收购美化)
序号从 28 开始，SG 与 DL 共享同一序号空间。

并发安全设计：
- 生成时立即 INSERT 一条 contract_status="reserved" 的占位记录，使用独立连接提交，
  利用 DB 唯一约束（idx_contract_no）保证编号唯一，且不影响调用方会话的事务语义
- 单进程内用 threading.Lock 串行化，减少 IntegrityError 重试
- 多进程下 DB 唯一约束兜底，捕获 IntegrityError 后重试
- 项目创建时（creator）通过 contract_no 找到占位记录并更新为正式记录
"""

import threading
import uuid
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from sqlalchemy import Integer, cast, func, insert
from sqlalchemy.exc import IntegrityError

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

# 业务形式 -> 合同编号后缀映射
_BUSINESS_FORM_SUFFIX: dict[str, str] = {
    "agent": "SG",
    "wholesale": "DL",
}

# 序号起始值（无历史合同时从此值开始）
_INITIAL_SEQUENCE = 28

# 单进程内合同编号生成锁（多进程靠 DB 唯一约束兜底）
_generate_lock = threading.Lock()


class ContractNumberGenerator:
    """合同编号生成器.

    使用「预占式」生成 + DB 唯一约束 + 重试机制保证并发安全。
    序号在 SG/DL 两种后缀间共享。

    Attributes:
        db: SQLAlchemy数据库会话
        max_retries: 最大重试次数，防止无限循环

    """

    def __init__(self, db: "Session", max_retries: int = 3) -> None:
        """初始化合同编号生成器.

        Args:
            db: SQLAlchemy数据库会话
            max_retries: 最大重试次数，默认为3

        """
        self.db = db
        self.max_retries = max_retries

    def generate(self, business_form: str) -> str:
        """生成下一个合同编号（预占式，并发安全）.

        格式: SH + 4位自增序号 + - + 后缀
        - agent(代理美化) -> SG，如 SH0028-SG
        - wholesale(收购美化) -> DL，如 SH0028-DL
        序号在两种后缀间共享，从 28 开始递增。

        生成后立即 INSERT 一条 contract_status="reserved" 的占位记录，
        使用独立连接提交（不影响调用方会话的事务语义），
        利用 DB 唯一约束保证编号唯一。项目创建时 creator 会更新该占位记录。

        Args:
            business_form: 业务形式，agent 或 wholesale

        Returns:
            新生成的合同编号

        Raises:
            ValueError: business_form 非 agent/wholesale 时抛出
            RuntimeError: 当无法生成唯一编号时（超过最大重试次数）

        """
        suffix = _BUSINESS_FORM_SUFFIX.get(business_form)
        if suffix is None:
            msg = f"无效的 business_form: {business_form}，仅支持 agent/wholesale"
            raise ValueError(msg)

        from models import ProjectContract  # noqa: PLC0415

        # 单进程内串行化，减少 IntegrityError 重试
        with _generate_lock:
            for attempt in range(self.max_retries):
                # 在数据库侧计算最大序号，避免全表扫描后 Python 逐行解析
                # 格式 SH####-XX：SUBSTR(contract_no, 3, 4) 提取 4 位序号，
                # CAST 为 INTEGER 后用 MAX 聚合，避免字符串字典序比较的跨位数问题
                max_num = (
                    self.db.query(func.max(cast(func.substr(ProjectContract.contract_no, 3, 4), Integer)))
                    .filter(ProjectContract.contract_no.like("SH%-%"))
                    .scalar()
                )
                next_num = (max_num + 1) if max_num else _INITIAL_SEQUENCE

                new_contract_no = f"SH{next_num:04d}-{suffix}"

                # 预占式：通过独立连接 INSERT 占位记录并提交，利用 DB 唯一约束防重。
                # 使用 engine.begin() 而非 self.db.commit()，避免提交调用方会话中
                # 未提交的变更，破坏外层事务语义。
                now = datetime.now(timezone.utc)
                try:
                    with self.db.bind.begin() as conn:
                        conn.execute(
                            insert(ProjectContract.__table__).values(
                                id=str(uuid.uuid4()),
                                project_id=str(uuid.uuid4()),  # 临时 project_id，creator 时更新
                                contract_no=new_contract_no,
                                contract_status="reserved",  # 占位状态，creator 时改为正式状态
                                is_deleted=False,
                                created_at=now,
                                updated_at=now,
                            )
                        )
                except IntegrityError:
                    # 并发冲突：编号已被其他事务预占，重试
                    if attempt < self.max_retries - 1:
                        continue
                    msg = f"无法生成唯一的合同编号，已超过最大重试次数({self.max_retries})"
                    raise RuntimeError(msg) from None
                return new_contract_no

        msg = f"无法生成唯一的合同编号，已超过最大重试次数({self.max_retries})"
        raise RuntimeError(msg)
