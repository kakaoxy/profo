"""认证服务层.

将业务逻辑从路由中分离，处理并发阻塞问题：
- 数据库操作 (Sync) -> 供路由层 run_in_threadpool 调用或 def 路由直接调用
- 外部 API 调用 (Async) -> 供 async 路由调用

微信 OAuth 相关逻辑已拆分至 wechat.py（WeChatAuthService）。
"""

import logging
from datetime import datetime, timedelta, timezone
from typing import ClassVar, Literal, TypedDict

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload

from constants.role_codes import BACKEND_ROLE_CODES as _BACKEND_ROLE_CODES
from constants.role_codes import RoleCode
from models import RefreshToken, Role, User
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
)

logger = logging.getLogger(__name__)


class NormalTokenResult(TypedDict):
    """正常令牌结果（登录/刷新成功）."""

    require_password_change: Literal[False]
    access_token: str
    refresh_token: str
    token_type: str
    expires_in: int
    user: User


class TempTokenResult(TypedDict):
    """临时令牌结果（需修改密码）."""

    require_password_change: Literal[True]
    temp_token: str


TokenResult = NormalTokenResult | TempTokenResult


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

        customer_role = db.query(Role).filter(Role.code == RoleCode.CUSTOMER.value).first()
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
        try:
            db.commit()
            db.refresh(db_user)
        except IntegrityError as e:
            db.rollback()
            msg = "用户名或手机号已被占用"
            raise ConflictError(msg) from e

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

    # 后台允许的角色（无任何后台身份的用户禁止登录后台）
    # 注意：与 dependencies/auth.py 的 INTERNAL_ROLE_CODES 不同。
    #   BACKEND_ROLE_CODES = {admin, operator, user}  → 后台登录允许的角色（含 user）
    #   INTERNAL_ROLE_CODES = {admin, operator}        → API Key 机器接口仅限内部角色（不含 user）
    # user 角色可登录后台但不应生成/使用 API Key。
    # 常量定义在 constants.role_codes，此处保留 ClassVar 别名以兼容 AuthService.BACKEND_ROLE_CODES 引用。
    BACKEND_ROLE_CODES: ClassVar[frozenset[str]] = _BACKEND_ROLE_CODES

    @staticmethod
    def has_backend_identity(user: User) -> bool:
        """判断用户是否具备后台身份（主角色或附加角色含后台角色）.

        Args:
            user: 用户对象（需有 role 与 roles 关系）

        Returns:
            True 表示可登录后台，False 表示无后台身份

        """
        backend_codes = AuthService.BACKEND_ROLE_CODES
        # 主角色检查
        if user.role and user.role.code in backend_codes:
            return True
        # 附加角色检查
        return any(r.code in backend_codes for r in (user.roles or []))

    @staticmethod
    def authenticate_backend_user(db: Session, username: str, password: str) -> User:
        """验证后台用户名密码并校验后台身份 (Sync - Blocking).

        在 authenticate_user 基础上额外拒绝没有任何后台身份的用户登录后台
        （主角色或附加角色需至少包含一个 BACKEND_ROLE_CODES 中的角色）。

        Args:
            db: 数据库会话
            username: 用户名
            password: 明文密码

        Returns:
            User: 认证成功的用户对象

        Raises:
            AuthenticationError: 用户名或密码错误
            PermissionDeniedError: 用户已被禁用 或 无后台身份

        """
        user = AuthService.authenticate_user(db, username, password)
        if not AuthService.has_backend_identity(user):
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
        role_claim: str | None = None,
    ) -> TokenResult:
        """为用户生成令牌 (Sync).

        处理登录后更新时间、生成 Token 的逻辑.

        Args:
            db: 数据库会话
            user: 用户对象
            force_temp_token: 是否强制使用临时令牌（用于密码重置）
            update_login_time: 是否更新最后登录时间（刷新token时不应更新）
            audience: Token 受众标识；不传则按角色推断（customer->c, 其他->admin）
            role_claim: Token 中 role 字段的值；不传则使用 user.role.code。
                用于多角色用户登录特定端时覆盖默认主角色（如 admin+customer
                用户登录 C 端时强制传 "customer"）。

        """
        # 推断受众：C 端 customer -> "c"，后台角色 -> "admin"
        if audience is None:
            audience = AUDIENCE_C if user.role and user.role.code == RoleCode.CUSTOMER.value else AUDIENCE_ADMIN

        # role claim：默认使用主角色 code；显式传入时覆盖（用于多角色用户登录特定端）
        effective_role_code = role_claim if role_claim is not None else (user.role.code if user.role else "")

        # 检查是否强制修改密码逻辑
        if force_temp_token and user.must_change_password:
            # 生成临时 Token logic
            temp_expires = timedelta(minutes=10)
            temp_token = create_access_token(
                data={
                    "sub": user.id,
                    "role": effective_role_code,
                    "scope": "reset_password",
                    "ver": user.token_version,
                },
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
            data={"sub": user.id, "role": effective_role_code, "ver": user.token_version},
            expires_delta=access_token_expires,
            audience=audience,
        )

        refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
        # refresh_token 携带 role：刷新时透传回 create_tokens_for_user 的 role_claim，
        # 避免多角色用户（如 admin+customer）刷新后 role 漂移到主角色
        refresh_token, refresh_jti = create_refresh_token(
            data={"sub": user.id, "role": effective_role_code, "ver": user.token_version},
            expires_delta=refresh_token_expires,
            audience=audience,
        )

        # 跟踪 refresh_token：刷新时校验 jti 并撤销旧 jti，实现轮换防重放
        db.add(
            RefreshToken(
                user_id=user.id,
                jti=refresh_jti,
                audience=audience,
                expires_at=datetime.now(timezone.utc) + refresh_token_expires,
            ),
        )
        db.commit()

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
    ) -> NormalTokenResult:
        """刷新 Token (Sync).

        注意：此方法不在刷新时更新 last_login_at，避免事务冲突。

        Args:
            db: 数据库会话
            refresh_token: 刷新令牌
            expected_audience: 期望的受众标识；传入时刷新令牌的 aud 必须匹配，
                避免C端 refresh_token 刷新后台 access_token。

        Raises:
            AuthenticationError: 刷新令牌无效/已撤销/不存在（重放防护）

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

        user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
        if user is None:
            msg = "用户不存在"
            raise AuthenticationError(msg)

        # 校验 token_version：旧 Token 在密码修改/禁用后应无法刷新
        token_ver = payload.get("ver")
        if token_ver is not None and user.token_version != token_ver:
            msg = "凭据已失效，请重新登录"
            raise AuthenticationError(msg)

        # 校验 jti 并撤销旧 refresh_token，实现轮换防重放：
        # 同一 refresh_token 只能使用一次，刷新后立即失效，旧 token 被截获也无法复用
        jti = payload.get("jti")
        if not jti:
            # 缺少 jti：旧版签发的 refresh_token，拒绝刷新（需重新登录）
            msg = "刷新令牌已失效，请重新登录"
            raise AuthenticationError(msg)

        # 原子条件 UPDATE：防止并发刷新竞态（两个请求同时读到 revoked=False）
        updated = (
            db.query(RefreshToken)
            .filter(RefreshToken.jti == jti, RefreshToken.revoked.is_(False))
            .update({RefreshToken.revoked: True})
        )
        db.commit()
        if updated == 0:
            msg = "刷新令牌已失效，请重新登录"
            raise AuthenticationError(msg)

        # 继承原 Token 的受众，避免刷新后跨系统
        inherited_audience = payload.get("aud")
        # 透传原 Token 的 role_claim，避免多角色用户刷新后 role 漂移到主角色
        # 旧版 refresh_token（未携带 role）此处为 None，回落到主角色 code，行为不变
        inherited_role_claim = payload.get("role")

        # 刷新token时不更新登录时间，避免事务冲突
        # create_tokens_for_user 会签发新 jti 并写入跟踪记录
        return AuthService.create_tokens_for_user(
            db,
            user,
            update_login_time=False,
            audience=inherited_audience,
            role_claim=inherited_role_claim,
        )

    @staticmethod
    def invalidate_user_tokens(db: Session, user: User) -> None:
        """递增 token_version，使该用户已签发的所有 JWT 失效 (Sync).

        用于修改密码、重置密码、禁用、删除用户、强制下线等场景。
        同时撤销所有未过期的 refresh_token 跟踪记录，确保已签发的
        refresh_token 也无法再换取新 access_token（纵深防御）。

        """
        # 原子递增 token_version，防止并发 read-modify-write 竞态
        db.query(User).filter(User.id == user.id).update(
            {User.token_version: User.token_version + 1}, synchronize_session=False
        )
        # 撤销该用户所有未撤销的 refresh_token 记录
        db.query(RefreshToken).filter(
            RefreshToken.user_id == user.id,
            RefreshToken.revoked.is_(False),
        ).update({RefreshToken.revoked: True})
        db.commit()

    @staticmethod
    def revoke_refresh_token(db: Session, refresh_token: str, expected_audience: str | None = None) -> None:
        """撤销指定 refresh_token（按 jti 撤销），用于 logout (Sync).

        即使 token 无效也不报错（幂等），避免攻击者通过响应推测 token 有效性。

        Args:
            db: 数据库会话
            refresh_token: 待撤销的刷新令牌
            expected_audience: 期望的受众标识（如 "c"），传入时校验 aud 匹配

        """
        payload = validate_token(
            refresh_token,
            token_type=AuthService._REFRESH_TOKEN_TYPE,
            audience=expected_audience,
        )
        if not payload:
            return

        jti = payload.get("jti")
        if not jti:
            return

        record = db.query(RefreshToken).filter(RefreshToken.jti == jti).first()
        if record and not record.revoked:
            record.revoked = True
            db.commit()
