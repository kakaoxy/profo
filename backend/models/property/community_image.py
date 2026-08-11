"""小区户型图库模型.

存储小区维度的户型图（不含其他类型图片），由推送时自动归类与 admin 手动上传共同维护。
"""

import enum
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base


class CommunityImageSource(str, enum.Enum):
    """小区户型图来源枚举."""

    SCRAPED = "scraped"  # 推送房源时自动归类
    UPLOADED = "uploaded"  # admin 手动上传


class CommunityImage(Base):
    """小区户型图表.

    整个表只存储户型图，不存储其他类型图片（室内图/外观图）。
    通过 ``community_id`` 逻辑外键关联 ``Community``。
    """

    __tablename__ = "community_images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联小区ID(逻辑外键)")
    url: Mapped[str] = mapped_column(Text, nullable=False, comment="户型图URL")
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True, comment="缩略图URL")
    source: Mapped[CommunityImageSource] = mapped_column(
        SQLEnum(CommunityImageSource, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="来源: scraped/uploaded",
    )
    source_property_id: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="来源房源ID（source=scraped 时填）",
    )
    description: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="描述")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")
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

    __table_args__ = (
        # 按小区查询未删除户型图（列表页主查询路径）
        Index("idx_community_image_community", "community_id", "is_deleted"),
        # 按来源房源查询（去重 / 历史数据归类脚本）
        Index("idx_community_image_source", "source", "source_property_id"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<CommunityImage(id={self.id}, community_id={self.community_id}, source={self.source})>"
