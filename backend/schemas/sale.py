"""
项目销售相关Schema
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class SaleBase(BaseModel):
    """销售基础字段"""
    listing_date: Optional[datetime] = Field(None, description="上架日期")
    list_price: Optional[Decimal] = Field(None, description="挂牌价(万)")
    sold_date: Optional[datetime] = Field(None, description="成交时间")
    sold_price: Optional[Decimal] = Field(None, description="成交价(万)")
    channel_manager_id: Optional[str] = Field(None, description="渠道负责人ID")
    property_agent_id: Optional[str] = Field(None, description="房源维护人ID")
    negotiator_id: Optional[str] = Field(None, description="联卖谈判人ID")
    transaction_status: str = Field(default="在售", description="交易状态")

    model_config = ConfigDict(from_attributes=True)


class SaleCreate(SaleBase):
    """创建销售记录请求"""
    project_id: str = Field(..., description="项目ID")


class SaleUpdate(BaseModel):
    """更新销售记录请求"""
    listing_date: Optional[datetime] = None
    list_price: Optional[Decimal] = None
    sold_date: Optional[datetime] = None
    sold_price: Optional[Decimal] = None
    channel_manager_id: Optional[str] = None
    property_agent_id: Optional[str] = None
    negotiator_id: Optional[str] = None
    transaction_status: Optional[str] = None


class SaleResponse(SaleBase):
    """销售记录响应"""
    id: str = Field(..., description="销售ID")
    project_id: str = Field(..., description="项目ID")
    is_deleted: bool = Field(default=False, description="逻辑删除标记")
    created_at: datetime
    updated_at: datetime


class SaleListResponse(BaseModel):
    """销售记录列表响应"""
    items: List[SaleResponse]
    total: int