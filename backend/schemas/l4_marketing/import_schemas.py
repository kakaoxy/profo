"""L4 项目导入相关 Pydantic Schema

用于从L3项目导入数据创建营销房源.
"""  # noqa: D400, D415

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from models.common import ProjectStatus, RenovationStage
from models.marketing.l4_marketing import PhotoCategory

# ============================================================================
# L3 项目精简信息 Schema
# ============================================================================


class L3ProjectBriefResponse(BaseModel):
    """L3项目精简信息 - 用于列表展示."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="项目ID")
    name: str = Field(description="项目名称")
    community_name: str = Field(description="小区名称")
    address: str = Field(description="物业地址")
    area: Decimal | None = Field(default=None, description="面积(m²)")
    layout: str | None = Field(default=None, description="户型")
    orientation: str | None = Field(default=None, description="朝向")
    status: ProjectStatus = Field(description="项目状态")


# ============================================================================
# L3 项目列表响应 Schema
# ============================================================================


class L3ProjectListResponse(BaseModel):
    """L3项目列表响应 - 统一分页格式."""

    items: list[L3ProjectBriefResponse]
    total: int = Field(ge=0, description="总记录数")
    page: int = Field(ge=1, description="当前页码")
    page_size: int = Field(ge=1, description="每页大小")


# ============================================================================
# 可导入媒体资源 Schema
# ============================================================================


class ImportableMediaResponse(BaseModel):
    """可导入的媒体资源信息."""

    model_config = ConfigDict(from_attributes=True)

    id: str = Field(description="媒体ID")
    file_url: str = Field(description="文件URL")
    thumbnail_url: str | None = Field(default=None, description="缩略图URL")
    photo_category: PhotoCategory = Field(description="照片分类")
    renovation_stage: RenovationStage | None = Field(default=None, description="装修阶段")
    description: str | None = Field(default=None, description="描述")
    sort_order: int = Field(default=0, description="排序")


# ============================================================================
# L3 项目导入数据 Schema
# ============================================================================


class L3ProjectImportResponse(BaseModel):
    """从L3项目导入的数据响应."""

    model_config = ConfigDict(from_attributes=True)

    # 关联信息
    project_id: str = Field(description="L3项目ID")

    # 小区信息
    community_id: str | None = Field(default=None, description="小区ID（UUID字符串）")
    community_name: str = Field(description="小区名称")

    # 户型信息
    layout: str | None = Field(default=None, description="户型")
    orientation: str | None = Field(default=None, description="朝向")
    floor_info: str | None = Field(default=None, description="楼层信息")

    # 面积与价格
    area: Decimal | None = Field(default=None, description="面积(m²)")
    total_price: Decimal | None = Field(default=None, description="总价(万元)")
    unit_price: Decimal | None = Field(default=None, description="单价(万元/m²)")

    # 营销信息
    title: str = Field(description="标题")
    tags: str | None = Field(default=None, description="标签")
    decoration_style: str | None = Field(default=None, description="装修风格")

    # 改造阶段完成时间 - 来自 L3 ProjectRenovation.stage_completed_dates
    stage_completed_dates: dict[str, str] | None = Field(
        default=None,
        description="L3 项目各阶段完成日期，格式: {stage: 'YYYY-MM-DD'}",
    )

    # 项目状态
    status: ProjectStatus | None = Field(default=None, description="项目状态")

    # 可导入的媒体资源
    available_media: list[ImportableMediaResponse] = Field(
        default_factory=list,
        description="可导入的媒体资源列表",
    )


# ============================================================================
# 查询参数 Schema
# ============================================================================


class L3ProjectQueryParams(BaseModel):
    """L3项目查询参数."""

    community_name: str | None = Field(default=None, description="小区名称筛选")
    status: ProjectStatus | None = Field(default=None, description="项目状态筛选")
    page: int = Field(default=1, ge=1, description="页码")
    page_size: int = Field(default=20, ge=1, le=200, description="每页大小")
