"""项目状态流转日志模型."""

from datetime import datetime

from sqlalchemy import DateTime, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ProjectStatusLog(BaseModel):
    """项目状态流转日志表."""

    __tablename__ = "project_status_logs"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    old_status: Mapped[str] = mapped_column(String(20), nullable=False, comment="变更前状态")
    new_status: Mapped[str] = mapped_column(String(20), nullable=False, comment="变更后状态")
    trigger_event: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="触发事件")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="操作人ID")
    operate_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="变更时间")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="变更说明")

    __table_args__ = (
        Index("idx_statuslog_project", "project_id"),
        Index("idx_statuslog_date", "operate_at"),
    )
