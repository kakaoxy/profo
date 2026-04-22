"""
L4 市场营销层查询参数和响应 Schema
"""
from pydantic import BaseModel, Field

from ..common import PaginatedResponse
from .project import L4MarketingProjectResponse
from .media import L4MarketingMediaResponse


class L4MarketingProjectQuery(BaseModel):
    """营销项目查询参数"""
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=200)
    community_id: int | None = None
    publish_status: str | None = None
    project_status: str | None = None
    consultant_id: str | None = None
    project_id: str | None = None
    decoration_style: str | None = None


class L4SyncResponse(BaseModel):
    """同步响应"""
    total_synced: int = Field(..., ge=0, description="同步数量")


class L4RefreshResponse(BaseModel):
    """刷新响应"""
    success: bool


class L4MarketingProjectSummary(BaseModel):
    """营销项目摘要统计 - 基于筛选条件的全量统计，不受分页影响"""
    total: int = Field(default=0, ge=0, description="项目总数")
    published: int = Field(default=0, ge=0, description="已发布项目数")
    draft: int = Field(default=0, ge=0, description="草稿项目数")
    for_sale: int = Field(default=0, ge=0, description="在售项目数")
    sold: int = Field(default=0, ge=0, description="已售项目数")
    in_progress: int = Field(default=0, ge=0, description="在途项目数")


# 统一分页响应格式 - 继承自 PaginatedResponse
class L4MarketingProjectListResponse(PaginatedResponse[L4MarketingProjectResponse]):
    """营销项目列表响应 - 统一分页格式"""
    summary: L4MarketingProjectSummary = Field(
        default_factory=L4MarketingProjectSummary,
        description="摘要统计 - 基于当前筛选条件的全量统计，不受分页影响"
    )


class L4MarketingMediaListResponse(PaginatedResponse[L4MarketingMediaResponse]):
    """媒体列表响应 - 统一分页格式"""
    pass
