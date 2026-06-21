"""财务流水模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, CashFlowCategory, CashFlowType


class FinanceRecord(BaseModel):
    """财务流水明细表（替换cashflow_records）."""

    __tablename__ = "finance_records"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    type: Mapped[CashFlowType] = mapped_column(
        SQLEnum(CashFlowType, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="流水类型：income/expense",
    )
    category: Mapped[CashFlowCategory] = mapped_column(
        SQLEnum(CashFlowCategory, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="费用类别",
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="金额(元)")
    record_date: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="发生日期")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="经办人ID")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_finance_project_date", "project_id", "record_date"),
        Index("idx_finance_type_category", "type", "category"),
        Index("idx_finance_deleted", "is_deleted"),
    )
