"""
小区周期统计模型
"""
from datetime import datetime, date
from typing import Optional
from sqlmodel import SQLModel, Field


class CommunityStats(SQLModel, table=True):
    """小区周期统计表"""
    __tablename__ = "community_stats"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    community_id: int = Field(foreign_key="communities.id", index=True)
    record_date: date = Field(index=True)
    avg_price_per_sqm: Optional[int] = Field(default=None)
    active_listings_count: Optional[int] = Field(default=None)
    deals_in_last_90_days: Optional[int] = Field(default=None)
    showings_in_last_30_days: Optional[int] = Field(default=None)
    source_agency_id: Optional[int] = Field(default=None, foreign_key="agencies.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
