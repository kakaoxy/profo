"""
房源相关模型
包含房源当前状态和历史快照表
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, Text,
    ForeignKey, Index, UniqueConstraint, Enum as SQLEnum
)
from sqlalchemy.orm import relationship
from .base import Base, PropertyStatus, ChangeType


class PropertyCurrent(Base):
    """房源当前状态表"""
    __tablename__ = "property_current"
    
    # 主键
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 唯一标识
    data_source = Column(String(50), nullable=False, comment="数据来源(链家/贝壳等)")
    source_property_id = Column(String(100), nullable=False, comment="来源平台的房源ID")
    
    # 关联小区
    community_id = Column(Integer, ForeignKey("communities.id"), nullable=False, comment="小区ID")
    
    # 核心字段
    status = Column(SQLEnum(PropertyStatus), nullable=False, comment="状态")
    property_type = Column(String(50), nullable=True, comment="物业类型")
    
    # 户型信息
    rooms = Column(Integer, nullable=False, comment="室")
    halls = Column(Integer, default=0, comment="厅")
    baths = Column(Integer, default=0, comment="卫")
    orientation = Column(String(50), nullable=False, comment="朝向")
    
    # 楼层信息
    floor_original = Column(String(50), nullable=False, comment="原始楼层字符串")
    floor_number = Column(Integer, nullable=True, comment="楼层数")
    total_floors = Column(Integer, nullable=True, comment="总楼层数")
    floor_level = Column(String(20), nullable=True, comment="楼层级别(低/中/高)")
    
    # 面积信息
    build_area = Column(Float, nullable=False, comment="建筑面积(㎡)")
    inner_area = Column(Float, nullable=True, comment="套内面积(㎡)")
    
    # 价格信息 - 在售
    listed_price_wan = Column(Float, nullable=True, comment="挂牌价(万)")
    listed_date = Column(DateTime, nullable=True, comment="上架时间")
    
    # 价格信息 - 成交
    sold_price_wan = Column(Float, nullable=True, comment="成交价(万)")
    sold_date = Column(DateTime, nullable=True, comment="成交时间")
    
    # 建筑信息
    build_year = Column(Integer, nullable=True, comment="建筑年代")
    building_structure = Column(String(50), nullable=True, comment="建筑结构")
    decoration = Column(String(50), nullable=True, comment="装修情况")
    elevator = Column(Boolean, nullable=True, comment="是否有电梯")
    
    # 产权信息
    ownership_type = Column(String(50), nullable=True, comment="产权性质")
    ownership_years = Column(Integer, nullable=True, comment="产权年限")
    last_transaction = Column(String(100), nullable=True, comment="上次交易")
    
    # 其他信息
    heating_method = Column(String(50), nullable=True, comment="供暖方式")
    listing_remarks = Column(Text, nullable=True, comment="房源描述")
    
    # 元数据
    owner_id = Column(Integer, nullable=True, comment="所有者ID(预留)")
    visibility = Column(String(20), default="private", comment="可见性(预留)")
    is_active = Column(Boolean, default=True, comment="是否激活")
    created_at = Column(DateTime, default=datetime.now, comment="创建时间")
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now, comment="更新时间")
    
    # 关系
    community = relationship("Community", back_populates="properties")
    property_media = relationship(
        "PropertyMedia",
        primaryjoin="and_(PropertyCurrent.data_source==PropertyMedia.data_source, "
                   "PropertyCurrent.source_property_id==PropertyMedia.source_property_id)",
        foreign_keys="[PropertyMedia.data_source, PropertyMedia.source_property_id]",
        lazy="select",  # 默认懒加载，查询时通过selectinload覆盖
        viewonly=True   # 标记为只读关系，避免级联操作问题
    )
    
    # 约束和索引
    __table_args__ = (
        UniqueConstraint("data_source", "source_property_id", name="uq_source_property"),
        Index("idx_community_price", "community_id", "listed_price_wan"),
        Index("idx_owner_visibility", "owner_id", "visibility"),
        Index("idx_status", "status"),
    )
    
    def __repr__(self):
        return f"<PropertyCurrent(id={self.id}, source={self.data_source}, property_id='{self.source_property_id}')>"


class PropertyHistory(Base):
    """房源历史快照表"""
    __tablename__ = "property_history"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 关联原房源
    data_source = Column(String(50), nullable=False, comment="数据来源")
    source_property_id = Column(String(100), nullable=False, comment="来源平台的房源ID")
    
    # 变更信息
    change_type = Column(SQLEnum(ChangeType), nullable=False, comment="变更类型")
    captured_at = Column(DateTime, default=datetime.now, comment="快照时间")
    
    # 快照的核心字段
    status = Column(SQLEnum(PropertyStatus), nullable=False, comment="状态")
    community_id = Column(Integer, nullable=True, comment="小区ID")
    rooms = Column(Integer, nullable=True, comment="室")
    build_area = Column(Float, nullable=True, comment="建筑面积")
    listed_price_wan = Column(Float, nullable=True, comment="挂牌价(万)")
    sold_price_wan = Column(Float, nullable=True, comment="成交价(万)")
    listed_date = Column(DateTime, nullable=True, comment="上架时间")
    sold_date = Column(DateTime, nullable=True, comment="成交时间")
    
    # 其他可能变化的字段
    floor_original = Column(String(50), nullable=True, comment="楼层")
    orientation = Column(String(50), nullable=True, comment="朝向")
    decoration = Column(String(50), nullable=True, comment="装修情况")
    
    # 索引
    __table_args__ = (
        Index("idx_history_lookup", "data_source", "source_property_id", "captured_at"),
    )
    
    def __repr__(self):
        return f"<PropertyHistory(id={self.id}, property='{self.source_property_id}', captured_at={self.captured_at})>"