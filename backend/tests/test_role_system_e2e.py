"""权限治理硬化 E2E 测试.

验证 is_system 系统角色防护 / risk_level 风险分级 / 审计日志落库的完整流程。

测试在 HTTP 层（TestClient）执行，覆盖：
1. RoleResponse 暴露 is_system 字段，迁移回填后内置角色为 TRUE
2. 系统角色防护：删除/改 code/停用均 409（非系统角色不受影响）
3. permissions.risk_level 随迁移种子映射回填（L0-L5）
4. 登录成功/失败/登出审计落库（login_success/login_failure/logout）
5. 房源导出敏感数据访问审计（sensitive_data_access）
6. API Key 生成/撤销审计（create/revoke）
7. 用户角色变更逐笔审计（assign_role/remove_role，含附加角色差集）

注意：conftest 在测试库执行启动迁移后 TRUNCATE 全表，种子数据由 ORM 重建
（is_system=False / risk_level=L1 默认值），因此用例内通过执行与迁移相同的
SQL 模拟回填，验证防护逻辑与迁移语义（回填语句本身在 dev 库实测）。
conftest 的 admin_client fixture 签发的 token 缺少 aud claim 会被受众校验
拒绝（401，从未被既有测试使用故未暴露），本文件改走完整 HTTP 登录链路。
"""

from typing import Any

import db
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.orm import Session

from migrations._role_system import _PERMISSION_RISK_LEVELS, _SYSTEM_ROLE_CODES
from models.system import OperationLog

# 测试用账号密码（与 conftest.py 的种子数据一致）
_ADMIN_PASSWORD = "Admin123!"

_SYSTEM_ROLE_BACKFILL_SQL = (
    "UPDATE roles SET is_system = TRUE WHERE code = ANY(:codes) AND is_system <> TRUE"
)


@pytest.fixture
def admin_auth(seeded_db: dict[str, Any]) -> dict[str, Any]:
    """真实 HTTP 登录的管理员客户端 + 种子会话.

    用依赖覆盖将 get_db 指向种子会话：审计落库可断言，且随 savepoint 回滚，
    不会写入 dev 库。
    """
    from main import app

    session = seeded_db["session"]

    def _override_get_db() -> Session:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    try:
        anon = TestClient(app)
        anon.headers["X-Requested-With"] = "XMLHttpRequest"
        resp = anon.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": _ADMIN_PASSWORD},
        )
        assert resp.status_code == 200, f"登录失败: {resp.status_code} {resp.text}"
        tokens = resp.json()

        client = TestClient(app, cookies={"access_token": tokens["access_token"]})
        client.headers["X-Requested-With"] = "XMLHttpRequest"
        yield {"client": client, "tokens": tokens, "session": session}
    finally:
        app.dependency_overrides.clear()


def _backfill_system_roles(session: Session) -> None:
    """在测试会话内执行与迁移 add_role_is_system_column 相同的回填 SQL."""
    session.execute(text(_SYSTEM_ROLE_BACKFILL_SQL), {"codes": list(_SYSTEM_ROLE_CODES)})
    session.commit()


def _backfill_risk_levels(session: Session) -> None:
    """在测试会话内执行与迁移 add_permission_risk_level_column 相同的回填 SQL."""
    for code, level in sorted(_PERMISSION_RISK_LEVELS.items()):
        session.execute(
            text("UPDATE permissions SET risk_level = :level WHERE code = :code AND risk_level <> :level"),
            {"level": level, "code": code},
        )
    session.commit()


def _latest_log(session: Session, **filters: Any) -> OperationLog | None:
    """按条件取最新一条审计日志（created_at 倒序）."""
    query = session.query(OperationLog)
    for field, value in filters.items():
        query = query.filter(getattr(OperationLog, field) == value)
    return query.order_by(OperationLog.created_at.desc()).first()


