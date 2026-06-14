"""互动过程模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ProjectInteraction(BaseModel):
    """互动过程明细表（替换sales_records）."""

    __tablename__ = "project_interactions"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    record_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="互动类型")
    interaction_target: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="互动对象")
    content: Mapped[str | None] = mapped_column(Text, nullable=True, comment="互动详情")
    interaction_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="互动时间")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="操作人ID")

    price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="出价金额(万)")

    __table_args__ = (
        Index("idx_interaction_project", "project_id"),
        Index("idx_interaction_date", "interaction_at"),
        Index("idx_interaction_type", "record_type"),
    )
