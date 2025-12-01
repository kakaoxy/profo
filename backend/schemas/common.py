"""
通用Schema
包含历史记录、失败记录、楼层解析等通用模型
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class FloorInfo(BaseModel):
    """楼层解析结果"""
    floor_number: Optional[int] = None
    total_floors: Optional[int] = None
    floor_level: Optional[str] = None


class PropertyHistoryResponse(BaseModel):
    """房源历史记录响应"""
    id: int
    change_type: str
    captured_at: datetime
    status: str
    listed_price_wan: Optional[float] = None
    sold_price_wan: Optional[float] = None
    build_area: Optional[float] = None
    
    model_config = {
        "from_attributes": True
    }


class FailedRecordResponse(BaseModel):
    """失败记录响应"""
    id: int
    data_source: Optional[str] = None
    failure_type: str
    failure_reason: str
    occurred_at: datetime
    is_handled: bool
    
    model_config = {
        "from_attributes": True
    }