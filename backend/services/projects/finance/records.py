"""现金流记录 CRUD."""

import logging
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from models import FinanceRecord, FinanceRecordLog, FinanceSubject, Project
from models.common import BusinessForm, CashFlowCategory, CashFlowType, FinanceActionType
from schemas.project.finance import (
    CashFlowRecordCreate,
    CashFlowSummary,
    LedgerRecordCreate,
    LedgerRecordUpdate,
)
from services.system.exceptions import ResourceNotFoundError, ServiceException, ValidationError

logger = logging.getLogger(__name__)


def _business_form_to_mode(business_form: BusinessForm | None) -> str | None:
    """业务形式 → 科目 modes 匹配值.

    FinanceSubject.modes 使用 'agent'/'acquire'（与 Bookkeeping.md 一致），
    而 BusinessForm 枚举值为 'agent'/'wholesale'，需做映射：
    - BusinessForm.AGENT → "agent"
    - BusinessForm.WHOLESALE → "acquire"
    """
    if business_form == BusinessForm.AGENT:
        return "agent"
    if business_form == BusinessForm.WHOLESALE:
        return "acquire"
    return None


class _RecordMixin:
    """现金流记录 CRUD 方法."""

    def _derive_category_from_subject(
        self,
        subject: FinanceSubject,
        flow_type: CashFlowType,
    ) -> CashFlowCategory:
        """从科目名称推导兼容的 CashFlowCategory.

        迁移脚本按 category::text ↔ finance_subjects.name 匹配回填 subject_id，
        因此新写入记录应保持同样映射：subject.name 命中 CashFlowCategory.value 即用之；
        若命中项与 flow_type 不兼容（如收入科目配支出方向），兜底 OTHER_INCOME/OTHER_EXPENSE。
        """
        for cat in CashFlowCategory:
            if cat.value == subject.name:
                try:
                    self._validate_category(flow_type, cat)
                except ValidationError:
                    break  # 命中但不兼容，走兜底
                return cat
        if flow_type == CashFlowType.INCOME:
            return CashFlowCategory.OTHER_INCOME
        return CashFlowCategory.OTHER_EXPENSE

    def _validate_subject_for_project(
        self,
        subject: FinanceSubject,
        project: Project,
    ) -> None:
        """校验科目适用于当前项目业务模式（modes 包含映射后的 mode）."""
        if project.business_form is None:
            return  # 历史项目无业务模式，不拦截
        required_mode = _business_form_to_mode(project.business_form)
        if required_mode is not None and required_mode not in (subject.modes or []):
            msg = f"科目不适用于当前项目业务模式（需包含 {required_mode}）"
            raise ValidationError(msg)

    @staticmethod
    def _validate_outflow_inflow(outflow: Decimal, inflow: Decimal) -> None:
        """校验 outflow/inflow 互斥：不能同时 > 0；至少一项 > 0."""
        if outflow > 0 and inflow > 0:
            msg = "流出与流入不可同时大于0"
            raise ValidationError(msg)
        if outflow <= 0 and inflow <= 0:
            msg = "流出/流入至少填一项且大于0"
            raise ValidationError(msg)

    def create_record(self, project_id: str, record_data: LedgerRecordCreate, operator_id: str) -> FinanceRecord:
        """创建现金流记录.

        Task 5 调整：
        - 校验 subject_id 存在 + 未删除 + modes 含项目业务模式
        - 校验 outflow/inflow 互斥（同时 > 0 报错；均 ≤ 0 报错）
        - 从新字段推导旧字段（type/amount/counterparty/category）以兼容旧查询
        - 操作日志 detail 记录新字段
        """
        logger.info("Creating cashflow record for project %s", project_id)

        # 验证项目存在且状态有效
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found: %s", project_id)
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        # 编辑锁：已结算项目不可新增记录
        self._assert_finance_editable(project)

        # Task 5: 校验 subject_id 存在 + 未删除
        subject = (
            self.db.query(FinanceSubject)
            .filter(
                FinanceSubject.id == record_data.subject_id,
                FinanceSubject.is_deleted.is_(False),
            )
            .first()
        )
        if subject is None:
            msg = "科目不存在或已删除"
            raise ValidationError(msg)

        # Task 5: 校验科目适用于当前项目业务模式
        self._validate_subject_for_project(subject, project)

        # Task 5: 校验 outflow/inflow 互斥 + 至少一项 > 0
        outflow = record_data.outflow if record_data.outflow is not None else Decimal(0)
        inflow = record_data.inflow if record_data.inflow is not None else Decimal(0)
        self._validate_outflow_inflow(outflow, inflow)

        # Task 5: 从新字段推导旧字段（兼容旧查询）
        flow_type = CashFlowType.INCOME if inflow > 0 else CashFlowType.EXPENSE
        amount = inflow if inflow > 0 else outflow
        # counterparty 优先 payer（兼容旧查询）
        counterparty = record_data.payer or record_data.counterparty

        # Task 5: 推导 category（model 中 category NOT NULL）
        # - 用户显式提供 category → 使用之并校验 type/category 匹配
        # - 否则尝试 subject.name ↔ CashFlowCategory.value 匹配；兜底 OTHER_*
        if record_data.category is not None:
            category = record_data.category
            self._validate_category(flow_type, category)
        else:
            category = self._derive_category_from_subject(subject, flow_type)

        # 兼容校验：若用户显式提供 type，检查与推导结果一致
        if record_data.type is not None and record_data.type != flow_type:
            msg = (
                f"type 与 inflow/outflow 推导不一致："
                f"provided={record_data.type.value}, expected={flow_type.value}"
            )
            raise ValidationError(msg)

        # 创建 FinanceRecord（新字段 + 回填旧字段）
        now = datetime.now(timezone.utc)
        record = FinanceRecord(
            project_id=project_id,
            type=flow_type.value,
            category=category.value,
            amount=amount,
            record_date=record_data.date,
            remark=record_data.description,
            counterparty=counterparty,
            counterparty_type=record_data.counterparty_type,
            receipt_urls=record_data.receipt_urls,
            # Task 5 新字段
            subject_id=record_data.subject_id,
            outflow=outflow,
            inflow=inflow,
            payer=record_data.payer,
            payee=record_data.payee,
            created_at=now,
            updated_at=now,
        )

        self.db.add(record)

        # 写入操作日志（与记录同一事务）
        log = FinanceRecordLog(
            project_id=project_id,
            action_type=FinanceActionType.CREATE,
            detail={
                "category": category.value,
                "amount": str(amount),
                "type": flow_type.value,
                "counterparty": counterparty,
                "date": record_data.date.isoformat() if record_data.date else None,
                # Task 5 新字段
                "subject_id": record_data.subject_id,
                "subject_name": subject.name,
                "outflow": str(outflow),
                "inflow": str(inflow),
                "payer": record_data.payer,
                "payee": record_data.payee,
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
        """资金账本：按记录ID更新流水（支持 Task 5 新字段 + 兼容字段 + 通用字段）.

        - 新字段：subject_id/outflow/inflow/payer/payee
        - 兼容字段：type/category/amount/counterparty（由新字段推导回填，显式提供则校验一致性）
        - 通用字段：receipt_urls(追加)/counterparty_type/description/date
        - 如更新 outflow/inflow，重新校验互斥性并回填 type/amount
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

        # 编辑锁：已结算项目不可修改记录（与 create/delete 一致）
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            logger.error("Project not found or soft-deleted: %s", project_id)
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        self._assert_finance_editable(project)

        detail: dict[str, Any] = {}

        # Task 5: 处理 subject_id 更新（校验存在 + 业务模式匹配）
        if payload.subject_id is not None and payload.subject_id != record.subject_id:
            subject = (
                self.db.query(FinanceSubject)
                .filter(
                    FinanceSubject.id == payload.subject_id,
                    FinanceSubject.is_deleted.is_(False),
                )
                .first()
            )
            if subject is None:
                msg = "科目不存在或已删除"
                raise ValidationError(msg)
            self._validate_subject_for_project(subject, project)
            record.subject_id = payload.subject_id
            detail["subject_id"] = payload.subject_id
            detail["subject_name"] = subject.name

        # Task 5: 处理 outflow/inflow 更新（互斥重校 + 回填 type/amount）
        new_outflow = payload.outflow if payload.outflow is not None else (record.outflow or Decimal(0))
        new_inflow = payload.inflow if payload.inflow is not None else (record.inflow or Decimal(0))
        # 互斥校验（基于合并后的新值）
        self._validate_outflow_inflow(new_outflow, new_inflow)
        # 推导 type/amount
        new_type = CashFlowType.INCOME if new_inflow > 0 else CashFlowType.EXPENSE
        new_amount = new_inflow if new_inflow > 0 else new_outflow
        if payload.outflow is not None:
            record.outflow = payload.outflow
            detail["outflow"] = str(payload.outflow)
        if payload.inflow is not None:
            record.inflow = payload.inflow
            detail["inflow"] = str(payload.inflow)
        if record.type != new_type.value:
            record.type = new_type.value
            detail["type"] = new_type.value
        if record.amount != new_amount:
            record.amount = new_amount
            detail["amount"] = str(new_amount)

        # Task 5: 处理 payer/payee 更新（payer 同步回填 counterparty）
        if payload.payer is not None:
            record.payer = payload.payer
            detail["payer"] = payload.payer
            # 回填 counterparty（保持与 create 一致：payer 优先）
            if record.counterparty != payload.payer:
                record.counterparty = payload.payer
                detail["counterparty"] = payload.payer
        if payload.payee is not None:
            record.payee = payload.payee
            detail["payee"] = payload.payee

        # Task 5: 兼容字段一致性校验（type/amount 由新字段推导，显式提供则校验）
        if payload.type is not None and payload.type != new_type:
            msg = (
                f"type 与 inflow/outflow 推导不一致："
                f"provided={payload.type.value}, expected={new_type.value}"
            )
            raise ValidationError(msg)
        if payload.category is not None:
            self._validate_category(new_type, payload.category)
            if record.category != payload.category.value:
                record.category = payload.category.value
                detail["category"] = payload.category.value
        if payload.amount is not None and payload.amount != new_amount:
            msg = (
                f"amount 与 inflow/outflow 推导不一致："
                f"provided={payload.amount}, expected={new_amount}"
            )
            raise ValidationError(msg)
        if payload.counterparty is not None and payload.counterparty != record.counterparty:
            record.counterparty = payload.counterparty
            detail["counterparty"] = payload.counterparty
        # related_stage 兼容字段（model 无对应列，仅记录到日志）
        if payload.related_stage is not None:
            detail["related_stage"] = payload.related_stage

        # 通用字段：补充凭证（追加去重）/ 支付方类型 / 备注 / 日期
        if payload.receipt_urls is not None:
            existing = record.receipt_urls or []
            merged = list(dict.fromkeys(existing + payload.receipt_urls))
            record.receipt_urls = merged
            detail["receipt_urls"] = merged
        if payload.counterparty_type is not None:
            record.counterparty_type = payload.counterparty_type
            detail["counterparty_type"] = payload.counterparty_type
        if payload.description is not None:
            record.remark = payload.description
            detail["remark"] = payload.description
        if payload.date is not None:
            record.record_date = payload.date
            detail["record_date"] = payload.date.isoformat()

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
