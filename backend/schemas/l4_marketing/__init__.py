"""
L4 市场营销层 Pydantic Schema
符合项目指南的 API 契约规范
"""
from .enums import PublishStatus, MarketingProjectStatus, MediaType, PhotoCategory
from .media import (
    L4MarketingMediaBase,
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
    L4MarketingMediaResponse,
)
from .project import (
    L4MarketingProjectBase,
    L4MarketingProjectCreate,
    L4MarketingProjectUpdate,
    L4MarketingProjectResponse,
)
from .query import (
    L4MarketingProjectQuery,
    L4SyncResponse,
    L4RefreshResponse,
    L4MarketingProjectListResponse,
    L4MarketingMediaListResponse,
)

__all__ = [
    # Enums
    "PublishStatus",
    "MarketingProjectStatus",
    "MediaType",
    "PhotoCategory",
    # Media
    "L4MarketingMediaBase",
    "L4MarketingMediaCreate",
    "L4MarketingMediaUpdate",
    "L4MarketingMediaResponse",
    # Project
    "L4MarketingProjectBase",
    "L4MarketingProjectCreate",
    "L4MarketingProjectUpdate",
    "L4MarketingProjectResponse",
    # Query & Response
    "L4MarketingProjectQuery",
    "L4SyncResponse",
    "L4RefreshResponse",
    "L4MarketingProjectListResponse",
    "L4MarketingMediaListResponse",
]
