"""
数据库模型定义
包含所有 6 个表: communities, community_aliases, property_current, 
property_history, property_media, failed_records
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, Float, DateTime, Boolean, Text,
    ForeignKey, Index, UniqueConstraint, Enum as SQLEnum
)
from sqlalchemy.orm import declarative_base, relationship
import enum


Base = declarative_base()


class PropertyStatus(str, enum.Enum):
    """房源状态枚举"""
    FOR_SALE = "在售"
    SOLD = "成交"


class ChangeType(str, enum.Enum):
    """变更类型枚举"""
    PRICE_CHANGE = "price_change"
    STATUS_CHANGE = "status_change"
    INFO_CHANGE = "info_change"


class MediaType(str, enum.Enum):
    """媒体类型枚举"""
    FLOOR_PLAN = "floor_plan"  # 户型图
    INTERIOR = "interior"  # 室内图
    EXTERIOR = "exterior"  # 外观图
    OTHER = "other"


# ==================== 1. communities (小区字典) ====================
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


# ==================== 2. community_aliases (小区别名映射) ====================
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


# ==================== 3. property_current (房源当前状态) ====================
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
    
    # 约束和索引
    __table_args__ = (
        UniqueConstraint("data_source", "source_property_id", name="uq_source_property"),
        Index("idx_community_price", "community_id", "listed_price_wan"),
        Index("idx_owner_visibility", "owner_id", "visibility"),
        Index("idx_status", "status"),
    )
    
    def __repr__(self):
        return f"<PropertyCurrent(id={self.id}, source={self.data_source}, property_id='{self.source_property_id}')>"


# ==================== 4. property_history (历史快照) ====================
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


# ==================== 5. property_media (媒体资源) ====================
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
    
    def __repr__(self):
        return f"<PropertyMedia(id={self.id}, type={self.media_type}, property='{self.source_property_id}')>"


# ==================== 6. failed_records (失败收容所) ====================
class FailedRecord(Base):
    """失败记录表 - 零丢失保障"""
    __tablename__ = "failed_records"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    
    # 来源信息
    data_source = Column(String(50), nullable=True, comment="数据来源")
    
    # 原始数据
    payload = Column(Text, nullable=False, comment="原始数据(JSON)")
    
    # 失败信息
    failure_type = Column(String(50), nullable=False, comment="失败类型")
    failure_reason = Column(Text, nullable=False, comment="失败原因")
    
    # 元数据
    occurred_at = Column(DateTime, default=datetime.now, comment="发生时间")
    is_handled = Column(Boolean, default=False, comment="是否已处理")
    handled_at = Column(DateTime, nullable=True, comment="处理时间")
    handler_notes = Column(Text, nullable=True, comment="处理备注")
    
    # 索引
    __table_args__ = (
        Index("idx_unhandled", "data_source", "is_handled", "occurred_at"),
    )
    
    def __repr__(self):
        return f"<FailedRecord(id={self.id}, type='{self.failure_type}', handled={self.is_handled})>"


# ==================== 数据库初始化函数 ====================
def create_all(engine):
    """创建所有表"""
    Base.metadata.create_all(engine)
    return engine
