"""认证服务层.

将业务逻辑从路由中分离，处理并发阻塞问题：
- 数据库操作 (Sync) -> 供路由层 run_in_threadpool 调用或 def 路由直接调用
- 外部 API 调用 (Async) -> 供 async 路由调用
"""

import logging
import secrets
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import ClassVar
from urllib.parse import urlencode

import httpx
from sqlalchemy.orm import Session, joinedload

from models import Role, User
from settings import settings
from utils.auth import (
    AUDIENCE_ADMIN,
    AUDIENCE_C,
    create_access_token,
    create_refresh_token,
    get_password_hash,
    validate_token,
    verify_password,
)

from .exceptions import (
    AuthenticationError,
    ConflictError,
    PermissionDeniedError,
    ResourceNotFoundError,
    ValidationError,
)

logger = logging.getLogger(__name__)


class AuthService:
    """认证服务层.

    将业务逻辑从路由中分离，处理并发阻塞问题：
    - 数据库操作 (Sync) -> 供路由层 run_in_threadpool 调用或 def 路由直接调用
    - 外部 API 调用 (Async) -> 供 async 路由调用
    """

    @staticmethod
    def register_public_user(
        db: Session,
        username: str,
        password: str,
        phone: str | None = None,
        nickname: str | None = None,
    ) -> User:
        """注册C端公开用户 (Sync - Blocking DB).

        检查用户名/手机号唯一性，分配customer角色，创建用户.

        Args:
            db: 数据库会话
            username: 用户名
            password: 明文密码（内部加密存储）
            phone: 手机号（可选）
            nickname: 昵称（可选，默认使用username）

        Returns:
            User: 新创建的用户对象

        Raises:
            ConflictError: 用户名或手机号已被占用
            ResourceNotFoundError: 系统未初始化customer角色

        """
        existing_user = db.query(User).filter(User.username == username).first()
        if existing_user:
            msg = "用户名已被占用"
            raise ConflictError(msg)

        phone_hash_value: str | None = None
        if phone:
            from utils.crypto import hash_phone  # noqa: PLC0415

            phone_hash_value = hash_phone(phone)
            existing_phone = db.query(User).filter(User.phone_hash == phone_hash_value).first()
            if existing_phone:
                msg = "手机号已被绑定"
                raise ConflictError(msg)

        customer_role = db.query(Role).filter(Role.code == "customer").first()
        if not customer_role:
            msg = "系统未初始化customer角色"
            raise ResourceNotFoundError(msg)

        db_user = User(
            username=username,
            password=get_password_hash(password),
            nickname=nickname or username,
            phone=phone,
            phone_hash=phone_hash_value,
            role_id=customer_role.id,
            status="active",
        )
        db.add(db_user)
        db.commit()
        db.refresh(db_user)

        return db_user

    @staticmethod
    def get_user_by_id(db: Session, user_id: str) -> User | None:
        """根据ID获取用户，预加载角色关系 (Sync - Blocking DB).

        Args:
            db: 数据库会话
            user_id: 用户ID

        Returns:
            User | None: 用户对象，不存在时返回 None

        """
        return db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()

    @staticmethod
    def authenticate_user(db: Session, username: str, password: str) -> User:
        """验证用户名密码 (Sync - Blocking).

        包含 bcrypt 验证（CPU密集型）.

        Args:
            db: 数据库会话
            username: 用户名
            password: 明文密码

        Returns:
            User: 认证成功的用户对象

        Raises:
            AuthenticationError: 用户名或密码错误
            PermissionDeniedError: 用户已被禁用

        Note:
            此方法在认证失败时会抛出异常，调用者应使用 try-except 处理。
            符合 Python EAFP (Easier to Ask for Forgiveness than Permission) 原则。

        Example:
            try:
                user = AuthService.authenticate_user(db, username, password)
                # 认证成功，使用 user 对象
            except AuthenticationError:
                # 认证失败，处理错误情况
                pass

        """
        user = db.query(User).options(joinedload(User.role)).filter(User.username == username).first()
        if not user or not verify_password(password, user.password):
            msg = "用户名或密码错误"
            raise AuthenticationError(msg)
        if user.status != "active":
            msg = "账号已被禁用，请联系管理员"
            raise PermissionDeniedError(msg)
        return user

    # 后台允许的角色（C 端 customer 明确禁止登录后台）
    _BACKEND_ROLE_CODES: ClassVar[set[str]] = {"admin", "operator", "user"}

    @staticmethod
    def authenticate_backend_user(db: Session, username: str, password: str) -> User:
        """验证后台用户名密码并校验角色 (Sync - Blocking).

        在 authenticate_user 基础上额外拒绝 C 端 customer 角色登录后台。

        Args:
            db: 数据库会话
            username: 用户名
            password: 明文密码

        Returns:
            User: 认证成功的用户对象

        Raises:
            AuthenticationError: 用户名或密码错误
            PermissionDeniedError: 用户已被禁用 或 角色不允许登录后台

        """
        user = AuthService.authenticate_user(db, username, password)
        if user.role is None or user.role.code not in AuthService._BACKEND_ROLE_CODES:
            msg = "该账号无权登录后台"
            raise PermissionDeniedError(msg)
        return user

    @staticmethod
    def authenticate_by_token(db: Session, token: str, audience: str | None = None) -> User:
        """通过 JWT token 认证用户 (Sync - Blocking).

        验证 token 有效性并返回对应的用户对象，复用 get_user_by_id 方法。
        同时校验 token_version 以支持服务端撤销。

        Args:
            db: 数据库会话
            token: JWT token 字符串
            audience: 期望的受众标识；传入时 Token 中的 aud 必须匹配。

        Returns:
            User: 认证成功的用户对象（已预加载角色关系）

        Raises:
            AuthenticationError: token 无效或用户不存在 或 token_version 不匹配

        """
        payload = validate_token(token, audience=audience)
        if not payload:
            msg = "token 无效"
            raise AuthenticationError(msg)

        user_id = payload.get("sub")
        if not isinstance(user_id, str):
            msg = "token 无效"
            raise AuthenticationError(msg)

        user = AuthService.get_user_by_id(db, user_id)
        if user is None:
            msg = "用户不存在"
            raise AuthenticationError(msg)

        # 校验 token_version：不匹配说明已签发 Token 已被撤销
        token_ver = payload.get("ver")
        if token_ver is not None and user.token_version != token_ver:
            msg = "凭据已失效，请重新登录"
            raise AuthenticationError(msg)

        return user

    @staticmethod
    def create_tokens_for_user(
        db: Session,
        user: User,
        *,
        force_temp_token: bool = False,
        update_login_time: bool = True,
        audience: str | None = None,
    ) -> dict[str, object]:
        """为用户生成令牌 (Sync).

        处理登录后更新时间、生成 Token 的逻辑.

        Args:
            db: 数据库会话
            user: 用户对象
            force_temp_token: 是否强制使用临时令牌（用于密码重置）
            update_login_time: 是否更新最后登录时间（刷新token时不应更新）
            audience: Token 受众标识；不传则按角色推断（customer->c, 其他->admin）

        """
        # 推断受众：C 端 customer -> "c"，后台角色 -> "admin"
        if audience is None:
            audience = AUDIENCE_C if user.role and user.role.code == "customer" else AUDIENCE_ADMIN

        # 检查是否强制修改密码逻辑
        if force_temp_token and user.must_change_password:
            # 生成临时 Token logic
            temp_expires = timedelta(minutes=10)
            temp_token = create_access_token(
                data={"sub": user.id, "role": user.role.code, "scope": "reset_password", "ver": user.token_version},
                expires_delta=temp_expires,
                audience=audience,
            )
            return {
                "require_password_change": True,
                "temp_token": temp_token,
            }

        # 更新最后登录时间（仅在登录时更新，刷新token时不更新）
        if update_login_time:
            user.last_login_at = datetime.now(timezone.utc)
            db.commit()
            db.refresh(user)

        # 创建令牌（携带 token_version 以支持服务端撤销）
        access_token_expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
        access_token = create_access_token(
            data={"sub": user.id, "role": user.role.code, "ver": user.token_version},
            expires_delta=access_token_expires,
            audience=audience,
        )

        refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
        refresh_token = create_refresh_token(
            data={"sub": user.id, "ver": user.token_version},
            expires_delta=refresh_token_expires,
            audience=audience,
        )

        return {
            "require_password_change": False,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int(access_token_expires.total_seconds()),
            "user": user,
        }

    _REFRESH_TOKEN_TYPE = "refresh"  # noqa: S105

    @staticmethod
    def refresh_user_token(
        db: Session,
        refresh_token: str,
        expected_audience: str | None = None,
    ) -> dict[str, object]:
        """刷新 Token (Sync).

        注意：此方法不在刷新时更新 last_login_at，避免事务冲突。

        Args:
            db: 数据库会话
            refresh_token: 刷新令牌
            expected_audience: 期望的受众标识；传入时刷新令牌的 aud 必须匹配，
                避免C端 refresh_token 刷新后台 access_token。

        """
        payload = validate_token(
            refresh_token,
            token_type=AuthService._REFRESH_TOKEN_TYPE,
            audience=expected_audience,
        )
        if not payload:
            msg = "刷新令牌无效"
            raise AuthenticationError(msg)

        user_id: str = payload.get("sub")
        if user_id is None:
            msg = "刷新令牌无效"
            raise AuthenticationError(msg)

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            msg = "用户不存在"
            raise AuthenticationError(msg)

        # 校验 token_version：旧 Token 在密码修改/禁用后应无法刷新
        token_ver = payload.get("ver")
        if token_ver is not None and user.token_version != token_ver:
            msg = "凭据已失效，请重新登录"
            raise AuthenticationError(msg)

        # 继承原 Token 的受众，避免刷新后跨系统
        inherited_audience = payload.get("aud")

        # 刷新token时不更新登录时间，避免事务冲突
        return AuthService.create_tokens_for_user(
            db, user, update_login_time=False, audience=inherited_audience
        )

    @staticmethod
    def invalidate_user_tokens(db: Session, user: User) -> None:
        """递增 token_version，使该用户已签发的所有 JWT 失效 (Sync).

        用于修改密码、重置密码、禁用、删除用户、强制下线等场景。

        """
        user.token_version = (user.token_version or 0) + 1
        db.commit()

    @staticmethod
    def generate_wechat_auth_url(redirect_uri: str | None = None) -> tuple[str, str]:
        """生成微信授权 URL 与随机 state.

        返回 (auth_url, state)。state 同时存入服务端临时存储，回调时必须校验。
        避免固定 state 导致的 CSRF / 登录态劫持。

        """
        callback_url = redirect_uri or settings.wechat_redirect_uri
        state = secrets.token_urlsafe(16)
        AuthService._store_wechat_state(state)
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

        if "errcode" in data:
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

        if "errcode" in data:
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
