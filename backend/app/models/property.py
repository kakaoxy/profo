"""
房源模型
"""
from datetime import datetime, date
from typing import Optional, Dict, Any
from decimal import Decimal
from sqlmodel import SQLModel, Field, Column, JSON


class Property(SQLModel, table=True):
    """房源主表"""
    __tablename__ = "properties"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    community_id: int = Field(foreign_key="communities.id", index=True)
    status: str = Field(max_length=50, index=True)  # 在售, 已成交, 个人记录, 已下架
    source_property_id: Optional[str] = Field(default=None, max_length=255, index=True)
    layout_bedrooms: Optional[int] = Field(default=None)
    layout_living_rooms: Optional[int] = Field(default=None)
    layout_bathrooms: Optional[int] = Field(default=None)
    area_sqm: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    orientation: Optional[str] = Field(default=None, max_length=100)
    floor_level: Optional[str] = Field(default=None, max_length=100)
    total_floors: Optional[int] = Field(default=None)
    build_year: Optional[int] = Field(default=None)
    listing_price_wan: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    listing_date: Optional[date] = Field(default=None)
    deal_price_wan: Optional[Decimal] = Field(default=None, max_digits=10, decimal_places=2)
    deal_date: Optional[date] = Field(default=None)
    deal_cycle_days: Optional[int] = Field(default=None)
    source_url: Optional[str] = Field(default=None)
    image_url: Optional[str] = Field(default=None)
    mortgage_info: Optional[str] = Field(default=None)
    tags: Optional[str] = Field(default=None)
    details_json: Optional[Dict[str, Any]] = Field(default=None, sa_column=Column(JSON))
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
