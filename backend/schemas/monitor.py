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
