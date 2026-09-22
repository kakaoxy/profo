"""资金账本（/admin/ledger，finance 域）操作审计日志测试.

覆盖 resource_type="project_finance" 的审计插桩点：
1. create_record          -> create（after 含金额）
2. update_record          -> update（before/after 非空）
3. delete_record_by_id    -> delete（before 非空）
4. settle_finance / unsettle_finance -> update（after.settled True / False）
5. GET /admin/ledger/export 与 GET /admin/ledger/{project_id}/export
   -> sensitive_data_access（Router 层记录，导出成功后才写）
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import FinanceSubject, Project
from models.common import BusinessForm
from models.system import OperationLog
from schemas.project.finance import (
    FinanceSettlementChangeRequest,
    FinanceUnsettleRequest,
    LedgerRecordCreate,
    LedgerRecordUpdate,
)
from services.projects import FinanceService


def _make_project(db_session: Session) -> Project:
    """创建并持久化一个最小可用项目."""
    project = Project(
        name="审计测试项目",
        community_name="测试小区",
        address="测试地址",
        status="signing",
        business_form=BusinessForm.AGENT,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _make_subject(db_session: Session, subject_id: str = "S11", name: str = "收房佣金") -> FinanceSubject:
    """创建并持久化一个测试科目."""
    subject = FinanceSubject(
        id=subject_id,
        name=name,
        level="2",
        pnl=True,
        modes=["agent"],
        stage="signing",
        note="测试科目",
        system=True,
        is_deleted=False,
    )
    db_session.add(subject)
    db_session.commit()
    db_session.refresh(subject)
    return subject


def _make_record_data(project_id: Any, subject_id: str) -> LedgerRecordCreate:
    """构造创建流水的请求数据."""
    return LedgerRecordCreate(
        project_id=project_id,
        subject_id=subject_id,
        outflow=Decimal("1000.50"),
        date=datetime.now(timezone.utc),
        description="测试流水",
        payer="测试付款方",
    )


def _logs(db_session: Session, action: str) -> list[OperationLog]:
    """查询 project_finance 资源指定 action 的审计日志."""
    return (
        db_session.query(OperationLog)
        .filter(
            OperationLog.resource_type == "project_finance",
            OperationLog.action == action,
        )
        .all()
    )


# ========== 流水 CRUD 审计日志（Service 层插桩）==========


def test_create_record_writes_create_audit_log(db_session: Session) -> None:
    """创建流水落一条 create/project_finance，after 含金额."""
    project = _make_project(db_session)
    _make_subject(db_session)
    service = FinanceService(db_session)

    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="audit-operator",
    )

    logs = _logs(db_session, "create")
    assert len(logs) == 1
    log = logs[0]
    assert log.user_id == "audit-operator"
    assert log.resource_id == str(record.id)
    assert log.before is None
    assert log.after is not None
    # after 含金额关键字段
    assert Decimal(log.after["amount"]) == Decimal("1000.50")
    assert Decimal(log.after["outflow"]) == Decimal("1000.50")
    assert log.after["subject_id"] == "S11"
    assert log.after["type"] == "expense"


def test_update_record_writes_update_audit_log(db_session: Session) -> None:
    """更新流水落一条 update，before/after 非空且反映变更."""
    project = _make_project(db_session)
    _make_subject(db_session)
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="audit-operator",
    )

    payload = LedgerRecordUpdate(description="更新后的备注", outflow=Decimal(2000))
    service.update_record(record.id, payload, operator_id="audit-operator")

    logs = _logs(db_session, "update")
    assert len(logs) == 1
    log = logs[0]
    assert log.user_id == "audit-operator"
    assert log.resource_id == str(record.id)
    assert log.before is not None
    assert log.after is not None
    assert log.before["remark"] == "测试流水"
    assert log.after["remark"] == "更新后的备注"
    assert Decimal(log.before["amount"]) == Decimal("1000.50")
    assert Decimal(log.after["amount"]) == Decimal(2000)


def test_delete_record_writes_delete_audit_log(db_session: Session) -> None:
    """删除流水落一条 delete，before 非空（含被删金额）."""
    project = _make_project(db_session)
    _make_subject(db_session)
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="audit-operator",
    )

    service.delete_record_by_id(record.id, operator_id="audit-operator")

    logs = _logs(db_session, "delete")
    assert len(logs) == 1
    log = logs[0]
    assert log.user_id == "audit-operator"
    assert log.resource_id == str(record.id)
    assert log.after is None
    assert log.before is not None
    assert Decimal(log.before["amount"]) == Decimal("1000.50")
    assert log.before["payer"] == "测试付款方"


def test_settle_and_unsettle_write_audit_logs(db_session: Session) -> None:
    """结算落一条 update 且 after.settled 为 True；反结算 after.settled 为 False."""
    project = _make_project(db_session)
    service = FinanceService(db_session)

    service.settle_finance(
        project.id,
        FinanceSettlementChangeRequest(settled_date=date(2026, 7, 7), settled_note="年度结算"),
        operator_id="audit-operator",
    )
    service.unsettle_finance(
        project.id,
        FinanceUnsettleRequest(reason="需要补录"),
        operator_id="audit-operator",
    )

    logs = _logs(db_session, "update")
    assert len(logs) == 2
    assert all(log.resource_id == str(project.id) for log in logs)
    assert all(log.user_id == "audit-operator" for log in logs)

    settle_logs = [log for log in logs if log.after["settled"] is True]
    unsettle_logs = [log for log in logs if log.after["settled"] is False]
    assert len(settle_logs) == 1
    assert len(unsettle_logs) == 1
    assert settle_logs[0].after["settled_note"] == "年度结算"
    assert unsettle_logs[0].after["reason"] == "需要补录"


# ========== 导出审计日志（Router 层 sensitive_data_access 插桩）==========


def test_export_ledger_writes_sensitive_access_log(backend_client: TestClient, db_session: Session) -> None:
    """GET /admin/ledger/export 导出成功后落一条 sensitive_data_access（resource_id=None）."""
    resp = backend_client.get("/api/v1/admin/ledger/export")
    assert resp.status_code == 200

    logs = _logs(db_session, "sensitive_data_access")
    assert len(logs) == 1
    log = logs[0]
    assert log.resource_type == "project_finance"
    assert log.resource_id is None
    assert log.user_id == "admin-user"


def test_export_project_records_writes_sensitive_access_log(backend_client: TestClient, db_session: Session) -> None:
    """GET /admin/ledger/{project_id}/export 导出成功后落一条 sensitive_data_access（resource_id=项目ID）."""
    project = _make_project(db_session)

    resp = backend_client.get(f"/api/v1/admin/ledger/{project.id}/export")
    assert resp.status_code == 200

    logs = _logs(db_session, "sensitive_data_access")
    assert len(logs) == 1
    log = logs[0]
    assert log.resource_type == "project_finance"
    assert log.resource_id == str(project.id)
    assert log.user_id == "admin-user"
