"""Logout 撤销 refresh_token 测试.

验证 C端 logout 后，旧 refresh_token 不可刷新（返回 AuthenticationError）。
"""

from typing import Any

import pytest

from models import Role, User
from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError
from utils.auth import AUDIENCE_C, get_password_hash


class TestLogoutRevokesRefreshToken:
    """logout 后 refresh_token 被撤销."""

    def test_refresh_token_revoked_after_logout(self, seeded_db: dict[str, Any]) -> None:
        """Logout 后，旧 refresh_token 再次刷新 → AuthenticationError."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        # 签发 C端受众的初始 token
        initial = AuthService.create_tokens_for_user(session, admin, audience=AUDIENCE_C)
        old_refresh = initial["refresh_token"]

        # logout：撤销 refresh_token
        AuthService.revoke_refresh_token(session, old_refresh, expected_audience="c")

        # 旧 refresh_token 再次使用 → 应被拒绝（jti 已撤销）
        with pytest.raises(AuthenticationError, match="刷新令牌已失效"):
            AuthService.refresh_user_token(session, old_refresh, expected_audience="c")

    def test_revoke_invalid_token_silent(self, seeded_db: dict[str, Any]) -> None:
        """对无效 token 调用 revoke_refresh_token → 静默返回（不报错）."""
        session = seeded_db["session"]

        # 无效 token 不应抛异常
        AuthService.revoke_refresh_token(session, "invalid.token.here", expected_audience="c")
        AuthService.revoke_refresh_token(session, "", expected_audience="c")

    def test_revoke_already_revoked_idempotent(self, seeded_db: dict[str, Any]) -> None:
        """重复撤销同一 refresh_token → 幂等，不报错."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        initial = AuthService.create_tokens_for_user(session, admin, audience=AUDIENCE_C)
        refresh = initial["refresh_token"]

        # 第一次撤销
        AuthService.revoke_refresh_token(session, refresh, expected_audience="c")
        # 第二次撤销（幂等）
        AuthService.revoke_refresh_token(session, refresh, expected_audience="c")


class TestRevokeRefreshTokenOwnership:
    """revoke_refresh_token 的 expected_user_id 归属校验.

    防御场景：攻击者用 admin 的 cookie 调 logout 接口传入 operator 的 refresh_token，
    若不做归属校验，admin 可批量撤销其他用户的 token 造成 DoS。
    """

    @staticmethod
    def _create_operator(session: Any) -> User:
        """直建 operator 用户用于归属校验测试（绕过 service 校验，聚焦撤销逻辑）."""
        operator_role = session.query(Role).filter(Role.code == "operator").first()
        user = User(
            id="operator-revoke-own",
            username="op-revoke-own",
            password=get_password_hash("Test1234!"),
            nickname="operator-revoke",
            role_id=operator_role.id,
            status="active",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    def test_revoke_other_user_token_skipped(self, seeded_db: dict[str, Any]) -> None:
        """Admin 调 revoke_refresh_token 传 operator 的 token + expected_user_id=admin.id → 静默跳过.

        场景：攻击者拿到 admin cookie 后传入他人的 refresh_token 调 logout。
        期望：token 不被撤销（operator 仍可正常刷新），且不报错（幂等）。
        """
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        operator = self._create_operator(session)

        # admin 与 operator 各签发自己的 C 端 token
        admin_initial = AuthService.create_tokens_for_user(session, admin, audience=AUDIENCE_C)
        operator_initial = AuthService.create_tokens_for_user(session, operator, audience=AUDIENCE_C)
        admin_refresh = admin_initial["refresh_token"]
        operator_refresh = operator_initial["refresh_token"]

        # admin 用自己的身份撤销 operator 的 token → 因 sub 不匹配而静默跳过
        AuthService.revoke_refresh_token(
            session,
            operator_refresh,
            expected_audience="c",
            expected_user_id=admin.id,
        )

        # operator 的 token 仍可正常刷新（未被撤销）
        refreshed = AuthService.refresh_user_token(
            session,
            operator_refresh,
            expected_audience="c",
        )
        assert refreshed["access_token"], "operator 的 refresh_token 应仍可刷新（未被撤销）"

        # admin 的 token 不受影响
        refreshed_admin = AuthService.refresh_user_token(
            session,
            admin_refresh,
            expected_audience="c",
        )
        assert refreshed_admin["access_token"], "admin 的 refresh_token 应仍可刷新"

    def test_revoke_own_token_succeeds(self, seeded_db: dict[str, Any]) -> None:
        """Admin 调 revoke_refresh_token 传自己的 token + expected_user_id=admin.id → 成功撤销."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        initial = AuthService.create_tokens_for_user(session, admin, audience=AUDIENCE_C)
        refresh = initial["refresh_token"]

        # admin 撤销自己的 token → sub 匹配，正常撤销
        AuthService.revoke_refresh_token(
            session,
            refresh,
            expected_audience="c",
            expected_user_id=admin.id,
        )

        # 旧 token 再次刷新 → 应被拒绝
        with pytest.raises(AuthenticationError, match="刷新令牌已失效"):
            AuthService.refresh_user_token(session, refresh, expected_audience="c")

    def test_revoke_without_user_id_backward_compatible(self, seeded_db: dict[str, Any]) -> None:
        """不传 expected_user_id 时行为与历史一致（撤销成功）."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        initial = AuthService.create_tokens_for_user(session, admin, audience=AUDIENCE_C)
        refresh = initial["refresh_token"]

        # 不传 expected_user_id：兼容历史调用（如内部脚本调用）
        AuthService.revoke_refresh_token(session, refresh, expected_audience="c")

        # 旧 token 再次刷新 → 应被拒绝
        with pytest.raises(AuthenticationError, match="刷新令牌已失效"):
            AuthService.refresh_user_token(session, refresh, expected_audience="c")
