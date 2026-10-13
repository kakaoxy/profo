"""小区相关模型.

包含Community和CommunityAlias表.
"""

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Float,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.common.base import Base

# PostgreSQL text[] 列型（communities.property_types）
TEXTARRAY = ARRAY(String)


class Community(Base):
    """小区表."""

    __tablename__ = "communities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name: Mapped[str] = mapped_column(String(200), nullable=False, unique=True, comment="小区名称(标准化)")
    city_id: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="城市ID")
    district: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="行政区")
    business_circle: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="商圈")
    avg_price_wan: Mapped[float | None] = mapped_column(Float, nullable=True, comment="小区均价(万)")
    total_properties: Mapped[int] = mapped_column(Integer, default=0, comment="房源总数")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否激活(软删除)")

    # ===== 楼盘字典画像扩展（SRS §8 / R1，v1.9）=====
    # BD-09 小区锚点坐标（原样落库不转换，BR-18）
    lng: Mapped[float | None] = mapped_column(Float, nullable=True, comment="经度(BD-09，原样落库)")
    lat: Mapped[float | None] = mapped_column(Float, nullable=True, comment="纬度(BD-09，原样落库)")
    # 环线：内环内/中环内/外环内/外环外，允许为空（BR-04 展示「—」）
    ring: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="环线(内环内/中环内/外环内/外环外，可空)"
    )
    # 物业类型数组（如 {住宅-公寓,住宅-新里}）
    property_types: Mapped[list | None] = mapped_column(
        TEXTARRAY,
        nullable=True,
        comment="物业类型列表(text[])，如 {住宅-公寓,住宅-新里}",
    )
    # 建成年代区间（脏值导入时置空，BR-05）
    era_from: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="建成年代起(如 1980)")
    era_to: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="建成年代止(如 2010)")
    developer: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="开发商")
    property_mgmt: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="物业公司")
    # 小区地址（含区域板块前缀，如「青浦盈浦;万寿新村」中的地址部分）
    address: Mapped[str | None] = mapped_column(String(300), nullable=True, comment="小区地址(可空)")
    # 数据来源：admin 后台补录 / review 审核转正（import 值域已废止，BR-20/SRS §8）
    source: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="数据来源(admin/review)，import 值域废止"
    )
    # 被并入主档的主小区 ID（v1.9 合并信息区块与解除合并依据；可空逻辑自指）
    merged_into_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, comment="被并入的主小区ID(可空逻辑自指)"
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="更新时间",
    )

    # 关系
    properties = relationship(
        "PropertyCurrent",
        back_populates="community",
        primaryjoin="Community.id == foreign(PropertyCurrent.community_id)",
    )
    aliases = relationship(
        "CommunityAlias",
        back_populates="community",
        primaryjoin="Community.id == foreign(CommunityAlias.community_id)",
    )

    # 索引
    __table_args__ = (
        # 地理位置查询索引
        Index("idx_community_location", "district", "business_circle"),
        # 均价查询索引
        Index("idx_community_price_avg", "avg_price_wan"),
        # 活跃状态查询索引
        Index("idx_community_active", "is_active"),
        # 楼盘字典：合并信息区块查询（被并入主档的小区清单）
        Index("idx_community_merged_into", "merged_into_id"),
        # 楼盘字典：总览筛选（区+环线）
        Index("idx_community_dict_filter", "district", "ring"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<Community(id={self.id}, name='{self.name}')>"


class CommunityAlias(Base):
    """小区别名表 - 用于小区合并后的别名查找."""

    __tablename__ = "community_aliases"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联的主小区ID")
    alias_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="别名")
    data_source: Mapped[str] = mapped_column(String(50), nullable=False, comment="数据来源")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="创建时间",
    )

    # 关系
    community = relationship(
        "Community",
        back_populates="aliases",
        primaryjoin="foreign(CommunityAlias.community_id) == Community.id",
    )

    __table_args__ = (
        UniqueConstraint("alias_name", "data_source", name="uq_alias_source"),
        Index("idx_alias_deleted", "is_deleted"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<CommunityAlias(alias='{self.alias_name}', community_id={self.community_id})>"


class CommunityCompetitor(Base):
    """小区竞品关联表."""

    __tablename__ = "community_competitors"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="主小区ID")
    competitor_community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="竞品小区ID")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        comment="创建时间",
    )

    __table_args__ = (UniqueConstraint("community_id", "competitor_community_id", name="uq_community_competitor"),)

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<CommunityCompetitor(community_id={self.community_id}, competitor={self.competitor_community_id})>"
