"""资金账本统计 calc_breakdown 构造器（纯函数，无副作用）.

从 get_statistics 中提取，复用已计算的科目金额与中间结果，不发起额外查询。
"""

from dataclasses import dataclass
from datetime import date
from decimal import Decimal

from models.common import BusinessForm, CashFlowCategory
from schemas.project.finance import (
    LedgerStatisticsCalcBreakdown,
    LedgerStatisticsCalcItem,
    LedgerStatisticsCalcSection,
)


@dataclass
class CalcBreakdownContext:
    """build_calc_breakdown 所需的全部已计算值."""

    business_form: BusinessForm | None
    is_wholesale: bool
    # Common amounts
    channel_commission_exp: Decimal
    engineering_renovation_exp: Decimal
    marketing_advance_exp: Decimal
    marketing_promotion_deduction_inc: Decimal
    project_incentive_exp: Decimal
    marketing_promotion_exp: Decimal
    operation_fee_exp: Decimal
    finance_tax_cost_exp: Decimal
    other_expense_exp: Decimal
    # AGENT-specific
    performance_bond_exp: Decimal
    tax_commission_diff_exp: Decimal
    paid_commission_exp: Decimal
    owner_commission_inc: Decimal
    # WHOLESALE-specific
    purchase_deposit_exp: Decimal
    purchase_downpayment_exp: Decimal
    property_tax_exp: Decimal
    quota_fee_exp: Decimal
    holding_cost_monthly_exp: Decimal
    selling_commission_exp: Decimal
    selling_tax_exp: Decimal
    # Computed values
    project_income: Decimal
    initial_investment: Decimal
    total_expense: Decimal
    gross_profit: Decimal
    net_profit: Decimal
    occupy_days: int
    roi: float
    annual_roi: float
    # Dates
    planned_date: date | None
    sold_date: date | None


