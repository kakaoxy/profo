"""资金账本统计页面 Schema.

按五层法 + 阶段现金流重算，替代原 8 分组聚合。
五层法(权责发生制): 收入层(⑥) → 毛利层(①②) → 净利层(③④)；
level=5 现金流专属 / level=7 配对项 不进损益，仅计入现金流 KPI。
各层金额 = 该层 (inflow - outflow) 合计，成本类为负、收入类为正，
故 gross = income + direct_cost、net = gross + opex + finance_cost 自洽。
"""

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, field_serializer


class LedgerStatisticsFiveLayer(BaseModel):
    """五层法统计(权责发生制·损益视角)."""

    income: Decimal = Decimal(0)
    direct_cost: Decimal = Decimal(0)
    gross: Decimal = Decimal(0)
    opex: Decimal = Decimal(0)
    finance_cost: Decimal = Decimal(0)
    net: Decimal = Decimal(0)

    @field_serializer("income", "direct_cost", "gross", "opex", "finance_cost", "net")
    def _serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsStageFlow(BaseModel):
    """阶段现金流(收付实现制·现金流视角)."""

    stage: str
    stage_label: str
    inflow: Decimal = Decimal(0)
    outflow: Decimal = Decimal(0)
    net: Decimal = Decimal(0)
    count: int = 0

    @field_serializer("inflow", "outflow", "net")
    def _serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsKPI(BaseModel):
    """统计页面 8 项 KPI."""

    project_income: Decimal = Decimal(0)
    gross_profit: Decimal = Decimal(0)
    net_profit: Decimal = Decimal(0)
    total_pnl_outflow: Decimal = Decimal(0)
    cash_inflow: Decimal = Decimal(0)
    cash_outflow: Decimal = Decimal(0)
    net_cashflow: Decimal = Decimal(0)
    record_count: int = 0

    @field_serializer(
        "project_income",
        "gross_profit",
        "net_profit",
        "total_pnl_outflow",
        "cash_inflow",
        "cash_outflow",
        "net_cashflow",
    )
    def _serialize_decimal(self, v: Decimal) -> float:
        return float(v)

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
    """五层法计算明细."""

    business_form: str | None = None
    sections: list[LedgerStatisticsCalcSection]
    model_config = ConfigDict(from_attributes=True)


class ProjectLedgerStatisticsResponse(BaseModel):
    """资金账本统计页面聚合响应(五层法 + 阶段现金流)."""

    five_layer: LedgerStatisticsFiveLayer
    stage_flows: list[LedgerStatisticsStageFlow]
    kpi: LedgerStatisticsKPI
    breakdown: LedgerStatisticsCalcBreakdown

    model_config = ConfigDict(from_attributes=True)
