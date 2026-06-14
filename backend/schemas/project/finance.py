"""项目财务相关Schema.

包含：
1. 现金流记录 (CashFlowRecordCreate, CashFlowRecordResponse)
2. 财务摘要和报表 (CashFlowSummary, CashFlowResponse, ProjectReportResponse)
3. 规范化财务表 (FinanceCreate, FinanceUpdate, FinanceResponse).
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, computed_field

from models.common import CashFlowCategory, CashFlowType

# ========== 现金流记录 (来自 project_finance.py) ==========


class CashFlowRecordCreate(BaseModel):
    """创建现金流."""

    type: CashFlowType
    category: CashFlowCategory
    amount: Decimal
    date: datetime
    description: str | None = None
    related_stage: str | None = None

    model_config = ConfigDict(from_attributes=True)


class CashFlowRecordResponse(BaseModel):
    """现金流记录响应 - 适配新的FinanceRecord表."""

    id: str
    project_id: str
    type: str
    category: str
    amount: Decimal
    record_date: datetime = Field(description="发生日期")  # 新字段名
    remark: str | None = Field(None, description="备注")  # 新字段名
    operator_id: str | None = Field(None, description="经办人ID")  # 新字段
    created_at: datetime
    updated_at: datetime

    # 兼容旧字段（用于响应）- 使用 computed_field 确保序列化
    @computed_field
    @property
    def date(self) -> datetime:
        """兼容旧字段 date（返回 record_date）."""
        return self.record_date

    @computed_field
    @property
    def description(self) -> str | None:
        """兼容旧字段 description（返回 remark）."""
        return self.remark

    @computed_field
    @property
    def related_stage(self) -> str | None:
        """兼容旧字段 related_stage（始终返回 None）."""
        return None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})


class CashFlowSummary(BaseModel):
    """现金流摘要."""

    total_income: Decimal
    total_expense: Decimal
    net_cash_flow: Decimal
    roi: float
    annualized_return: float = 0.0
    holding_days: int = 0
    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})


class CashFlowResponse(BaseModel):
    """现金流响应."""

    records: list[CashFlowRecordResponse]
    summary: CashFlowSummary
    model_config = ConfigDict(from_attributes=True)


class ProjectReportResponse(BaseModel):
    """财务报表 - 适配新的规范化表结构."""

    project_id: str
    project_name: str | None = None
    community_name: str | None = None
    status: str

    signing_date: datetime | None
    renovation_start_date: datetime | None
    renovation_end_date: datetime | None = None
    listing_date: datetime | None
    sold_date: datetime | None

    total_investment: Decimal
    total_income: Decimal
    net_profit: Decimal
    roi: float

    address: str | None = None
    sale_price: Decimal | None = None
    list_price: Decimal | None = None
    signing_price: Decimal | None = None

    model_config = ConfigDict(from_attributes=True, json_encoders={Decimal: float})


# ========== 规范化财务表 (来自 finance.py) ==========


class FinanceBase(BaseModel):
    """财务记录基础字段."""

    type: str = Field(description="流水类型：income/expense")
    category: str = Field(description="费用类别")
    amount: Decimal = Field(description="金额(元)")
    record_date: datetime = Field(description="发生日期")
    operator_id: str | None = Field(None, description="经办人ID")
    remark: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FinanceCreate(FinanceBase):
    """创建财务记录请求."""

    project_id: str = Field(description="项目ID")


class FinanceUpdate(BaseModel):
    """更新财务记录请求."""

    type: str | None = None
    category: str | None = None
    amount: Decimal | None = None
    record_date: datetime | None = None
    operator_id: str | None = None
    remark: str | None = None


class FinanceResponse(FinanceBase):
    """财务记录响应."""

    id: str = Field(description="财务记录ID")
    project_id: str = Field(description="项目ID")
    created_at: datetime
    updated_at: datetime


class FinanceListResponse(BaseModel):
    """财务记录列表响应."""

    items: list[FinanceResponse]
    total: int
