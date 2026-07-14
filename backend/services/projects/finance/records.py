"""现金流记录 CRUD."""

import logging
from datetime import datetime, timezone
from typing import Any

from models import FinanceRecord, FinanceRecordLog, Project
from models.common import BusinessForm, CashFlowCategory, FinanceActionType, SettlementStatus
from schemas.project.finance import (
    CashFlowRecordCreate,
    CashFlowSummary,
    LedgerRecordCreate,
    LedgerRecordUpdate,
)
from services.system.exceptions import ResourceNotFoundError, ServiceException, ValidationError

logger = logging.getLogger(__name__)


class _RecordMixin:
    """现金流记录 CRUD 方法."""

    def create_record(self, project_id: str, record_data: LedgerRecordCreate, operator_id: str) -> FinanceRecord:
        """创建现金流记录."""
        logger.info("Creating cashflow record for project %s", project_id)

        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found: %s", project_id)
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

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
                msg = "收购款科目仅适用于收购美化项目"
                raise ValidationError(msg)
            if (
                record_data.category == CashFlowCategory.AGENCY_COMMISSION
                and project.business_form == BusinessForm.WHOLESALE
            ):
                msg = "中介佣金仅适用于代理美化项目"
                raise ValidationError(msg)

        # 创建新的 FinanceRecord
        now = datetime.now(timezone.utc)
        record = FinanceRecord(
            project_id=project_id,
            type=record_data.type.value,
            category=record_data.category.value,
            amount=record_data.amount,
            record_date=record_data.date,
            remark=record_data.description,
            counterparty=record_data.counterparty,
            counterparty_type=record_data.counterparty_type,
            receipt_urls=record_data.receipt_urls,
            created_at=now,
            updated_at=now,
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
            msg = "获取现金流记录失败"
            raise ServiceException(msg) from e
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
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
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
            msg = "现金流记录不存在"
            raise ResourceNotFoundError(msg)

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
            msg = "现金流记录不存在"
            raise ResourceNotFoundError(msg)

        project_id = record.project_id

        # 编辑锁：已结算项目不可删除记录（与 delete_record 一致，防止资金账本路由绕过结算锁）
        # 项目不存在或已软删除 -> 404，避免 `if project:` 在软删除场景跳过结算锁
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found or soft-deleted: %s", project_id)
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
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

    def update_record(
        self,
        record_id: str,
        payload: LedgerRecordUpdate,
        operator_id: str,
    ) -> FinanceRecord:
        """资金账本：按记录ID更新流水（补充凭证/支付方类型）.

        - 补充凭证：追加到现有 receipt_urls，去重保序
        - 更新支付方类型：直接覆盖 counterparty_type
        - 已结算项目不可修改（与 create/delete 一致的编辑锁）
        """
        logger.info("Updating finance record %s", record_id)

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
            msg = "现金流记录不存在"
            raise ResourceNotFoundError(msg)

        project_id = record.project_id

        # 编辑锁：已结算项目不可修改记录
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found or soft-deleted: %s", project_id)
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        if project.finance_settlement_status == SettlementStatus.SETTLED:
            msg = "已结算，不可修改"
            raise ServiceException(msg, status_code=400)

        detail: dict[str, Any] = {}

        # 补充凭证：追加到现有 receipt_urls，去重保序
        if payload.receipt_urls is not None:
            existing = record.receipt_urls or []
            merged = list(dict.fromkeys(existing + payload.receipt_urls))
            record.receipt_urls = merged
            detail["receipt_urls"] = merged

        # 更新支付方类型
        if payload.counterparty_type is not None:
            record.counterparty_type = payload.counterparty_type
            detail["counterparty_type"] = payload.counterparty_type

        record.updated_at = datetime.now(timezone.utc)

        # 写入操作日志（与更新同一事务）
        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.UPDATE,
            detail=detail,
            operator=operator_id,
        )
        self.db.add(log)

        self.db.commit()
        self.db.refresh(record)

        logger.info("Finance record updated successfully: %s", record_id)
        return record

    # 别名方法 - 与路由兼容
    def get_cashflow_records(self, project_id: str) -> list[FinanceRecord]:
        """获取项目现金流记录（路由兼容别名）."""
        return self.get_records(project_id)

    def get_cashflow_summary(self, project_id: str) -> CashFlowSummary:
        """获取现金流汇总（路由兼容别名）."""
        return self.get_summary(project_id)

    def create_cashflow_record(
        self,
        project_id: str,
        record_data: CashFlowRecordCreate,
        operator_id: str,
    ) -> FinanceRecord:
        """创建现金流记录（路由兼容别名）."""
        return self.create_record(project_id, record_data, operator_id)

    def delete_cashflow_record(self, record_id: str, project_id: str) -> None:
        """删除现金流记录（路由兼容别名）."""
        return self.delete_record(record_id, project_id)
