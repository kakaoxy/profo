"""
个人看房笔记相关的Pydantic模式
"""
from datetime import datetime, date
from typing import Optional
from decimal import Decimal
from pydantic import BaseModel, validator


class MyViewingBase(BaseModel):
    """个人看房笔记基础模式"""
    property_id: int
    agent_id: Optional[int] = None
    viewing_date: date
    expected_purchase_price_wan: Optional[Decimal] = None
    rating: Optional[int] = None
    notes_general: Optional[str] = None
    notes_pros: Optional[str] = None
    notes_cons: Optional[str] = None
    
    @validator('rating')
    def validate_rating(cls, v):
        if v is not None and (v < 1 or v > 5):
            raise ValueError('评分必须在1-5之间')
        return v


class MyViewingCreate(MyViewingBase):
    """创建个人看房笔记模式"""
    pass


class MyViewingUpdate(BaseModel):
    """更新个人看房笔记模式"""
    property_id: Optional[int] = None
    agent_id: Optional[int] = None
    viewing_date: Optional[date] = None
    expected_purchase_price_wan: Optional[Decimal] = None
    rating: Optional[int] = None
    notes_general: Optional[str] = None
    notes_pros: Optional[str] = None
    notes_cons: Optional[str] = None
    
    @validator('rating')
    def validate_rating(cls, v):
        if v is not None and (v < 1 or v > 5):
            raise ValueError('评分必须在1-5之间')
        return v


class MyViewingResponse(MyViewingBase):
    """个人看房笔记响应模式"""
    id: int
    user_id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
