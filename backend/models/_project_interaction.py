"""
互动过程模型
"""
from sqlalchemy import Column, String, Numeric, DateTime, Text, ForeignKey, Index

from .base import BaseModel


class ProjectInteraction(BaseModel):
    """互动过程明细表（替换sales_records）"""
    __tablename__ = "project_interactions"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    record_type = Column(String(20), nullable=False, comment="互动类型")
    interaction_target = Column(String(100), nullable=True, comment="互动对象")
    content = Column(Text, nullable=True, comment="互动详情")
    interaction_at = Column(DateTime, nullable=False, comment="互动时间")
    operator_id = Column(String(36), nullable=True, comment="操作人ID")

    price = Column(Numeric(15, 2), nullable=True, comment="出价金额(万)")

    __table_args__ = (
        Index("idx_interaction_project", "project_id"),
        Index("idx_interaction_date", "interaction_at"),
        Index("idx_interaction_type", "record_type"),
    )