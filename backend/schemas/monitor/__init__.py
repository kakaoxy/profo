"""
监控和市场分析相关Schema
"""
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict


# --- Market Sentiment ---

class FloorStats(BaseModel):
    type: str
    deals_count: int
    deal_avg_price: float
    current_count: int
    current_avg_price: float


class MarketSentimentResponse(BaseModel):
    floor_stats: list[FloorStats]
    inventory_months: float

    model_config = ConfigDict(from_attributes=True)


# --- Trend & Positioning ---

class TrendData(BaseModel):
    month: str
    listing_price: float
    deal_price: float
    volume: int


class TrendResponse(BaseModel):
    trends: list[TrendData]

    model_config = ConfigDict(from_attributes=True)


# --- Neighboring Competitors ---

class CompetitorResponse(BaseModel):
    community_id: str
    community_name: str
    avg_price: float
    on_sale_count: int

    model_config = ConfigDict(from_attributes=True)


class AddCompetitorRequest(BaseModel):
    competitor_community_id: str


# --- AI Strategy ---

class AIStrategyRequest(BaseModel):
    project_id: str
    user_context: str


class RiskPoints(BaseModel):
    profit_critical_price: float
    daily_cost: float


class AIStrategyResponse(BaseModel):
    report_markdown: str
    risk_points: RiskPoints
    action_plan: list[str]

    model_config = ConfigDict(from_attributes=True)


# --- Neighborhood Radar ---

class NeighborhoodRadarItem(BaseModel):
    """周边竞品雷达单项数据"""
    community_id: str
    community_name: str
    is_subject: bool
    listing_count: int
    listing_beike: int
    listing_iaij: int
    listing_avg_price: float
    deal_count: int
    deal_beike: int
    deal_iaij: int
    deal_avg_price: float
    spread_percent: float
    spread_label: str

    model_config = ConfigDict(from_attributes=True)


class NeighborhoodRadarResponse(BaseModel):
    """周边竞品雷达响应"""
    items: list[NeighborhoodRadarItem]

    model_config = ConfigDict(from_attributes=True)


# --- Community Market Stats ---

class CommunityMarketStatsResponse(BaseModel):
    """小区市场统计数据响应
    
    用于项目卡片展示的市场数据:
    - on_sale: 竞品在售数量
    - avg_price: 成交均价(元/㎡)
    - volume_30d: 30日成交量
    - price_trend_30d: 30日价格趋势百分比
    - is_price_up: 价格趋势方向 (true=上涨, false=下跌, null=持平)
    """
    on_sale: int = Field(0, description="竞品在售数量")
    avg_price: float = Field(0.0, description="成交均价(元/㎡)")
    volume_30d: int = Field(0, description="30日成交量")
    price_trend_30d: float = Field(0.0, description="30日价格趋势百分比")
    is_price_up: Optional[bool] = Field(None, description="价格趋势方向: true=上涨, false=下跌, null=持平")

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    # Market Sentiment
    "FloorStats",
    "MarketSentimentResponse",
    # Trend
    "TrendData",
    "TrendResponse",
    # Competitors
    "CompetitorResponse",
    "AddCompetitorRequest",
    # AI Strategy
    "AIStrategyRequest",
    "RiskPoints",
    "AIStrategyResponse",
    # Neighborhood Radar
    "NeighborhoodRadarItem",
    "NeighborhoodRadarResponse",
    # Community Market Stats
    "CommunityMarketStatsResponse",
]