class TestSystemRoleProtection:
    """系统角色防护：is_system=TRUE 的内置角色禁止删除/改 code/停用."""

    def test_role_response_exposes_is_system_after_backfill(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """回填前内置角色 is_system=False（种子默认），回填后全部为 True."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]

        resp = client.get("/api/v1/roles")
        assert resp.status_code == 200
        roles = resp.json()["items"]
        by_code = {r["code"]: r for r in roles}
        assert "is_system" in by_code["admin"]
        assert by_code["admin"]["is_system"] is False  # 种子 ORM 默认值

        _backfill_system_roles(session)

        resp = client.get("/api/v1/roles")
        assert resp.status_code == 200
        roles = resp.json()["items"]
        by_code = {r["code"]: r for r in roles}
        for code in _SYSTEM_ROLE_CODES:
            assert by_code[code]["is_system"] is True, f"{code} 应为系统角色"

    def test_system_role_delete_forbidden(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """DELETE 系统角色 → 409；非系统角色删除不受影响（阴性对照）."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]
        _backfill_system_roles(session)

        resp = client.delete("/api/v1/roles/operator-role")
        assert resp.status_code == 409
        assert "系统角色不可删除" in resp.json()["message"]

        # 阴性对照：非系统角色可正常删除
        create_resp = client.post(
            "/api/v1/roles",
            json={"name": "临时角色", "code": "temp_role_e2e", "permission_codes": []},
        )
        assert create_resp.status_code == 200
        temp_id = create_resp.json()["id"]
        assert client.delete(f"/api/v1/roles/{temp_id}").status_code == 204

    def test_system_role_code_change_forbidden(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """PUT 修改系统角色 code → 409；仅改 name/description 保留可用."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]
        _backfill_system_roles(session)

        resp = client.put(
            "/api/v1/roles/operator-role",
            json={"code": "operator_renamed"},
        )
        assert resp.status_code == 409
        assert "系统角色不可修改角色代码" in resp.json()["message"]

        # name/description 编辑保留
        resp = client.put(
            "/api/v1/roles/operator-role",
            json={"name": "运营人员", "description": "系统运营角色"},
        )
        assert resp.status_code == 200

    def test_system_role_deactivate_forbidden(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """PUT is_active=False 停用系统角色 → 409."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]
        _backfill_system_roles(session)

        resp = client.put(
            "/api/v1/roles/user-role",
            json={"is_active": False},
        )
        assert resp.status_code == 409
        assert "系统角色不可停用" in resp.json()["message"]


class TestPermissionRiskLevel:
    """permissions.risk_level 风险分级：响应暴露字段 + 迁移映射回填."""

    def test_risk_level_exposed_and_backfilled(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """种子 ORM 默认 L1；执行迁移回填 SQL 后按映射命中 L0-L5."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]

        resp = client.get("/api/v1/permissions")
        assert resp.status_code == 200
        perms = resp.json()["items"]
        by_code = {p["code"]: p for p in perms}
        assert "risk_level" in by_code["user:read"]
        assert by_code["user:read"]["risk_level"] == "L1"  # ORM 默认值

        _backfill_risk_levels(session)

        resp = client.get("/api/v1/permissions")
        assert resp.status_code == 200
        perms = resp.json()["items"]
        by_code = {p["code"]: p for p in perms}
        # 每个等级抽查一个权限点
        assert by_code["user:read"]["risk_level"] == "L0"
        assert by_code["lead:create"]["risk_level"] == "L1"
        assert by_code["lead:write"]["risk_level"] == "L2"
        assert by_code["ledger:write"]["risk_level"] == "L3"
        assert by_code["user:delete"]["risk_level"] == "L4"
        assert by_code["role:create"]["risk_level"] == "L5"
        # 映射中的权限码必须全部真实存在于权限表（防拼写漂移）
        seed_codes = set(by_code.keys())
        assert set(_PERMISSION_RISK_LEVELS) <= seed_codes


class TestAuthAuditLogs:
    """登录成功/失败/登出 DB 审计落库."""

    def test_login_failure_and_success_audit(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """错误密码 → 401 + login_failure(user_id=None)；正确密码 → login_success."""
        session: Session = admin_auth["session"]

        from main import app

        anon = TestClient(app)
        anon.headers["X-Requested-With"] = "XMLHttpRequest"

        resp = anon.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": "wrong-password"},
        )
        assert resp.status_code == 401

        failure_log = _latest_log(session, action="login_failure", resource_type="auth")
        assert failure_log is not None
        assert failure_log.user_id is None
        assert failure_log.after is not None
        assert failure_log.after.get("username") == "admin"
        assert "reason" in failure_log.after

        resp = anon.post(
            "/api/v1/auth/login",
            json={"username": "admin", "password": _ADMIN_PASSWORD},
        )
        assert resp.status_code == 200

        success_log = _latest_log(session, action="login_success", resource_type="auth")
        assert success_log is not None
        assert success_log.user_id == "admin-user"

    def test_logout_audit(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """登出撤销 refresh_token 后落库 logout 审计."""
        from main import app

        session: Session = admin_auth["session"]
        tokens: dict[str, Any] = admin_auth["tokens"]

        authed = TestClient(app, cookies={"access_token": tokens["access_token"]})
        authed.headers["X-Requested-With"] = "XMLHttpRequest"
        resp = authed.post(
            "/api/v1/auth/logout",
            json={"refresh_token": tokens["refresh_token"]},
        )
        assert resp.status_code == 200

        logout_log = _latest_log(session, action="logout", resource_type="auth")
        assert logout_log is not None
        assert logout_log.user_id == "admin-user"


class TestSensitiveDataAudit:
    """房源导出敏感数据访问审计."""

    def test_property_export_audited(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """GET /properties/export → 200 CSV，并落库 sensitive_data_access."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]

        resp = client.get("/api/v1/properties/export")
        assert resp.status_code == 200

        log = _latest_log(session, action="sensitive_data_access", resource_type="property")
        assert log is not None
        assert log.user_id == "admin-user"


class TestApiKeyAudit:
    """API Key 生成/撤销审计."""

    def test_api_key_create_and_revoke_audited(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """POST /auth/api-key → create 日志（含 key_prefix）；DELETE → revoke 日志."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]

        resp = client.post("/api/v1/auth/api-key")
        assert resp.status_code == 200
        key_data = resp.json()
        assert key_data["api_key"]

        create_log = _latest_log(session, action="create", resource_type="api_key")
        assert create_log is not None
        assert create_log.user_id == "admin-user"
        assert create_log.after is not None
        assert create_log.after.get("key_prefix") == key_data["prefix"]

        resp = client.delete("/api/v1/auth/api-key")
        assert resp.status_code == 204

        revoke_log = _latest_log(session, action="revoke", resource_type="api_key")
        assert revoke_log is not None
        assert revoke_log.user_id == "admin-user"
        assert revoke_log.after is not None
        assert revoke_log.after.get("key_prefix") == key_data["prefix"]


class TestUserRoleChangeAudit:
    """用户角色变更逐笔审计（主角色 + 附加角色差集）."""

    def test_main_role_change_records_remove_and_assign(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """创建 user 角色用户 → 改主角色为 operator → remove_role(user) + assign_role(operator)."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]

        create_resp = client.post(
            "/api/v1/users",
            json={
                "username": "audit_target",
                "password": "Target123!",
                "role_id": "user-role",
            },
        )
        assert create_resp.status_code == 201
        target_id = create_resp.json()["id"]

        resp = client.put(
            f"/api/v1/users/{target_id}",
            json={"role_id": "operator-role"},
        )
        assert resp.status_code == 200

        remove_log = _latest_log(session, action="remove_role", resource_type="user")
        assert remove_log is not None
        assert remove_log.resource_id == target_id
        assert remove_log.after is not None
        assert remove_log.after.get("role_code") == "user"

        assign_log = _latest_log(session, action="assign_role", resource_type="user")
        assert assign_log is not None
        assert assign_log.resource_id == target_id
        assert assign_log.after is not None
        assert assign_log.after.get("role_code") == "operator"

    def test_additional_role_change_records_diff(
        self,
        admin_auth: dict[str, Any],
    ) -> None:
        """附加角色从空到 [customer] → 仅 assign_role(customer)，无 remove_role."""
        client: TestClient = admin_auth["client"]
        session: Session = admin_auth["session"]

        create_resp = client.post(
            "/api/v1/users",
            json={
                "username": "audit_target2",
                "password": "Target123!",
                "role_id": "user-role",
            },
        )
        assert create_resp.status_code == 201
        target_id = create_resp.json()["id"]

        # 基线：此时不应有该用户的角色移除审计
        baseline_remove = _latest_log(session, action="remove_role", resource_type="user")
        baseline_remove_id = baseline_remove.id if baseline_remove else None

        resp = client.put(
            f"/api/v1/users/{target_id}",
            json={"additional_role_ids": ["customer-role"]},
        )
        assert resp.status_code == 200

        assign_log = _latest_log(session, action="assign_role", resource_type="user")
        assert assign_log is not None
        assert assign_log.resource_id == target_id
        assert assign_log.after is not None
        assert assign_log.after.get("role_code") == "customer"

        # 主角色未变 → 不应产生新的 remove_role
        remove_log = _latest_log(session, action="remove_role", resource_type="user")
        assert remove_log is None or remove_log.id == baseline_remove_id
