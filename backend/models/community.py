"""
小区相关模型
包含Community和CommunityAlias表
"""
from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from .base import Base


class Community(Base):
    """小区表"""
    __tablename__ = "communities"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False, unique=True, comment="小区名称(标准化)")
    city_id = Column(Integer, nullable=True, comment="城市ID")
    district = Column(String(100), nullable=True, comment="行政区")
    business_circle = Column(String(100), nullable=True, comment="商圈")
    avg_price_wan = Column(Float, nullable=True, comment="小区均价(万)")
    total_properties = Column(Integer, default=0, comment="房源总数")
    is_active = Column(Boolean, default=True, comment="是否激活(软删除)")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")
    
    # 关系
    properties = relationship("PropertyCurrent", back_populates="community")
    aliases = relationship("CommunityAlias", back_populates="community")
    
    def __repr__(self):
        return f"<Community(id={self.id}, name='{self.name}')>"


class CommunityAlias(Base):
    """小区别名表 - 用于小区合并后的别名查找"""
    __tablename__ = "community_aliases"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False, comment="关联的主小区ID")
    alias_name = Column(String(200), nullable=False, comment="别名")
    data_source = Column(String(50), nullable=False, comment="数据来源")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    
    # 关系
    community = relationship("Community", back_populates="aliases")
    
    # 唯一约束: 同一数据源的别名不能重复
    __table_args__ = (
        UniqueConstraint("alias_name", "data_source", name="uq_alias_source"),
    )
    
    def __repr__(self):
        return f"<CommunityAlias(alias='{self.alias_name}', community_id={self.community_id})>"