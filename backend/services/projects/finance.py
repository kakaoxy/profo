"""项目财务业务服务.

负责：项目财务计算、现金流记录管理、财务报告生成
注意：已适配新的规范化表结构，财务流水使用 FinanceRecord 表

文件行数说明（>500 行）：
本文件约 1100 行未拆分，原因：
1. 现金流 CRUD、财务汇总计算、资金账本聚合统计（含 get_statistics 八分组）、操作日志共享 FinanceRecord 模型与 _validate_category 校验
2. sync_financials 缓存同步被 create/delete 调用，拆分会破坏事务一致性
3. create_record / delete_record_by_id 写日志需与主操作同事务，拆分会破坏原子性
4. 与 InvestmentService 等同类服务保持单一 Service 类的现有模式一致
"""

import csv
import io
import logging
import zipfile
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from sqlalchemy import case, func, or_
from sqlalchemy.orm import Session

from models import (
    FinanceRecord,
    FinanceRecordLog,
    Investment,
    Investor,
    Project,
    ProjectContract,
    ProjectRenovation,
    ProjectSale,
    User,
)
from models.common import (
    BusinessForm,
    CashFlowCategory,
    CashFlowType,
    FinanceActionType,
    ProjectStatus,
    SettlementStatus,
)
from schemas.project import FinanceLogResponse
from schemas.project.finance import (
    CashFlowRecordCreate,
    FinanceSettlementChangeRequest,
    FinanceSettlementResponse,
    FinanceUnsettleRequest,
    LedgerRecordCreate,
    LedgerStatisticsCalcBreakdown,
    LedgerStatisticsCalcItem,
    LedgerStatisticsCalcSection,
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
from services.system.exceptions import ResourceNotFoundError, ServiceException, ValidationError
from settings import settings
from utils.file_security import get_safe_file_path

logger = logging.getLogger(__name__)


class FinanceService:
    """项目财务服务."""

    def __init__(self, db: Session) -> None:
        """初始化财务服务.

        Args:
            db: SQLAlchemy数据库会话

        """
        self.db = db

    def create_record(self, project_id: str, record_data: LedgerRecordCreate, operator_id: str) -> FinanceRecord:
        """创建现金流记录."""
        logger.info("Creating cashflow record for project %s", project_id)

        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found: %s", project_id)
            raise ResourceNotFoundError("项目不存在")

        # 编辑锁：已结算项目不可新增记录
        self._assert_finance_editable(project)

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
            receipt_urls=record_data.receipt_urls,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )

        self.db.add(record)

        # 写入操作日志（与记录同一事务）
        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.CREATE,
            detail={
                "category": record_data.category.value,
                "amount": str(record_data.amount),
                "type": record_data.type.value,
                "counterparty": record_data.counterparty,
                "date": record_data.date.isoformat() if record_data.date else None,
            },
            operator=operator_id,
        )
        self.db.add(log)

        # flush 让 sync 聚合查询能看到新增记录；sync 失败则整体回滚（Fail Loud）
        self.db.flush()
        try:
            self._sync_financial_cache(project_id)
        except Exception:
            logger.exception("Failed to sync project financials")
            raise
        self.db.commit()
        self.db.refresh(record)

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

        # 编辑锁：已结算项目不可删除记录（与 delete_record_by_id 一致，防止 cashflow 路由绕过结算锁）
        # 项目不存在或已软删除 -> 404，避免 `if project:` 在软删除场景跳过结算锁（regression from 933a37c）
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found or soft-deleted: %s", project_id)
            raise ResourceNotFoundError("项目不存在")
        self._assert_finance_editable(project)

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
        # flush 让 sync 聚合查询排除已软删记录；sync 失败则整体回滚（Fail Loud）
        self.db.flush()
        try:
            self._sync_financial_cache(project_id)
        except Exception:
            logger.exception("Failed to sync project financials")
            raise
        self.db.commit()

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
                            (FinanceRecord.type == CashFlowType.INCOME.value, FinanceRecord.amount),
                            else_=0,
                        ),
                    ).label("total_income"),
                    func.sum(
                        case(
                            (FinanceRecord.type == CashFlowType.EXPENSE.value, FinanceRecord.amount),
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
                if project.status == ProjectStatus.SOLD.value and sale and sale.sold_date:
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
        - 按 Project.created_at 倒序分页（与项目列表一致，最新项目排最前）
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
                Project.created_at.label("project_created_at"),
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
                Project.created_at,
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
        rows = query.order_by(Project.created_at.desc()).offset(offset).limit(page_size).all()

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
        base = self.db.query(FinanceRecord).filter(FinanceRecord.is_deleted.is_(False))

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

    def export_project_records_zip(self, project_id: str) -> tuple[str, bytes]:
        """资金账本：导出单项目流水为 zip（含 CSV + 票据图片）.

        Returns:
            (filename_stem, zip_bytes) - filename_stem 形如 "资金账本_XX001_20260707"

        """
        records = self.get_records(project_id)

        # 查询项目编号用于文件名
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        contract = self.db.query(ProjectContract).filter(ProjectContract.project_id == project_id).first()
        project_code = (
            (contract.contract_no if contract else None) or (project.name if project else None) or project_id[:8]
        )

        today = datetime.now().strftime("%Y%m%d")
        filename_stem = f"资金账本_{project_code}_{today}"

        # 构建 CSV（UTF-8 with BOM，Excel 兼容）
        csv_buffer = io.StringIO()
        csv_buffer.write("\ufeff")
        writer = csv.writer(csv_buffer)
        writer.writerow(["日期", "交易形式", "交易方", "分类", "金额", "票据", "备注"])

        upload_dir = Path(settings.upload_dir).resolve()
        receipt_files: list[tuple[str, bytes]] = []
        seen_filenames: set[str] = set()
        type_label = {CashFlowType.INCOME.value: "收入", CashFlowType.EXPENSE.value: "支出"}

        for rec in records:
            date_str = rec.record_date.strftime("%Y-%m-%d") if rec.record_date else ""
            type_val = rec.type.value if rec.type else ""
            form_str = type_label.get(type_val, type_val)
            counterparty = rec.counterparty or ""
            category = rec.category.value if rec.category else ""
            amount = f"{float(rec.amount):.2f}" if rec.amount is not None else "0.00"
            remark = rec.remark or ""

            receipt_names: list[str] = []
            for url in rec.receipt_urls or []:
                filename = url.split("/static/uploads/")[-1] if "/static/uploads/" in url else url.lstrip("/")
                receipt_names.append(filename)

                if filename in seen_filenames:
                    continue
                seen_filenames.add(filename)

                try:
                    file_path = get_safe_file_path(upload_dir, filename)
                except ValueError:
                    logger.warning("票据文件名不安全或路径非法: %s", filename)
                    continue

                if file_path.is_file():
                    try:
                        receipt_files.append((f"receipts/{filename}", file_path.read_bytes()))
                    except Exception:
                        logger.warning("读取票据文件失败: %s", file_path)
                else:
                    logger.warning("票据文件不存在: %s", file_path)

            writer.writerow([date_str, form_str, counterparty, category, amount, ";".join(receipt_names), remark])

        # 构建 zip
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("流水.csv", csv_buffer.getvalue().encode("utf-8"))
            for zip_path, file_bytes in receipt_files:
                zf.writestr(zip_path, file_bytes)

        logger.info(
            "导出项目 %s 流水 zip 完成：%d 条记录，%d 个票据",
            project_id,
            len(records),
            len(receipt_files),
        )
        return filename_stem, zip_buffer.getvalue()

    def get_statistics(self, project_id: str) -> ProjectLedgerStatisticsResponse:
        """资金账本统计页面：一次性聚合项目统计数据.

        聚合 8 个分组：项目基础信息 / 投资 / 装修 / 保证金 / 佣金 / 营销 / 运营 / 资金汇总.
        单次查询按 (type, category) 分组聚合 FinanceRecord，避免 N+1.
        """
        # 1. 获取项目（404 if not found or soft-deleted）
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            raise ResourceNotFoundError("项目不存在")

        # 2. 获取合同（planned_handover_date = 交房时间）
        contract = self.db.query(ProjectContract).filter(ProjectContract.project_id == project_id).first()

        # 3. 获取销售（sold_date = 成交时间）
        sale = self.db.query(ProjectSale).filter(ProjectSale.project_id == project_id).first()

        # 4. 获取装修信息
        renovation = self.db.query(ProjectRenovation).filter(ProjectRenovation.project_id == project_id).first()

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

        # 7. 跟投实付：按 counterparty 匹配 PROJECT_INVESTMENT (income)
        paid_rows = (
            self.db.query(
                FinanceRecord.counterparty,
                func.sum(FinanceRecord.amount).label("paid"),
            )
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
                FinanceRecord.type == CashFlowType.INCOME.value,
                FinanceRecord.category == CashFlowCategory.PROJECT_INVESTMENT,
            )
            .group_by(FinanceRecord.counterparty)
            .all()
        )
        paid_map: dict[str | None, Decimal] = {row.counterparty: row.paid or Decimal(0) for row in paid_rows}

        # 8. 保证金最近支付/收款时间
        bond_pay_date = (
            self.db.query(func.max(FinanceRecord.record_date))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
                FinanceRecord.type == CashFlowType.EXPENSE.value,
                FinanceRecord.category == CashFlowCategory.PERFORMANCE_BOND,
            )
            .scalar()
        )
        bond_receive_date = (
            self.db.query(func.max(FinanceRecord.record_date))
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
                FinanceRecord.type == CashFlowType.INCOME.value,
                FinanceRecord.category == CashFlowCategory.BOND_RECOVERY,
            )
            .scalar()
        )

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
                + design_fee
                + demolition_fee
                + garbage_fee
                + other_fee
            )

            area = project.area or Decimal(0)
            hard_unit_price = hard_amount / area if area > 0 else Decimal(0)

            reno_start = renovation.actual_start_date or renovation.contract_start_date
            reno_end = renovation.actual_end_date or datetime.now(timezone.utc)
            if reno_start:
                reno_days = (reno_end.date() - reno_start.date()).days
            else:
                reno_days = 0

            renovation_info = LedgerStatisticsRenovation(
                company=renovation.renovation_company,
                total_fee=total_fee,
                hard_amount=hard_amount,
                hard_unit_price=hard_unit_price,
                soft_actual=soft_actual,
                custom_cabinet=custom_cabinet,
                window=window_amount,
                wall_treatment=wall_treatment,
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
        marketing_advance_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.MARKETING_ADVANCE)
        marketing_promotion_deduction_inc = _amount(CashFlowType.INCOME, CashFlowCategory.MARKETING_PROMOTION_DEDUCTION)
        project_incentive_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.PROJECT_INCENTIVE)
        marketing_promotion_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.MARKETING_PROMOTION)
        operation_fee_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.OPERATION_FEE)
        finance_tax_cost_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.FINANCE_TAX_COST)
        other_expense_exp = _amount(CashFlowType.EXPENSE, CashFlowCategory.OTHER_EXPENSE)

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
                + engineering_renovation_exp
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
                + engineering_renovation_exp
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
                + engineering_renovation_exp
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
                performance_bond_exp + channel_commission_exp + engineering_renovation_exp + marketing_advance_exp
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
        def _amt(label: str, sign: str, amount: Decimal | float) -> LedgerStatisticsCalcItem:
            """构建金额类明细项."""
            return LedgerStatisticsCalcItem(label=label, sign=sign, amount=float(amount))

        delivery_date_str = planned_date.isoformat() if planned_date else "无"
        deal_date_str = sold_date.isoformat() if sold_date else "无"

        if is_wholesale:
            s1_items = [
                _amt(CashFlowCategory.PURCHASE_DEPOSIT.value, "", purchase_deposit_exp),
                _amt(CashFlowCategory.PURCHASE_DOWNPAYMENT.value, "+", purchase_downpayment_exp),
                _amt(CashFlowCategory.PROPERTY_TAX.value, "+", property_tax_exp),
                _amt(CashFlowCategory.QUOTA_FEE.value, "+", quota_fee_exp),
                _amt(CashFlowCategory.HOLDING_COST_MONTHLY.value, "+", holding_cost_monthly_exp),
                _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "+", channel_commission_exp),
                _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", engineering_renovation_exp),
                _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", marketing_advance_exp),
                _amt(CashFlowCategory.MARKETING_PROMOTION_DEDUCTION.value, "-", marketing_promotion_deduction_inc),
                _amt(CashFlowCategory.SELLING_COMMISSION.value, "+", selling_commission_exp),
                _amt(CashFlowCategory.SELLING_TAX.value, "+", selling_tax_exp),
                _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "+", project_incentive_exp),
                _amt(CashFlowCategory.MARKETING_PROMOTION.value, "+", marketing_promotion_exp),
                _amt(CashFlowCategory.OPERATION_FEE.value, "+", operation_fee_exp),
                _amt(CashFlowCategory.FINANCE_TAX_COST.value, "+", finance_tax_cost_exp),
                _amt(CashFlowCategory.OTHER_EXPENSE.value, "+", other_expense_exp),
            ]
            s2_items = [
                _amt(CashFlowCategory.PURCHASE_DEPOSIT.value, "", purchase_deposit_exp),
                _amt(CashFlowCategory.PURCHASE_DOWNPAYMENT.value, "+", purchase_downpayment_exp),
                _amt(CashFlowCategory.PROPERTY_TAX.value, "+", property_tax_exp),
                _amt(CashFlowCategory.QUOTA_FEE.value, "+", quota_fee_exp),
                _amt(CashFlowCategory.HOLDING_COST_MONTHLY.value, "+", holding_cost_monthly_exp),
                _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "+", channel_commission_exp),
                _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", engineering_renovation_exp),
                _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", marketing_advance_exp),
            ]
            s3_label = CashFlowCategory.SALE_PRICE.value
            s4_items = [
                _amt(s3_label, "", project_income),
                _amt("项目前期投入", "-", initial_investment),
                _amt(CashFlowCategory.SELLING_COMMISSION.value, "-", selling_commission_exp),
                _amt(CashFlowCategory.SELLING_TAX.value, "-", selling_tax_exp),
                _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "-", project_incentive_exp),
                _amt(CashFlowCategory.OTHER_EXPENSE.value, "-", other_expense_exp),
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
                _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "", channel_commission_exp),
                _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", engineering_renovation_exp),
                _amt(CashFlowCategory.TAX_COMMISSION_DIFF.value, "+", tax_commission_diff_exp),
                _amt(CashFlowCategory.PAID_COMMISSION.value, "+", paid_commission_exp),
                _amt(CashFlowCategory.OWNER_COMMISSION.value, "-", owner_commission_inc),
                _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", marketing_advance_exp),
                _amt(CashFlowCategory.MARKETING_PROMOTION_DEDUCTION.value, "-", marketing_promotion_deduction_inc),
                _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "+", project_incentive_exp),
                _amt(CashFlowCategory.MARKETING_PROMOTION.value, "+", marketing_promotion_exp),
                _amt(CashFlowCategory.OPERATION_FEE.value, "+", operation_fee_exp),
                _amt(CashFlowCategory.FINANCE_TAX_COST.value, "+", finance_tax_cost_exp),
                _amt(CashFlowCategory.OTHER_EXPENSE.value, "+", other_expense_exp),
            ]
            s2_items = [
                _amt(CashFlowCategory.PERFORMANCE_BOND.value, "", performance_bond_exp),
                _amt(CashFlowCategory.CHANNEL_COMMISSION.value, "+", channel_commission_exp),
                _amt(CashFlowCategory.ENGINEERING_RENOVATION.value, "+", engineering_renovation_exp),
                _amt(CashFlowCategory.MARKETING_ADVANCE.value, "+", marketing_advance_exp),
            ]
            s3_label = CashFlowCategory.VALUE_ADDED_SERVICE.value
            s4_items = [
                _amt(s3_label, "", project_income),
                _amt("项目前期投入", "-", initial_investment),
                _amt(CashFlowCategory.TAX_COMMISSION_DIFF.value, "-", tax_commission_diff_exp),
                _amt(CashFlowCategory.PAID_COMMISSION.value, "-", paid_commission_exp),
                _amt(CashFlowCategory.OWNER_COMMISSION.value, "+", owner_commission_inc),
                _amt(CashFlowCategory.PROJECT_INCENTIVE.value, "-", project_incentive_exp),
                _amt(CashFlowCategory.OTHER_EXPENSE.value, "-", other_expense_exp),
            ]
            s1_formula = (
                "渠道佣金 + 工程装修费 + 税费及佣金差额 + 代付佣金 - 业主佣金 + "
                "营销费垫付 - 营销推广费抵扣 + 项目激励 + 营销推广费 + 运营费 + 财税成本 + 其他支出"
            )
            s2_formula = "履约保证金 + 渠道佣金 + 工程装修费 + 营销费垫付"
            s4_formula = "增值服务费 - 项目前期投入 - 税费及佣金差额 - 代付佣金 + 业主佣金 - 项目激励 - 其他支出"

        # 通用 S5-S8
        s5_items = [
            _amt("项目毛利", "", gross_profit),
            _amt(CashFlowCategory.MARKETING_PROMOTION.value, "-", marketing_promotion_exp),
            _amt(CashFlowCategory.OPERATION_FEE.value, "-", operation_fee_exp),
            _amt(CashFlowCategory.FINANCE_TAX_COST.value, "-", finance_tax_cost_exp),
        ]
        s6_items = [
            LedgerStatisticsCalcItem(label="成交时间", sign="", text=deal_date_str),
            LedgerStatisticsCalcItem(label="交房时间", sign="-", text=delivery_date_str),
        ]
        s7_items = [
            _amt("项目净利", "", net_profit),
            _amt("项目前期投入", "/", initial_investment),
        ]
        s8_items = [
            _amt("投资回报率", "", roi),
            _amt("资金占用时间", "/", occupy_days),
            _amt("常数", "*", 365),
        ]

        calc_sections = [
            LedgerStatisticsCalcSection(
                title="项目总支出",
                formula=s1_formula,
                items=s1_items,
                result=float(total_expense),
                result_type="currency",
            ),
            LedgerStatisticsCalcSection(
                title="项目前期投入",
                formula=s2_formula,
                items=s2_items,
                result=float(initial_investment),
                result_type="currency",
            ),
            LedgerStatisticsCalcSection(
                title="项目收入",
                formula=s3_label,
                items=[_amt(s3_label, "", project_income)],
                result=float(project_income),
                result_type="currency",
            ),
            LedgerStatisticsCalcSection(
                title="项目毛利",
                formula=s4_formula,
                items=s4_items,
                result=float(gross_profit),
                result_type="currency",
            ),
            LedgerStatisticsCalcSection(
                title="项目净利",
                formula="项目毛利 - 营销推广费 - 运营费 - 财税成本",
                items=s5_items,
                result=float(net_profit),
                result_type="currency",
            ),
            LedgerStatisticsCalcSection(
                title="资金占用时间",
                formula="成交时间 - 交房时间",
                items=s6_items,
                result=float(occupy_days),
                result_type="days",
            ),
            LedgerStatisticsCalcSection(
                title="投资回报率",
                formula="项目净利 / 项目前期投入 × 100",
                items=s7_items,
                result=roi,
                result_type="percent",
            ),
            LedgerStatisticsCalcSection(
                title="年化回报率",
                formula="投资回报率 / 资金占用时间 × 365",
                items=s8_items,
                result=annual_roi,
                result_type="percent",
            ),
        ]

        calc_breakdown = LedgerStatisticsCalcBreakdown(
            business_form=project.business_form.value if project.business_form else None,
            sections=calc_sections,
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

    def delete_record_by_id(self, record_id: str, operator_id: str) -> None:
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

        # 编辑锁：已结算项目不可删除记录
        project = self.db.query(Project).filter(Project.id == project_id).first()
        if project:
            self._assert_finance_editable(project)

        # 写入操作日志（与删除同一事务）
        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.DELETE,
            detail={
                "category": record.category.value if record.category else None,
                "amount": str(record.amount) if record.amount is not None else None,
                "type": record.type.value if record.type else None,
                "counterparty": record.counterparty,
                "date": record.record_date.isoformat() if record.record_date else None,
            },
            operator=operator_id,
        )
        self.db.add(log)

        record.is_deleted = True
        record.updated_at = datetime.now(timezone.utc)
        # flush 让 sync 聚合查询排除已软删记录；sync 失败则整体回滚（Fail Loud）
        self.db.flush()
        try:
            self._sync_financial_cache(project_id)
        except Exception:
            logger.exception("Failed to sync project financials")
            raise
        self.db.commit()

        logger.info("Finance record deleted successfully: %s", record_id)

    # ==================== 结算 / 反结算 ====================

    def _assert_finance_editable(self, project: Project) -> None:
        """编辑锁：已结算项目不可新增/删除流水记录."""
        if project.finance_settlement_status == SettlementStatus.SETTLED:
            raise ServiceException("已结算资金账本不可编辑，请先反结算", status_code=400)

    def _build_settlement_response(self, project: Project) -> FinanceSettlementResponse:
        """构建结算状态响应."""
        return FinanceSettlementResponse(
            finance_settlement_status=project.finance_settlement_status,
            finance_settled_date=project.finance_settled_date,
            finance_settled_note=project.finance_settled_note,
        )

    def settle_finance(
        self,
        project_id: str,
        data: FinanceSettlementChangeRequest,
        operator_id: str,
    ) -> FinanceSettlementResponse:
        """结算：unsettled → settled，记录日期与说明，写日志."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            raise ResourceNotFoundError("项目不存在")
        if project.finance_settlement_status == SettlementStatus.SETTLED:
            raise ValidationError("该项目资金账本已结算，无需重复结算")

        project.finance_settlement_status = SettlementStatus.SETTLED
        project.finance_settled_date = data.settled_date
        project.finance_settled_note = data.settled_note

        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.SETTLE,
            detail={
                "settled_date": data.settled_date.isoformat(),
                "settled_note": data.settled_note or "",
            },
            operator=operator_id,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(project)
        logger.info("项目 %s 资金账本已结算", project_id)
        return self._build_settlement_response(project)

    def unsettle_finance(
        self,
        project_id: str,
        data: FinanceUnsettleRequest,
        operator_id: str,
    ) -> FinanceSettlementResponse:
        """反结算：settled → unsettled，清空结算字段，写日志."""
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            raise ResourceNotFoundError("项目不存在")
        if project.finance_settlement_status != SettlementStatus.SETTLED:
            raise ValidationError("该项目资金账本未结算，无需反结算")

        project.finance_settlement_status = SettlementStatus.UNSETTLED
        project.finance_settled_date = None
        project.finance_settled_note = None

        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.UNSETTLE,
            detail={"reason": data.reason},
            operator=operator_id,
        )
        self.db.add(log)
        self.db.commit()
        self.db.refresh(project)
        logger.info("项目 %s 资金账本已反结算", project_id)
        return self._build_settlement_response(project)

    def list_logs(self, project_id: str) -> list[FinanceLogResponse]:
        """获取项目资金账本操作日志（按 created_at 降序）.

        联表 User 批量填充 operator_name（参考 InvestmentService._build_logs_response）。
        """
        logs = (
            self.db.query(FinanceRecordLog)
            .filter(FinanceRecordLog.project_id == project_id)
            .order_by(FinanceRecordLog.created_at.desc())
            .all()
        )

        operator_ids = {log.operator for log in logs}
        name_map: dict[str, str] = {}
        if operator_ids:
            users = self.db.query(User).filter(User.id.in_(operator_ids)).all()
            name_map = {u.id: (u.nickname or u.username or u.id) for u in users}

        return [
            FinanceLogResponse(
                id=log.id,
                project_id=log.project_id,
                action_type=log.action_type,
                detail=log.detail or {},
                operator_id=log.operator,
                operator_name=name_map.get(log.operator, log.operator),
                created_at=log.created_at,
            )
            for log in logs
        ]

    # 别名方法 - 与路由兼容
    def get_cashflow_records(self, project_id: str) -> list[FinanceRecord]:
        """获取项目现金流记录（路由兼容别名）."""
        return self.get_records(project_id)

    def get_cashflow_summary(self, project_id: str) -> dict[str, Any]:
        """获取现金流汇总（路由兼容别名）."""
        return self.get_summary(project_id)

    def create_cashflow_record(
        self, project_id: str, record_data: CashFlowRecordCreate, operator_id: str
    ) -> FinanceRecord:
        """创建现金流记录（路由兼容别名）."""
        return self.create_record(project_id, record_data, operator_id)

    def delete_cashflow_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录（路由兼容别名）."""
        return self.delete_record(record_id, project_id)


# 向后兼容别名,待调用方迁移后删除
CashFlowService = FinanceService
