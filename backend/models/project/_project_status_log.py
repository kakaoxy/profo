"""
项目状态流转日志模型
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Index

from ..common.base import BaseModel


class ProjectStatusLog(BaseModel):
    """项目状态流转日志表"""
    __tablename__ = "project_status_logs"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    old_status = Column(String(20), nullable=False, comment="变更前状态")
    new_status = Column(String(20), nullable=False, comment="变更后状态")
    trigger_event = Column(String(100), nullable=True, comment="触发事件")
    operator_id = Column(String(36), nullable=True, comment="操作人ID")
    operate_at = Column(DateTime, nullable=False, comment="变更时间")
    remark = Column(Text, nullable=True, comment="变更说明")

    __table_args__ = (
        Index("idx_statuslog_project", "project_id"),
        Index("idx_statuslog_date", "operate_at"),
    )