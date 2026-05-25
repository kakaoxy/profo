"""
通用Schema
包含分页响应、历史记录、失败记录、楼层解析等通用模型
"""
from datetime import datetime
from typing import Optional, TypeVar, Generic, List
from pydantic import BaseModel, Field, ConfigDict


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """统一分页响应格式

    符合 AGENTS.md 规范第 29 条:
    列表接口必须返回 items/total/page/page_size 固定结构
    """
    items: List[T] = Field(..., description="数据列表")
    total: int = Field(..., description="总记录数")
    page: int = Field(..., description="当前页码")
    page_size: int = Field(..., description="每页数量")

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class FailedRecordResponse(BaseModel):
    """失败记录响应"""
    id: int
    data_source: Optional[str] = None
    failure_type: str
    failure_reason: str
    occurred_at: datetime
    is_handled: bool

    model_config = ConfigDict(from_attributes=True)