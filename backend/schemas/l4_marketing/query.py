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


# 统一分页响应格式 - 继承自 PaginatedResponse
class L4MarketingProjectListResponse(PaginatedResponse[L4MarketingProjectResponse]):
    """营销项目列表响应 - 统一分页格式"""
    pass


class L4MarketingMediaListResponse(PaginatedResponse[L4MarketingMediaResponse]):
    """媒体列表响应 - 统一分页格式"""
    pass
