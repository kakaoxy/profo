"""
L4 市场营销层 Pydantic Schema
符合项目指南的 API 契约规范
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


# ============================================================================
# 基础枚举和常量
# ============================================================================

class PublishStatus(str):
    """发布状态枚举"""
    DRAFT = "草稿"
    PUBLISHED = "发布"


class MarketingProjectStatus(str):
    """营销项目状态枚举"""
    IN_PROGRESS = "在途"
    FOR_SALE = "在售"
    SOLD = "已售"


class MediaType(str):
    """媒体类型"""
    IMAGE = "image"
    VIDEO = "video"


# ============================================================================
# L4 Marketing Media Schemas
# ============================================================================

class L4MarketingMediaBase(BaseModel):
    """营销媒体基础模型"""
    media_type: str = Field(default="image", description="媒体类型: image/video")
    renovation_stage: Optional[str] = Field(None, max_length=50, description="装修阶段")
    description: Optional[str] = Field(None, description="描述")
    sort_order: int = Field(default=0, ge=0, description="排序")


class L4MarketingMediaCreate(L4MarketingMediaBase):
    """创建媒体请求"""
    origin_media_id: Optional[int] = Field(None, description="来源媒体ID(L3层)")
    file_url: str = Field(..., min_length=1, description="文件URL")
    thumbnail_url: Optional[str] = Field(None, description="缩略图URL")


class L4MarketingMediaUpdate(BaseModel):
    """更新媒体请求"""
    renovation_stage: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)
    thumbnail_url: Optional[str] = None


class L4MarketingMediaResponse(L4MarketingMediaBase):
    """媒体响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: int
    marketing_project_id: int
    origin_media_id: Optional[int] = None
    file_url: str
    thumbnail_url: Optional[str] = None
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime


# ============================================================================
# L4 Marketing Project Schemas
# ============================================================================

class L4MarketingProjectBase(BaseModel):
    """营销项目基础模型"""
    # 小区信息
    community_id: int = Field(..., gt=0, description="关联小区ID")

    # 户型信息
    layout: str = Field(..., min_length=1, max_length=100, description="户型，如：三室两厅")
    orientation: str = Field(..., min_length=1, max_length=50, description="朝向，如：南北通透")
    floor_info: str = Field(..., min_length=1, max_length=100, description="楼层信息，如：15/28层")

    # 面积与价格
    area: Decimal = Field(..., gt=0, decimal_places=2, description="面积(m²)，保留两位小数")
    total_price: Decimal = Field(..., gt=0, decimal_places=2, description="总价(万元)，保留两位小数")

    # 营销信息
    title: str = Field(..., min_length=1, max_length=255, description="标题，最大长度255")
    images: Optional[str] = Field(None, description="图片URL列表，多个用逗号分隔")
    sort_order: int = Field(default=0, ge=0, description="排序权重，默认0")
    tags: Optional[str] = Field(None, max_length=500, description="标签，多个用逗号分隔")
    decoration_style: Optional[str] = Field(None, max_length=100, description="装修风格，最大长度100")

    # 状态
    publish_status: str = Field(default=PublishStatus.DRAFT, description="发布状态: 草稿/发布")
    project_status: str = Field(default=MarketingProjectStatus.IN_PROGRESS, description="项目状态: 在途/在售/已售")

    # 关联
    project_id: Optional[int] = Field(None, description="关联L3项目ID(软引用)，可为空")
    consultant_id: Optional[str] = Field(None, min_length=1, max_length=36, description="关联顾问ID(软引用User表)，UUID字符串")


class L4MarketingProjectCreate(L4MarketingProjectBase):
    """创建营销项目请求"""
    pass


class L4MarketingProjectUpdate(BaseModel):
    """更新营销项目请求 - 所有字段可选"""
    # 小区信息
    community_id: Optional[int] = Field(None, gt=0, description="关联小区ID")

    # 户型信息
    layout: Optional[str] = Field(None, min_length=1, max_length=100)
    orientation: Optional[str] = Field(None, min_length=1, max_length=50)
    floor_info: Optional[str] = Field(None, min_length=1, max_length=100)

    # 面积与价格
    area: Optional[Decimal] = Field(None, gt=0, decimal_places=2)
    total_price: Optional[Decimal] = Field(None, gt=0, decimal_places=2)

    # 营销信息
    title: Optional[str] = Field(None, min_length=1, max_length=255)
    images: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)
    tags: Optional[str] = Field(None, max_length=500)
    decoration_style: Optional[str] = Field(None, max_length=100)

    # 状态
    publish_status: Optional[str] = Field(None, description="发布状态: 草稿/发布")
    project_status: Optional[str] = Field(None, description="项目状态: 在途/在售/已售")

    # 关联
    project_id: Optional[int] = None
    consultant_id: Optional[str] = Field(None, min_length=1, max_length=36, description="关联顾问ID(软引用User表)，UUID字符串")


class L4MarketingProjectResponse(BaseModel):
    """营销项目响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: int

    # 小区信息
    community_id: int

    # 户型信息
    layout: str
    orientation: str
    floor_info: str

    # 面积与价格
    area: Decimal
    total_price: Decimal
    unit_price: Decimal

    # 营销信息
    title: str
    images: Optional[str] = None
    sort_order: int
    tags: Optional[str] = None
    decoration_style: Optional[str] = None

    # 状态
    publish_status: str
    project_status: str

    # 关联
    project_id: Optional[int] = None
    consultant_id: Optional[str] = None

    # 系统字段
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime

    # 关联数据
    media_files: List[L4MarketingMediaResponse] = Field(default_factory=list)


# ============================================================================
# 列表响应 Schema (符合统一分页格式)
# ============================================================================

class L4MarketingProjectListResponse(BaseModel):
    """营销项目列表响应 - 统一分页格式"""
    items: List[L4MarketingProjectResponse]
    total: int = Field(..., ge=0, description="总记录数")
    page: int = Field(..., ge=1, description="当前页码")
    size: int = Field(..., ge=1, description="每页大小")


class L4MarketingMediaListResponse(BaseModel):
    """媒体列表响应 - 统一分页格式"""
    items: List[L4MarketingMediaResponse]
    total: int = Field(..., ge=0, description="总记录数")
    page: int = Field(..., ge=1, description="当前页码")
    size: int = Field(..., ge=1, description="每页大小")


# ============================================================================
# 同步与刷新 Schema
# ============================================================================

class L4SyncResponse(BaseModel):
    """同步响应"""
    total_synced: int = Field(..., ge=0, description="同步数量")


class L4RefreshResponse(BaseModel):
    """刷新响应"""
    success: bool


# ============================================================================
# 查询参数 Schema
# ============================================================================

class L4MarketingProjectQuery(BaseModel):
    """营销项目查询参数"""
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)
    community_id: Optional[int] = None
    publish_status: Optional[str] = None
    project_status: Optional[str] = None
    consultant_id: Optional[str] = None
    project_id: Optional[int] = None
    decoration_style: Optional[str] = None

