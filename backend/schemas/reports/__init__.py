"""报表模块 Schema.

字段名对齐前端 types.ts.
包含商圈分析与小区分析两组模型.
"""

from schemas.reports.common import (
    ErrorResponse,
    KpiCard,
    Pagination,
    QoqDirection,
    RangeOption,
    ReportsFilter,
    SortOrder,
    TrendDimension,
)
from schemas.reports.communities import (
    CommunityDetailResponse,
    CommunityListResponse,
    CommunityRow,
)
from schemas.reports.market import (
    BusinessDistrictListResponse,
    BusinessDistrictRow,
    ComparisonData,
    ComparisonFloorStructure,
    ComparisonRoomStructure,
    ComparisonSummaryRow,
    ComparisonTrendPoint,
    KpiData,
    PriceBucket,
    PriceDistributionResponse,
    TrendDataPoint,
)

__all__ = [
    "BusinessDistrictListResponse",
    "BusinessDistrictRow",
    "CommunityDetailResponse",
    "CommunityListResponse",
    "CommunityRow",
    "ComparisonData",
    "ComparisonFloorStructure",
    "ComparisonRoomStructure",
    "ComparisonSummaryRow",
    "ComparisonTrendPoint",
    "ErrorResponse",
    "KpiCard",
    "KpiData",
    "Pagination",
    "PriceBucket",
    "PriceDistributionResponse",
    "QoqDirection",
    "RangeOption",
    "ReportsFilter",
    "SortOrder",
    "TrendDataPoint",
    "TrendDimension",
]
