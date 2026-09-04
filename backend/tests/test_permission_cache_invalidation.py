"""权限缓存失效测试.

验证 token_version 在以下场景中递增，使旧 Token 失效：
1. 密码修改后 token_version 递增（通过 AuthService.invalidate_user_tokens）
2. 用户角色变更（role_id / additional_role_ids）后 token_version 递增
3. 角色权限变更（permission_codes）后，该角色下所有用户 token_version 递增
"""

from typing import Any

import pytest

from schemas.user import PasswordChange, RoleUpdate, UserCreate, UserUpdate
from services.system import role_service, user_lifecycle_service, user_service
from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError
from utils.auth import AUDIENCE_ADMIN, create_access_token

# 测试用密码（满足强度要求：8+ 字符 + 大小写 + 数字 + 特殊字符）
_TEST_PASSWORD = "Test1234!"


class TestPasswordChangeInvalidation:
    """密码修改后 token_version 递增."""

    def test_change_password_increments_token_version(self, seeded_db: dict[str, Any]) -> None:
        """修改密码后 token_version 递增 1."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        original_version = admin.token_version

        user_lifecycle_service.change_password(
            session,
            admin,
            PasswordChange(current_password="Admin123!", new_password="NewPass123!"),
        )

        session.refresh(admin)
        assert admin.token_version == original_version + 1

    def test_reset_password_increments_token_version(self, seeded_db: dict[str, Any]) -> None:
        """重置密码后 token_version 递增 1."""
        from schemas.user import PasswordResetRequest

        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        original_version = normal.token_version

        user_lifecycle_service.reset_password(
            session,
            normal.id,
            PasswordResetRequest(password="Reset123!"),
        )

        session.refresh(normal)
        assert normal.token_version == original_version + 1

    def test_old_token_rejected_after_password_change(self, seeded_db: dict[str, Any]) -> None:
        """修改密码后，旧 Token 经 authenticate_by_token → AuthenticationError."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        # 签发携带当前 token_version 的 Token
        old_token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        # 修改密码（递增 token_version）
        user_lifecycle_service.change_password(
            session,
            admin,
            PasswordChange(current_password="Admin123!", new_password="NewPass123!"),
        )

        # 旧 Token 应被拒绝（token_version 不匹配）
        with pytest.raises(AuthenticationError, match="凭据已失效"):
            AuthService.authenticate_by_token(session, old_token, audience=AUDIENCE_ADMIN)


class TestRoleChangeInvalidation:
    """用户角色变更后 token_version 递增."""

    def test_role_id_change_increments_token_version(self, seeded_db: dict[str, Any]) -> None:
        """主角色（role_id）变更后 token_version 递增 1."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        original_version = normal.token_version

        # 将 normal 用户的主角色从 user-role 改为 operator-role
        user_service.update_user(session, normal.id, UserUpdate(role_id="operator-role"))

        session.refresh(normal)
        assert normal.token_version == original_version + 1
        assert normal.role_id == "operator-role"

    def test_additional_role_change_increments_token_version(self, seeded_db: dict[str, Any]) -> None:
        """附加角色变更后 token_version 递增 1."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        original_version = admin.token_version

        # admin 用户添加附加 customer 角色
        user_service.update_user(
            session,
            admin.id,
            UserUpdate(),
            additional_role_ids=["customer-role"],
        )

        session.refresh(admin)
        assert admin.token_version == original_version + 1

    def test_clearing_additional_roles_increments_token_version(self, seeded_db: dict[str, Any]) -> None:
        """清空附加角色后 token_version 递增 1."""
        session = seeded_db["session"]

        # 先创建带附加 customer 角色的用户
        user_data = UserCreate(
            username="multi-role-test",
            password=_TEST_PASSWORD,
            nickname="多角色测试",
            role_id="user-role",
            additional_role_ids=["customer-role"],
        )
        user = user_service.create_user(
            session,
            user_data,
            additional_role_ids=["customer-role"],
        )
        original_version = user.token_version

        # 清空附加角色
        user_service.update_user(
            session,
            user.id,
            UserUpdate(),
            additional_role_ids=[],
        )

        session.refresh(user)
        assert user.token_version == original_version + 1

    def test_non_role_update_does_not_increment_token_version(self, seeded_db: dict[str, Any]) -> None:
        """更新非角色字段（如 nickname）不递增 token_version."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        original_version = normal.token_version

        user_service.update_user(session, normal.id, UserUpdate(nickname="新昵称"))

        session.refresh(normal)
        assert normal.token_version == original_version
        assert normal.nickname == "新昵称"


class TestPermissionChangeInvalidation:
    """角色权限变更后，该角色下所有用户 token_version 递增."""

    def test_permission_update_increments_token_version_for_main_role_users(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """角色权限变更后，主角色为该角色的用户 token_version 递增."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        original_version = normal.token_version

        # 更新 user-role 的权限（normal 用户主角色为 user-role）
        role_service.update_role(
            session,
            "user-role",
            RoleUpdate(permission_codes=["property:read", "lead:read"]),
        )

        session.refresh(normal)
        assert normal.token_version == original_version + 1

    def test_permission_update_increments_token_version_for_additional_role_users(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """角色权限变更后，附加角色为该角色的用户 token_version 递增."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        admin_original_version = admin.token_version

        # 为 admin 添加附加 customer 角色
        user_service.update_user(
            session,
            admin.id,
            UserUpdate(),
            additional_role_ids=["customer-role"],
        )
        session.refresh(admin)
        version_after_role_change = admin.token_version

        # 更新 customer-role 的权限（admin 附加角色为 customer-role）
        role_service.update_role(
            session,
            "customer-role",
            RoleUpdate(permission_codes=["valuation:write"]),
        )

        session.refresh(admin)
        # admin 的 token_version 应在角色变更的基础上再递增 1
        assert admin.token_version == version_after_role_change + 1
        assert admin.token_version == admin_original_version + 2

    def test_permission_update_does_not_affect_other_role_users(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """角色权限变更不影响其他角色的用户."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        original_version = admin.token_version

        # 更新 user-role 的权限（admin 主角色为 admin-role，不受影响）
        role_service.update_role(
            session,
            "user-role",
            RoleUpdate(permission_codes=["property:read"]),
        )

        session.refresh(admin)
        assert admin.token_version == original_version
