"""项目跟进和评估模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Enum as SQLEnum, Index, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, FollowUpMethod


class ProjectFollowUp(BaseModel):
    """项目跟进记录表."""

    __tablename__ = "project_follow_ups"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    # DB列名 method（由 Task 23 rename 迁移统一），Python 属性名暂保留 follow_up_type
    follow_up_type: Mapped[FollowUpMethod] = mapped_column(
        "method",
        SQLEnum(FollowUpMethod, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="跟进方式",
    )
    content: Mapped[str | None] = mapped_column(Text, nullable=True, comment="跟进详情")
    follow_up_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="跟进时间")
    follower_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="跟进人ID")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_followup_project", "project_id"),
        Index("idx_followup_date", "follow_up_at"),
        Index("idx_followup_deleted", "is_deleted"),
    )


class ProjectEvaluation(BaseModel):
    """项目评估记录表."""

    __tablename__ = "project_evaluations"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    evaluation_type: Mapped[str] = mapped_column(String(20), nullable=False, comment="评估类型")
    evaluation_price: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="评估价格(万)")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="评估备注")
    evaluator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="评估人ID")
    evaluation_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="评估时间")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_evaluation_project", "project_id"),
        Index("idx_evaluation_date", "evaluation_at"),
        Index("idx_evaluation_deleted", "is_deleted"),
    )
