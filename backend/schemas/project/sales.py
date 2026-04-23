"""
项目销售相关Schema
包含：
1. 销售角色更新 (SalesRolesUpdate)
2. 销售记录 (SalesRecordCreate, SalesRecordResponse)
3. 成交确认 (ProjectCompleteRequest)
4. 规范化销售表 (SaleCreate, SaleUpdate, SaleResponse)
5. 互动记录 (InteractionCreate, InteractionUpdate, InteractionResponse)
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from models.common import RecordType


# ========== 销售角色更新 (来自 project_sales.py) ==========

class SalesRolesUpdate(BaseModel):
    """更新销售角色 - 使用用户ID而非文本"""
    channel_manager_id: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("channel_manager_id", "channelManagerId", "channel_manager", "channelManager"),
        max_length=36,
        description="渠道负责人用户ID",
    )
    property_agent_id: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("property_agent_id", "propertyAgentId", "presenter"),
        max_length=36,
        description="讲房人用户ID(房源维护人)",
    )
    negotiator_id: Optional[str] = Field(
        None,
        validation_alias=AliasChoices("negotiator_id", "negotiatorId", "negotiator"),
        max_length=36,
        description="谈判人用户ID(联卖谈判人)",
    )

    model_config = ConfigDict(from_attributes=True)


class SalesRecordCreate(BaseModel):
    """创建销售记录"""
    record_type: RecordType
    customer_name: Optional[str] = Field(None, max_length=100)
    customer_phone: Optional[str] = Field(None, max_length=20)
    customer_info: Optional[Dict[str, Any]] = None
    record_date: datetime
    record_time: Optional[str] = None
    price: Optional[Decimal] = None
    notes: Optional[str] = None
    feedback: Optional[str] = None
    result: Optional[str] = None
    related_agent: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class SalesRecordResponse(BaseModel):
    """销售记录响应 - 兼容 ProjectInteraction 模型字段映射"""
    id: str
    project_id: str
    record_type: str
    customer_name: Optional[str] = Field(None, validation_alias=AliasChoices("customer_name", "interaction_target"))
    customer_phone: Optional[str] = None
    customer_info: Optional[Dict[str, Any]] = None
    record_date: datetime = Field(..., validation_alias=AliasChoices("record_date", "interaction_at"))
    record_time: Optional[str] = None
    price: Optional[Decimal] = None
    notes: Optional[str] = Field(None, validation_alias=AliasChoices("notes", "content"))
    feedback: Optional[str] = None
    result: Optional[str] = None
    related_agent: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)


class SalesRecordListResponse(BaseModel):
    """销售记录列表响应"""
    items: List[SalesRecordResponse]
    total: int


class ProjectCompleteRequest(BaseModel):
    """确认成交请求"""
    sold_price: Decimal = Field(
        ...,
        validation_alias=AliasChoices("sold_price", "soldPrice"),
    )
    sold_date: datetime = Field(
        ...,
        validation_alias=AliasChoices("sold_date", "soldDate"),
    )

    model_config = ConfigDict(
        populate_by_name=True, # 允许 Python 代码里用 sold_price 赋值
        from_attributes=True
    )


# ========== 规范化销售表 (来自 sale.py) ==========

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


# ========== 互动记录 (来自 interaction.py) ==========

class InteractionBase(BaseModel):
    """互动记录基础字段"""
    record_type: str = Field(description="互动类型")
    interaction_target: Optional[str] = Field(None, max_length=100, description="互动对象")
    content: Optional[str] = Field(None, description="互动详情")
    interaction_at: datetime = Field(description="互动时间")
    operator_id: Optional[str] = Field(None, description="操作人ID")

    model_config = ConfigDict(from_attributes=True)


class InteractionCreate(InteractionBase):
    """创建互动记录请求"""
    project_id: str = Field(description="项目ID")


class InteractionUpdate(BaseModel):
    """更新互动记录请求"""
    record_type: Optional[str] = None
    interaction_target: Optional[str] = None
    content: Optional[str] = None
    interaction_at: Optional[datetime] = None
    operator_id: Optional[str] = None


class InteractionResponse(InteractionBase):
    """互动记录响应"""
    id: str = Field(description="互动记录ID")
    project_id: str = Field(description="项目ID")
    price: Optional[Decimal] = Field(None, description="出价金额(万)")
    created_at: datetime
    updated_at: datetime


class InteractionListResponse(BaseModel):
    """互动记录列表响应"""
    items: List[InteractionResponse]
    total: int