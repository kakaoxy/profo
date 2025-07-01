"""
小区相关的Pydantic模式
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CommunityBase(BaseModel):
    """小区基础模式"""
    city_id: int
    name: str
    district: Optional[str] = None
    business_circle: Optional[str] = None
    address: Optional[str] = None


class CommunityCreate(CommunityBase):
    """创建小区模式"""
    pass


class CommunityUpdate(BaseModel):
    """更新小区模式"""
    city_id: Optional[int] = None
    name: Optional[str] = None
    district: Optional[str] = None
    business_circle: Optional[str] = None
    address: Optional[str] = None


class CommunityResponse(CommunityBase):
    """小区响应模式"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
