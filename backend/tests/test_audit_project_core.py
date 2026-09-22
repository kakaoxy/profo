"""「项目管理-项目本体」操作审计日志测试.

覆盖项目写操作与导出的审计落库（operation_logs 表，resource_type=project）：
1. POST /api/v1/projects           → 落 create（after 含 contract_no，user_id 为操作者）
2. PUT  /api/v1/projects/{id}      → 落 update（before/after 均非空）
3. DELETE /api/v1/projects/{id}    → 落 delete（before 含合同编号/删除前状态，无 after）
4. PUT  /api/v1/projects/{id}/status → 落 update 且 before.status ≠ after.status
5. POST /api/v1/projects/{id}/complete → 落 update（after.status=sold，含成交价）
6. GET  /api/v1/projects/export    → 落 sensitive_data_access（resource_id=None，无快照）

复用 backend/tests/conftest.py 的 backend_client（admin 角色 + CSRF 头）与
根 conftest 的 PostgreSQL SAVEPOINT 隔离基建（日志随外层事务回滚，不污染库）。
"""

import uuid
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models.system import OperationLog

BASE = "/api/v1/projects"


def _project_payload(**overrides: Any) -> dict[str, Any]:
    """构造项目创建请求体（contract_no 随机生成，规避部分唯一索引冲突）."""
    payload: dict[str, Any] = {
        "community_name": "审计测试小区",
        "address": "审计测试地址1号",
        "contract_no": f"AUDIT-{uuid.uuid4().hex[:12]}",
        "business_form": "agent",
        "owner_name": "审计业主",
    }
    payload.update(overrides)
    return payload


def _query_logs(session: Session, *, action: str, resource_id: str | None = None) -> list[OperationLog]:
    """按 action (+resource_id) 查询 resource_type=project 的审计日志."""
    query = session.query(OperationLog).filter(
        OperationLog.action == action,
        OperationLog.resource_type == "project",
    )
    if resource_id is not None:
        query = query.filter(OperationLog.resource_id == resource_id)
    return query.all()


def test_create_project_writes_create_log(
    backend_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """创建项目后落一条 create 审计日志，after 含 contract_no，user_id 为操作者."""
    session: Session = seeded_db["session"]
    admin_id: str = seeded_db["users"]["admin"].id
    payload = _project_payload()

    resp = backend_client.post(BASE, json=payload)
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    logs = _query_logs(session, action="create", resource_id=project_id)
    assert len(logs) == 1
    log = logs[0]
    assert log.user_id == admin_id
    assert log.before is None
    assert log.after is not None
    assert log.after["contract_no"] == payload["contract_no"]
    assert log.after["community_name"] == payload["community_name"]


def test_update_project_writes_update_log(
    backend_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """更新项目后落一条 update 审计日志，before/after 均非空且反映变更."""
    session: Session = seeded_db["session"]
    payload = _project_payload()

    resp = backend_client.post(BASE, json=payload)
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    resp = backend_client.put(f"{BASE}/{project_id}", json={"community_name": "审计更新小区"})
    assert resp.status_code == 200, resp.text

    logs = _query_logs(session, action="update", resource_id=project_id)
    assert len(logs) == 1
    log = logs[0]
    assert log.before is not None
    assert log.before["community_name"] == "审计测试小区"
    assert log.after is not None
    assert log.after["community_name"] == "审计更新小区"


def test_delete_project_writes_delete_log(
    backend_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """删除项目后落一条 delete 审计日志，before 含合同编号与删除前状态，无 after."""
    session: Session = seeded_db["session"]
    payload = _project_payload()

    resp = backend_client.post(BASE, json=payload)
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    resp = backend_client.delete(f"{BASE}/{project_id}")
    assert resp.status_code == 204, resp.text

    logs = _query_logs(session, action="delete", resource_id=project_id)
    assert len(logs) == 1
    log = logs[0]
    assert log.before is not None
    assert log.before["contract_no"] == payload["contract_no"]
    assert log.before["status"] == "signing"  # 删除前状态（软删除后才会变为 deleted）
    assert log.after is None


def test_update_status_writes_transition_log(
    backend_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """状态流转后落一条 update 审计日志，且 before.status ≠ after.status."""
    session: Session = seeded_db["session"]

    resp = backend_client.post(BASE, json=_project_payload())
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    resp = backend_client.put(f"{BASE}/{project_id}/status", json={"status": "renovating"})
    assert resp.status_code == 200, resp.text

    logs = _query_logs(session, action="update", resource_id=project_id)
    assert len(logs) == 1
    log = logs[0]
    assert log.before == {"status": "signing"}
    assert log.after == {"status": "renovating"}
    assert log.before["status"] != log.after["status"]


def test_complete_project_writes_sold_log(
    backend_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """确认成交后落一条 update 审计日志，after.status=sold 且含成交价."""
    session: Session = seeded_db["session"]

    resp = backend_client.post(BASE, json=_project_payload())
    assert resp.status_code == 201, resp.text
    project_id = resp.json()["id"]

    # 成交前需流转到在售
    resp = backend_client.put(f"{BASE}/{project_id}/status", json={"status": "selling"})
    assert resp.status_code == 200, resp.text

    resp = backend_client.post(
        f"{BASE}/{project_id}/complete",
        json={"sold_price": 260.5, "sold_date": "2026-01-15T00:00:00"},
    )
    assert resp.status_code == 201, resp.text

    logs = _query_logs(session, action="update", resource_id=project_id)
    # 状态流转与成交各落一条 update；成交那条 after.status=sold
    sold_logs = [log for log in logs if (log.after or {}).get("status") == "sold"]
    assert len(sold_logs) == 1
    log = sold_logs[0]
    assert log.after is not None
    assert log.after["sold_price"] is not None
    assert log.after["transaction_status"] == "已售"


def test_export_writes_sensitive_access_log(
    backend_client: TestClient,
    seeded_db: dict[str, Any],
) -> None:
    """导出项目 CSV 后落一条 sensitive_data_access 审计日志（resource_id=None，无快照）."""
    session: Session = seeded_db["session"]
    admin_id: str = seeded_db["users"]["admin"].id

    resp = backend_client.get(f"{BASE}/export")
    assert resp.status_code == 200, resp.text

    logs = _query_logs(session, action="sensitive_data_access")
    assert len(logs) == 1
    log = logs[0]
    assert log.user_id == admin_id
    assert log.resource_id is None
    assert log.before is None
    assert log.after is None
