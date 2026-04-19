"""
项目互动过程相关Schema（替换原sales_records）
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


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
