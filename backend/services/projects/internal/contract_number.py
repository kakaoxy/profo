"""合同编号生成器模块.

负责生成唯一的合同编号，采用线程安全的设计。
格式: SH + 4位自增序号 + - + 后缀，如 SH0028-SG (代理美化) / SH0028-DL (收购美化)
序号从 28 开始，SG 与 DL 共享同一序号空间。
"""

import time
from typing import TYPE_CHECKING

from sqlalchemy import func

if TYPE_CHECKING:
    from sqlalchemy.orm import Session

# 业务形式 -> 合同编号后缀映射
_BUSINESS_FORM_SUFFIX: dict[str, str] = {
    "agent": "SG",
    "wholesale": "DL",
}

# 序号起始值（无历史合同时从此值开始）
_INITIAL_SEQUENCE = 28


class ContractNumberGenerator:
    """合同编号生成器.

    使用数据库唯一约束和重试机制保证并发安全，避免重复编号。
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
        """生成下一个合同编号（线程安全）.

        格式: SH + 4位自增序号 + - + 后缀
        - agent(代理美化) -> SG，如 SH0028-SG
        - wholesale(收购美化) -> DL，如 SH0028-DL
        序号在两种后缀间共享，从 28 开始递增。

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

        for attempt in range(self.max_retries):
            # 查询所有 SH 开头的合同编号，取最大序号（SG/DL 共享序号空间）
            result = (
                self.db.query(
                    func.max(ProjectContract.contract_no),
                )
                .filter(
                    ProjectContract.contract_no.like("SH%-%"),
                )
                .scalar()
            )

            if result:
                try:
                    # 格式 SH0028-SG，取中间数字部分
                    num_part = result.split("-")[0]
                    last_num = int(num_part[2:])  # 去掉 "SH" 前缀
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = _INITIAL_SEQUENCE
            else:
                next_num = _INITIAL_SEQUENCE

            new_contract_no = f"SH{next_num:04d}-{suffix}"

            # 检查该编号是否已存在（双重验证）
            existing = (
                self.db.query(ProjectContract)
                .filter(
                    ProjectContract.contract_no == new_contract_no,
                )
                .first()
            )

            if not existing:
                return new_contract_no

            # 如果存在，说明并发冲突，继续循环生成下一个
            # 添加短暂延迟，让其他事务完成
            if attempt < self.max_retries - 1:
                time.sleep(0.01 * (attempt + 1))  # 指数退避

        msg = f"无法生成唯一的合同编号，已超过最大重试次数({self.max_retries})"
        raise RuntimeError(msg)
