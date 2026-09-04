"""API Key 机器接口测试.

验证：
1. admin 角色的 API Key 调用机器接口（/push）成功
2. operator 角色的 API Key 调用机器接口成功
3. user 角色的 API Key 调用机器接口返回权限错误（403）
4. 无效的 API Key 返回认证错误（401）
"""

from collections.abc import Generator
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import Role, User
from services.system.api_key import ApiKeyService
from utils.auth import get_password_hash


def _make_db_override(session: Session) -> type[Generator[Session, None, None]]:
    """创建 get_db 覆盖."""

    def _override() -> Generator[Session, None, None]:
        yield session

    return _override


def _create_user(session: Session, role_code: str, username: str, user_id: str) -> User:
    """创建指定角色的用户."""
    role = session.query(Role).filter(Role.code == role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash("Password1!"),
        nickname=f"{role_code}用户",
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _generate_api_key_for_user(session: Session, user: User) -> str:
    """为指定用户生成 API Key."""
    return ApiKeyService.generate_api_key(session, str(user.id))[0]


class TestApiKeyMachineInterface:
    """API Key 调用 /push 机器接口的权限边界测试."""

    def test_admin_api_key_can_call_push(self, seeded_db: dict[str, Any]) -> None:
        """Admin 角色的 API Key 调用机器接口成功."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        api_key = _generate_api_key_for_user(session, admin)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/push",
                headers={"X-API-Key": api_key},
                json=[
                    {
                        "数据源": "test",
                        "房源ID": "test-admin-001",
                        "状态": "在售",
                        "小区名": "测试小区",
                        "室": 2,
                        "朝向": "南",
                        "楼层": "中楼层",
                        "面积": 89.5,
                        "挂牌价": 300.0,
                        "上架时间": "2025-01-01",
                    }
                ],
            )
            assert resp.status_code == 200, f"admin API Key 调用 /push 应返回 200，实际 {resp.status_code}: {resp.text}"
            data = resp.json()
            assert "total" in data
        finally:
            app.dependency_overrides.clear()

    def test_operator_api_key_can_call_push(self, seeded_db: dict[str, Any]) -> None:
        """Operator 角色的 API Key 调用机器接口成功."""
        session = seeded_db["session"]
        operator = _create_user(session, "operator", "operator_push", "operator-push")
        api_key = _generate_api_key_for_user(session, operator)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/push",
                headers={"X-API-Key": api_key},
                json=[
                    {
                        "数据源": "test",
                        "房源ID": "test-operator-001",
                        "状态": "在售",
                        "小区名": "测试小区",
                        "室": 2,
                        "朝向": "南",
                        "楼层": "中楼层",
                        "面积": 89.5,
                        "挂牌价": 300.0,
                        "上架时间": "2025-01-01",
                    }
                ],
            )
            assert resp.status_code == 200, (
                f"operator API Key 调用 /push 应返回 200，实际 {resp.status_code}: {resp.text}"
            )
        finally:
            app.dependency_overrides.clear()

    def test_user_api_key_call_push_returns_permission_error(self, seeded_db: dict[str, Any]) -> None:
        """User 角色的 API Key 调用机器接口返回 403 权限错误."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        api_key = _generate_api_key_for_user(session, normal)

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/push",
                headers={"X-API-Key": api_key},
                json=[{"title": "test"}],
            )
            assert resp.status_code == 403, (
                f"user 角色 API Key 调用 /push 应返回 403，实际 {resp.status_code}: {resp.text}"
            )
            assert "无权" in resp.json().get("message", "")
        finally:
            app.dependency_overrides.clear()

    def test_invalid_api_key_returns_auth_error(self, seeded_db: dict[str, Any]) -> None:
        """无效的 API Key 返回 401 认证错误."""
        session = seeded_db["session"]

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app)
            resp = client.post(
                "/api/v1/push",
                headers={"X-API-Key": "profo_invalid_key_00000000000000000000000000000000"},
                json=[{"title": "test"}],
            )
            assert resp.status_code == 401, f"无效 API Key 调用 /push 应返回 401，实际 {resp.status_code}: {resp.text}"
            assert "API Key" in resp.json().get("message", "")
        finally:
            app.dependency_overrides.clear()
