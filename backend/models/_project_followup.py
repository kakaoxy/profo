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

    def validate_user_references(self, db) -> None:
        """验证软引用的用户ID是否存在且有效"""
        from .user import User
        if self.follower_id:
            user = db.query(User).filter(
                User.id == self.follower_id,
                User.status == "active"
            ).first()
            if not user:
                raise ValueError(f"无效的跟进人ID: {self.follower_id}")


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

    def validate_user_references(self, db) -> None:
        """验证软引用的用户ID是否存在且有效"""
        from .user import User
        if self.evaluator_id:
            user = db.query(User).filter(
                User.id == self.evaluator_id,
                User.status == "active"
            ).first()
            if not user:
                raise ValueError(f"无效的评估人ID: {self.evaluator_id}")