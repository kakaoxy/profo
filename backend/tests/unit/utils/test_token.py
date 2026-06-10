"""JWT 令牌工具函数单元测试."""

from datetime import timedelta

import pytest
from jose import jwt

from settings import settings
from utils.auth.token import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_user_id_from_token,
    validate_token,
)


# ---------------------------------------------------------------------------
# create_access_token
# ---------------------------------------------------------------------------


class TestCreateAccessToken:
    """create_access_token 测试."""

    def test_returns_jwt_string(self) -> None:
        """应返回有效的 JWT 字符串."""
        token = create_access_token({"sub": "user-1"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decoded_payload_contains_original_data_and_type_and_exp(self) -> None:
        """解码后应包含原始数据、type=access、exp."""
        token = create_access_token({"sub": "user-1", "role": "admin"})
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

        assert payload["sub"] == "user-1"
        assert payload["role"] == "admin"
        assert payload["type"] == "access"
        assert "exp" in payload

    def test_custom_expires_delta_respected(self) -> None:
        """自定义 expires_delta 应被正确使用."""
        delta = timedelta(hours=2)
        token = create_access_token({"sub": "user-1"}, expires_delta=delta)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

        # exp 应大约在 2 小时后（允许 5 秒误差）
        from datetime import datetime, timezone

        expected_exp = datetime.now(timezone.utc) + delta
        actual_exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert abs((actual_exp - expected_exp).total_seconds()) < 5

    def test_does_not_mutate_input_data(self) -> None:
        """不应修改传入的原始 data 字典."""
        data = {"sub": "user-1"}
        original = data.copy()
        create_access_token(data)
        assert data == original


# ---------------------------------------------------------------------------
# create_refresh_token
# ---------------------------------------------------------------------------


class TestCreateRefreshToken:
    """create_refresh_token 测试."""

    def test_returns_jwt_string(self) -> None:
        """应返回有效的 JWT 字符串."""
        token = create_refresh_token({"sub": "user-1"})
        assert isinstance(token, str)
        assert len(token) > 0

    def test_decoded_payload_contains_type_refresh_and_exp(self) -> None:
        """解码后应包含 type=refresh 和 exp."""
        token = create_refresh_token({"sub": "user-1"})
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

        assert payload["sub"] == "user-1"
        assert payload["type"] == "refresh"
        assert "exp" in payload

    def test_custom_expires_delta_respected(self) -> None:
        """自定义 expires_delta 应被正确使用."""
        delta = timedelta(days=30)
        token = create_refresh_token({"sub": "user-1"}, expires_delta=delta)
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm])

        from datetime import datetime, timezone

        expected_exp = datetime.now(timezone.utc) + delta
        actual_exp = datetime.fromtimestamp(payload["exp"], tz=timezone.utc)
        assert abs((actual_exp - expected_exp).total_seconds()) < 5


# ---------------------------------------------------------------------------
# decode_token
# ---------------------------------------------------------------------------


