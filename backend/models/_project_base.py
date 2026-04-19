"""
项目主表核心模型
"""
from sqlalchemy import Column, String, Numeric, Boolean, Enum as SQLEnum, Index, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from datetime import datetime, timezone

from .base import BaseModel, ProjectStatus, RenovationStage


class Project(BaseModel):
    """项目主表 - 仅保留核心基础信息"""
    __tablename__ = "projects"

    name = Column(String(700), nullable=False, comment="项目名称(自动生成:小区名称+地址)")
    community_name = Column(String(200), nullable=False, comment="小区名称")
    address = Column(String(500), nullable=False, comment="物业地址")

    project_manager_id = Column(String(36), ForeignKey("users.id"), nullable=True, comment="项目负责人ID")

    area = Column(Numeric(10, 2), nullable=True, comment="产证面积(m²)")
    layout = Column(String(50), nullable=True, comment="户型(展示用)")
    orientation = Column(String(50), nullable=True, comment="朝向")

    status = Column(SQLEnum(ProjectStatus, values_callable=lambda x: [e.value for e in x]), nullable=False, default=ProjectStatus.SIGNING, comment="项目状态")
    renovation_stage = Column(SQLEnum(RenovationStage, values_callable=lambda x: [e.value for e in x]), nullable=True, comment="改造子阶段")

    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc), nullable=False)

    __table_args__ = (
        Index("idx_project_status", "status"),
        Index("idx_project_deleted", "is_deleted"),
        Index("idx_project_manager", "project_manager_id"),
    )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        if not self.name or self.name == "未命名项目":
            self.name = self.generate_name()

    def generate_name(self) -> str:
        """自动生成项目名称: 小区名称 + 地址"""
        parts = []
        if self.community_name:
            parts.append(self.community_name)
        if self.address:
            parts.append(self.address)
        return " - ".join(parts) if parts else "未命名项目"