"""
业主信息模型
"""
from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


class ProjectOwner(BaseModel):
    """业主信息表"""
    __tablename__ = "project_owners"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    owner_name = Column(String(100), nullable=True, comment="业主姓名")
    owner_phone = Column(String(20), nullable=True, comment="业主联系方式")
    owner_id_card = Column(String(18), nullable=True, comment="业主身份证号")
    relation_type = Column(String(20), nullable=False, default="业主", comment="关系类型")
    owner_info = Column(Text, nullable=True, comment="备注")

    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_owner_project", "project_id"),
    )