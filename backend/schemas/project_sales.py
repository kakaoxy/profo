from datetime import datetime
from decimal import Decimal
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from models.base import RecordType

class SalesRolesUpdate(BaseModel):
    """更新销售角色"""
    channelManager: Optional[str] = Field(None, max_length=100)
    presenter: Optional[str] = Field(None, max_length=100)
    negotiator: Optional[str] = Field(None, max_length=100)
    
    # 兼容旧字段
    property_agent: Optional[str] = None
    client_agent: Optional[str] = None
    first_viewer: Optional[str] = None
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
    sold_price: Decimal = Field(..., alias="soldPrice")
    sold_date: datetime = Field(..., alias="soldDate")

    model_config = ConfigDict(
        populate_by_name=True, # 允许 Python 代码里用 sold_price 赋值
        from_attributes=True
    )