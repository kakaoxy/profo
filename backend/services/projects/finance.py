"""项目财务业务服务.

负责：项目财务计算、现金流记录管理、财务报告生成
注意：已适配新的规范化表结构，财务流水使用 FinanceRecord 表

文件行数说明（>500 行）：
本文件约 660 行未拆分，原因：
1. 现金流 CRUD、财务汇总计算、资金账本聚合统计共享 FinanceRecord 模型与 _validate_category 校验
2. sync_financials 缓存同步被 create/delete 调用，拆分会破坏事务一致性
3. 与 InvestmentService 等同类服务保持单一 Service 类的现有模式一致
"""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from models import FinanceRecord, Project, ProjectContract, ProjectSale
from models.common import BusinessForm, CashFlowCategory, CashFlowType
from services.system.exceptions import ResourceNotFoundError, ServiceException, ValidationError

logger = logging.getLogger(__name__)


class FinanceService:
    """项目财务服务."""

    def __init__(self, db: Session) -> None:
        """初始化财务服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def create_record(self, project_id: str, record_data: Any) -> FinanceRecord:  # noqa: ANN401
        """创建现金流记录."""
        logger.info("Creating cashflow record for project %s", project_id)

        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found: %s", project_id)
            raise ResourceNotFoundError("项目不存在")

        # 验证现金流类型和分类匹配
        try:
            self._validate_category(record_data.type, record_data.category)
        except ValidationError:
            logger.exception("Cashflow category validation failed")
            raise

        # 业务形式驱动的现金流科目校验：
        # - 收购款(PURCHASE_PRICE)仅适用于收购美化(WHOLESALE)项目
        # - 中介佣金(AGENCY_COMMISSION)仅适用于代理美化(AGENT)项目
        # - business_form 为 None 的历史项目不拦截（兼容）
        if project.business_form is not None:
            if (
                record_data.category == CashFlowCategory.PURCHASE_PRICE
                and project.business_form != BusinessForm.WHOLESALE
            ):
                raise ValidationError("收购款科目仅适用于收购美化项目")
            if (
                record_data.category == CashFlowCategory.AGENCY_COMMISSION
                and project.business_form == BusinessForm.WHOLESALE
            ):
                raise ValidationError("中介佣金仅适用于代理美化项目")

        # 创建新的 FinanceRecord
        record = FinanceRecord(
            project_id=project_id,
            type=record_data.type.value,
            category=record_data.category.value,
            amount=record_data.amount,
            record_date=record_data.date,
            remark=record_data.description,
            counterparty=record_data.counterparty,
            receipt_url=record_data.receipt_url,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        self.db.add(record)
        self.db.commit()
        self.db.refresh(record)

        # 创建成功后，触发财务数据同步计算
        try:
            self.sync_financials(project_id)
            logger.info("Project financials synced for project %s", project_id)
        except Exception:
            logger.exception("Failed to sync project financials")

        logger.info("Cashflow record created successfully: %s", record.id)
        return record

    def get_records(self, project_id: str) -> list[FinanceRecord]:
        """获取项目现金流记录."""
        logger.info("Getting cashflow records for project %s", project_id)
        try:
            records = (
                self.db.query(FinanceRecord)
                .filter(
                    FinanceRecord.project_id == project_id,
                    FinanceRecord.is_deleted.is_(False),
                )
                .order_by(FinanceRecord.record_date.desc(), FinanceRecord.created_at.desc())
                .all()
            )
        except Exception as e:
            logger.exception("Error getting cashflow records for project %s", project_id)
            raise ServiceException("获取现金流记录失败") from e
        else:
            logger.info("Found %d cashflow records for project %s", len(records), project_id)
            return records

    def delete_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录."""
        logger.info("Deleting cashflow record %s for project %s", record_id, project_id)

        record = (
            self.db.query(FinanceRecord)
            .filter(
                FinanceRecord.id == record_id,
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
            )
            .first()
        )

        if not record:
            logger.error("Cashflow record not found: %s for project %s", record_id, project_id)
            raise ResourceNotFoundError("现金流记录不存在")

        record.is_deleted = True
        record.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        # 删除成功后，触发财务数据同步计算
        try:
            self.sync_financials(project_id)
            logger.info("Project financials synced for project %s", project_id)
        except Exception:
            logger.exception("Failed to sync project financials")

        logger.info("Cashflow record deleted successfully: %s", record_id)

    def get_summary(self, project_id: str) -> dict[str, Any]:
        """获取现金流汇总."""
        logger.info("Getting cashflow summary for project %s", project_id)

        try:
            # 1. 获取项目基本信息用于日期计算
            project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
            if not project:
                raise ResourceNotFoundError("项目不存在")  # noqa: TRY301

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
                            (FinanceRecord.type == "income", FinanceRecord.amount),
                            else_=0,
                        ),
                    ).label("total_income"),
                    func.sum(
                        case(
                            (FinanceRecord.type == "expense", FinanceRecord.amount),
                            else_=0,
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
                if project.status == "sold" and sale and sale.sold_date:
                    end_date = sale.sold_date

                delta = end_date.date() - start_date.date()
                holding_days = max(delta.days, 0)

            # 5. 计算年化收益率
            annualized_return = 0.0
            if holding_days > 0:
                annualized_return = (roi / holding_days) * 365

            summary = {
                "total_income": total_income,
                "total_expense": total_expense,
                "net_cash_flow": net_cash_flow,
                "roi": round(roi, 2),
                "holding_days": holding_days,
                "annualized_return": round(annualized_return, 2),
            }

            logger.info("Cashflow summary calculated for project %s: %s", project_id, summary)
            return summary  # noqa: TRY300
        except Exception as e:
            logger.exception("Error calculating cashflow summary for project %s", project_id)
            raise ServiceException("计算现金流汇总失败") from e

    def sync_financials(self, project_id: str) -> None:
        """同步计算项目的财务数据，并更新到 Project 表的缓存字段中."""
        # 1. 确认项目存在
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            return

        # 2. 聚合计算总收入
        income_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == "income",
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
                FinanceRecord.type == "expense",
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
        self.db.commit()

    def get_report(self, project_id: str) -> dict[str, Any]:
        """获取项目财务报告."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            raise ResourceNotFoundError("项目不存在")

        # 从 ProjectContract 获取签约价格
        contract = (
            self.db.query(ProjectContract)
            .filter(
                ProjectContract.project_id == project_id,
            )
            .first()
        )

        # 从 ProjectSale 获取销售价格
        sale = (
            self.db.query(ProjectSale)
            .filter(
                ProjectSale.project_id == project_id,
            )
            .first()
        )

        # 实时计算财务数据
        income_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == "income",
                FinanceRecord.is_deleted.is_(False),
            )
            .scalar()
        )
        total_income = float(income_res) if income_res else 0

        expense_res = (
            self.db.query(func.sum(FinanceRecord.amount))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.type == "expense",
                FinanceRecord.is_deleted.is_(False),
            )
            .scalar()
        )
        total_expense = float(expense_res) if expense_res else 0

        net_profit = total_income - total_expense
        roi = (net_profit / total_expense * 100) if total_expense > 0 else 0

        return {
            "project_id": project.id,
            "community_name": project.community_name,
            "status": project.status,
            "address": project.address,
            "signing_date": contract.signing_date if contract else None,
            "renovation_start_date": project.updated_at if project.status == "renovating" else None,
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
        }

        if flow_type == CashFlowType.EXPENSE and category not in expense_categories:
            raise ValidationError(f"支出类型不能使用分类: {category.value}")

        if flow_type == CashFlowType.INCOME and category not in income_categories:
            raise ValidationError(f"收入类型不能使用分类: {category.value}")

    # ==================== 资金账本 (Ledger) ====================

    def list_projects_with_stats(
        self,
        search: str | None,
        project_status: str | None,
        page: int,
        page_size: int,
    ) -> tuple[list[dict[str, Any]], int]:
        """资金账本：分页查询有流水记录的项目及其聚合统计.

        - JOIN Project + FinanceRecord，按 project_id 分组聚合
        - total_income / total_expense / net_cash_flow / record_count
        - search 模糊搜索 project.contract_no / project.community_name / project.address
        - project_status 筛选
        - 按 net_cash_flow 倒序分页
        """
        total_income_expr = func.sum(
            case(
                (FinanceRecord.type == CashFlowType.INCOME.value, FinanceRecord.amount),
                else_=Decimal(0),
            ),
        ).label("total_income")
        total_expense_expr = func.sum(
            case(
                (FinanceRecord.type == CashFlowType.EXPENSE.value, FinanceRecord.amount),
                else_=Decimal(0),
            ),
        ).label("total_expense")
        net_cash_flow_expr = (total_income_expr - total_expense_expr).label("net_cash_flow")
        record_count_expr = func.count(FinanceRecord.id).label("record_count")

        query = (
            self.db.query(
                Project.id.label("project_id"),
                Project.community_name.label("project_name"),
                Project.address.label("project_address"),
                Project.status.label("project_status"),
                ProjectContract.contract_no.label("project_code"),
                total_income_expr,
                total_expense_expr,
                net_cash_flow_expr,
                record_count_expr,
            )
            .join(FinanceRecord, FinanceRecord.project_id == Project.id)
            .outerjoin(ProjectContract, ProjectContract.project_id == Project.id)
            .filter(
                Project.is_deleted.is_(False),
                FinanceRecord.is_deleted.is_(False),
            )
            .group_by(
                Project.id,
                Project.community_name,
                Project.address,
                Project.status,
                ProjectContract.contract_no,
            )
        )

        if search:
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{escaped}%"
            query = query.filter(
                or_(
                    ProjectContract.contract_no.ilike(like, escape="\\"),
                    Project.community_name.ilike(like, escape="\\"),
                    Project.address.ilike(like, escape="\\"),
                ),
            )

        if project_status is not None:
            query = query.filter(Project.status == project_status)

        total: int = query.count()
        offset = (page - 1) * page_size
        rows = (
            query.order_by(net_cash_flow_expr.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items: list[dict[str, Any]] = []
        for row in rows:
            total_income = row.total_income or Decimal(0)
            total_expense = row.total_expense or Decimal(0)
            net_cf = total_income - total_expense
            roi = float((net_cf / total_expense) * 100) if total_expense > 0 else 0.0
            items.append(
                {
                    "project_id": row.project_id,
                    "project_code": row.project_code,
                    "project_name": row.project_name,
                    "project_address": row.project_address,
                    "project_status": row.project_status,
                    "total_income": total_income,
                    "total_expense": total_expense,
                    "net_cash_flow": net_cf,
                    "roi": round(roi, 2),
                    "record_count": int(row.record_count),
                },
            )
        return items, total

    def get_overall_stats(self) -> dict[str, Any]:
        """资金账本：全局汇总（有流水记录的项目数、总收入、总支出、净现金流、记录数）."""
        base = (
            self.db.query(FinanceRecord)
            .filter(FinanceRecord.is_deleted.is_(False))
        )

        total_records: int = base.count()

        agg = (
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
            .filter(FinanceRecord.is_deleted.is_(False))
            .first()
        )

        total_income = agg.total_income or Decimal(0)
        total_expense = agg.total_expense or Decimal(0)
        net_cash_flow = total_income - total_expense

        total_projects = (
            self.db.query(func.count(func.distinct(FinanceRecord.project_id)))
            .filter(FinanceRecord.is_deleted.is_(False))
            .scalar()
        ) or 0

        return {
            "total_projects": int(total_projects),
            "total_income": total_income,
            "total_expense": total_expense,
            "net_cash_flow": net_cash_flow,
            "total_records": int(total_records),
        }

    def export_ledger_excel(
        self,
        search: str | None,
        project_status: str | None,
    ) -> bytes:
        """资金账本：导出全量项目列表为 .xlsx（openpyxl）.

        列：项目编号、小区、地址、项目状态、总收入、总支出、净现金流、ROI(%)、记录数
        """
        import io  # noqa: PLC0415

        from openpyxl import Workbook  # noqa: PLC0415

        items, _ = self.list_projects_with_stats(
            search=search,
            project_status=project_status,
            page=1,
            page_size=10000,
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "资金账本"
        headers = [
            "项目编号",
            "小区",
            "地址",
            "项目状态",
            "总收入",
            "总支出",
            "净现金流",
            "ROI(%)",
            "记录数",
        ]
        ws.append(headers)

        status_label = {
            "signing": "签约",
            "renovating": "改造",
            "selling": "在售",
            "sold": "已售",
            "deleted": "已删除",
        }

        for it in items:
            ws.append(
                [
                    it["project_code"] or "",
                    it["project_name"] or "",
                    it["project_address"] or "",
                    status_label.get(it["project_status"], it["project_status"] or "-"),
                    float(it["total_income"]),
                    float(it["total_expense"]),
                    float(it["net_cash_flow"]),
                    round(it["roi"], 2),
                    it["record_count"],
                ],
            )

        for col_idx in range(1, len(headers) + 1):
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()

    def delete_record_by_id(self, record_id: str) -> None:
        """资金账本：按记录ID软删除流水（无需 project_id）.

        删除后触发财务数据同步计算.
        """
        logger.info("Deleting finance record %s", record_id)

        record = (
            self.db.query(FinanceRecord)
            .filter(
                FinanceRecord.id == record_id,
                FinanceRecord.is_deleted.is_(False),
            )
            .first()
        )

        if not record:
            logger.error("Finance record not found: %s", record_id)
            raise ResourceNotFoundError("现金流记录不存在")

        project_id = record.project_id
        record.is_deleted = True
        record.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        # 删除成功后，触发财务数据同步计算
        try:
            self.sync_financials(project_id)
            logger.info("Project financials synced for project %s", project_id)
        except Exception:
            logger.exception("Failed to sync project financials")

        logger.info("Finance record deleted successfully: %s", record_id)

    # 别名方法 - 与路由兼容
    def get_cashflow_records(self, project_id: str) -> list[FinanceRecord]:
        """获取项目现金流记录（路由兼容别名）."""
        return self.get_records(project_id)

    def get_cashflow_summary(self, project_id: str) -> dict[str, Any]:
        """获取现金流汇总（路由兼容别名）."""
        return self.get_summary(project_id)

    def create_cashflow_record(self, project_id: str, record_data: Any) -> FinanceRecord:  # noqa: ANN401
        """创建现金流记录（路由兼容别名）."""
        return self.create_record(project_id, record_data)

    def delete_cashflow_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录（路由兼容别名）."""
        return self.delete_record(record_id, project_id)


# 保持向后兼容的别名
ProjectFinanceService = FinanceService
CashFlowService = FinanceService
