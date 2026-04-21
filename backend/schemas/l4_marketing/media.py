"""
L4 市场营销层媒体相关 Schema
"""
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from .enums import PhotoCategory, MediaType


class L4MarketingMediaBase(BaseModel):
    """营销媒体基础模型"""
    media_type: MediaType = Field(default=MediaType.IMAGE, description="媒体类型: image/video")
    photo_category: PhotoCategory = Field(default=PhotoCategory.MARKETING, description="照片分类: marketing/renovation")
    renovation_stage: str | None = Field(default=None, max_length=50, description="装修阶段(仅改造照片)")
    description: str | None = Field(default=None, description="描述")
    sort_order: int = Field(default=0, ge=0, description="排序")


class L4MarketingMediaCreate(L4MarketingMediaBase):
    """创建媒体请求"""
    origin_media_id: int | None = Field(default=None, description="来源媒体ID(L3层)")
    file_url: str = Field(min_length=1, description="文件URL")
    thumbnail_url: str | None = Field(default=None, description="缩略图URL")


class L4MarketingMediaUpdate(BaseModel):
    """更新媒体请求"""
    photo_category: PhotoCategory | None = Field(default=None, description="照片分类")
    renovation_stage: str | None = Field(default=None, max_length=50)
    description: str | None = None
    sort_order: int | None = Field(default=None, ge=0)
    thumbnail_url: str | None = None


class L4MarketingMediaResponse(L4MarketingMediaBase):
    """媒体响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    marketing_project_id: int
    origin_media_id: int | None = None
    file_url: str
    thumbnail_url: str | None = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime


class MediaSortOrderUpdate(BaseModel):
    """媒体排序更新项"""
    media_id: int = Field(description="媒体ID")
    sort_order: int = Field(ge=0, description="排序值")