def build_calc_breakdown(ctx: CalcBreakdownContext) -> LedgerStatisticsCalcBreakdown:
    """构建 calc_breakdown（复用已计算的科目金额与中间结果，不发起额外查询）."""

    # --- calc_breakdown（复用已计算的科目金额与中间结果，不发起额外查询）---
    def _amt(label: str, sign: str, amount: Decimal | float) -> LedgerStatisticsCalcItem:
        """构建金额类明细项."""
        return LedgerStatisticsCalcItem(label=label, sign=sign, amount=float(amount))

    delivery_date_str = ctx.planned_date.isoformat() if ctx.planned_date else "无"
    deal_date_str = ctx.sold_date.isoformat() if ctx.sold_date else "无"

    if ctx.is_wholesale:
        s1_items = [
            _amt(CashFlowCategory.PURCHASE_DEPOSIT.value, "", ctx.purchase_deposit_exp),
            _amt(CashFlowCategory.PURCHASE_DOWNPAYMENT.value, "+", ctx.purchase_downpayment_exp),
            _amt(CashFlowCategory.PROPERTY_TAX.value, "+", ctx.property_tax_exp),
            _amt(CashFlowCategory.QUOTA_FEE.value, "+", ctx.quota_fee_exp),
            _amt(CashFlowCategory.HOLDING_COST_MONTHLY.value, "+", ctx.holding_cost_monthly_exp),
            _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "+", ctx.channel_commission_exp),
            _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", ctx.engineering_renovation_exp),
            _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", ctx.marketing_advance_exp),
            _amt(CashFlowCategory.MARKETING_PROMOTION_DEDUCTION.value, "-", ctx.marketing_promotion_deduction_inc),
            _amt(CashFlowCategory.SELLING_COMMISSION.value, "+", ctx.selling_commission_exp),
            _amt(CashFlowCategory.SELLING_TAX.value, "+", ctx.selling_tax_exp),
            _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "+", ctx.project_incentive_exp),
            _amt(CashFlowCategory.MARKETING_PROMOTION.value, "+", ctx.marketing_promotion_exp),
            _amt(CashFlowCategory.OPERATION_FEE.value, "+", ctx.operation_fee_exp),
            _amt(CashFlowCategory.FINANCE_TAX_COST.value, "+", ctx.finance_tax_cost_exp),
            _amt(CashFlowCategory.OTHER_EXPENSE.value, "+", ctx.other_expense_exp),
        ]
        s2_items = [
            _amt(CashFlowCategory.PURCHASE_DEPOSIT.value, "", ctx.purchase_deposit_exp),
            _amt(CashFlowCategory.PURCHASE_DOWNPAYMENT.value, "+", ctx.purchase_downpayment_exp),
            _amt(CashFlowCategory.PROPERTY_TAX.value, "+", ctx.property_tax_exp),
            _amt(CashFlowCategory.QUOTA_FEE.value, "+", ctx.quota_fee_exp),
            _amt(CashFlowCategory.HOLDING_COST_MONTHLY.value, "+", ctx.holding_cost_monthly_exp),
            _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "+", ctx.channel_commission_exp),
            _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", ctx.engineering_renovation_exp),
            _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", ctx.marketing_advance_exp),
        ]
        s3_label = CashFlowCategory.SALE_PRICE.value
        s4_items = [
            _amt(s3_label, "", ctx.project_income),
            _amt("项目前期投入", "-", ctx.initial_investment),
            _amt(CashFlowCategory.SELLING_COMMISSION.value, "-", ctx.selling_commission_exp),
            _amt(CashFlowCategory.SELLING_TAX.value, "-", ctx.selling_tax_exp),
            _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "-", ctx.project_incentive_exp),
            _amt(CashFlowCategory.OTHER_EXPENSE.value, "-", ctx.other_expense_exp),
        ]
        s1_formula = (
            "购房款-定金 + 购房款-首付 + 房屋税费 + 名额费 + 持有成本-月供 + "
            "渠道佣金 + 工程装修费 + 营销费垫付 - 营销推广费抵扣 + "
            "卖房佣金 + 卖房税费 + 项目激励 + 营销推广费 + 运营费 + 财税成本 + 其他支出"
        )
        s2_formula = (
            "购房款-定金 + 购房款-首付 + 房屋税费 + 名额费 + 持有成本-月供 + 渠道佣金 + 工程装修费 + 营销费垫付"
        )
        s4_formula = "售房款 - 项目前期投入 - 卖房佣金 - 卖房税费 - 项目激励 - 其他支出"
    else:
        s1_items = [
            _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "", ctx.channel_commission_exp),
            _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", ctx.engineering_renovation_exp),
            _amt(CashFlowCategory.TAX_COMMISSION_DIFF.value, "+", ctx.tax_commission_diff_exp),
            _amt(CashFlowCategory.PAID_COMMISSION.value, "+", ctx.paid_commission_exp),
            _amt(CashFlowCategory.OWNER_COMMISSION.value, "-", ctx.owner_commission_inc),
            _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", ctx.marketing_advance_exp),
            _amt(CashFlowCategory.MARKETING_PROMOTION_DEDUCTION.value, "-", ctx.marketing_promotion_deduction_inc),
            _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "+", ctx.project_incentive_exp),
            _amt(CashFlowCategory.MARKETING_PROMOTION.value, "+", ctx.marketing_promotion_exp),
            _amt(CashFlowCategory.OPERATION_FEE.value, "+", ctx.operation_fee_exp),
            _amt(CashFlowCategory.FINANCE_TAX_COST.value, "+", ctx.finance_tax_cost_exp),
            _amt(CashFlowCategory.OTHER_EXPENSE.value, "+", ctx.other_expense_exp),
        ]
        s2_items = [
            _amt(CashFlowCategory.PERFORMANCE_BOND.value, "", ctx.performance_bond_exp),
            _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "+", ctx.channel_commission_exp),
            _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", ctx.engineering_renovation_exp),
            _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", ctx.marketing_advance_exp),
        ]
        s3_label = CashFlowCategory.VALUE_ADDED_SERVICE.value
        s4_items = [
            _amt(s3_label, "", ctx.project_income),
            _amt("项目前期投入", "-", ctx.initial_investment),
            _amt(CashFlowCategory.TAX_COMMISSION_DIFF.value, "-", ctx.tax_commission_diff_exp),
            _amt(CashFlowCategory.PAID_COMMISSION.value, "-", ctx.paid_commission_exp),
            _amt(CashFlowCategory.OWNER_COMMISSION.value, "+", ctx.owner_commission_inc),
            _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "-", ctx.project_incentive_exp),
            _amt(CashFlowCategory.OTHER_EXPENSE.value, "-", ctx.other_expense_exp),
        ]
        s1_formula = (
            "渠道佣金 + 工程装修费 + 税费及佣金差额 + 代付佣金 - 业主佣金 + "
            "营销费垫付 - 营销推广费抵扣 + 项目激励 + 营销推广费 + 运营费 + 财税成本 + 其他支出"
        )
        s2_formula = "履约保证金 + 渠道佣金 + 工程装修费 + 营销费垫付"
        s4_formula = "增值服务费 - 项目前期投入 - 税费及佣金差额 - 代付佣金 + 业主佣金 - 项目激励 - 其他支出"

    # 通用 S5-S8
    s5_items = [
        _amt("项目毛利", "", ctx.gross_profit),
        _amt(CashFlowCategory.MARKETING_PROMOTION.value, "-", ctx.marketing_promotion_exp),
        _amt(CashFlowCategory.OPERATION_FEE.value, "-", ctx.operation_fee_exp),
        _amt(CashFlowCategory.FINANCE_TAX_COST.value, "-", ctx.finance_tax_cost_exp),
    ]
    s6_items = [
        LedgerStatisticsCalcItem(label="成交时间", sign="", text=deal_date_str),
        LedgerStatisticsCalcItem(label="交房时间", sign="-", text=delivery_date_str),
    ]
    s7_items = [
        _amt("项目净利", "", ctx.net_profit),
        _amt("项目前期投入", "/", ctx.initial_investment),
    ]
    s8_items = [
        _amt("投资回报率", "", ctx.roi),
        _amt("资金占用时间", "/", ctx.occupy_days),
        _amt("常数", "*", 365),
    ]

    calc_sections = [
        LedgerStatisticsCalcSection(
            title="项目总支出",
            formula=s1_formula,
            items=s1_items,
            result=float(ctx.total_expense),
            result_type="currency",
        ),
        LedgerStatisticsCalcSection(
            title="项目前期投入",
            formula=s2_formula,
            items=s2_items,
            result=float(ctx.initial_investment),
            result_type="currency",
        ),
        LedgerStatisticsCalcSection(
            title="项目收入",
            formula=s3_label,
            items=[_amt(s3_label, "", ctx.project_income)],
            result=float(ctx.project_income),
            result_type="currency",
        ),
        LedgerStatisticsCalcSection(
            title="项目毛利",
            formula=s4_formula,
            items=s4_items,
            result=float(ctx.gross_profit),
            result_type="currency",
        ),
        LedgerStatisticsCalcSection(
            title="项目净利",
            formula="项目毛利 - 营销推广费 - 运营费 - 财税成本",
            items=s5_items,
            result=float(ctx.net_profit),
            result_type="currency",
        ),
        LedgerStatisticsCalcSection(
            title="资金占用时间",
            formula="成交时间 - 交房时间",
            items=s6_items,
            result=float(ctx.occupy_days),
            result_type="days",
        ),
        LedgerStatisticsCalcSection(
            title="投资回报率",
            formula="项目净利 / 项目前期投入 × 100",
            items=s7_items,
            result=ctx.roi,
            result_type="percent",
        ),
        LedgerStatisticsCalcSection(
            title="年化回报率",
            formula="投资回报率 / 资金占用时间 × 365",
            items=s8_items,
            result=ctx.annual_roi,
            result_type="percent",
        ),
    ]

    return LedgerStatisticsCalcBreakdown(
        business_form=ctx.business_form.value if ctx.business_form else None,
        sections=calc_sections,
    )
