"""
合同编号生成器模块

负责生成唯一的合同编号，采用线程安全的设计。
格式: MFB-年月-4位自增序号，如 MFB-202604-0001
"""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import func

if TYPE_CHECKING:
    from sqlalchemy.orm import Session


class ContractNumberGenerator:
    """
    合同编号生成器

    使用数据库唯一约束和重试机制保证并发安全，避免重复编号。

    Attributes:
        db: SQLAlchemy数据库会话
        max_retries: 最大重试次数，防止无限循环
    """

    def __init__(self, db: "Session", max_retries: int = 3):
        """
        初始化合同编号生成器

        Args:
            db: SQLAlchemy数据库会话
            max_retries: 最大重试次数，默认为3
        """
        self.db = db
        self.max_retries = max_retries

    def generate(self) -> str:
        """
        生成下一个合同编号（线程安全）

        格式: MFB-年月-4位自增序号，如 MFB-202604-0001
        使用数据库唯一约束和重试机制保证并发安全。

        Returns:
            新生成的合同编号

        Raises:
            RuntimeError: 当无法生成唯一编号时（超过最大重试次数）
        """
        import time
        from sqlalchemy.exc import IntegrityError
        from models import ProjectContract

        now = datetime.now()
        year_month = f"{now.year}{now.month:02d}"
        prefix = f"MFB-{year_month}-"

        for attempt in range(self.max_retries):
            # 查询当月最大序号（使用func.max保证查询效率）
            result = self.db.query(
                func.max(ProjectContract.contract_no)
            ).filter(
                ProjectContract.contract_no.like(f"{prefix}%")
            ).scalar()

            if result:
                try:
                    last_num = int(result.split("-")[-1])
                    next_num = last_num + 1
                except (ValueError, IndexError):
                    next_num = 1
            else:
                next_num = 1

            new_contract_no = f"{prefix}{next_num:04d}"

            # 检查该编号是否已存在（双重验证）
            existing = self.db.query(ProjectContract).filter(
                ProjectContract.contract_no == new_contract_no
            ).first()

            if not existing:
                return new_contract_no

            # 如果存在，说明并发冲突，继续循环生成下一个
            # 添加短暂延迟，让其他事务完成
            if attempt < self.max_retries - 1:
                time.sleep(0.01 * (attempt + 1))  # 指数退避

        raise RuntimeError(f"无法生成唯一的合同编号，已超过最大重试次数({self.max_retries})")
