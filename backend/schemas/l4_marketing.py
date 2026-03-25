"""
L4 市场营销层 Pydantic Schema
符合项目指南的 API 契约规范
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


# ============================================================================
# 基础枚举和常量
# ============================================================================

class MarketingProjectStatus(str):
    """营销项目状态"""
    IN_PROGRESS = "在途"
    FOR_SALE = "在售"
    SOLD = "已售"


class MediaType(str):
    """媒体类型"""
    IMAGE = "image"
    VIDEO = "video"


# ============================================================================
# L4 Consultant Schemas
# ============================================================================

class L4ConsultantBase(BaseModel):
    """顾问基础模型"""
    name: str = Field(..., min_length=1, max_length=100, description="姓名")
    avatar_url: Optional[str] = Field(None, description="头像URL")
    role: Optional[str] = Field(None, max_length=100, description="职位")
    phone: Optional[str] = Field(None, max_length=20, description="联系电话")
    wx_qr_code: Optional[str] = Field(None, description="微信二维码")
    intro: Optional[str] = Field(None, description="个人简介")


class L4ConsultantCreate(L4ConsultantBase):
    """创建顾问请求"""
    pass


class L4ConsultantUpdate(BaseModel):
    """更新顾问请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    avatar_url: Optional[str] = None
    role: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, max_length=20)
    wx_qr_code: Optional[str] = None
    intro: Optional[str] = None
    is_active: Optional[bool] = None
    rating: Optional[float] = Field(None, ge=0, le=5)
    completed_projects: Optional[int] = Field(None, ge=0)


class L4ConsultantResponse(L4ConsultantBase):
    """顾问响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    rating: float = Field(default=5.0, ge=0, le=5)
    completed_projects: int = Field(default=0, ge=0)
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


# ============================================================================
# L4 Marketing Media Schemas
# ============================================================================

class L4MarketingMediaBase(BaseModel):
    """营销媒体基础模型"""
    media_type: str = Field(default="image", description="媒体类型: image/video")
    renovation_stage: Optional[str] = Field(None, description="装修阶段")
    description: Optional[str] = Field(None, description="描述")
    sort_order: int = Field(default=0, ge=0, description="排序")


class L4MarketingMediaCreate(L4MarketingMediaBase):
    """创建媒体请求"""
    origin_media_id: Optional[str] = Field(None, description="来源媒体ID(L3层)")
    file_url: str = Field(..., description="文件URL")
    thumbnail_url: Optional[str] = Field(None, description="缩略图URL")


class L4MarketingMediaUpdate(BaseModel):
    """更新媒体请求"""
    renovation_stage: Optional[str] = None
    description: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)


class L4MarketingMediaResponse(L4MarketingMediaBase):
    """媒体响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    marketing_project_id: str
    origin_media_id: Optional[str] = None
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
    title: str = Field(..., min_length=1, max_length=200, description="营销标题")
    cover_image: Optional[str] = Field(None, description="封面图URL")
    style: Optional[str] = Field(None, max_length=50, description="装修风格")
    description: Optional[str] = Field(None, description="项目描述")
    marketing_tags: Optional[str] = Field(None, max_length=500, description="营销标签，逗号分隔")
    share_title: Optional[str] = Field(None, max_length=100, description="分享标题")
    share_image: Optional[str] = Field(None, description="分享图片URL")


class L4MarketingProjectCreate(L4MarketingProjectBase):
    """创建营销项目请求 (独立项目)"""
    consultant_id: Optional[str] = Field(None, description="关联顾问ID")


class L4MarketingProjectUpdate(BaseModel):
    """更新营销项目请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    cover_image: Optional[str] = None
    style: Optional[str] = Field(None, max_length=50)
    description: Optional[str] = None
    marketing_tags: Optional[str] = Field(None, max_length=500)
    share_title: Optional[str] = Field(None, max_length=100)
    share_image: Optional[str] = None
    consultant_id: Optional[str] = None

    # 状态更新
    project_status: Optional[str] = Field(None, description="项目状态: 在途/在售/已售")
    sort_order: Optional[int] = Field(None, ge=0)
    is_published: Optional[bool] = None


class L4MarketingProjectResponse(L4MarketingProjectBase):
    """营销项目响应模型"""
    model_config = ConfigDict(from_attributes=True)

    id: str
    project_id: Optional[str] = None
    consultant_id: Optional[str] = None

    # 物理数据 (来自L3项目)
    address: Optional[str] = None
    area: Optional[float] = Field(None, ge=0)
    price: Optional[float] = Field(None, ge=0)
    layout: Optional[str] = None
    orientation: Optional[str] = None
    floor_info: Optional[str] = None

    # 状态字段
    project_status: str = Field(default="在途")
    view_count: int = Field(default=0, ge=0)
    sort_order: int = Field(default=0, ge=0)
    is_published: bool = False
    published_at: Optional[datetime] = None
    is_deleted: bool = False

    # 时间戳
    created_at: datetime
    updated_at: datetime

    # 关联数据
    consultant: Optional[L4ConsultantResponse] = None
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


class L4ConsultantListResponse(BaseModel):
    """顾问列表响应 - 统一分页格式"""
    items: List[L4ConsultantResponse]
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
    is_published: Optional[bool] = None
    project_status: Optional[str] = None
    consultant_id: Optional[str] = None


class L4ConsultantQuery(BaseModel):
    """顾问查询参数"""
    page: int = Field(default=1, ge=1)
    size: int = Field(default=20, ge=1, le=100)
    is_active: Optional[bool] = None
