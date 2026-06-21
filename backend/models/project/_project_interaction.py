"""互动过程模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, RecordType


class ProjectInteraction(BaseModel):
    """互动过程明细表（替换sales_records）."""

    __tablename__ = "project_interactions"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    record_type: Mapped[RecordType] = mapped_column(
        SQLEnum(RecordType, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="互动类型",
    )
    interaction_target: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="互动对象")
    content: Mapped[str | None] = mapped_column(Text, nullable=True, comment="互动详情")
    interaction_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="互动时间")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="操作人ID")

    price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="出价金额(万)")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_interaction_project", "project_id"),
        Index("idx_interaction_date", "interaction_at"),
        Index("idx_interaction_type", "record_type"),
        Index("idx_interaction_deleted", "is_deleted"),
    )
