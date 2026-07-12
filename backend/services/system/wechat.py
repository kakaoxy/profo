"""微信 OAuth 服务（从 services/system/auth.py 拆分）.

处理微信网页授权、小程序登录、state 管理（防 CSRF）与临时令牌交换。
核心认证（用户名密码、JWT 生命周期）仍保留在 auth.py 的 AuthService 中。

设计：
- 方法保持 static/classmethod 风格，与原 AuthService 一致，无需实例化。
- state / temp_code 存储在数据库表中（带 TTL），支持多 Worker 部署。
"""

import logging
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session

from models import Role, User
from models.system import WeChatOAuthState, WeChatTempCode
from settings import settings
from utils.auth import get_password_hash

from .exceptions import AuthenticationError, ResourceNotFoundError, ValidationError

logger = logging.getLogger(__name__)

_STATE_TTL_SECONDS = 600  # 10 分钟
_CODE_TTL_SECONDS = 60


class WeChatAuthService:
    """微信 OAuth 服务层.

    提供微信网页授权 URL 生成、access_token/userinfo 获取、小程序 session、
    用户登录/注册、state 校验（防 CSRF）与临时令牌交换。
    """

    @staticmethod
    def generate_wechat_auth_url(db: Session, redirect_uri: str | None = None) -> tuple[str, str]:
        """生成微信授权 URL 与随机 state.

        返回 (auth_url, state)。state 同时存入数据库，回调时必须校验。
        避免固定 state 导致的 CSRF / 登录态劫持。

        """
        callback_url = redirect_uri or settings.wechat_redirect_uri
        state = secrets.token_urlsafe(16)
        WeChatAuthService._store_wechat_state(db, state)
        params = {
            "appid": settings.wechat_appid,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": "snsapi_userinfo",
            "state": state,
            "connect_redirect": 1,
        }
        return settings.wechat_auth_url_base + "?" + urlencode(params) + "#wechat_redirect", state

    @staticmethod
    def _store_wechat_state(db: Session, state: str) -> None:
        """存储微信 OAuth state（带 TTL），顺带清理过期记录."""
        now = datetime.now(timezone.utc)
        # 清理过期 state（避免积压）
        db.query(WeChatOAuthState).filter(WeChatOAuthState.expires_at < now).delete()
        db.add(
            WeChatOAuthState(
                state=state,
                expires_at=now + timedelta(seconds=_STATE_TTL_SECONDS),
            )
        )
        db.commit()

    @staticmethod
    def consume_wechat_state(db: Session, state: str | None) -> bool:
        """校验并消费微信 OAuth state（一次性）.

        Returns:
            True 表示 state 有效且已被消费；False 表示无效/过期/缺失。

        """
        if not state:
            return False
        now = datetime.now(timezone.utc)
        record = (
            db.query(WeChatOAuthState)
            .filter(
                WeChatOAuthState.state == state,
                WeChatOAuthState.expires_at > now,
            )
            .first()
        )
        if record is None:
            return False
        db.delete(record)
        db.commit()
        return True

    @staticmethod
    def store_temp_token(db: Session, access_token: str, refresh_token: str) -> str:
        """存储临时令牌并返回临时授权码，顺带清理过期记录."""
        now = datetime.now(timezone.utc)
        # 清理过期临时码
        db.query(WeChatTempCode).filter(WeChatTempCode.expires_at < now).delete()

        code = str(uuid.uuid4())
        db.add(
            WeChatTempCode(
                code=code,
                access_token=access_token,
                refresh_token=refresh_token,
                expires_at=now + timedelta(seconds=_CODE_TTL_SECONDS),
            )
        )
        db.commit()
        return code

    @staticmethod
    def exchange_temp_code(db: Session, code: str) -> dict[str, object]:
        """用临时授权码换取令牌."""
        now = datetime.now(timezone.utc)
        record = (
            db.query(WeChatTempCode)
            .filter(
                WeChatTempCode.code == code,
                WeChatTempCode.expires_at > now,
            )
            .first()
        )
        if record is None:
            msg = "授权码无效"
            raise AuthenticationError(msg)
        entry: dict[str, object] = {
            "access_token": record.access_token,
            "refresh_token": record.refresh_token,
        }
        db.delete(record)
        db.commit()
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
