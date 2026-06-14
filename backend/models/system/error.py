"""错误处理相关模型.

包含FailedRecord表.
"""

from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base


class FailedRecord(Base):
    """失败记录表 - 零丢失保障."""

    __tablename__ = "failed_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    data_source: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="数据来源")
    payload: Mapped[str] = mapped_column(Text, nullable=False, comment="原始数据(JSON)")
    failure_type: Mapped[str] = mapped_column(String(50), nullable=False, comment="失败类型")
    failure_reason: Mapped[str] = mapped_column(Text, nullable=False, comment="失败原因")
    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="发生时间")
    is_handled: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否已处理")
    handled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="处理时间")
    handler_notes: Mapped[str | None] = mapped_column(Text, nullable=True, comment="处理备注")

    __table_args__ = (Index("idx_unhandled", "data_source", "is_handled", "occurred_at"),)

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<FailedRecord(id={self.id}, type='{self.failure_type}', handled={self.is_handled})>"
