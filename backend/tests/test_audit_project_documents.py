"""项目文书签收审计日志测试.

覆盖 documents service 写操作的审计埋点（resource_type=project_document）：
- create_document → action=create（仅 after 快照）
- update_document → action=update（before/after 快照非空）
- delete_document → action=delete（仅 before 快照）
- initialize_documents → action=create（after.documents 清单非空，幂等重入不产生日志）
"""

import uuid

from sqlalchemy.orm import Session

from models import Project
from models.common import BusinessForm
from models.system import OperationLog
from schemas.project.document import DocumentCreate, DocumentUpdate
from services.projects.internal import documents as documents_service


def _make_project(session: Session) -> Project:
    """创建一个 agent 业务形式的测试项目."""
    project = Project(
        id=str(uuid.uuid4()),
        name="文书审计测试项目",
        community_name="测试小区",
        address="测试地址1号",
        business_form=BusinessForm.AGENT,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    return project


def _document_logs(session: Session) -> list[OperationLog]:
    """查询本次测试产生的文书域审计日志（SAVEPOINT 隔离下仅含当前用例数据）."""
    return (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "project_document")
        .order_by(OperationLog.created_at.asc(), OperationLog.id.asc())
        .all()
    )


def test_create_document_logs_create(db_session: Session) -> None:
    """创建文书落一条 create 审计日志，after 快照含文书关键字段."""
    project = _make_project(db_session)

    doc = documents_service.create_document(
        db_session,
        project.id,
        DocumentCreate(document_name="补充协议"),
        operator_id="operator-1",
    )

    logs = _document_logs(db_session)
    assert len(logs) == 1
    log = logs[0]
    assert log.action == "create"
    assert log.user_id == "operator-1"
    assert log.resource_type == "project_document"
    assert log.resource_id == str(doc.id)
    assert log.before is None
    assert log.after is not None
    assert log.after["document_name"] == "补充协议"
    assert log.after["signoff_status"] == "unsigned"
    assert log.after["archive_date"] is None
    assert log.after["display_order"] == 1
    assert log.after["category"] == "other"


def test_update_document_logs_update(db_session: Session) -> None:
    """更新文书落一条 update 审计日志，before/after 快照非空且反映变更."""
    project = _make_project(db_session)
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="装修合同"))

    documents_service.update_document(
        db_session,
        project.id,
        doc.id,
        DocumentUpdate(signoff_status="archived", archive_date="2025-05-18"),
        operator_id="operator-2",
    )

    update_logs = [log for log in _document_logs(db_session) if log.action == "update"]
    assert len(update_logs) == 1
    log = update_logs[0]
    assert log.user_id == "operator-2"
    assert log.resource_type == "project_document"
    assert log.resource_id == str(doc.id)
    assert log.before is not None
    assert log.after is not None
    assert log.before["signoff_status"] == "unsigned"
    assert log.before["archive_date"] is None
    assert log.after["signoff_status"] == "archived"
    assert log.after["archive_date"] == "2025-05-18"


def test_update_document_not_found_logs_nothing(db_session: Session) -> None:
    """文书不存在时不产生审计日志."""
    project = _make_project(db_session)

    result = documents_service.update_document(
        db_session,
        project.id,
        str(uuid.uuid4()),
        DocumentUpdate(signoff_status="signed"),
        operator_id="operator-3",
    )

    assert result is None
    assert _document_logs(db_session) == []


def test_delete_document_logs_delete(db_session: Session) -> None:
    """删除文书落一条 delete 审计日志，before 快照非空、after 为空."""
    project = _make_project(db_session)
    doc = documents_service.create_document(db_session, project.id, DocumentCreate(document_name="业主身份证"))

    assert documents_service.delete_document(db_session, project.id, doc.id, operator_id="operator-4") is True

    delete_logs = [log for log in _document_logs(db_session) if log.action == "delete"]
    assert len(delete_logs) == 1
    log = delete_logs[0]
    assert log.user_id == "operator-4"
    assert log.resource_type == "project_document"
    assert log.resource_id == str(doc.id)
    assert log.before is not None
    assert log.before["document_name"] == "业主身份证"
    assert log.after is None


def test_initialize_documents_logs_create(db_session: Session) -> None:
    """初始化文书落一条 create 审计日志，after.documents 为新增文书清单."""
    project = _make_project(db_session)

    count = documents_service.initialize_documents(
        db_session,
        project.id,
        BusinessForm.AGENT,
        operator_id="operator-5",
    )

    assert count == 12
    logs = _document_logs(db_session)
    assert len(logs) == 1
    log = logs[0]
    assert log.action == "create"
    assert log.user_id == "operator-5"
    assert log.resource_type == "project_document"
    assert log.resource_id == str(project.id)
    documents_in_after = log.after["documents"] if log.after else None
    assert isinstance(documents_in_after, list)
    assert len(documents_in_after) == 12
    assert {"document_name", "category"} == set(documents_in_after[0].keys())
    assert documents_in_after[0]["document_name"] == "签约合同"


def test_initialize_documents_idempotent_no_extra_log(db_session: Session) -> None:
    """幂等重入（无新增文书）不产生额外审计日志."""
    project = _make_project(db_session)
    documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)
    assert len(_document_logs(db_session)) == 1

    second_count = documents_service.initialize_documents(db_session, project.id, BusinessForm.AGENT)

    assert second_count == 0
    assert len(_document_logs(db_session)) == 1
