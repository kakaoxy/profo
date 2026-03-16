from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict
from models.base import CashFlowType, CashFlowCategory

class CashFlowRecordCreate(BaseModel):
    """创建现金流"""
    type: CashFlowType
    category: CashFlowCategory
    amount: Decimal
    date: datetime
    description: Optional[str] = None
    related_stage: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CashFlowRecordResponse(BaseModel):
    """现金流记录响应 - 适配新的FinanceRecord表"""
    id: str
    project_id: str
    type: str
    category: str
    amount: Decimal
    record_date: datetime = Field(..., description="发生日期")  # 新字段名
    remark: Optional[str] = Field(None, description="备注")  # 新字段名
    operator_id: Optional[str] = Field(None, description="经办人ID")  # 新字段
    created_at: datetime
    updated_at: datetime

    # 兼容旧字段（用于响应）
    @property
    def date(self) -> datetime:
        return self.record_date

    @property
    def description(self) -> Optional[str]:
        return self.remark

    @property
    def related_stage(self) -> Optional[str]:
        return None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

class CashFlowSummary(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    net_cash_flow: Decimal
    roi: float
    annualized_return: float = 0.0
    holding_days: int = 0
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})

class CashFlowResponse(BaseModel):
    records: List[CashFlowRecordResponse]
    summary: CashFlowSummary
    model_config = ConfigDict(from_attributes=True)

class ProjectReportResponse(BaseModel):
    """财务报表 - 适配新的规范化表结构"""
    project_id: str
    project_name: Optional[str] = None
    community_name: Optional[str] = None
    status: str

    signing_date: Optional[datetime]
    renovation_start_date: Optional[datetime]
    renovation_end_date: Optional[datetime] = None
    listing_date: Optional[datetime]
    sold_date: Optional[datetime]

    total_investment: Decimal
    total_income: Decimal
    net_profit: Decimal
    roi: float

    address: Optional[str] = None
    sale_price: Optional[Decimal] = None
    list_price: Optional[Decimal] = None
    signing_price: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})
