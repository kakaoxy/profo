"""Token 撤销测试.

验证修改密码、禁用用户、删除用户后，旧 Token 立即失效。
覆盖服务层（authenticate_by_token）和 API 层（HTTP 状态码）。
"""

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError
from services.system.user import UserLifecycleService, UserService
from utils.auth import AUDIENCE_ADMIN, create_access_token


class TestChangePasswordRevokesToken:
    """修改密码后旧 Token 立即失效."""

    def test_service_level_token_invalidated(self, seeded_db: dict[str, Any]) -> None:
        """服务层：修改密码后，旧 Token 经 authenticate_by_token → AuthenticationError."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        # 签发 Token（携带当前 token_version）
        old_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        # 修改密码
        user_service = UserLifecycleService()
        from schemas.user import PasswordChange

        user_service.change_password(
            session,
            admin,
            PasswordChange(current_password="Admin123!", new_password="NewPass123!"),
        )

        # 旧 Token 应被拒绝（token_version 不匹配）
        with pytest.raises(AuthenticationError, match="凭据已失效"):
            AuthService.authenticate_by_token(session, old_token, audience=AUDIENCE_ADMIN)

    def test_api_level_old_token_rejected(self, seeded_db: dict[str, Any]) -> None:
        """API 层：修改密码后，使用旧 Token 访问 → 401."""
        from collections.abc import Generator

        import db
        from main import app

        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        old_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        def _override() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[db.get_db] = _override
        try:
            client = TestClient(app, cookies={"access_token": old_token})
            client.headers["X-Requested-With"] = "XMLHttpRequest"

            # 修改密码
            resp = client.post(
                "/api/v1/users/change-password",
                json={"current_password": "Admin123!", "new_password": "NewPass123!"},
            )
            assert resp.status_code == 200, f"修改密码失败: {resp.status_code} {resp.text}"

            # 旧 Token 访问 → 应 401
            resp = client.get("/api/v1/auth/me")
            assert resp.status_code == 401, f"修改密码后旧 Token 应返回 401，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()


class TestDeleteUserRevokesToken:
    """删除用户（软删除 status=inactive + invalidate）后旧 Token 立即失效."""

    def test_service_level_token_invalidated(self, seeded_db: dict[str, Any]) -> None:
        """服务层：删除用户后，旧 Token → AuthenticationError."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]

        old_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )

        # admin 删除 normal
        user_service = UserLifecycleService()
        user_service.delete_user(session, normal.id, current_user_id=admin.id)

        # 旧 Token 应被拒绝
        with pytest.raises(AuthenticationError, match="凭据已失效"):
            AuthService.authenticate_by_token(session, old_token, audience=AUDIENCE_ADMIN)

    def test_api_level_old_token_rejected(self, seeded_db: dict[str, Any]) -> None:
        """API 层：删除用户后，旧 Token 访问 → 401."""
        from collections.abc import Generator

        import db
        from main import app

        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]

        normal_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )
        admin_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        def _override() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[db.get_db] = _override
        try:
            admin_client = TestClient(app, cookies={"access_token": admin_token})
            admin_client.headers["X-Requested-With"] = "XMLHttpRequest"
            normal_client = TestClient(app, cookies={"access_token": normal_token})

            # 验证 normal 的旧 Token 原本可用
            resp = normal_client.get("/api/v1/users/me")
            assert resp.status_code == 200, f"旧 Token 原本应可用: {resp.status_code}"

            # admin 删除 normal
            resp = admin_client.delete(f"/api/v1/users/{normal.id}")
            assert resp.status_code == 204, f"删除用户失败: {resp.status_code} {resp.text}"

            # 旧 Token 应失效 → 401
            resp = normal_client.get("/api/v1/users/me")
            assert resp.status_code == 401, f"删除用户后旧 Token 应返回 401，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()


