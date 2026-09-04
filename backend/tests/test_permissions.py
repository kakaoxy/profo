"""权限测试.

验证：
1. customer 角色尝试登录后台 → 被拒绝
2. user 角色尝试生成 API Key → 403 Forbidden
3. 后台内部角色（admin/operator）可生成 API Key（正向验证）
4. customer 角色无法访问后台管理接口
"""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import Role, User
from services.system.auth import AuthService
from services.system.exceptions import PermissionDeniedError
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash


def _make_db_override(session: Session) -> type[Generator[Session, None, None]]:
    """创建生成器函数作为 get_db 覆盖（FastAPI 需要生成器函数而非返回生成器的普通函数）."""

    def _override() -> Generator[Session, None, None]:
        yield session

    return _override


class TestCustomerCannotLoginBackend:
    """customer 角色尝试登录后台 → 被拒绝."""

    def test_service_level_customer_rejected(self, seeded_db: dict[str, Any]) -> None:
        """服务层：authenticate_backend_user 拒绝 customer 角色."""
        session = seeded_db["session"]

        # 创建 customer 用户
        customer_role = session.query(Role).filter(Role.code == "customer").first()
        customer = User(
            id="cust-login-test",
            username="custlogin",
            password=get_password_hash("Customer1!"),
            role_id=customer_role.id,
            status="active",
        )
        session.add(customer)
        session.commit()

        with pytest.raises(PermissionDeniedError, match="无权登录后台"):
            AuthService.authenticate_backend_user(session, "custlogin", "Customer1!")

    def test_api_level_customer_login_rejected(self, seeded_db: dict[str, Any]) -> None:
        """API 层：customer 角色通过 /auth/login 登录后台 → 403."""
        from main import app

        session = seeded_db["session"]

        # 创建 customer 用户
        customer_role = session.query(Role).filter(Role.code == "customer").first()
        customer = User(
            id="cust-api-test",
            username="custapi",
            password=get_password_hash("Customer1!"),
            role_id=customer_role.id,
            status="active",
        )
        session.add(customer)
        session.commit()

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/auth/login",
                json={"username": "custapi", "password": "Customer1!"},
            )
            assert resp.status_code == 403, f"customer 角色登录后台应返回 403，实际 {resp.status_code}: {resp.text}"
        finally:
            app.dependency_overrides.clear()

    def test_backend_role_can_login(self, seeded_db: dict[str, Any]) -> None:
        """正向验证：admin 角色可通过 authenticate_backend_user."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        user = AuthService.authenticate_backend_user(session, admin.username, "Admin123!")
        assert user.role.code == "admin"


class TestUserRoleCannotCreateApiKey:
    """user 角色尝试生成 API Key → 403 Forbidden."""

    def test_api_level_user_role_rejected(self, seeded_db: dict[str, Any], normal_user_client: TestClient) -> None:
        """API 层：user 角色调用 POST /auth/api-key → 403."""
        resp = normal_user_client.post("/api/v1/auth/api-key")
        assert resp.status_code == 403, f"user 角色生成 API Key 应返回 403，实际 {resp.status_code}: {resp.text}"

    def test_api_level_admin_can_create_api_key(self, backend_client: TestClient) -> None:
        """正向验证：admin 角色调用 POST /auth/api-key → 200."""
        resp = backend_client.post("/api/v1/auth/api-key")
        assert resp.status_code == 200, f"admin 角色生成 API Key 应返回 200，实际 {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "api_key" in data, "响应应包含 api_key"
        assert data["api_key"].startswith("profo_"), "API Key 应以 profo_ 开头"

    def test_api_level_user_cannot_get_api_key_info(self, normal_user_client: TestClient) -> None:
        """API 层：user 角色调用 GET /auth/api-key → 403."""
        resp = normal_user_client.get("/api/v1/auth/api-key")
        assert resp.status_code == 403, f"user 角色获取 API Key 信息应返回 403，实际 {resp.status_code}"

    def test_api_level_user_cannot_delete_api_key(self, normal_user_client: TestClient) -> None:
        """API 层：user 角色调用 DELETE /auth/api-key → 403."""
        resp = normal_user_client.delete("/api/v1/auth/api-key")
        assert resp.status_code == 403, f"user 角色删除 API Key 应返回 403，实际 {resp.status_code}"


class TestCustomerCannotAccessBackend:
    """customer 角色无法访问后台管理接口."""

    def test_customer_cannot_access_user_list(
        self,
        seeded_db: dict[str, Any],
        customer_audience_token: str,
    ) -> None:
        """Customer Token 访问 GET /users → 401（受众不匹配）或 403（角色不足）."""
        from main import app

        session = seeded_db["session"]
        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            # customer Token 有 aud=c，后台接口期望 aud=admin → 401
            client = TestClient(app, cookies={"access_token": customer_audience_token})
            resp = client.get("/api/v1/users")
            assert resp.status_code in (401, 403), f"customer 访问用户列表应返回 401/403，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()


class TestOperatorRolePermissions:
    """operator 角色权限边界测试."""

    def test_operator_can_create_api_key(self, seeded_db: dict[str, Any]) -> None:
        """正向验证：operator 角色可生成 API Key."""
        from main import app

        session = seeded_db["session"]

        # 创建 operator 用户
        operator_role = session.query(Role).filter(Role.code == "operator").first()
        operator = User(
            id="operator-test",
            username="operator1",
            password=get_password_hash("Operator1!"),
            role_id=operator_role.id,
            status="active",
        )
        session.add(operator)
        session.commit()

        token = create_access_token(
            data={"sub": operator.id, "role": "operator", "ver": operator.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app, cookies={"access_token": token})
            client.headers["X-Requested-With"] = "XMLHttpRequest"
            resp = client.post("/api/v1/auth/api-key")
            assert resp.status_code == 200, f"operator 生成 API Key 应返回 200，实际 {resp.status_code}: {resp.text}"
        finally:
            app.dependency_overrides.clear()

    def test_operator_cannot_manage_users(self, seeded_db: dict[str, Any]) -> None:
        """Operator 角色不能访问用户管理（GET /users → 403）."""
        from main import app

        session = seeded_db["session"]

        operator_role = session.query(Role).filter(Role.code == "operator").first()
        operator = User(
            id="operator-test2",
            username="operator2",
            password=get_password_hash("Operator1!"),
            role_id=operator_role.id,
            status="active",
        )
        session.add(operator)
        session.commit()

        token = create_access_token(
            data={"sub": operator.id, "role": "operator", "ver": operator.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app, cookies={"access_token": token})
            resp = client.get("/api/v1/users")
            assert resp.status_code == 403, f"operator 访问用户列表应返回 403，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()
