"""小区分析报表 Schema.

包含小区行、列表响应、详情响应、同商圈对比等模型.
字段名对齐前端 types.ts.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from schemas.reports.market import (
    DistributionResponse,
    KpiData,
    PriceDistributionResponse,
    TrendDataPoint,
)


class CommunityRow(BaseModel):
    """小区行."""

    community_id: str = Field(description="小区ID")
    community_name: str = Field(description="小区名称")
    business_circle: str = Field(description="所属商圈")
    district: str | None = Field(None, description="所属行政区")
    sold_count: int = Field(description="成交套数")
    avg_price_wan: float | None = Field(None, description="平均总价(万)")
    avg_unit_price: float | None = Field(None, description="平均单价(元/㎡)")
    main_layout: str | None = Field(None, description="主力户型（如 '3室2厅'）")
    main_floor: str | None = Field(None, description="主力楼层（如 '中楼层'）")
    avg_area: float | None = Field(None, description="平均面积(㎡)")
    price_qoq: float | None = Field(None, description="价格环比(%)")

    model_config = ConfigDict(from_attributes=True)


class CommunityListResponse(BaseModel):
    """小区明细列表响应."""

    items: list[CommunityRow] = Field(description="小区行列表")
    total: int = Field(description="小区总数")


class CommunityDetailResponse(BaseModel):
    """小区成交分析详情响应."""

    community: dict[str, Any] = Field(
        description="小区基本信息（community_id/community_name/business_circle/district）",
    )
    kpi: KpiData = Field(description="KPI 卡片聚合")
    trend: list[TrendDataPoint] = Field(description="成交趋势")
    price_distribution: PriceDistributionResponse = Field(description="价格分布")
    rooms_distribution: DistributionResponse = Field(description="户型分布")
    floor_distribution: DistributionResponse = Field(description="楼层分布")
    main_layout: str | None = Field(None, description="主力户型（近 12 月成交占比最高）")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "CommunityDetailResponse",
    "CommunityListResponse",
    "CommunityRow",
]
