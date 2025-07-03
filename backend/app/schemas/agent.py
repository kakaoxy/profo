"""
经纪人相关的Pydantic模式
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class AgentBase(BaseModel):
    """经纪人基础模式"""
    agency_id: int
    name: str
    phone: Optional[str] = None


class AgentCreate(AgentBase):
    """创建经纪人模式"""
    pass


class AgentUpdate(BaseModel):
    """更新经纪人模式"""
    agency_id: Optional[int] = None
    name: Optional[str] = None
    phone: Optional[str] = None


class AgentResponse(AgentBase):
    """经纪人响应模式"""
    id: int
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
