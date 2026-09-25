"""管理密码（ProjectKey）并发首次录入回归测试.

缺陷（修复前）：``PUT /api/v1/projects/{id}/keys/manager`` 首次录入是「读不到行即插入」，
两个请求同时录入时都读不到行，后插入者撞 ``project_keys.project_id`` 唯一约束，
IntegrityError 冒泡到错误处理器，用户看到失败响应（实测 400「数据完整性错误」，
sqlstate 23505）——PUT 幂等语义不成立。

仓库既有口径（``services/growth_center/admin_flow.py``、``services/projects/renovation.py``）：
捕获 IntegrityError → 回滚 → 加锁重查 → 统一走更新分支（last-write-wins）。

覆盖：
- 服务层：读窗口内被并发写入（用一次性「读不到行」确定性模拟，避免时序抖动）
  → 回退为更新且不抛异常，仅一行、明文为后写值、审计日志 create+update 各一条；
- HTTP 层：连续两次 PUT 幂等（200），响应仍为最新详情。
"""

import uuid
from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import KeyAuditLog, Project, ProjectKey, ProjectStatus
from schemas.keys import ManagerKeyPutRequest
from services.projects.keys import KeyService
from utils.auth import AUDIENCE_ADMIN, create_access_token


@pytest.fixture
def manager_key_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「管理员 + 无管理密码房源」环境（服务层 session + 后台 HTTP 客户端）."""
    session: Session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]

    project = Project(
        id=uuid.uuid4(),
        name="管理密码并发测试房源",
        community_name="测试小区",
        address="测试路 3 号 303 室",
        status=ProjectStatus.SELLING,
    )
    session.add(project)
    session.flush()

    admin_token = create_access_token(
        data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
        audience=AUDIENCE_ADMIN,
    )

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    admin_client = TestClient(
        app,
        cookies={"access_token": admin_token},
        headers={"X-Requested-With": "XMLHttpRequest"},
        raise_server_exceptions=False,
    )
    try:
        yield {
            "session": session,
            "admin": admin,
            "project_id": project.id,
            "admin_client": admin_client,
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


def _manager_rows(session: Session, project_id: uuid.UUID) -> list[ProjectKey]:
    return session.query(ProjectKey).filter(ProjectKey.project_id == project_id).all()


def _manager_log_actions(session: Session, project_id: uuid.UUID) -> set[str]:
    rows = session.query(KeyAuditLog).filter(KeyAuditLog.project_id == project_id).all()
    return {row.action for row in rows if (row.detail or {}).get("object") == "manager"}


class TestManagerKeyConcurrentFirstEntry:
    """并发首次录入不得把唯一约束冲突抛给调用方."""

    def test_stale_read_falls_back_to_update(
        self, manager_key_env: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """读窗口内并发写入 → 插入撞唯一约束 → 回退为更新（修复前抛 IntegrityError）."""
        session: Session = manager_key_env["session"]
        admin = manager_key_env["admin"]
        project_id = manager_key_env["project_id"]
        service = KeyService(session)

        # 并发对手（视为已提交）：先由正常路径写入一行
        service.put_manager_key(project_id, admin, ManagerKeyPutRequest(password="1111"))
        assert len(_manager_rows(session, project_id)) == 1

        # 「读不到行 → 插入」与并发提交之间无原子性：确定性模拟第一次读不到行
        # （真实多线程复现依赖时序；此处直接构造窗口，避免 flaky）
        real_read = KeyService._locked_manager_key
        calls = {"count": 0}

        def stale_read(self: KeyService, pid: uuid.UUID) -> ProjectKey | None:
            calls["count"] += 1
            return None if calls["count"] == 1 else real_read(self, pid)

        monkeypatch.setattr(KeyService, "_locked_manager_key", stale_read)

        # 修复前：flush 抛 IntegrityError 直接冒泡（用户侧失败响应）；修复后：回退为更新
        resp = service.put_manager_key(project_id, admin, ManagerKeyPutRequest(password="2222"))

        assert calls["count"] >= 2, "应走「插入冲突 → 回滚重查」分支"
        assert resp.set is True
        rows = _manager_rows(session, project_id)
        assert len(rows) == 1, "唯一约束下仍应只有一行"
        assert rows[0].password_encrypted == "2222", "last-write-wins：明文为后写值"
        assert _manager_log_actions(session, project_id) == {"create", "update"}

    def test_http_second_put_is_update(self, manager_key_env: dict[str, Any]) -> None:
        """HTTP 层连续两次 PUT：均 200，且只落一行、明文为最后一次."""
        client: TestClient = manager_key_env["admin_client"]
        session: Session = manager_key_env["session"]
        project_id = manager_key_env["project_id"]
        url = f"/api/v1/projects/{project_id}/keys/manager"

        first = client.put(url, json={"password": "1111"})
        assert first.status_code == 200, first.text
        second = client.put(url, json={"password": "2222"})
        assert second.status_code == 200, second.text
        assert second.json()["manager_key"]["set"] is True

        rows = _manager_rows(session, project_id)
        assert len(rows) == 1
        assert rows[0].password_encrypted == "2222"
        assert _manager_log_actions(session, project_id) == {"create", "update"}
