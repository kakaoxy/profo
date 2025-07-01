"""
城市每日成交统计模型
"""
from datetime import datetime, date
from typing import Optional
from decimal import Decimal
from sqlmodel import SQLModel, Field


class DailyCityStats(SQLModel, table=True):
    """城市每日成交统计表"""
    __tablename__ = "daily_city_stats"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    city_id: int = Field(foreign_key="cities.id", index=True)
    record_date: date = Field(index=True)
    new_deal_units: Optional[int] = Field(default=None)
    new_deal_area: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    secondhand_deal_units: Optional[int] = Field(default=None)
    secondhand_deal_area: Optional[Decimal] = Field(default=None, max_digits=12, decimal_places=2)
    secondhand_deal_total_price: Optional[Decimal] = Field(default=None, max_digits=20, decimal_places=2)
    created_at: datetime = Field(default_factory=datetime.utcnow)
