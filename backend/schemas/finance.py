"""
财务流水相关Schema（替换原cashflow_records）
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict


class FinanceBase(BaseModel):
    """财务记录基础字段"""
    type: str = Field(..., description="流水类型：income/expense")
    category: str = Field(..., description="费用类别")
    amount: Decimal = Field(..., description="金额(元)")
    record_date: datetime = Field(..., description="发生日期")
    operator_id: Optional[str] = Field(None, description="经办人ID")
    remark: Optional[str] = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FinanceCreate(FinanceBase):
    """创建财务记录请求"""
    project_id: str = Field(..., description="项目ID")


class FinanceUpdate(BaseModel):
    """更新财务记录请求"""
    type: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[Decimal] = None
    record_date: Optional[datetime] = None
    operator_id: Optional[str] = None
    remark: Optional[str] = None


class FinanceResponse(FinanceBase):
    """财务记录响应"""
    id: str = Field(..., description="财务记录ID")
    project_id: str = Field(..., description="项目ID")
    created_at: datetime
    updated_at: datetime


class FinanceListResponse(BaseModel):
    """财务记录列表响应"""
    items: List[FinanceResponse]
    total: int