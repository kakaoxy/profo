"""AuthService 单元测试."""

import time
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from sqlalchemy.orm import Session

from models import Role, User
from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError, ValidationError
from utils.auth import create_access_token, create_refresh_token, get_password_hash


# ---------------------------------------------------------------------------
# authenticate_user
# ---------------------------------------------------------------------------


class TestAuthenticateUser:
    """authenticate_user 测试."""

    def test_success_with_correct_credentials(self, seeded_db: dict) -> None:
        """正确用户名和密码应返回用户对象."""
        db = seeded_db["session"]
        user = AuthService.authenticate_user(db, "admin", "Admin123!")
        assert user is not None
        assert user.username == "admin"

    def test_raises_authentication_error_for_wrong_password(self, seeded_db: dict) -> None:
        """错误密码应抛出 AuthenticationError."""
        db = seeded_db["session"]
        with pytest.raises(AuthenticationError):
            AuthService.authenticate_user(db, "admin", "WrongPassword1!")

    def test_raises_authentication_error_for_nonexistent_user(self, seeded_db: dict) -> None:
        """不存在的用户名应抛出 AuthenticationError."""
        db = seeded_db["session"]
        with pytest.raises(AuthenticationError):
            AuthService.authenticate_user(db, "nonexistent", "Whatever123!")


# ---------------------------------------------------------------------------
# try_authenticate_user
# ---------------------------------------------------------------------------


class TestTryAuthenticateUser:
    """try_authenticate_user 测试."""

    def test_returns_user_on_success(self, seeded_db: dict) -> None:
        """验证成功应返回 User 对象."""
        db = seeded_db["session"]
        user = AuthService.try_authenticate_user(db, "admin", "Admin123!")
        assert user is not None
        assert user.username == "admin"

    def test_returns_none_on_failure(self, seeded_db: dict) -> None:
        """验证失败应返回 None."""
        db = seeded_db["session"]
        result = AuthService.try_authenticate_user(db, "admin", "WrongPassword1!")
        assert result is None


# ---------------------------------------------------------------------------
# create_tokens_for_user
# ---------------------------------------------------------------------------


