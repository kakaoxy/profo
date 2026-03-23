from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from models.base import RecordType

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
    """销售记录响应"""
    id: str
    project_id: str
    record_type: str
    customer_name: Optional[str]
    customer_phone: Optional[str]
    customer_info: Optional[Dict[str, Any]]
    record_date: datetime
    record_time: Optional[str]
    price: Optional[Decimal]
    notes: Optional[str]
    feedback: Optional[str]
    result: Optional[str]
    related_agent: Optional[str]
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)

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