class TestDisableUserRevokesToken:
    """禁用用户（通过 update_user status=inactive）后旧 Token 立即失效.

    修复后行为：update_user 检测到 status 由 active → 非 active 时，
    主动调用 AuthService.invalidate_user_tokens，递增 token_version，
    使旧 Token 在 JWT 层面立即失效（与 change_password/delete_user 行为一致）。
    """

    def test_service_level_token_invalidated(self, seeded_db: dict[str, Any]) -> None:
        """服务层：禁用用户后，旧 Token → AuthenticationError（token_version 不匹配）."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        original_ver = normal.token_version

        old_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )

        # 禁用用户
        user_service = UserService()
        from schemas.user import UserUpdate

        user_service.update_user(session, normal.id, UserUpdate(status="inactive"))

        # token_version 应递增
        session.refresh(normal)
        assert normal.token_version == original_ver + 1, (
            "禁用用户后 token_version 应递增 1（update_user 调用了 invalidate_user_tokens）"
        )

        # 旧 Token 应被拒绝
        with pytest.raises(AuthenticationError, match="凭据已失效"):
            AuthService.authenticate_by_token(session, old_token, audience=AUDIENCE_ADMIN)

    def test_api_level_old_token_rejected(self, seeded_db: dict[str, Any]) -> None:
        """API 层：禁用用户后，旧 Token 访问 → 401."""
        from collections.abc import Generator

        import db
        from main import app

        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]

        normal_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )
        admin_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        def _override() -> Generator[Session, None, None]:
            yield session

        app.dependency_overrides[db.get_db] = _override
        try:
            admin_client = TestClient(app, cookies={"access_token": admin_token})
            admin_client.headers["X-Requested-With"] = "XMLHttpRequest"
            normal_client = TestClient(app, cookies={"access_token": normal_token})

            # 验证 normal 的旧 Token 原本可用
            resp = normal_client.get("/api/v1/users/me")
            assert resp.status_code == 200, f"旧 Token 原本应可用: {resp.status_code}"

            # admin 禁用 normal（通过 update_user status=inactive）
            resp = admin_client.put(
                f"/api/v1/users/{normal.id}",
                json={"status": "inactive"},
            )
            assert resp.status_code == 200, f"禁用用户失败: {resp.status_code} {resp.text}"

            # 旧 Token 应失效 → 401
            resp = normal_client.get("/api/v1/users/me")
            assert resp.status_code == 401, f"禁用用户后旧 Token 应返回 401，实际 {resp.status_code}"
        finally:
            app.dependency_overrides.clear()

    def test_reenable_user_does_not_invalidate_token(self, seeded_db: dict[str, Any]) -> None:
        """重新启用用户（inactive → active）不应撤销 Token.

        只有 active → 非 active 才触发撤销，反向变更无需递增 token_version。
        """
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        # 先禁用
        user_service = UserService()
        from schemas.user import UserUpdate

        user_service.update_user(session, normal.id, UserUpdate(status="inactive"))
        session.refresh(normal)
        version_after_disable = normal.token_version

        # 再启用
        user_service.update_user(session, normal.id, UserUpdate(status="active"))
        session.refresh(normal)
        assert normal.token_version == version_after_disable, "重新启用用户不应递增 token_version"

    def test_update_other_fields_does_not_invalidate_token(self, seeded_db: dict[str, Any]) -> None:
        """更新非 status 字段（如 nickname）不应撤销 Token."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        original_ver = normal.token_version

        user_service = UserService()
        from schemas.user import UserUpdate

        user_service.update_user(session, normal.id, UserUpdate(nickname="新昵称"))

        session.refresh(normal)
        assert normal.token_version == original_ver, "更新 nickname 不应改变 token_version"


class TestResetPasswordRevokesToken:
    """重置密码后旧 Token 立即失效."""

    def test_service_level_token_invalidated(self, seeded_db: dict[str, Any]) -> None:
        """服务层：重置密码后，旧 Token → AuthenticationError."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        old_token = create_access_token(
            data={"sub": normal.id, "role": "user", "ver": normal.token_version},
            audience=AUDIENCE_ADMIN,
        )

        user_service = UserLifecycleService()
        from schemas.user import PasswordResetRequest

        user_service.reset_password(
            session,
            normal.id,
            PasswordResetRequest(password="Reset123!"),
        )

        with pytest.raises(AuthenticationError, match="凭据已失效"):
            AuthService.authenticate_by_token(session, old_token, audience=AUDIENCE_ADMIN)
