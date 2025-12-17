from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from pydantic import BaseModel, Field, model_validator, ConfigDict
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

    @model_validator(mode='after')
    def validate_category_match(self) -> 'CashFlowRecordCreate':
        expense_categories = {
            CashFlowCategory.PERFORMANCE_BOND,
            CashFlowCategory.AGENCY_COMMISSION,
            CashFlowCategory.RENOVATION_FEE,
            CashFlowCategory.MARKETING_FEE,
            CashFlowCategory.OTHER_EXPENSE,
            CashFlowCategory.TAX_FEE,
            CashFlowCategory.OPERATION_FEE,
        }
        income_categories = {
            CashFlowCategory.BOND_RETURN,
            CashFlowCategory.PREMIUM,
            CashFlowCategory.SERVICE_FEE,
            CashFlowCategory.OTHER_INCOME,
            CashFlowCategory.SALE_PRICE,
        }
        
        if self.type == CashFlowType.EXPENSE and self.category not in expense_categories:
            raise ValueError(f"支出类型不能使用分类: {self.category}")
        if self.type == CashFlowType.INCOME and self.category not in income_categories:
            raise ValueError(f"收入类型不能使用分类: {self.category}")
        return self

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
    model_config = ConfigDict(from_attributes=True)

class CashFlowSummary(BaseModel):
    total_income: Decimal
    total_expense: Decimal
    net_cash_flow: Decimal
    roi: float
    model_config = ConfigDict(from_attributes=True)

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
    
    model_config = ConfigDict(from_attributes=True)