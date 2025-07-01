"""
城市每日成交统计相关的Pydantic模式
"""
from datetime import datetime, date
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel


class DailyCityStatsBase(BaseModel):
    """城市每日成交统计基础模式"""
    city_id: int
    record_date: date
    new_deal_units: Optional[int] = None
    new_deal_area: Optional[Decimal] = None
    secondhand_deal_units: Optional[int] = None
    secondhand_deal_area: Optional[Decimal] = None
    secondhand_deal_total_price: Optional[Decimal] = None


class DailyCityStatsCreate(DailyCityStatsBase):
    """创建城市每日成交统计模式"""
    pass


class DailyCityStatsUpdate(BaseModel):
    """更新城市每日成交统计模式"""
    city_id: Optional[int] = None
    record_date: Optional[date] = None
    new_deal_units: Optional[int] = None
    new_deal_area: Optional[Decimal] = None
    secondhand_deal_units: Optional[int] = None
    secondhand_deal_area: Optional[Decimal] = None
    secondhand_deal_total_price: Optional[Decimal] = None


class DailyCityStatsResponse(DailyCityStatsBase):
    """城市每日成交统计响应模式"""
    id: int
    created_at: datetime
    
    class Config:
        from_attributes = True
