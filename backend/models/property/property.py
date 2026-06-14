"""房源相关模型.

包含房源当前状态和历史快照表.
"""

from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from models.common.base import Base, ChangeType, PropertyStatus


class PropertyCurrent(Base):
    """房源当前状态表."""

    __tablename__ = "property_current"

    # 主键
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 唯一标识
    data_source: Mapped[str] = mapped_column(String(50), nullable=False, comment="数据来源(链家/贝壳等)")
    source_property_id: Mapped[str] = mapped_column(String(100), nullable=False, comment="来源平台的房源ID")

    # 关联小区
    community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="小区ID")

    # 核心字段
    status: Mapped[PropertyStatus] = mapped_column(SQLEnum(PropertyStatus), nullable=False, comment="状态")
    property_type: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="物业类型")

    # 户型信息
    rooms: Mapped[int] = mapped_column(Integer, nullable=False, comment="室")
    halls: Mapped[int] = mapped_column(Integer, default=0, comment="厅")
    baths: Mapped[int] = mapped_column(Integer, default=0, comment="卫")
    orientation: Mapped[str] = mapped_column(String(50), nullable=False, comment="朝向")

    # 楼层信息
    floor_original: Mapped[str] = mapped_column(String(50), nullable=False, comment="原始楼层字符串")
    floor_number: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="楼层数")
    total_floors: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="总楼层数")
    floor_level: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="楼层级别(低/中/高)")

    # 面积信息
    build_area: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, comment="建筑面积(㎡)")
    inner_area: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True, comment="套内面积(㎡)")

    # 价格信息 - 在售
    listed_price_wan: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="挂牌价(万)")
    listed_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="上架时间")

    # 价格信息 - 成交
    sold_price_wan: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="成交价(万)")
    sold_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="成交时间")

    # 建筑信息
    build_year: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="建筑年代")
    building_structure: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="建筑结构")
    decoration: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="装修情况")
    elevator: Mapped[bool | None] = mapped_column(Boolean, nullable=True, comment="是否有电梯")

    # 产权信息
    ownership_type: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="产权性质")
    ownership_years: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="产权年限")
    last_transaction: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="上次交易")

    # 其他信息
    heating_method: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="供暖方式")
    listing_remarks: Mapped[str | None] = mapped_column(Text, nullable=True, comment="房源描述")

    # 元数据
    owner_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="推送用户ID")
    visibility: Mapped[str] = mapped_column(String(20), default="private", comment="可见性(预留)")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否激活")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="更新时间",
    )

    # 关系
    community = relationship("Community", back_populates="properties", primaryjoin="foreign(PropertyCurrent.community_id) == Community.id")
    property_media = relationship(
        "PropertyMedia",
        primaryjoin="and_(PropertyCurrent.data_source==PropertyMedia.data_source, "
        "PropertyCurrent.source_property_id==PropertyMedia.source_property_id)",
        foreign_keys="[PropertyMedia.data_source, PropertyMedia.source_property_id]",
        lazy="select",
        viewonly=True,
    )

    # 约束和索引
    __table_args__ = (
        UniqueConstraint("data_source", "source_property_id", name="uq_source_property"),
        Index("idx_community_price", "community_id", "listed_price_wan"),
        Index("idx_owner_visibility", "owner_id", "visibility"),
        Index("idx_status", "status"),
        # 价格范围查询索引
        Index("idx_price_range", "listed_price_wan", "sold_price_wan"),
        # 面积查询索引
        Index("idx_area_range", "build_area"),
        # 房型查询索引
        Index("idx_rooms", "rooms"),
        # 楼层信息查询索引
        Index("idx_floor_info", "floor_level", "floor_number"),
        # 日期范围查询索引
        Index("idx_dates", "listed_date", "sold_date", "updated_at"),
        # 建筑年代查询索引
        Index("idx_build_year", "build_year"),
        # 物业类型查询索引
        Index("idx_property_type", "property_type"),
        # 朝向查询索引
        Index("idx_orientation", "orientation"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<PropertyCurrent(id={self.id}, source={self.data_source}, property_id='{self.source_property_id}')>"


class PropertyHistory(Base):
    """房源历史快照表."""

    __tablename__ = "property_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # 关联原房源
    data_source: Mapped[str] = mapped_column(String(50), nullable=False, comment="数据来源")
    source_property_id: Mapped[str] = mapped_column(String(100), nullable=False, comment="来源平台的房源ID")

    # 变更信息
    change_type: Mapped[ChangeType] = mapped_column(SQLEnum(ChangeType), nullable=False, comment="变更类型")
    captured_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="快照时间")

    # 快照的核心字段
    status: Mapped[PropertyStatus] = mapped_column(SQLEnum(PropertyStatus), nullable=False, comment="状态")
    community_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="小区ID")
    rooms: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="室")
    build_area: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True, comment="建筑面积")
    listed_price_wan: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="挂牌价(万)")
    sold_price_wan: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="成交价(万)")
    listed_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="上架时间")
    sold_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="成交时间")

    # 其他可能变化的字段
    floor_original: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="楼层")
    orientation: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="朝向")
    decoration: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="装修情况")

    # 索引
    __table_args__ = (Index("idx_history_lookup", "data_source", "source_property_id", "captured_at"),)

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<PropertyHistory(id={self.id}, property='{self.source_property_id}', captured_at={self.captured_at})>"
