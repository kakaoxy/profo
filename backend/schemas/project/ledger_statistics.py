"""资金账本统计页面 Schema.

包含统计页面 8 分组聚合响应及其子模型（从 finance.py 拆分，降低单文件行数）。
这些模型仅依赖 Pydantic 与标准库类型，无跨 schema 引用。
"""

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, field_serializer


class LedgerStatisticsProjectBase(BaseModel):
    """统计页面 - 项目基础信息."""

    community_name: str | None = None
    address: str | None = None
    area: Decimal | None = Decimal(0)
    status: str | None = None
    delivery_date: datetime | None = None
    deal_date: datetime | None = None
    project_days: int = 0

    @field_serializer("area")
    def _serialize_area(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsInvestor(BaseModel):
    """统计页面 - 跟投人项."""

    name: str | None = None
    share_ratio: Decimal | None = Decimal(0)
    invest_amount: Decimal | None = Decimal(0)
    paid_amount: Decimal | None = Decimal(0)

    @field_serializer("share_ratio", "invest_amount", "paid_amount")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsInvestment(BaseModel):
    """统计页面 - 投资情况."""

    investors: list[LedgerStatisticsInvestor] = Field(default_factory=list)
    total_investment: Decimal | None = Decimal(0)
    total_paid: Decimal | None = Decimal(0)
    total_unpaid: Decimal | None = Decimal(0)
    pay_progress: float = 0.0

    @field_serializer("total_investment", "total_paid", "total_unpaid")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsRenovation(BaseModel):
    """统计页面 - 装修预算."""

    company: str | None = None
    total_fee: Decimal | None = Decimal(0)
    hard_amount: Decimal | None = Decimal(0)
    hard_unit_price: Decimal | None = Decimal(0)
    custom_cabinet: Decimal | None = Decimal(0)
    window: Decimal | None = Decimal(0)
    wall_treatment: Decimal | None = Decimal(0)
    other_decoration: Decimal | None = Decimal(0)
    other_fee: Decimal | None = Decimal(0)
    days: int = 0

    @field_serializer(
        "total_fee",
        "hard_amount",
        "hard_unit_price",
        "custom_cabinet",
        "window",
        "wall_treatment",
        "other_decoration",
        "other_fee",
    )
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsDeposit(BaseModel):
    """统计页面 - 履约保证金."""

    amount: Decimal | None = Decimal(0)
    pay_date: datetime | None = None
    recovery: Decimal | None = Decimal(0)
    receive_date: datetime | None = None
    is_refunded: str | None = None
    diff: Decimal | None = Decimal(0)

    @field_serializer("amount", "recovery", "diff")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsCommission(BaseModel):
    """统计页面 - 渠道佣金及税费."""

    channel_commission: Decimal | None = Decimal(0)
    agent_commission: Decimal | None = Decimal(0)
    owner_commission: Decimal | None = Decimal(0)
    tax_diff: Decimal | None = Decimal(0)
    total: Decimal | None = Decimal(0)

    @field_serializer("channel_commission", "agent_commission", "owner_commission", "tax_diff", "total")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsMarketing(BaseModel):
    """统计页面 - 营销推广费."""

    marketing_fee: Decimal | None = Decimal(0)
    advance: Decimal | None = Decimal(0)
    deduction: Decimal | None = Decimal(0)
    total: Decimal | None = Decimal(0)

    @field_serializer("marketing_fee", "advance", "deduction", "total")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsOperation(BaseModel):
    """统计页面 - 运营成本."""

    operation_fee: Decimal | None = Decimal(0)
    maintenance_reserve: Decimal | None = Decimal(0)
    tax_cost: Decimal | None = Decimal(0)
    total: Decimal | None = Decimal(0)

    @field_serializer("operation_fee", "maintenance_reserve", "tax_cost", "total")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsSummary(BaseModel):
    """统计页面 - 资金汇总 KPI."""

    total_expense: Decimal | None = Decimal(0)
    initial_investment: Decimal | None = Decimal(0)
    gross_profit: Decimal | None = Decimal(0)
    net_profit: Decimal | None = Decimal(0)
    occupy_days: int = 0
    roi: float = 0.0
    annual_roi: float = 0.0
    project_income: Decimal | None = Decimal(0)

    @field_serializer("total_expense", "initial_investment", "gross_profit", "net_profit", "project_income")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsCalcItem(BaseModel):
    """计算明细项."""

    label: str
    sign: str = ""
    amount: float | None = None
    text: str | None = None
    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsCalcSection(BaseModel):
    """计算区段."""

    title: str
    formula: str
    items: list[LedgerStatisticsCalcItem]
    result: float
    result_type: str
    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsCalcBreakdown(BaseModel):
    """资金汇总计算明细."""

    business_form: str | None = None
    sections: list[LedgerStatisticsCalcSection]
    model_config = ConfigDict(from_attributes=True)


class ProjectLedgerStatisticsResponse(BaseModel):
    """资金账本统计页面聚合响应（8 分组）."""

    project_base: LedgerStatisticsProjectBase
    investment: LedgerStatisticsInvestment
    renovation: LedgerStatisticsRenovation
    deposit: LedgerStatisticsDeposit
    commission: LedgerStatisticsCommission
    marketing: LedgerStatisticsMarketing
    operation: LedgerStatisticsOperation
    summary: LedgerStatisticsSummary
    calc_breakdown: LedgerStatisticsCalcBreakdown

    model_config = ConfigDict(from_attributes=True)
