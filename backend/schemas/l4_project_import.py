"""
L4 项目导入相关 Pydantic Schema
用于从L3项目导入数据创建营销房源
"""
from typing import Optional, List
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict


# ============================================================================
# L3 项目精简信息 Schema
# ============================================================================

class L3ProjectBriefResponse(BaseModel):
    """L3项目精简信息 - 用于列表展示"""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="项目ID")
    name: str = Field(description="项目名称")
    community_name: str = Field(description="小区名称")
    address: str = Field(description="物业地址")
    area: Optional[Decimal] = Field(default=None, description="面积(m²)")
    layout: Optional[str] = Field(default=None, description="户型")
    orientation: Optional[str] = Field(default=None, description="朝向")
    status: str = Field(description="项目状态")


# ============================================================================
# L3 项目列表响应 Schema
# ============================================================================

class L3ProjectListResponse(BaseModel):
    """L3项目列表响应 - 统一分页格式"""
    items: List[L3ProjectBriefResponse]
    total: int = Field(ge=0, description="总记录数")
    page: int = Field(ge=1, description="当前页码")
    page_size: int = Field(ge=1, description="每页大小")


# ============================================================================
# 可导入媒体资源 Schema
# ============================================================================

class ImportableMediaResponse(BaseModel):
    """可导入的媒体资源信息"""
    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="媒体ID")
    file_url: str = Field(description="文件URL")
    thumbnail_url: Optional[str] = Field(default=None, description="缩略图URL")
    photo_category: str = Field(description="照片分类")
    renovation_stage: Optional[str] = Field(default=None, description="装修阶段")
    description: Optional[str] = Field(default=None, description="描述")
    sort_order: int = Field(default=0, description="排序")


# ============================================================================
# L3 项目导入数据 Schema
# ============================================================================

class L3ProjectImportResponse(BaseModel):
    """从L3项目导入的数据响应"""
    model_config = ConfigDict(from_attributes=True)

    # 关联信息
    project_id: str = Field(description="L3项目ID")

    # 小区信息
    community_id: Optional[int] = Field(default=None, description="小区ID")
    community_name: str = Field(description="小区名称")

    # 户型信息
    layout: Optional[str] = Field(default=None, description="户型")
    orientation: Optional[str] = Field(default=None, description="朝向")
    floor_info: Optional[str] = Field(default=None, description="楼层信息")

    # 面积与价格
    area: Optional[Decimal] = Field(default=None, description="面积(m²)")
    total_price: Optional[Decimal] = Field(default=None, description="总价(万元)")
    unit_price: Optional[Decimal] = Field(default=None, description="单价(万元/m²)")

    # 营销信息
    title: str = Field(description="标题")
    tags: Optional[str] = Field(default=None, description="标签")
    decoration_style: Optional[str] = Field(default=None, description="装修风格")

    # 项目状态
    status: Optional[str] = Field(default=None, description="项目状态")

    # 可导入的媒体资源
    available_media: List[ImportableMediaResponse] = Field(
        default_factory=list,
        description="可导入的媒体资源列表"
    )


# ============================================================================
# 查询参数 Schema
# ============================================================================

class L3ProjectQueryParams(BaseModel):
    """L3项目查询参数"""
    community_name: Optional[str] = Field(default=None, description="小区名称筛选")
    status: Optional[str] = Field(default=None, description="项目状态筛选")
    page: int = Field(default=1, ge=1, description="页码")
    page_size: int = Field(default=20, ge=1, le=200, description="每页大小")
