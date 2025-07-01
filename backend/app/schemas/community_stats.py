"""
小区周期统计相关的Pydantic模式
"""
from datetime import datetime, date
from typing import Optional
from pydantic import BaseModel


class CommunityStatsBase(BaseModel):
    """小区周期统计基础模式"""
    community_id: int
    record_date: date
    avg_price_per_sqm: Optional[int] = None
    active_listings_count: Optional[int] = None
    deals_in_last_90_days: Optional[int] = None
    showings_in_last_30_days: Optional[int] = None
    source_agency_id: Optional[int] = None


class CommunityStatsCreate(CommunityStatsBase):
    """创建小区周期统计模式"""
    pass


class CommunityStatsUpdate(BaseModel):
    """更新小区周期统计模式"""
    community_id: Optional[int] = None
    record_date: Optional[date] = None
    avg_price_per_sqm: Optional[int] = None
    active_listings_count: Optional[int] = None
    deals_in_last_90_days: Optional[int] = None
    showings_in_last_30_days: Optional[int] = None
    source_agency_id: Optional[int] = None


class CommunityStatsResponse(CommunityStatsBase):
    """小区周期统计响应模式"""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
