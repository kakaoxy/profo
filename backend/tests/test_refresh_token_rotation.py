"""Refresh Token 轮换测试.

验证 refresh_token 在使用后立即失效（jti 撤销），同一 refresh_token
不可重复利用，防止重放攻击。
"""

from typing import Any

import pytest

from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError


class TestRefreshTokenRotation:
    """refresh_token 轮换：旧 token 使用后失效，新 token 可用."""

    def test_old_refresh_token_invalidated_after_use(self, seeded_db: dict[str, Any]) -> None:
        """刷新后，旧 refresh_token 再次使用 → AuthenticationError."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        # 签发初始 token
        initial = AuthService.create_tokens_for_user(session, admin, audience="admin")
        old_refresh = initial["refresh_token"]

        # 第一次刷新：成功，返回新 token
        refreshed = AuthService.refresh_user_token(session, old_refresh, expected_audience="admin")
        assert refreshed["refresh_token"] != old_refresh, "刷新后应返回新的 refresh_token"

        # 旧 refresh_token 再次使用 → 应被拒绝（jti 已撤销）
        with pytest.raises(AuthenticationError, match="刷新令牌已失效"):
            AuthService.refresh_user_token(session, old_refresh, expected_audience="admin")

    def test_new_refresh_token_is_usable(self, seeded_db: dict[str, Any]) -> None:
        """刷新返回的新 refresh_token 可继续使用."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        initial = AuthService.create_tokens_for_user(session, admin, audience="admin")
        refreshed1 = AuthService.refresh_user_token(session, initial["refresh_token"], expected_audience="admin")

        # 新 refresh_token 应可再次刷新
        refreshed2 = AuthService.refresh_user_token(session, refreshed1["refresh_token"], expected_audience="admin")
        assert refreshed2["refresh_token"] != refreshed1["refresh_token"]

    def test_concurrent_refresh_with_same_token_fails(self, seeded_db: dict[str, Any]) -> None:
        """同一 refresh_token 第二次刷新（模拟并发重放）→ 拒绝."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        initial = AuthService.create_tokens_for_user(session, admin, audience="admin")
        old_refresh = initial["refresh_token"]

        # 第一次刷新成功
        AuthService.refresh_user_token(session, old_refresh, expected_audience="admin")

        # 第二次刷新（重放）→ 拒绝
        with pytest.raises(AuthenticationError, match="刷新令牌已失效"):
            AuthService.refresh_user_token(session, old_refresh, expected_audience="admin")

    def test_refresh_token_without_jti_rejected(self, seeded_db: dict[str, Any]) -> None:
        """无 jti 的旧版 refresh_token 被拒绝（需重新登录）."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        # 模拟旧版 refresh_token（无 jti）：手动构造
        # create_refresh_token 现在总会生成 jti，所以用 jwt 直接编码一个无 jti 的
        from datetime import datetime, timedelta, timezone

        from jose import jwt

        from settings import settings
        from utils.auth import AUDIENCE_ADMIN

        payload = {
            "sub": admin.id,
            "ver": admin.token_version,
            "type": "refresh",
            "aud": AUDIENCE_ADMIN,
            "exp": datetime.now(timezone.utc) + timedelta(days=1),
        }
        legacy_token = jwt.encode(payload, settings.jwt_secret_key, algorithm=settings.jwt_algorithm)

        with pytest.raises(AuthenticationError, match="刷新令牌已失效"):
            AuthService.refresh_user_token(session, legacy_token, expected_audience="admin")

    def test_invalidate_user_tokens_revokes_refresh_tokens(self, seeded_db: dict[str, Any]) -> None:
        """invalidate_user_tokens 后，已签发的 refresh_token 无法刷新."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        initial = AuthService.create_tokens_for_user(session, admin, audience="admin")
        refresh = initial["refresh_token"]

        # 撤销所有 token（模拟修改密码/禁用）
        AuthService.invalidate_user_tokens(session, admin)

        # refresh_token 应失效（token_version 不匹配 + jti 已撤销）
        with pytest.raises(AuthenticationError, match="凭据已失效"):
            AuthService.refresh_user_token(session, refresh, expected_audience="admin")

    def test_rotation_preserves_audience(self, seeded_db: dict[str, Any]) -> None:
        """轮换后受众保持一致：C 端 refresh_token 刷新后仍为 aud=c."""
        session = seeded_db["session"]
        from models import Role
        from utils.auth import get_password_hash
        from utils.crypto import hash_phone

        # 创建 C 端用户
        customer_role = session.query(Role).filter(Role.code == "customer").first()
        from models import User

        c_user = User(
            id="rotation-c-user",
            username="rotation_c",
            password=get_password_hash("Cpass123!"),
            nickname="轮换C端",
            phone="13900139099",
            phone_hash=hash_phone("13900139099"),
            role_id=customer_role.id,
            status="active",
        )
        session.add(c_user)
        session.commit()
        session.refresh(c_user)

        initial = AuthService.create_tokens_for_user(session, c_user, audience="c")
        refreshed = AuthService.refresh_user_token(session, initial["refresh_token"], expected_audience="c")

        # 新 refresh_token 用 aud=admin 刷新应失败（受众隔离）
        with pytest.raises(AuthenticationError, match="刷新令牌无效"):
            AuthService.refresh_user_token(session, refreshed["refresh_token"], expected_audience="admin")
