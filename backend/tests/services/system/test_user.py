"""用户服务测试.

覆盖 Task 4：角色变更（role_id 或附加角色增减）应调用
AuthService.invalidate_user_tokens 撤销 refresh_token 并递增 token_version，
与密码修改/禁用行为一致。
"""

from typing import Any

import pytest
from sqlalchemy.orm import Session

from models import RefreshToken, Role
from schemas.user import UserUpdate
from services.system.auth import AuthService
from services.system.exceptions import ValidationError
from services.system.user import UserService


def _count_unrevoked_refresh_tokens(session: Session, user_id: str) -> int:
    """统计指定用户未撤销的 refresh_token 数量."""
    return (
        session.query(RefreshToken)
        .filter(
            RefreshToken.user_id == user_id,
            RefreshToken.revoked.is_(False),
        )
        .count()
    )


class TestRoleChangeRevokesRefreshToken:
    """角色变更后应撤销 refresh_token 并递增 token_version."""

    def test_change_main_role_revokes_refresh_tokens(self, seeded_db: dict[str, Any]) -> None:
        """Admin 将用户主角色从 user 改为 operator → refresh_token 全部撤销，token_version 递增."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]
        original_ver = normal.token_version

        # 为 normal 用户签发 refresh_token（aud=admin，主角色为后台角色 user）
        AuthService.create_tokens_for_user(session, normal, audience="admin")
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 1, "签发后应存在 1 条未撤销 refresh_token"

        # admin 将 normal 的主角色从 user-role 改为 operator-role
        operator_role = session.query(Role).filter(Role.code == "operator").first()
        user_service = UserService()
        user_service.update_user(
            session,
            normal.id,
            UserUpdate(role_id=operator_role.id),
            operator_id=admin.id,
        )

        # 验证 token_version 递增
        session.refresh(normal)
        assert normal.token_version == original_ver + 1, "角色变更后 token_version 应递增 1"

        # 验证所有未撤销 refresh_token 已被撤销
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 0, "角色变更后应撤销所有未撤销的 refresh_token"

    def test_add_additional_role_revokes_refresh_tokens(self, seeded_db: dict[str, Any]) -> None:
        """Admin 为用户添加附加角色（customer）→ refresh_token 全部撤销，token_version 递增."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]
        original_ver = normal.token_version

        # 签发 refresh_token
        AuthService.create_tokens_for_user(session, normal, audience="admin")
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 1

        # admin 为 normal 添加 customer 附加角色
        customer_role = session.query(Role).filter(Role.code == "customer").first()
        user_service = UserService()
        user_service.update_user(
            session,
            normal.id,
            UserUpdate(),
            additional_role_ids=[customer_role.id],
            operator_id=admin.id,
        )

        session.refresh(normal)
        assert normal.token_version == original_ver + 1, "添加附加角色后 token_version 应递增 1"
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 0, (
            "添加附加角色后应撤销所有未撤销的 refresh_token"
        )

    def test_remove_additional_role_revokes_refresh_tokens(self, seeded_db: dict[str, Any]) -> None:
        """Admin 清空用户附加角色（传 []）→ refresh_token 全部撤销，token_version 递增."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]
        original_ver = normal.token_version

        # 先添加 customer 附加角色（此步会递增 token_version 并撤销当时存在的 token）
        customer_role = session.query(Role).filter(Role.code == "customer").first()
        user_service = UserService()
        user_service.update_user(
            session,
            normal.id,
            UserUpdate(),
            additional_role_ids=[customer_role.id],
            operator_id=admin.id,
        )
        session.refresh(normal)
        version_after_add = normal.token_version
        assert version_after_add == original_ver + 1, "添加附加角色后 token_version 应递增 1"

        # 再签发新的 refresh_token（之前的已被撤销）
        AuthService.create_tokens_for_user(session, normal, audience="admin")
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 1

        # 清空附加角色（传空列表）
        user_service.update_user(
            session,
            normal.id,
            UserUpdate(),
            additional_role_ids=[],
            operator_id=admin.id,
        )

        session.refresh(normal)
        assert normal.token_version == version_after_add + 1, "清空附加角色后 token_version 应再次递增"
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 0, (
            "清空附加角色后应撤销所有未撤销的 refresh_token"
        )


class TestNonRoleUpdateDoesNotRevokeToken:
    """更新非角色字段不应撤销 Token."""

    def test_update_nickname_preserves_token(self, seeded_db: dict[str, Any]) -> None:
        """Admin 更新用户 nickname → token_version 不变，refresh_token 不被撤销."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]
        original_ver = normal.token_version

        # 签发 refresh_token
        AuthService.create_tokens_for_user(session, normal, audience="admin")
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 1

        # 仅更新 nickname（非角色/状态/附加角色字段）
        user_service = UserService()
        user_service.update_user(
            session,
            normal.id,
            UserUpdate(nickname="新昵称"),
            operator_id=admin.id,
        )

        session.refresh(normal)
        assert normal.token_version == original_ver, "更新 nickname 不应改变 token_version"
        assert _count_unrevoked_refresh_tokens(session, normal.id) == 1, "更新 nickname 不应撤销 refresh_token"


class TestSelfPrivilegeProtectionPreserved:
    """自提权防护保持不变：admin 不能修改自身角色."""

    def test_admin_cannot_change_own_role(self, seeded_db: dict[str, Any]) -> None:
        """Admin 修改自身 role_id → ValidationError（自提权防护触发）."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        user_service = UserService()
        operator_role = session.query(Role).filter(Role.code == "operator").first()
        with pytest.raises(ValidationError, match="不能修改自身的角色"):
            user_service.update_user(
                session,
                admin.id,
                UserUpdate(role_id=operator_role.id),
                operator_id=admin.id,
            )
