from datetime import datetime
from pydantic import BaseModel, ConfigDict

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
    community_id: int
    community_name: str
    avg_price: float
    on_sale_count: int

    model_config = ConfigDict(from_attributes=True)

class AddCompetitorRequest(BaseModel):
    competitor_community_id: int

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
    community_id: int
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

