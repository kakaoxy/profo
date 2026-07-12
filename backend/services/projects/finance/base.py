"""财务服务基础设施：db 会话 + 共享校验/缓存方法."""

import logging
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import FinanceRecord, Project
from models.common import CashFlowCategory, CashFlowType, SettlementStatus
from schemas.project.finance import FinanceSettlementResponse
from services.system.exceptions import ServiceException, ValidationError

logger = logging.getLogger(__name__)


class _FinanceServiceBase:
    """财务服务基类：持有 db 会话，提供共享校验/缓存方法."""

    def __init__(self, db: Session) -> None:
        """初始化财务服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def sync_financials(self, project_id: str) -> None:
        """同步计算项目的财务数据，并更新到 Project 表的缓存字段中（独立事务）.

        供 facade.sync_project_financials 等外部调用方使用，自带 commit。
        create_record / delete_record / delete_record_by_id 内部应调用
        _sync_financial_cache 与主操作同事务，避免假成功（Fail Loud）。
        """
        self._sync_financial_cache(project_id)
        self.db.commit()

    def _sync_financial_cache(self, project_id: str) -> None:
        """聚合流水计算缓存字段并写入 session（不 commit，由调用方负责事务）.

        失败时抛出异常，调用方未 commit 则整体回滚。
        """
        # 1. 确认项目存在
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            return

        # 2. 聚合计算总收入
        income_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == CashFlowType.INCOME.value,
                FinanceRecord.is_deleted.is_(False),
            )
            .scalar()
        )
        total_income = income_res or Decimal(0)

        # 3. 聚合计算总支出
        expense_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == CashFlowType.EXPENSE.value,
                FinanceRecord.is_deleted.is_(False),
            )
            .scalar()
        )
        total_expense = expense_res or Decimal(0)

        # 4. 计算净利润
        net_cash_flow = total_income - total_expense

        # 5. 计算 ROI
        roi = 0.0
        if total_expense > 0:
            roi = float((net_cash_flow / total_expense) * 100)

        # 6. 更新并保存到项目缓存字段
        project.total_income = total_income
        project.total_expense = total_expense
        project.net_cash_flow = net_cash_flow
        project.roi = roi

        self.db.add(project)

    def _validate_category(self, flow_type: CashFlowType, category: CashFlowCategory) -> None:
        """验证现金流类型和分类是否匹配."""
        expense_categories = {
            CashFlowCategory.PERFORMANCE_BOND,
            CashFlowCategory.AGENCY_COMMISSION,
            CashFlowCategory.RENOVATION_FEE,
            CashFlowCategory.MARKETING_FEE,
            CashFlowCategory.OTHER_EXPENSE,
            CashFlowCategory.TAX_FEE,
            CashFlowCategory.OPERATION_FEE,
            CashFlowCategory.PURCHASE_PRICE,
            CashFlowCategory.CHANNEL_COMMISSION,
            CashFlowCategory.ENGINEERING_RENOVATION,
            CashFlowCategory.HARD_DECORATION,
            CashFlowCategory.SOFT_DECORATION,
            CashFlowCategory.CUSTOM_CABINET_DECORATION,
            CashFlowCategory.WINDOW_DECORATION,
            CashFlowCategory.WALL_DECORATION,
            CashFlowCategory.OTHER_DECORATION,
            CashFlowCategory.MARKETING_PROMOTION,
            CashFlowCategory.OPERATION_SERVICE,
            CashFlowCategory.INVESTMENT_PRINCIPAL_RETURN,
            CashFlowCategory.INVESTOR_PROFIT_DISTRIBUTION,
            CashFlowCategory.PURCHASE_PRINCIPAL,
            CashFlowCategory.PROPERTY_TAX,
            CashFlowCategory.QUOTA_FEE,
            CashFlowCategory.HOLDING_COST_MONTHLY,
            CashFlowCategory.OTHER_TAX,
            CashFlowCategory.PROJECT_RESERVE,
            CashFlowCategory.MARKETING_ADVANCE,
            CashFlowCategory.FINANCE_TAX_COST,
            CashFlowCategory.PROJECT_INCENTIVE,
            CashFlowCategory.PAID_COMMISSION,
            CashFlowCategory.TAX_COMMISSION_DIFF,
            CashFlowCategory.PURCHASE_DEPOSIT,
            CashFlowCategory.PURCHASE_DOWNPAYMENT,
            CashFlowCategory.SELLING_COMMISSION,
            CashFlowCategory.SELLING_TAX,
        }

        income_categories = {
            CashFlowCategory.BOND_RETURN,
            CashFlowCategory.PREMIUM,
            CashFlowCategory.SERVICE_FEE,
            CashFlowCategory.OTHER_INCOME,
            CashFlowCategory.SALE_PRICE,
            CashFlowCategory.BOND_RECOVERY,
            CashFlowCategory.VALUE_ADDED_SERVICE,
            CashFlowCategory.PROJECT_INVESTMENT,
            CashFlowCategory.RESERVE_RECOVERY,
            CashFlowCategory.MARKETING_PROMOTION_DEDUCTION,
            CashFlowCategory.OWNER_COMMISSION,
        }

        if flow_type == CashFlowType.EXPENSE and category not in expense_categories:
            msg = f"支出类型不能使用分类: {category.value}"
            raise ValidationError(msg)

        if flow_type == CashFlowType.INCOME and category not in income_categories:
            msg = f"收入类型不能使用分类: {category.value}"
            raise ValidationError(msg)

    def _assert_finance_editable(self, project: Project) -> None:
        """编辑锁：已结算项目不可新增/删除流水记录."""
        if project.finance_settlement_status == SettlementStatus.SETTLED:
            msg = "已结算资金账本不可编辑，请先反结算"
            raise ServiceException(msg, status_code=400)

    def _build_settlement_response(self, project: Project) -> FinanceSettlementResponse:
        """构建结算状态响应."""
        return FinanceSettlementResponse(
            finance_settlement_status=project.finance_settlement_status,
            finance_settled_date=project.finance_settled_date,
            finance_settled_note=project.finance_settled_note,
        )