class TestCreateTokensForUser:
    """create_tokens_for_user 测试."""

    def test_normal_token_creation(self, seeded_db: dict) -> None:
        """正常令牌生成应包含 access_token、refresh_token、token_type、expires_in."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        result = AuthService.create_tokens_for_user(db, user, update_login_time=False)

        assert result["require_password_change"] is False
        assert "access_token" in result
        assert "refresh_token" in result
        assert result["token_type"] == "bearer"
        assert isinstance(result["expires_in"], int)
        assert result["expires_in"] > 0

    def test_force_temp_token_with_must_change_password(self, seeded_db: dict) -> None:
        """force_temp_token=True 且 must_change_password=True 应返回临时令牌."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        user.must_change_password = True
        db.commit()
        db.refresh(user)

        result = AuthService.create_tokens_for_user(db, user, force_temp_token=True, update_login_time=False)

        assert result["require_password_change"] is True
        assert "temp_token" in result
        assert "access_token" not in result

    def test_force_temp_token_without_must_change_password(self, seeded_db: dict) -> None:
        """force_temp_token=True 但 must_change_password=False 应返回正常令牌."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        user.must_change_password = False
        db.commit()
        db.refresh(user)

        result = AuthService.create_tokens_for_user(db, user, force_temp_token=True, update_login_time=False)

        assert result["require_password_change"] is False
        assert "access_token" in result
        assert "refresh_token" in result

    def test_update_login_time_true(self, seeded_db: dict) -> None:
        """update_login_time=True 应更新 last_login_at."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        user.last_login_at = None
        db.commit()
        db.refresh(user)

        before = datetime.now(timezone.utc)
        AuthService.create_tokens_for_user(db, user, update_login_time=True)
        db.refresh(user)

        assert user.last_login_at is not None
        assert user.last_login_at >= before.replace(tzinfo=None)

    def test_update_login_time_false(self, seeded_db: dict) -> None:
        """update_login_time=False 不应更新 last_login_at."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        user.last_login_at = None
        db.commit()
        db.refresh(user)

        AuthService.create_tokens_for_user(db, user, update_login_time=False)
        db.refresh(user)

        assert user.last_login_at is None


# ---------------------------------------------------------------------------
# refresh_user_token
# ---------------------------------------------------------------------------


class TestRefreshUserToken:
    """refresh_user_token 测试."""

    def test_success_with_valid_refresh_token(self, seeded_db: dict) -> None:
        """有效的 refresh_token 应成功刷新并返回新令牌."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        refresh_token = create_refresh_token(data={"sub": user.id})

        result = AuthService.refresh_user_token(db, refresh_token)

        assert "access_token" in result
        assert "refresh_token" in result
        assert result["token_type"] == "bearer"

    def test_raises_for_invalid_refresh_token(self, seeded_db: dict) -> None:
        """无效的 refresh_token 应抛出 AuthenticationError."""
        db = seeded_db["session"]
        with pytest.raises(AuthenticationError):
            AuthService.refresh_user_token(db, "invalid.refresh.token")

    def test_raises_for_expired_refresh_token(self, seeded_db: dict) -> None:
        """过期的 refresh_token 应抛出 AuthenticationError."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]
        expired_token = create_refresh_token(
            data={"sub": user.id},
            expires_delta=timedelta(seconds=-1),
        )
        with pytest.raises(AuthenticationError):
            AuthService.refresh_user_token(db, expired_token)

    def test_raises_for_nonexistent_user_in_token(self, seeded_db: dict) -> None:
        """token 中用户不存在应抛出 AuthenticationError."""
        db = seeded_db["session"]
        refresh_token = create_refresh_token(data={"sub": "nonexistent-user-id"})

        with pytest.raises(AuthenticationError):
            AuthService.refresh_user_token(db, refresh_token)


# ---------------------------------------------------------------------------
# generate_wechat_auth_url
# ---------------------------------------------------------------------------


class TestGenerateWechatAuthUrl:
    """generate_wechat_auth_url 测试."""

    def test_returns_url_containing_appid_and_redirect_uri(self) -> None:
        """生成的 URL 应包含 appid 和 redirect_uri 参数."""
        url = AuthService.generate_wechat_auth_url(redirect_uri="https://example.com/callback")
        assert "appid=" in url
        assert "redirect_uri=" in url
        assert "https%3A%2F%2Fexample.com%2Fcallback" in url or "example.com/callback" in url

    def test_uses_default_redirect_uri_when_not_provided(self) -> None:
        """未提供 redirect_uri 时应使用默认值."""
        from settings import settings

        url = AuthService.generate_wechat_auth_url()
        assert "appid=" in url
        assert settings.wechat_redirect_uri.split("/")[-1] in url or "redirect_uri=" in url


# ---------------------------------------------------------------------------
# store_temp_token / exchange_temp_code
# ---------------------------------------------------------------------------


class TestTempCodeFlow:
    """store_temp_token / exchange_temp_code 测试."""

    def test_store_and_exchange_successfully(self) -> None:
        """存储后应能成功换取令牌."""
        AuthService._temp_code_store.clear()

        access = "test_access_token"
        refresh = "test_refresh_token"
        code = AuthService.store_temp_token(access, refresh)

        result = AuthService.exchange_temp_code(code)
        assert result["access_token"] == access
        assert result["refresh_token"] == refresh

    def test_exchange_invalid_code_raises(self) -> None:
        """无效授权码应抛出 AuthenticationError."""
        AuthService._temp_code_store.clear()
        with pytest.raises(AuthenticationError):
            AuthService.exchange_temp_code("nonexistent_code")

    def test_code_is_one_time_use(self) -> None:
        """授权码只能使用一次，第二次应抛出 AuthenticationError."""
        AuthService._temp_code_store.clear()

        code = AuthService.store_temp_token("a", "r")
        AuthService.exchange_temp_code(code)

        with pytest.raises(AuthenticationError):
            AuthService.exchange_temp_code(code)

    def test_expired_code_raises(self) -> None:
        """过期的授权码应被清理，换取时抛出 AuthenticationError."""
        AuthService._temp_code_store.clear()

        code = AuthService.store_temp_token("a", "r")
        # 手动将过期时间设为过去
        AuthService._temp_code_store[code]["expires_at"] = time.time() - 1

        with pytest.raises(AuthenticationError):
            AuthService.exchange_temp_code(code)


# ---------------------------------------------------------------------------
# fetch_wechat_access_token (async)
# ---------------------------------------------------------------------------


class TestFetchWechatAccessToken:
    """fetch_wechat_access_token 测试."""

    @pytest.mark.asyncio
    async def test_success(self) -> None:
        """成功获取微信 access_token."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "access_token": "wx_access_token_123",
            "expires_in": 7200,
            "refresh_token": "wx_refresh_token",
            "openid": "wx_openid_123",
            "scope": "snsapi_userinfo",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            result = await AuthService.fetch_wechat_access_token("test_code")

        assert result["access_token"] == "wx_access_token_123"
        assert result["openid"] == "wx_openid_123"

    @pytest.mark.asyncio
    async def test_raises_validation_error_on_wechat_error(self) -> None:
        """微信返回错误时应抛出 ValidationError."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "errcode": 40029,
            "errmsg": "invalid code",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValidationError, match="微信授权失败"):
                await AuthService.fetch_wechat_access_token("bad_code")


# ---------------------------------------------------------------------------
# fetch_wechat_user_info (async)
# ---------------------------------------------------------------------------


class TestFetchWechatUserInfo:
    """fetch_wechat_user_info 测试."""

    @pytest.mark.asyncio
    async def test_success(self) -> None:
        """成功获取微信用户信息."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "openid": "wx_openid_123",
            "nickname": "微信用户",
            "headimgurl": "https://avatar.img/wechat.jpg",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            result = await AuthService.fetch_wechat_user_info("wx_access_token", "wx_openid_123")

        assert result["nickname"] == "微信用户"
        assert result["openid"] == "wx_openid_123"

    @pytest.mark.asyncio
    async def test_raises_validation_error_on_wechat_error(self) -> None:
        """微信返回错误时应抛出 ValidationError."""
        mock_response = MagicMock()
        mock_response.json.return_value = {
            "errcode": 40001,
            "errmsg": "invalid access_token",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(ValidationError, match="获取微信用户信息失败"):
                await AuthService.fetch_wechat_user_info("bad_token", "wx_openid")


# ---------------------------------------------------------------------------
# fetch_wechat_miniapp_session (async)
# ---------------------------------------------------------------------------


class TestFetchWechatMiniappSession:
    """fetch_wechat_miniapp_session 测试."""

    @pytest.mark.asyncio
    async def test_success(self) -> None:
        """成功获取小程序会话."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "openid": "wx_mini_openid",
            "session_key": "wx_session_key",
            "unionid": "wx_unionid",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            result = await AuthService.fetch_wechat_miniapp_session("js_code_123")

        assert result["openid"] == "wx_mini_openid"
        assert result["session_key"] == "wx_session_key"

    @pytest.mark.asyncio
    async def test_raises_authentication_error_on_http_error(self) -> None:
        """HTTP 请求失败应抛出 AuthenticationError."""
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.HTTPError("connection failed"))
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AuthenticationError, match="微信登录请求失败"):
                await AuthService.fetch_wechat_miniapp_session("js_code")

    @pytest.mark.asyncio
    async def test_raises_authentication_error_on_json_parse_error(self) -> None:
        """JSON 解析失败应抛出 AuthenticationError."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.side_effect = ValueError("bad json")

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AuthenticationError, match="微信登录响应解析失败"):
                await AuthService.fetch_wechat_miniapp_session("js_code")

    @pytest.mark.asyncio
    async def test_raises_authentication_error_on_wechat_errcode(self) -> None:
        """微信返回非零 errcode 应抛出 AuthenticationError."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "errcode": 40029,
            "errmsg": "invalid code",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(AuthenticationError, match="微信登录失败"):
                await AuthService.fetch_wechat_miniapp_session("bad_code")

    @pytest.mark.asyncio
    async def test_errcode_zero_is_success(self) -> None:
        """微信返回 errcode=0 应视为成功."""
        mock_response = MagicMock()
        mock_response.raise_for_status = MagicMock()
        mock_response.json.return_value = {
            "errcode": 0,
            "openid": "wx_mini_openid",
            "session_key": "wx_session_key",
        }

        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=False)

        with patch("services.system.auth.httpx.AsyncClient", return_value=mock_client):
            result = await AuthService.fetch_wechat_miniapp_session("js_code")

        assert result["openid"] == "wx_mini_openid"


# ---------------------------------------------------------------------------
# login_or_register_wechat_user
# ---------------------------------------------------------------------------


class TestLoginOrRegisterWechatUser:
    """login_or_register_wechat_user 测试."""

    def test_existing_user_updates_info(self, seeded_db: dict) -> None:
        """已存在的微信用户应更新信息并返回."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]

        user.wechat_openid = "test_openid_123"
        user.wechat_unionid = None
        user.nickname = "旧昵称"
        db.commit()
        db.refresh(user)

        result = AuthService.login_or_register_wechat_user(
            db,
            openid="test_openid_123",
            unionid="test_unionid_456",
            user_info={"nickname": "新昵称", "headimgurl": "https://avatar.img/new.jpg"},
            session_key="new_session_key",
        )

        assert result.id == user.id
        assert result.nickname == "新昵称"
        assert result.avatar == "https://avatar.img/new.jpg"
        assert result.wechat_unionid == "test_unionid_456"
        assert result.wechat_session_key == "new_session_key"

    def test_new_user_creates_user_and_role(self, seeded_db: dict) -> None:
        """新微信用户应创建用户，缺少 user 角色时自动创建."""
        db = seeded_db["session"]

        openid = "brand_new_openid_xyz"
        result = AuthService.login_or_register_wechat_user(
            db,
            openid=openid,
            unionid=None,
            user_info={"nickname": "微信新用户", "headimgurl": "https://avatar.img/wechat.jpg"},
        )

        assert result is not None
        assert result.wechat_openid == openid
        assert result.username.startswith("wechat_")
        assert result.nickname == "微信新用户"
        assert result.status == "active"

        role = db.query(Role).filter(Role.id == result.role_id).first()
        assert role is not None
        assert role.code == "user"

    def test_new_user_creates_role_when_missing(self, db_session: Session) -> None:
        """当 user 角色不存在时应自动创建."""
        db = db_session
        # 仅创建 admin 角色，不创建 user 角色
        admin_role = Role(id="admin-role-only", name="管理员", code="admin", permissions=["view_data"])
        db.add(admin_role)
        db.commit()

        openid = "another_new_openid_999"
        result = AuthService.login_or_register_wechat_user(
            db,
            openid=openid,
            unionid=None,
        )

        assert result is not None
        role = db.query(Role).filter(Role.id == result.role_id).first()
        assert role is not None
        assert role.code == "user"

    def test_new_user_without_user_info_uses_defaults(self, seeded_db: dict) -> None:
        """新用户无 user_info 时应使用默认昵称."""
        db = seeded_db["session"]

        openid = "no_user_info_openid"
        result = AuthService.login_or_register_wechat_user(
            db,
            openid=openid,
            unionid=None,
        )

        assert result.nickname == "微信用户"
        assert result.avatar is None

    def test_existing_user_with_session_key_updates(self, seeded_db: dict) -> None:
        """已存在的微信用户传入 session_key 应更新."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]

        user.wechat_openid = "sk_test_openid"
        user.wechat_session_key = None
        db.commit()
        db.refresh(user)

        result = AuthService.login_or_register_wechat_user(
            db,
            openid="sk_test_openid",
            unionid=None,
            session_key="updated_session_key",
        )

        assert result.wechat_session_key == "updated_session_key"

    def test_existing_user_updates_last_login_at(self, seeded_db: dict) -> None:
        """已存在的微信用户登录应更新 last_login_at."""
        db = seeded_db["session"]
        user = seeded_db["users"]["admin"]

        user.wechat_openid = "login_time_openid"
        user.last_login_at = None
        db.commit()
        db.refresh(user)

        before = datetime.now(timezone.utc)
        AuthService.login_or_register_wechat_user(
            db,
            openid="login_time_openid",
            unionid=None,
        )
        db.refresh(user)

        assert user.last_login_at is not None
        assert user.last_login_at >= before.replace(tzinfo=None)
