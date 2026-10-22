"""现金流汇总与财务报告."""

import logging
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func

from models import FinanceRecord, Project, ProjectContract, ProjectRenovation, ProjectSale
from models.common import CashFlowType, ProjectStatus
from schemas.project.finance import CashFlowSummary
from services.system.exceptions import ResourceNotFoundError, ServiceException

logger = logging.getLogger(__name__)


class _SummaryMixin:
    """现金流汇总与财务报告方法."""

    def get_summary(self, project_id: uuid.UUID) -> CashFlowSummary:
        """获取现金流汇总."""
        logger.info("Getting cashflow summary for project %s", project_id)

        try:
            # 1. 获取项目基本信息用于日期计算
            project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
            if not project:
                msg = "项目不存在"
                raise ResourceNotFoundError(msg)

            # 从 ProjectContract 获取签约日期
            contract = (
                self.db.query(ProjectContract)
                .filter(
                    ProjectContract.project_id == project_id,
                )
                .first()
            )

            # 从 ProjectSale 获取成交日期
            sale = (
                self.db.query(ProjectSale)
                .filter(
                    ProjectSale.project_id == project_id,
                )
                .first()
            )

            # 2. 聚合计算收入支出
            result = (
                self.db.query(
                    func.sum(
                        case(
                            (FinanceRecord.type == CashFlowType.INCOME.value, FinanceRecord.amount),
                            else_=Decimal(0),
                        ),
                    ).label("total_income"),
                    func.sum(
                        case(
                            (FinanceRecord.type == CashFlowType.EXPENSE.value, FinanceRecord.amount),
                            else_=Decimal(0),
                        ),
                    ).label("total_expense"),
                )
                .filter(FinanceRecord.project_id == project_id, FinanceRecord.is_deleted.is_(False))
                .first()
            )

            total_income = result.total_income or Decimal(0)
            total_expense = result.total_expense or Decimal(0)
            net_cash_flow = total_income - total_expense

            # 3. 计算 ROI
            roi_decimal = (net_cash_flow / total_expense) if total_expense > 0 else Decimal("0.0")
            roi = float(roi_decimal * 100)

            # 4. 计算资金占用天数
            holding_days = 0
            start_date = contract.signing_date if contract else project.created_at

            if start_date:
                end_date = datetime.now(timezone.utc)
                if project.status == ProjectStatus.SOLD.value and sale and sale.sold_date:
                    end_date = sale.sold_date

                delta = end_date.date() - start_date.date()
                holding_days = max(delta.days, 0)

            # 5. 计算年化收益率
            annualized_return = 0.0
            if holding_days > 0:
                annualized_return = (roi / holding_days) * 365

            summary = CashFlowSummary(
                total_income=total_income,
                total_expense=total_expense,
                net_cash_flow=net_cash_flow,
                roi=round(roi, 2),
                holding_days=holding_days,
                annualized_return=round(annualized_return, 2),
            )

            logger.info("Cashflow summary calculated for project %s", project_id)
        except (ResourceNotFoundError, ServiceException):
            raise
        except Exception as e:
            logger.exception("Error calculating cashflow summary for project %s", project_id)
            msg = "计算现金流汇总失败"
            raise ServiceException(msg) from e
        else:
            return summary

    def get_report(self, project_id: uuid.UUID) -> dict[str, Any]:
        """获取项目财务报告."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        # 从 ProjectContract 获取签约价格（排除软删记录）
        contract = (
            self.db.query(ProjectContract)
            .filter(
                ProjectContract.project_id == project_id,
                ProjectContract.is_deleted.is_(False),
            )
            .first()
        )

        # 从 ProjectSale 获取销售价格（排除软删记录）
        sale = (
            self.db.query(ProjectSale)
            .filter(
                ProjectSale.project_id == project_id,
                ProjectSale.is_deleted.is_(False),
            )
            .first()
        )

        # 装修信息：renovation_start_date 取装修合同开始日期（权威来源），
        # renovation_end_date 取实际完工日期；不再用 project.updated_at 冒充
        renovation = (
            self.db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .first()
        )

        # 实时计算财务数据
        income_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == CashFlowType.INCOME.value,
                FinanceRecord.is_deleted.is_(False),
            )
            .scalar()
        )
        total_income = float(income_res) if income_res else 0

        expense_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == CashFlowType.EXPENSE.value,
                FinanceRecord.is_deleted.is_(False),
            )
            .scalar()
        )
        total_expense = float(expense_res) if expense_res else 0

        net_profit = total_income - total_expense
        roi = (net_profit / total_expense * 100) if total_expense > 0 else 0

        return {
            "project_id": project.id,
            "project_name": project.name or project.generate_name(),
            "community_name": project.community_name,
            "status": project.status,
            "address": project.address,
            "signing_date": contract.signing_date if contract else None,
            "renovation_start_date": renovation.contract_start_date if renovation else None,
            "renovation_end_date": renovation.actual_end_date if renovation else None,
            "listing_date": sale.listing_date if sale else None,
            "sold_date": sale.sold_date if sale else None,
            "total_investment": total_expense,
            "total_income": total_income,
            "net_profit": net_profit,
            "roi": roi,
            "sale_price": float(sale.sold_price) if sale and sale.sold_price else None,
            "list_price": float(sale.list_price) if sale and sale.list_price else None,
            "signing_price": float(contract.signing_price) if contract and contract.signing_price else None,
        }
