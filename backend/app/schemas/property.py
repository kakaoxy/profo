"""
房源相关的Pydantic模式
"""
from datetime import datetime, date
from typing import Optional, Dict, Any
from decimal import Decimal
from pydantic import BaseModel


class PropertyBase(BaseModel):
    """房源基础模式"""
    community_id: int
    status: str
    source_property_id: Optional[str] = None
    layout_bedrooms: Optional[int] = None
    layout_living_rooms: Optional[int] = None
    layout_bathrooms: Optional[int] = None
    area_sqm: Optional[Decimal] = None
    orientation: Optional[str] = None
    floor_level: Optional[str] = None
    total_floors: Optional[int] = None
    build_year: Optional[int] = None
    listing_price_wan: Optional[Decimal] = None
    listing_date: Optional[date] = None
    deal_price_wan: Optional[Decimal] = None
    deal_date: Optional[date] = None
    deal_cycle_days: Optional[int] = None
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    mortgage_info: Optional[str] = None
    tags: Optional[str] = None
    details_json: Optional[Dict[str, Any]] = None


class PropertyCreate(PropertyBase):
    """创建房源模式"""
    pass


class PropertyUpdate(BaseModel):
    """更新房源模式"""
    community_id: Optional[int] = None
    status: Optional[str] = None
    source_property_id: Optional[str] = None
    layout_bedrooms: Optional[int] = None
    layout_living_rooms: Optional[int] = None
    layout_bathrooms: Optional[int] = None
    area_sqm: Optional[Decimal] = None
    orientation: Optional[str] = None
    floor_level: Optional[str] = None
    total_floors: Optional[int] = None
    build_year: Optional[int] = None
    listing_price_wan: Optional[Decimal] = None
    listing_date: Optional[date] = None
    deal_price_wan: Optional[Decimal] = None
    deal_date: Optional[date] = None
    deal_cycle_days: Optional[int] = None
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    mortgage_info: Optional[str] = None
    tags: Optional[str] = None
    details_json: Optional[Dict[str, Any]] = None


class PropertyResponse(PropertyBase):
    """房源响应模式"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PropertyFilter(BaseModel):
    """房源筛选模式"""
    community_name: Optional[str] = None
    status: Optional[str] = None
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    min_area: Optional[Decimal] = None
    max_area: Optional[Decimal] = None
    bedrooms: Optional[int] = None
    page: int = 1
    limit: int = 20
