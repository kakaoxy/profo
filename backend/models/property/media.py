"""媒体资源相关模型.

包含PropertyMedia表.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base, MediaType


class PropertyMedia(Base):
    """房源媒体资源表."""

    __tablename__ = "property_media"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    data_source: Mapped[str] = mapped_column(String(50), nullable=False, comment="数据来源")
    source_property_id: Mapped[str] = mapped_column(String(100), nullable=False, comment="来源平台的房源ID")

    media_type: Mapped[MediaType] = mapped_column(SQLEnum(MediaType), nullable=False, comment="媒体类型")
    url: Mapped[str] = mapped_column(String(500), nullable=False, comment="媒体URL")
    description: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="描述")
    sort_order: Mapped[int] = mapped_column(Integer, default=0, comment="排序")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")

    __table_args__ = (
        UniqueConstraint("data_source", "source_property_id", "url", name="uq_property_media_url"),
        Index("idx_property_media", "source_property_id", "data_source", "media_type"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<PropertyMedia(id={self.id}, type={self.media_type}, property='{self.source_property_id}')>"
