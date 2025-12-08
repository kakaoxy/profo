"""
媒体资源相关模型
包含PropertyMedia表
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, DateTime, UniqueConstraint, Index, Enum as SQLEnum
from sqlalchemy.orm import relationship
from .base import Base, MediaType


class PropertyMedia(Base):
    """房源媒体资源表"""
    __tablename__ = "property_media"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 关联房源
    data_source = Column(String(50), nullable=False, comment="数据来源")
    source_property_id = Column(String(100), nullable=False, comment="来源平台的房源ID")
    
    # 媒体信息
    media_type = Column(SQLEnum(MediaType), nullable=False, comment="媒体类型")
    url = Column(String(500), nullable=False, comment="媒体URL")
    description = Column(String(200), nullable=True, comment="描述")
    sort_order = Column(Integer, default=0, comment="排序")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    
    # 约束和索引
    __table_args__ = (
        UniqueConstraint("data_source", "source_property_id", "url", name="uq_property_media_url"),
        Index("idx_property_media", "source_property_id", "data_source", "media_type"),
    )
    
    # 关系 - 移除反向关系，避免方向冲突
    # property = relationship(...)  # 注释掉反向关系

    def __repr__(self):
        return f"<PropertyMedia(id={self.id}, type={self.media_type}, property='{self.source_property_id}')>"