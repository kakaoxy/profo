"""
项目跟进和评估模型
"""
from sqlalchemy import Column, String, Numeric, DateTime, Text, ForeignKey, Index

from .base import BaseModel


class ProjectFollowUp(BaseModel):
    """项目跟进记录表"""
    __tablename__ = "project_follow_ups"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    follow_up_type = Column(String(20), nullable=False, comment="跟进方式")
    content = Column(Text, nullable=True, comment="跟进详情")
    follow_up_at = Column(DateTime, nullable=False, comment="跟进时间")
    follower_id = Column(String(36), nullable=True, comment="跟进人ID")

    __table_args__ = (
        Index("idx_followup_project", "project_id"),
        Index("idx_followup_date", "follow_up_at"),
    )


class ProjectEvaluation(BaseModel):
    """项目评估记录表"""
    __tablename__ = "project_evaluations"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    evaluation_type = Column(String(20), nullable=False, comment="评估类型")
    evaluation_price = Column(Numeric(15, 2), nullable=False, comment="评估价格(万)")
    remark = Column(Text, nullable=True, comment="评估备注")
    evaluator_id = Column(String(36), nullable=True, comment="评估人ID")
    evaluation_at = Column(DateTime, nullable=False, comment="评估时间")

    __table_args__ = (
        Index("idx_evaluation_project", "project_id"),
        Index("idx_evaluation_date", "evaluation_at"),
    )