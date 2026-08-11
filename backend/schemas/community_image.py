"""小区户型图库 Schema.

参照 ``schemas/l4_marketing/media.py`` 模式，严格与 SQLAlchemy Model 分离。
整个模块只管户型图，故 **不含 ``media_type`` 字段**。
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.property import CommunityImageSource


class CommunityImageBase(BaseModel):
    """小区户型图基础模型."""

    description: str | None = Field(default=None, max_length=200, description="描述")
    sort_order: int = Field(default=0, ge=0, description="排序")


class CommunityImageCreate(BaseModel):
    """创建户型图请求（手动上传场景）.

    ``url`` / ``thumbnail_url`` 由路由层调用 ``save_upload_file`` 上传图片后填入，
    非客户端直接传入的 URL。
    """

    url: str = Field(min_length=1, description="户型图URL")
    thumbnail_url: str | None = Field(default=None, description="缩略图URL")
    source_property_id: str | None = Field(default=None, max_length=100, description="来源房源ID")
    description: str | None = Field(default=None, max_length=200, description="描述")


class CommunityImageUpdate(BaseModel):
    """更新户型图请求（PATCH 语义，仅更新提供的字段）."""

    description: str | None = Field(default=None, max_length=200, description="描述")
    sort_order: int | None = Field(default=None, ge=0, description="排序")


class CommunityImageResponse(CommunityImageBase):
    """户型图响应模型."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    community_id: str
    url: str
    thumbnail_url: str | None = None
    source: CommunityImageSource
    source_property_id: str | None = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime


class CommunityImageListResponse(BaseModel):
    """户型图列表响应."""

    total: int
    items: list[CommunityImageResponse]


__all__ = [
    "CommunityImageBase",
    "CommunityImageCreate",
    "CommunityImageListResponse",
    "CommunityImageResponse",
    "CommunityImageUpdate",
]
