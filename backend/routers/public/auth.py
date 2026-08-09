"""C端公开认证路由.

注册、登录、刷新令牌、退出登录.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from constants.role_codes import RoleCode
from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from models import User
from schemas.public import (
    PublicLoginResponse,
    PublicLogoutResponse,
    PublicRefreshTokenRequest,
    PublicRegisterRequest,
    PublicRegisterResponse,
    PublicUserInfo,
)
from services.system import permission_service
from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError, PermissionDeniedError
from utils.auth import AUDIENCE_C
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone
from utils.security_logger import log_auth_event

router = APIRouter(prefix="/public/auth", tags=["public-auth"])


def has_customer_identity(user: User) -> bool:
    """判断用户是否具备 C 端 customer 身份（主角色或附加角色含 customer）.

    Args:
        user: 用户对象（需有 role 与 roles 关系）

    Returns:
        True 表示可登录 C 端，False 表示无 customer 身份

    """
    # 主角色检查
    if user.role and user.role.code == RoleCode.CUSTOMER.value:
        return True
    # 附加角色检查
    return any(r.code == RoleCode.CUSTOMER.value for r in (user.roles or []))


def _build_user_info(
    user: User,
    permissions: list[str] | None = None,
) -> PublicUserInfo:
    """构建用户公开信息响应.

    Args:
        user: 用户对象
        permissions: 权限代码列表；None 时默认空列表（保持 register/login 向后兼容）

    """
    return PublicUserInfo(
        id=user.id,
        username=user.username,
        nickname=user.nickname,
        phone=mask_phone(user.phone),
        avatar=user.avatar,
        status=user.status,
        created_at=user.created_at,
        permissions=permissions if permissions is not None else [],
    )


@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    summary="C端用户注册",
    description="注册C端用户账号，自动分配customer角色",
    responses={
        409: {"description": "用户名或手机号已存在"},
        422: {"description": "密码强度不足或字段校验失败"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.PUBLIC_REGISTER)
def register(
    request: Request,
    body: PublicRegisterRequest,
    db: DbSessionDep,
) -> PublicRegisterResponse:
    """C端用户注册，自动分配customer角色."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    db_user = AuthService.register_public_user(
        db,
        username=body.username,
        password=body.password,
        phone=body.phone,
        nickname=body.nickname,
    )
    log_auth_event(
        "register_success",
        user_id=db_user.id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    token_data = AuthService.create_tokens_for_user(db, db_user)

    return PublicRegisterResponse(
        access_token=token_data["access_token"],
        refresh_token=token_data["refresh_token"],
        token_type=token_data["token_type"],
        expires_in=token_data["expires_in"],
        user=_build_user_info(db_user),
    )


@router.post(
    "/token",
    summary="C端登录",
    description="使用用户名密码登录，返回JWT令牌；支持 C 端用户与内部用户（按身份签发对应端令牌）",
    responses={
        401: {"description": "用户名或密码错误"},
        403: {"description": "账号被禁用"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_LOGIN)
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSessionDep,
) -> PublicLoginResponse:
    """登录，验证用户名密码后返回JWT令牌；按用户身份签发对应端令牌."""
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        user = AuthService.authenticate_user(db, form_data.username, form_data.password)
    except (AuthenticationError, PermissionDeniedError) as e:
        log_auth_event(
            "login_failure",
            client_ip=client_ip,
            user_agent=user_agent,
            username=form_data.username,
            reason=type(e).__name__,
        )
        raise
    log_auth_event(
        "login_success",
        user_id=user.id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    # 按用户身份识别并签发对应端令牌，供前端差异化展示：
    # - 具备 customer 身份（主角色或附加角色）→ 签发 C 端令牌（aud=c, role=customer），
    #   即使主角色为 admin，C 端身份下 role claim 也固定为 customer；
    # - 纯内部用户（无 customer 身份）→ 签发后台令牌（aud=admin），
    #   前端据此通过 C 端 /me 或后台 /me 双通道识别内部身份。
    if has_customer_identity(user):
        token_data = AuthService.create_tokens_for_user(
            db,
            user,
            audience=AUDIENCE_C,
            role_claim=RoleCode.CUSTOMER.value,
        )
    else:
        token_data = AuthService.create_tokens_for_user(db, user)

    return PublicLoginResponse(
        access_token=token_data["access_token"],
        refresh_token=token_data["refresh_token"],
        token_type=token_data["token_type"],
        expires_in=token_data["expires_in"],
        user=_build_user_info(user),
    )


@router.post(
    "/refresh",
    summary="C端刷新令牌",
    description="使用refresh_token获取新的access_token",
    responses={
        401: {"description": "刷新令牌无效或已失效"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_REFRESH)
def refresh_access_token(
    request: Request,
    refresh_data: PublicRefreshTokenRequest,
    db: DbSessionDep,
) -> PublicLoginResponse:
    """C端刷新令牌，使用refresh_token获取新的access_token.

    仅接受C端受众(aud=c)的刷新令牌，拒绝后台Token.
    """
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    try:
        token_data = AuthService.refresh_user_token(
            db,
            refresh_data.refresh_token,
            expected_audience="c",
        )
    except AuthenticationError as e:
        log_auth_event(
            "refresh_failure",
            client_ip=client_ip,
            user_agent=user_agent,
            reason=type(e).__name__,
        )
        raise
    log_auth_event(
        "refresh_success",
        user_id=token_data["user"].id,
        client_ip=client_ip,
        user_agent=user_agent,
    )

    return PublicLoginResponse(
        access_token=token_data["access_token"],
        refresh_token=token_data["refresh_token"],
        token_type=token_data["token_type"],
        expires_in=token_data["expires_in"],
    )


@router.get(
    "/me",
    summary="C端获取当前用户信息",
    description="返回当前登录的C端用户信息（供前端Server Component鉴权使用）",
    responses={
        401: {"description": "未认证"},
        403: {"description": "非C端用户或账号已禁用"},
    },
)
@limiter.limit(RateLimits.PUBLIC_PROFILE_READ)
def get_current_user_info(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicUserInfo:
    """获取当前登录的C端用户信息."""
    perm_codes = permission_service.get_user_permission_codes(db, current_user)
    return _build_user_info(current_user, permissions=sorted(perm_codes))


@router.post(
    "/logout",
    summary="C端退出登录",
    description="C端用户退出登录，服务端撤销当前 refresh_token（access_token 短期过期自然失效）",
    responses={
        401: {"description": "未认证"},
        403: {"description": "非C端用户"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.PUBLIC_LOGOUT)
def logout(
    request: Request,
    body: PublicRefreshTokenRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicLogoutResponse:
    """C端退出登录，撤销当前 refresh_token.

    access_token 为 JWT 无状态令牌，短期过期自然失效；
    refresh_token 按 jti 撤销，防止退出后被重放刷新。
    归属校验：refresh_token 必须属于当前登录用户，否则静默跳过（防 DoS）。
    """
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    AuthService.revoke_refresh_token(
        db,
        body.refresh_token,
        expected_audience="c",
        expected_user_id=str(current_user.id),
    )
    log_auth_event(
        "logout",
        user_id=current_user.id,
        client_ip=client_ip,
        user_agent=user_agent,
    )
    return PublicLogoutResponse(message="退出登录成功")
