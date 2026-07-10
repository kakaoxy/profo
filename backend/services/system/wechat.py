"""微信 OAuth 服务（从 services/system/auth.py 拆分）.

处理微信网页授权、小程序登录、state 管理（防 CSRF）与临时令牌交换。
核心认证（用户名密码、JWT 生命周期）仍保留在 auth.py 的 AuthService 中。

设计：
- 方法保持 static/classmethod 风格，与原 AuthService 一致，无需实例化。
- state / temp_code 使用进程内 ClassVar 字典存储（与原实现一致）。
"""

import logging
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import ClassVar
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from models import Role, User
from settings import settings
from utils.auth import get_password_hash

from .exceptions import AuthenticationError, ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)


class WeChatAuthService:
    """微信 OAuth 服务层.

    提供微信网页授权 URL 生成、access_token/userinfo 获取、小程序 session、
    用户登录/注册、state 校验（防 CSRF）与临时令牌交换。
    """

    @staticmethod
    def generate_wechat_auth_url(redirect_uri: str | None = None) -> tuple[str, str]:
        """生成微信授权 URL 与随机 state.

        返回 (auth_url, state)。state 同时存入服务端临时存储，回调时必须校验。
        避免固定 state 导致的 CSRF / 登录态劫持。

        """
        callback_url = redirect_uri or settings.wechat_redirect_uri
        state = secrets.token_urlsafe(16)
        WeChatAuthService._store_wechat_state(state)
        params = {
            "appid": settings.wechat_appid,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": "snsapi_userinfo",
            "state": state,
            "connect_redirect": 1,
        }
        return settings.wechat_auth_url_base + "?" + urlencode(params) + "#wechat_redirect", state

    # 微信 OAuth state 临时存储（随机 state + TTL，防 CSRF）
    _wechat_state_store: ClassVar[dict[str, float]] = {}
    _state_ttl: ClassVar[int] = 600  # 10 分钟

    @classmethod
    def _cleanup_expired_states(cls) -> None:
        now = time.time()
        cls._wechat_state_store = {k: v for k, v in cls._wechat_state_store.items() if v > now}

    @classmethod
    def _store_wechat_state(cls, state: str) -> None:
        """存储微信 OAuth state（带 TTL）."""
        cls._cleanup_expired_states()
        cls._wechat_state_store[state] = time.time() + cls._state_ttl

    @classmethod
    def consume_wechat_state(cls, state: str | None) -> bool:
        """校验并消费微信 OAuth state（一次性）.

        Returns:
            True 表示 state 有效且已被消费；False 表示无效/过期/缺失。

        """
        if not state:
            return False
        cls._cleanup_expired_states()
        return cls._wechat_state_store.pop(state, None) is not None

    _temp_code_store: ClassVar[dict[str, dict[str, object]]] = {}
    _code_ttl: ClassVar[int] = 60

    @classmethod
    def _cleanup_expired_codes(cls) -> None:
        now = time.time()
        active_codes = {k: v for k, v in cls._temp_code_store.items() if v["expires_at"] > now}
        cls._temp_code_store = active_codes

    @classmethod
    def store_temp_token(cls, access_token: str, refresh_token: str) -> str:
        """存储临时令牌并返回临时授权码."""
        cls._cleanup_expired_codes()

        now = time.time()
        code = str(uuid.uuid4())
        cls._temp_code_store[code] = {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_at": now + cls._code_ttl,
        }
        return code

    @classmethod
    def exchange_temp_code(cls, code: str) -> dict[str, object]:
        """用临时授权码换取令牌."""
        cls._cleanup_expired_codes()

        entry = cls._temp_code_store.pop(code, None)
        if entry is None:
            msg = "授权码无效"
            raise AuthenticationError(msg)
        return entry

    @staticmethod
    async def fetch_wechat_access_token(code: str) -> dict[str, object]:
        """获取微信 Access Token (Async - IO Bound)."""
        params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "code": code,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.wechat_token_url, params=params)
            data = response.json()

        if data.get("errcode", 0) != 0:
            msg = f"微信授权失败: {data.get('errmsg')}"
            raise ValidationError(msg)
        return data

    @staticmethod
    async def fetch_wechat_user_info(access_token: str, openid: str) -> dict[str, object]:
        """获取微信用户信息 (Async - IO Bound)."""
        params = {
            "access_token": access_token,
            "openid": openid,
            "lang": "zh_CN",
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.wechat_userinfo_url, params=params)
            data = response.json()

        if data.get("errcode", 0) != 0:
            msg = f"获取微信用户信息失败: {data.get('errmsg')}"
            raise ValidationError(msg)
        return data

    @staticmethod
    async def fetch_wechat_miniapp_session(code: str) -> dict[str, object]:
        """获取微信小程序 Session (Async - IO Bound)."""
        params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "js_code": code,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient() as client:
            try:
                response = await client.get(settings.wechat_jscode2session_url, params=params)
                response.raise_for_status()
                data = response.json()
            except httpx.HTTPError as e:
                msg = f"微信登录请求失败: {e}"
                raise AuthenticationError(msg) from e
            except (ValueError, KeyError) as e:
                msg = f"微信登录响应解析失败: {e}"
                raise AuthenticationError(msg) from e

        if "errcode" in data and data["errcode"] != 0:
            msg = f"微信登录失败: {data.get('errmsg')}"
            raise AuthenticationError(msg)
        return data

    @staticmethod
    def login_or_register_wechat_user(
        db: Session,
        openid: str,
        unionid: str | None,
        user_info: dict[str, object] | None = None,
        session_key: str | None = None,
    ) -> User:
        """处理微信用户登录/注册 (Sync - Blocking DB).

        微信用户统一归入 C 端 customer 角色体系，禁止分配后台角色。
        """
        user = db.query(User).filter(User.wechat_openid == openid).first()

        if not user:
            # 注册新用户 - 统一分配 customer 角色（C 端用户）
            role = db.query(Role).filter(Role.code == "customer").first()
            if not role:
                msg = "系统未初始化 customer 角色"
                raise ResourceNotFoundError(msg)

            nickname = user_info.get("nickname", "微信用户") if user_info else "微信用户"
            avatar = user_info.get("headimgurl") if user_info else None

            user = User(
                username=f"wechat_{openid[:10]}",
                password=get_password_hash(openid),
                nickname=nickname,
                avatar=avatar,
                wechat_openid=openid,
                wechat_unionid=unionid,
                wechat_session_key=session_key,
                role_id=role.id,
                status="active",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # 更新现有信息
            if user_info:
                user.nickname = user_info.get("nickname", user.nickname)
                user.avatar = user_info.get("headimgurl", user.avatar)
            if unionid:
                user.wechat_unionid = unionid
            if session_key:
                user.wechat_session_key = session_key

            user.last_login_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(user)

        return user
