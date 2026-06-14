"""财务流水模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class FinanceRecord(BaseModel):
    """财务流水明细表（替换cashflow_records）."""

    __tablename__ = "finance_records"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    type: Mapped[str] = mapped_column(String(20), nullable=False, comment="流水类型：income/expense")
    category: Mapped[str] = mapped_column(String(50), nullable=False, comment="费用类别")
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="金额(元)")
    record_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="发生日期")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="经办人ID")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")

    __table_args__ = (
        Index("idx_finance_project_date", "project_id", "record_date"),
        Index("idx_finance_type_category", "type", "category"),
    )
