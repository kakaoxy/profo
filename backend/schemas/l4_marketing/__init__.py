"""L4 市场营销层 Pydantic Schema

符合项目指南的 API 契约规范.
"""

from models.marketing.l4_marketing import (
    L4MediaType,
    MarketingProjectStatus,
    PhotoCategory,
    PublishStatus,
)

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
    L4MarketingNotifySummary,
    L4MarketingPriceChangeSummary,
    L4MarketingPriceChangeTimelineItem,
    L4MarketingPriceChangeTimelineResponse,
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
from .subscription import (
    L4MarketingSubscriptionStatsResponse,
    PublicMarketingNotifySummary,
    PublicMarketingProjectSubscriptionStatusResponse,
    PublicMarketingSubscribeReportRequest,
    PublicMarketingSubscribeReportResponse,
    PublicMarketingSubscribeTemplateResponse,
    PublicMarketingSubscriptionStatusResponse,
    SubscribeReportItem,
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
    "L4MarketingNotifySummary",
    "L4MarketingPriceChangeSummary",
    "L4MarketingPriceChangeTimelineItem",
    "L4MarketingPriceChangeTimelineResponse",
    "L4MarketingProjectBase",
    "L4MarketingProjectCreate",
    "L4MarketingProjectListResponse",
    # Query & Response
    "L4MarketingProjectQuery",
    "L4MarketingProjectResponse",
    "L4MarketingProjectSummary",
    "L4MarketingProjectUpdate",
    "L4MarketingSubscriptionStatsResponse",
    "L4MediaType",
    "L4RefreshResponse",
    "L4SyncResponse",
    "MarketingProjectStatus",
    "MediaSortOrderUpdate",
    "PhotoCategory",
    # 订阅通知
    "PublicMarketingNotifySummary",
    "PublicMarketingProjectSubscriptionStatusResponse",
    "PublicMarketingSubscribeReportRequest",
    "PublicMarketingSubscribeReportResponse",
    "PublicMarketingSubscribeTemplateResponse",
    "PublicMarketingSubscriptionStatusResponse",
    # Enums
    "PublishStatus",
    "SubscribeReportItem",
]
