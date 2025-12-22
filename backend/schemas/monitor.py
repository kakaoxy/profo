from pydantic import BaseModel
from typing import List, Optional, Any
from datetime import datetime

# --- Market Sentiment ---

class FloorStats(BaseModel):
    type: str  # high, mid, low
    deals_count: int
    deal_avg_price: float
    current_count: int
    current_avg_price: float

class MarketSentimentResponse(BaseModel):
    floor_stats: List[FloorStats]
    inventory_months: float

# --- Trend & Positioning ---

class TrendData(BaseModel):
    month: str  # "YYYY-MM"
    listing_price: float
    deal_price: float
    volume: int

class TrendResponse(BaseModel):
    trends: List[TrendData]

# --- Neighboring Competitors ---

class CompetitorResponse(BaseModel):
    community_id: int
    community_name: str
    avg_price: float
    on_sale_count: int

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
    action_plan: List[str]


# --- Neighborhood Radar ---

class NeighborhoodRadarItem(BaseModel):
    """周边竞品雷达单项数据"""
    community_id: int
    community_name: str
    is_subject: bool  # 是否是本案小区
    # 挂牌数据
    listing_count: int
    listing_beike: int
    listing_iaij: int
    listing_avg_price: float  # 元/㎡
    # 成交数据
    deal_count: int
    deal_beike: int
    deal_iaij: int
    deal_avg_price: float  # 元/㎡
    # 价差
    spread_percent: float  # 相对本案的价差百分比
    spread_label: str  # 显示文本


class NeighborhoodRadarResponse(BaseModel):
    """周边竞品雷达响应"""
    items: List[NeighborhoodRadarItem]

