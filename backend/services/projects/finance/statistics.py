"""资金账本统计页面聚合."""

import logging
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import case, func

from models import (
    FinanceRecord,
    Investment,
    Investor,
    Project,
    ProjectContract,
    ProjectRenovation,
    ProjectSale,
)
from models.common import BusinessForm, CashFlowCategory, CashFlowType
from schemas.project.ledger_statistics import (
    LedgerStatisticsCommission,
    LedgerStatisticsDeposit,
    LedgerStatisticsInvestment,
    LedgerStatisticsInvestor,
    LedgerStatisticsMarketing,
    LedgerStatisticsOperation,
    LedgerStatisticsProjectBase,
    LedgerStatisticsRenovation,
    LedgerStatisticsSummary,
    ProjectLedgerStatisticsResponse,
)
from services.system.exceptions import ResourceNotFoundError

from .statistics_builder import CalcBreakdownContext, build_calc_breakdown

logger = logging.getLogger(__name__)


class _StatisticsMixin:
    """资金账本统计页面聚合方法."""

    def get_statistics(self, project_id: str) -> ProjectLedgerStatisticsResponse:
        """资金账本统计页面：一次性聚合项目统计数据.

        聚合 8 个分组：项目基础信息 / 投资 / 装修 / 保证金 / 佣金 / 营销 / 运营 / 资金汇总.
        单次查询按 (type, category) 分组聚合 FinanceRecord，避免 N+1.
        """
        # 1-4. 一次 JOIN 获取项目+合同+销售+装修（减少3次串行查询）
        row = (
            self.db.query(Project, ProjectContract, ProjectSale, ProjectRenovation)
            .outerjoin(ProjectContract, ProjectContract.project_id == Project.id)
            .outerjoin(ProjectSale, ProjectSale.project_id == Project.id)
            .outerjoin(ProjectRenovation, ProjectRenovation.project_id == Project.id)
            .filter(Project.id == project_id, Project.is_deleted.is_(False))
            .first()
        )
        if not row:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        project, contract, sale, renovation = row

        # 5. 获取投资 + 顶级投资方（parent_id is null）
        investment = (
            self.db.query(Investment)
            .filter(Investment.project_id == project_id, Investment.deleted_at.is_(None))
            .first()
        )
        investors: list[Investor] = []
        if investment:
            investors = (
                self.db.query(Investor)
                .filter(Investor.investment_id == investment.id, Investor.parent_id.is_(None))
                .order_by(Investor.sort_order)
                .all()
            )

        # 6. 聚合 FinanceRecord by (type, category)，单次查询
        agg_rows = (
            self.db.query(
                FinanceRecord.type,
                FinanceRecord.category,
                func.sum(FinanceRecord.amount).label("total"),
            )
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
            )
            .group_by(FinanceRecord.type, FinanceRecord.category)
            .all()
        )
        agg: dict[tuple[str, str], Decimal] = {}
        for row in agg_rows:
            type_key = row.type.value if hasattr(row.type, "value") else str(row.type)
            cat_key = row.category.value if hasattr(row.category, "value") else str(row.category)
            agg[(type_key, cat_key)] = row.total or Decimal(0)

        def _amount(flow_type: CashFlowType, category: CashFlowCategory) -> Decimal:
            return agg.get((flow_type.value, category.value), Decimal(0))

        # 7-8. 合并3次查询为1次：跟投实付 + 保证金最近支付/收款时间
        combined = (
            self.db.query(
                FinanceRecord.counterparty,
                func.sum(
                    case(
                        (
                            (FinanceRecord.type == CashFlowType.INCOME.value)
                            & (FinanceRecord.category == CashFlowCategory.PROJECT_INVESTMENT),
                            FinanceRecord.amount,
                        ),
                        else_=Decimal(0),
                    ),
                ).label("paid"),
                func.max(
                    case(
                        (
                            (FinanceRecord.type == CashFlowType.EXPENSE.value)
                            & (FinanceRecord.category == CashFlowCategory.PERFORMANCE_BOND),
                            FinanceRecord.record_date,
                        ),
                    ),
                ).label("bond_pay_date"),
                func.max(
                    case(
                        (
                            (FinanceRecord.type == CashFlowType.INCOME.value)
                            & (FinanceRecord.category == CashFlowCategory.BOND_RECOVERY),
                            FinanceRecord.record_date,
                        ),
                    ),
                ).label("bond_receive_date"),
            )
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
            )
            .group_by(FinanceRecord.counterparty)
            .all()
        )

        paid_map: dict[str | None, Decimal] = {
            r.counterparty: r.paid or Decimal(0) for r in combined if (r.paid or Decimal(0)) > 0
        }
        bond_pay_date = max((r.bond_pay_date for r in combined if r.bond_pay_date), default=None)
        bond_receive_date = max((r.bond_receive_date for r in combined if r.bond_receive_date), default=None)

        # ==================== 构建响应各分组 ====================

        # --- project_base ---
        today = datetime.now(timezone.utc).date()
        planned_date = contract.planned_handover_date.date() if contract and contract.planned_handover_date else None
        sold_date = sale.sold_date.date() if sale and sale.sold_date else None

        if planned_date is None:
            project_days = 0
        elif sold_date is not None:
            project_days = (sold_date - planned_date).days
        else:
            project_days = (today - planned_date).days

        project_base = LedgerStatisticsProjectBase(
            community_name=project.community_name,
            address=project.address,
            area=project.area,
            status=project.status.value if project.status else None,
            delivery_date=contract.planned_handover_date if contract else None,
            deal_date=sale.sold_date if sale else None,
            project_days=project_days,
        )

        # --- investment ---
        investor_items: list[LedgerStatisticsInvestor] = []
        total_invest_amount = Decimal(0)
        total_paid_amount = Decimal(0)
        for inv in investors:
            inv_paid = paid_map.get(inv.name, Decimal(0))
            total_invest_amount += inv.invest_amount
            total_paid_amount += inv_paid
            investor_items.append(
                LedgerStatisticsInvestor(
                    name=inv.name,
                    share_ratio=inv.share_ratio,
                    invest_amount=inv.invest_amount,
                    paid_amount=inv_paid,
                ),
            )

        total_unpaid = total_invest_amount - total_paid_amount
        pay_progress = float((total_paid_amount / total_invest_amount) * 100) if total_invest_amount > 0 else 0.0
        investment_info = LedgerStatisticsInvestment(
            investors=investor_items,
            total_investment=total_invest_amount,
            total_paid=total_paid_amount,
            total_unpaid=total_unpaid,
            pay_progress=round(pay_progress, 1),
        )

        # --- renovation ---
        if renovation:
            hard_amount = renovation.hard_contract_amount or Decimal(0)
            soft_actual = renovation.soft_actual_cost or Decimal(0)
            custom_cabinet = renovation.custom_cabinet_amount or Decimal(0)
            window_amount = renovation.window_amount or Decimal(0)
            wall_treatment = renovation.wall_treatment_amount or Decimal(0)
            other_decoration = renovation.other_decoration_amount or Decimal(0)
            design_fee = renovation.design_fee or Decimal(0)
            demolition_fee = renovation.demolition_fee or Decimal(0)
            garbage_fee = renovation.garbage_fee or Decimal(0)
            other_fee = renovation.other_extra_fee or Decimal(0)

            total_fee = (
                hard_amount
                + soft_actual
                + custom_cabinet
                + window_amount
                + wall_treatment
                + other_decoration
                + design_fee
                + demolition_fee
                + garbage_fee
                + other_fee
            )

            area = project.area or Decimal(0)
            hard_unit_price = hard_amount / area if area > 0 else Decimal(0)

            reno_start = renovation.actual_start_date or renovation.contract_start_date
            reno_end = renovation.actual_end_date or datetime.now(timezone.utc)
            reno_days = (reno_end.date() - reno_start.date()).days if reno_start else 0

            renovation_info = LedgerStatisticsRenovation(
                company=renovation.renovation_company,
                total_fee=total_fee,
                hard_amount=hard_amount,
                hard_unit_price=hard_unit_price,
                soft_actual=soft_actual,
                custom_cabinet=custom_cabinet,
                window=window_amount,
                wall_treatment=wall_treatment,
                other_decoration=other_decoration,
                other_fee=other_fee,
                days=reno_days,
            )
        else:
            renovation_info = LedgerStatisticsRenovation()

        # --- deposit ---
        deposit_amount = _amount(CashFlowType.EXPENSE, CashFlowCategory.PERFORMANCE_BOND)
        deposit_recovery = _amount(CashFlowType.INCOME, CashFlowCategory.BOND_RECOVERY)
        if deposit_amount > 0:
            is_refunded = "已退还" if (deposit_amount - deposit_recovery) == 0 else "部分退还"
        else:
            is_refunded = "未支付"
        deposit_diff = abs(deposit_amount - deposit_recovery)
        deposit_info = LedgerStatisticsDeposit(
            amount=deposit_amount,
            pay_date=bond_pay_date,
            recovery=deposit_recovery,
            receive_date=bond_receive_date,
            is_refunded=is_refunded,
            diff=deposit_diff,
        )

        # --- commission ---
        channel_commission = _amount(CashFlowType.EXPENSE, CashFlowCategory.CHANNEL_COMMISSION)
        agent_commission = _amount(CashFlowType.EXPENSE, CashFlowCategory.PAID_COMMISSION)
        owner_commission = _amount(CashFlowType.INCOME, CashFlowCategory.OWNER_COMMISSION)
        tax_diff = _amount(CashFlowType.EXPENSE, CashFlowCategory.TAX_COMMISSION_DIFF)
        commission_total = owner_commission - agent_commission - channel_commission - tax_diff
        commission_info = LedgerStatisticsCommission(
            channel_commission=channel_commission,
            agent_commission=agent_commission,
            owner_commission=owner_commission,
            tax_diff=tax_diff,
            total=commission_total,
        )

        # --- marketing ---
        marketing_fee = _amount(CashFlowType.EXPENSE, CashFlowCategory.MARKETING_PROMOTION)
        marketing_advance = _amount(CashFlowType.EXPENSE, CashFlowCategory.MARKETING_ADVANCE)
        marketing_deduction = _amount(CashFlowType.INCOME, CashFlowCategory.MARKETING_PROMOTION_DEDUCTION)
        marketing_total = marketing_fee - marketing_advance + marketing_deduction
        marketing_info = LedgerStatisticsMarketing(
            marketing_fee=marketing_fee,
            advance=marketing_advance,
            deduction=marketing_deduction,
            total=marketing_total,
        )

        # --- operation ---
        operation_fee = _amount(CashFlowType.EXPENSE, CashFlowCategory.OPERATION_FEE)
        maintenance_reserve = _amount(CashFlowType.EXPENSE, CashFlowCategory.PROJECT_RESERVE)
        tax_cost = _amount(CashFlowType.EXPENSE, CashFlowCategory.FINANCE_TAX_COST)
        operation_total = operation_fee + maintenance_reserve + tax_cost
        operation_info = LedgerStatisticsOperation(
            operation_fee=operation_fee,
            maintenance_reserve=maintenance_reserve,
            tax_cost=tax_cost,
            total=operation_total,
        )

        # --- summary ---
        # 按业务形式分支计算（None 回退 AGENT）
        is_wholesale = project.business_form == BusinessForm.WHOLESALE

        # 公共科目金额
        channel_commission_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.CHANNEL_COMMISSION)
        engineering_renovation_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.ENGINEERING_RENOVATION)
        hard_decoration_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.HARD_DECORATION)
        soft_decoration_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.SOFT_DECORATION)
        custom_cabinet_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.CUSTOM_CABINET_DECORATION)
        window_decoration_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.WINDOW_DECORATION)
        wall_decoration_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.WALL_DECORATION)
        other_decoration_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.OTHER_DECORATION)
        total_renovation_exp = (
            hard_decoration_exp
            + soft_decoration_exp
            + custom_cabinet_exp
            + window_decoration_exp
            + wall_decoration_exp
            + other_decoration_exp
            + engineering_renovation_exp
        )
        marketing_advance_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.MARKETING_ADVANCE)
        marketing_promotion_deduction_inc = _amount(CashFlowType.INCOME, CashFlowCategory.MARKETING_PROMOTION_DEDUCTION)
        project_incentive_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PROJECT_INCENTIVE)
        marketing_promotion_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.MARKETING_PROMOTION)
        operation_fee_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.OPERATION_FEE)
        finance_tax_cost_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.FINANCE_TAX_COST)
        other_expense_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.OTHER_EXPENSE)

        # 初始化分支专属变量（避免传参时 NameError，不影响计算结果：未走到的分支变量保持 0，
        # build_calc_breakdown 仅读取实际分支对应的变量）
        purchase_deposit_exp = Decimal(0)
        purchase_downpayment_exp = Decimal(0)
        property_tax_exp = Decimal(0)
        quota_fee_exp = Decimal(0)
        holding_cost_monthly_exp = Decimal(0)
        selling_commission_exp = Decimal(0)
        selling_tax_exp = Decimal(0)
        performance_bond_exp = Decimal(0)
        tax_commission_diff_exp = Decimal(0)
        paid_commission_exp = Decimal(0)
        owner_commission_inc = Decimal(0)

        if is_wholesale:
            # 收购美化 - WHOLESALE 业务分支
            purchase_deposit_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PURCHASE_DEPOSIT)
            purchase_downpayment_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PURCHASE_DOWNPAYMENT)
            property_tax_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PROPERTY_TAX)
            quota_fee_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.QUOTA_FEE)
            holding_cost_monthly_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.HOLDING_COST_MONTHLY)
            selling_commission_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.SELLING_COMMISSION)
            selling_tax_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.SELLING_TAX)

            total_expense = (
                purchase_deposit_exp
                + purchase_downpayment_exp
                + property_tax_exp
                + quota_fee_exp
                + holding_cost_monthly_exp
                + channel_commission_exp
                + total_renovation_exp
                + marketing_advance_exp
                - marketing_promotion_deduction_inc
                + selling_commission_exp
                + selling_tax_exp
                + project_incentive_exp
                + marketing_promotion_exp
                + operation_fee_exp
                + finance_tax_cost_exp
                + other_expense_exp
            )
            initial_investment = (
                purchase_deposit_exp
                + purchase_downpayment_exp
                + property_tax_exp
                + quota_fee_exp
                + holding_cost_monthly_exp
                + channel_commission_exp
                + total_renovation_exp
                + marketing_advance_exp
            )
            project_income = _amount(CashFlowType.INCOME, CashFlowCategory.SALE_PRICE)
            gross_profit = (
                project_income
                - initial_investment
                - selling_commission_exp
                - selling_tax_exp
                - project_incentive_exp
                - other_expense_exp
            )
        else:
            # 代理美化(AGENT) 或 business_form=None 回退
            performance_bond_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PERFORMANCE_BOND)
            tax_commission_diff_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.TAX_COMMISSION_DIFF)
            paid_commission_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PAID_COMMISSION)
            owner_commission_inc = _amount(CashFlowType.INCOME, CashFlowCategory.OWNER_COMMISSION)

            total_expense = (
                channel_commission_exp
                + total_renovation_exp
                + tax_commission_diff_exp
                + paid_commission_exp
                - owner_commission_inc
                + marketing_advance_exp
                - marketing_promotion_deduction_inc
                + project_incentive_exp
                + marketing_promotion_exp
                + operation_fee_exp
                + finance_tax_cost_exp
                + other_expense_exp
            )
            initial_investment = (
                performance_bond_exp + channel_commission_exp + total_renovation_exp + marketing_advance_exp
            )
            project_income = _amount(CashFlowType.INCOME, CashFlowCategory.VALUE_ADDED_SERVICE)
            gross_profit = (
                project_income
                - initial_investment
                - tax_commission_diff_exp
                - paid_commission_exp
                + owner_commission_inc
                - project_incentive_exp
                - other_expense_exp
            )

        net_profit = gross_profit - marketing_promotion_exp - operation_fee_exp - finance_tax_cost_exp

        occupy_days = project_days
        roi = round(float(net_profit / initial_investment * 100), 1) if initial_investment != 0 else 0.0
        annual_roi = round(roi * 365 / occupy_days, 1) if occupy_days != 0 else 0.0

        summary_info = LedgerStatisticsSummary(
            total_expense=total_expense,
            initial_investment=initial_investment,
            gross_profit=gross_profit,
            net_profit=net_profit,
            occupy_days=occupy_days,
            roi=roi,
            annual_roi=annual_roi,
            project_income=project_income,
        )

        # --- calc_breakdown（复用已计算的科目金额与中间结果，不发起额外查询）---
        calc_breakdown = build_calc_breakdown(
            CalcBreakdownContext(
                business_form=project.business_form,
                is_wholesale=is_wholesale,
                channel_commission_exp=channel_commission_exp,
                engineering_renovation_exp=engineering_renovation_exp,
                hard_decoration_exp=hard_decoration_exp,
                soft_decoration_exp=soft_decoration_exp,
                custom_cabinet_exp=custom_cabinet_exp,
                window_decoration_exp=window_decoration_exp,
                wall_decoration_exp=wall_decoration_exp,
                other_decoration_exp=other_decoration_exp,
                marketing_advance_exp=marketing_advance_exp,
                marketing_promotion_deduction_inc=marketing_promotion_deduction_inc,
                project_incentive_exp=project_incentive_exp,
                marketing_promotion_exp=marketing_promotion_exp,
                operation_fee_exp=operation_fee_exp,
                finance_tax_cost_exp=finance_tax_cost_exp,
                other_expense_exp=other_expense_exp,
                performance_bond_exp=performance_bond_exp,
                tax_commission_diff_exp=tax_commission_diff_exp,
                paid_commission_exp=paid_commission_exp,
                owner_commission_inc=owner_commission_inc,
                purchase_deposit_exp=purchase_deposit_exp,
                purchase_downpayment_exp=purchase_downpayment_exp,
                property_tax_exp=property_tax_exp,
                quota_fee_exp=quota_fee_exp,
                holding_cost_monthly_exp=holding_cost_monthly_exp,
                selling_commission_exp=selling_commission_exp,
                selling_tax_exp=selling_tax_exp,
                project_income=project_income,
                initial_investment=initial_investment,
                total_expense=total_expense,
                gross_profit=gross_profit,
                net_profit=net_profit,
                occupy_days=occupy_days,
                roi=roi,
                annual_roi=annual_roi,
                planned_date=planned_date,
                sold_date=sold_date,
            ),
        )

        return ProjectLedgerStatisticsResponse(
            project_base=project_base,
            investment=investment_info,
            renovation=renovation_info,
            deposit=deposit_info,
            commission=commission_info,
            marketing=marketing_info,
            operation=operation_info,
            summary=summary_info,
            calc_breakdown=calc_breakdown,
        )
