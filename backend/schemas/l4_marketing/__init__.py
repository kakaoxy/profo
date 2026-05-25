"""L4 市场营销层 Pydantic Schema

符合项目指南的 API 契约规范.
"""  # noqa: D400, D415

from .enums import MarketingProjectStatus, MediaType, PhotoCategory, PublishStatus
from .import_schemas import (
    ImportableMediaResponse,
    L3ProjectBriefResponse,
    L3ProjectImportResponse,
    L3ProjectListResponse,
    L3ProjectQueryParams,
)
from .media import (
    L4MarketingMediaBase,
    L4MarketingMediaCreate,
    L4MarketingMediaResponse,
    L4MarketingMediaUpdate,
    MediaSortOrderUpdate,
)
from .project import (
    L4MarketingProjectBase,
    L4MarketingProjectCreate,
    L4MarketingProjectResponse,
    L4MarketingProjectUpdate,
)
from .query import (
    L4MarketingMediaListResponse,
    L4MarketingProjectListResponse,
    L4MarketingProjectQuery,
    L4MarketingProjectSummary,
    L4RefreshResponse,
    L4SyncResponse,
)

__all__ = [
    "ImportableMediaResponse",
    # Import Schemas
    "L3ProjectBriefResponse",
    "L3ProjectImportResponse",
    "L3ProjectListResponse",
    "L3ProjectQueryParams",
    # Media
    "L4MarketingMediaBase",
    "L4MarketingMediaCreate",
    "L4MarketingMediaListResponse",
    "L4MarketingMediaResponse",
    "L4MarketingMediaUpdate",
    # Project
    "L4MarketingProjectBase",
    "L4MarketingProjectCreate",
    "L4MarketingProjectListResponse",
    # Query & Response
    "L4MarketingProjectQuery",
    "L4MarketingProjectResponse",
    "L4MarketingProjectSummary",
    "L4MarketingProjectUpdate",
    "L4RefreshResponse",
    "L4SyncResponse",
    "MarketingProjectStatus",
    "MediaSortOrderUpdate",
    "MediaType",
    "PhotoCategory",
    # Enums
    "PublishStatus",
]
