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
    id: str
    project_id: str
    type: str
    category: str
    amount: Decimal
    date: datetime
    description: Optional[str]
    related_stage: Optional[str]
    created_at: datetime
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
    """财务报表"""
    project_id: str
    project_name: str
    status: str
    
    signing_date: Optional[datetime]
    renovation_start_date: Optional[datetime]
    renovation_end_date: Optional[datetime]
    listing_date: Optional[datetime]
    sold_date: Optional[datetime]
    
    total_investment: Decimal
    total_income: Decimal
    net_profit: Decimal
    roi: float
    
    address: str
    sale_price: Optional[Decimal]
    list_price: Optional[Decimal]
    
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})
