"""
L4 市场营销层项目相关 Schema
"""
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict

from .enums import PublishStatus, MarketingProjectStatus
from .media import L4MarketingMediaCreate, L4MarketingMediaResponse


class L4MarketingProjectBase(BaseModel):
    """营销项目基础模型"""
    # 小区信息
    community_id: int = Field(gt=0, description="关联小区ID")
    community_name: str | None = Field(default=None, max_length=200, description="小区名称(冗余存储)")

    # 户型信息
    layout: str = Field(min_length=1, max_length=100, description="户型，如：三室两厅")
    orientation: str = Field(min_length=1, max_length=50, description="朝向，如：南北通透")
    floor_info: str = Field(min_length=1, max_length=100, description="楼层信息，如：15/28层")

    # 面积与价格
    area: Decimal = Field(gt=0, decimal_places=2, description="面积(m²)，保留两位小数")
    total_price: Decimal = Field(gt=0, decimal_places=2, description="总价(万元)，保留两位小数")

    # 营销信息
    title: str = Field(min_length=1, max_length=255, description="标题，最大长度255")
    images: list[str] = Field(default_factory=list, description="图片URL列表")
    sort_order: int = Field(default=0, ge=0, description="排序权重，默认0")
    tags: list[str] = Field(default_factory=list, description="标签列表")
    decoration_style: str | None = Field(default=None, max_length=100, description="装修风格，最大长度100")

    # 状态
    publish_status: PublishStatus = Field(default=PublishStatus.DRAFT, description="发布状态: 草稿/发布")
    project_status: MarketingProjectStatus = Field(default=MarketingProjectStatus.IN_PROGRESS, description="项目状态: 在途/在售/已售")

    # 关联
    project_id: str | None = Field(None, min_length=1, max_length=36, description="关联L3项目ID(软引用)，可为空，UUID字符串")
    consultant_id: str | None = Field(None, min_length=1, max_length=36, description="关联顾问ID(软引用User表)，UUID字符串")


class L4MarketingProjectCreate(L4MarketingProjectBase):
    """创建营销项目请求"""
    media_files: list[L4MarketingMediaCreate] | None = Field(default=None, description="媒体文件列表，创建项目时同时上传图片")


class L4MarketingProjectUpdate(BaseModel):
    """更新营销项目请求 - 所有字段可选"""
    # 小区信息
    community_id: int | None = Field(default=None, gt=0, description="关联小区ID")
    community_name: str | None = Field(default=None, max_length=200, description="小区名称(冗余存储)")

    # 户型信息
    layout: str | None = Field(default=None, min_length=1, max_length=100)
    orientation: str | None = Field(default=None, min_length=1, max_length=50)
    floor_info: str | None = Field(default=None, min_length=1, max_length=100)

    # 面积与价格
    area: Decimal | None = Field(default=None, gt=0, decimal_places=2)
    total_price: Decimal | None = Field(default=None, gt=0, decimal_places=2)

    # 营销信息
    title: str | None = Field(default=None, min_length=1, max_length=255)
    images: list[str] | None = Field(default=None, description="图片URL列表")
    sort_order: int | None = Field(default=None, ge=0)
    tags: list[str] | None = Field(default=None, description="标签列表")
    decoration_style: str | None = Field(default=None, max_length=100)

    # 状态
    publish_status: PublishStatus | None = Field(default=None, description="发布状态: 草稿/发布")
    project_status: MarketingProjectStatus | None = Field(default=None, description="项目状态: 在途/在售/已售")

    # 关联
    project_id: str | None = Field(default=None, min_length=1, max_length=36, description="关联L3项目ID(软引用)，UUID字符串")
    consultant_id: str | None = Field(default=None, min_length=1, max_length=36, description="关联顾问ID(软引用User表)，UUID字符串")


class L4MarketingProjectResponse(BaseModel):
    """营销项目响应模型

    数据库使用JSON存储images和tags，前后端统一使用list[str]格式
    """
    model_config = ConfigDict(from_attributes=True)

    id: int

    # 小区信息
    community_id: int
    community_name: str | None = None

    # 户型信息
    layout: str
    orientation: str
    floor_info: str

    # 面积与价格
    area: Decimal
    total_price: Decimal
    unit_price: Decimal

    # 营销信息 - JSON数组格式
    title: str
    images: list[str] = Field(default_factory=list, description="图片URL列表，JSON数组")
    sort_order: int
    tags: list[str] = Field(default_factory=list, description="标签列表，JSON数组")
    decoration_style: str | None = None

    # 状态
    publish_status: PublishStatus
    project_status: MarketingProjectStatus

    # 关联
    project_id: str | None = None
    consultant_id: str | None = None

    # 系统字段
    is_deleted: bool = False
    created_at: datetime
    updated_at: datetime

    # 关联数据
    media_files: list[L4MarketingMediaResponse] = Field(default_factory=list)