class TestDecodeToken:
    """decode_token 测试."""

    def test_decodes_valid_access_token(self) -> None:
        """应正确解码有效的 access token."""
        token = create_access_token({"sub": "user-1"})
        payload = decode_token(token)

        assert payload is not None
        assert payload["sub"] == "user-1"
        assert payload["type"] == "access"

    def test_returns_none_for_invalid_token(self) -> None:
        """无效 token 应返回 None."""
        assert decode_token("this.is.invalid") is None

    def test_key_rotation_tries_old_key(self) -> None:
        """密钥轮换：新密钥失败时应尝试旧密钥."""
        old_key = "old_secret_key_1234567890abcdef"
        # 用旧密钥签发 token
        from jose import jwt as jose_jwt

        token = jose_jwt.encode(
            {"sub": "user-1", "type": "access", "exp": 9999999999},
            old_key,
            algorithm=settings.jwt_algorithm,
        )

        # 新密钥无法解码，但启用轮换后旧密钥可以
        original_rotation = settings.jwt_key_rotation_enabled
        original_old_key = settings.jwt_secret_key_old
        try:
            settings.jwt_key_rotation_enabled = True
            settings.jwt_secret_key_old = old_key

            payload = decode_token(token)
            assert payload is not None
            assert payload["sub"] == "user-1"
        finally:
            settings.jwt_key_rotation_enabled = original_rotation
            settings.jwt_secret_key_old = original_old_key

    def test_key_rotation_returns_none_when_both_keys_fail(self) -> None:
        """密钥轮换：两个密钥都失败时返回 None."""
        original_rotation = settings.jwt_key_rotation_enabled
        original_old_key = settings.jwt_secret_key_old
        try:
            settings.jwt_key_rotation_enabled = True
            settings.jwt_secret_key_old = "another_invalid_key_xyz"

            assert decode_token("totally.invalid.token") is None
        finally:
            settings.jwt_key_rotation_enabled = original_rotation
            settings.jwt_secret_key_old = original_old_key

    def test_key_rotation_disabled_skips_old_key(self) -> None:
        """密钥轮换关闭时不应尝试旧密钥."""
        old_key = "old_secret_key_1234567890abcdef"
        from jose import jwt as jose_jwt

        token = jose_jwt.encode(
            {"sub": "user-1", "type": "access", "exp": 9999999999},
            old_key,
            algorithm=settings.jwt_algorithm,
        )

        original_rotation = settings.jwt_key_rotation_enabled
        original_old_key = settings.jwt_secret_key_old
        try:
            settings.jwt_key_rotation_enabled = False
            settings.jwt_secret_key_old = old_key

            assert decode_token(token) is None
        finally:
            settings.jwt_key_rotation_enabled = original_rotation
            settings.jwt_secret_key_old = original_old_key


# ---------------------------------------------------------------------------
# validate_token
# ---------------------------------------------------------------------------


class TestValidateToken:
    """validate_token 测试."""

    def test_validates_access_token_with_type_access(self) -> None:
        """type=access 的 token 配合 token_type='access' 应验证通过."""
        token = create_access_token({"sub": "user-1"})
        payload = validate_token(token, token_type="access")

        assert payload is not None
        assert payload["sub"] == "user-1"
        assert payload["type"] == "access"

    def test_returns_none_for_wrong_token_type(self) -> None:
        """access token 配合 token_type='refresh' 应返回 None."""
        token = create_access_token({"sub": "user-1"})
        assert validate_token(token, token_type="refresh") is None

    def test_refresh_token_with_type_refresh(self) -> None:
        """refresh token 配合 token_type='refresh' 应验证通过."""
        token = create_refresh_token({"sub": "user-1"})
        payload = validate_token(token, token_type="refresh")

        assert payload is not None
        assert payload["type"] == "refresh"

    def test_returns_none_for_invalid_token(self) -> None:
        """无效 token 应返回 None."""
        assert validate_token("invalid.token.here", token_type="access") is None

    def test_default_token_type_is_access(self) -> None:
        """默认 token_type 应为 'access'."""
        token = create_access_token({"sub": "user-1"})
        payload = validate_token(token)  # 不传 token_type
        assert payload is not None

        refresh_token = create_refresh_token({"sub": "user-1"})
        assert validate_token(refresh_token) is None


# ---------------------------------------------------------------------------
# get_user_id_from_token
# ---------------------------------------------------------------------------


class TestGetUserIdFromToken:
    """get_user_id_from_token 测试."""

    def test_returns_user_id_from_valid_token(self) -> None:
        """有效 token 应返回用户 ID（sub 字段）."""
        token = create_access_token({"sub": "user-1"})
        assert get_user_id_from_token(token) == "user-1"

    def test_returns_none_for_invalid_token(self) -> None:
        """无效 token 应返回 None."""
        assert get_user_id_from_token("invalid.token.here") is None

    def test_returns_none_for_refresh_token(self) -> None:
        """refresh token（默认校验 access 类型）应返回 None."""
        token = create_refresh_token({"sub": "user-1"})
        assert get_user_id_from_token(token) is None
