"""C端公开认证路由.

注册、登录、刷新令牌、退出登录.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep, require_roles
from models import User
from schemas.public import (
    PublicLoginResponse,
    PublicLogoutResponse,
    PublicRefreshTokenRequest,
    PublicRegisterRequest,
    PublicRegisterResponse,
    PublicUserInfo,
)
from services.system.auth import AuthService
from services.system.exceptions import PermissionDeniedError
from utils.auth import AUDIENCE_C
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone

router = APIRouter(prefix="/public/auth", tags=["public-auth"])


def has_customer_identity(user: User) -> bool:
    """判断用户是否具备 C 端 customer 身份（主角色或附加角色含 customer）.

    Args:
        user: 用户对象（需有 role 与 roles 关系）

    Returns:
        True 表示可登录 C 端，False 表示无 customer 身份

    """
    # 主角色检查
    if user.role and user.role.code == "customer":
        return True
    # 附加角色检查
    return any(r.code == "customer" for r in (user.roles or []))


def _build_user_info(user: User) -> PublicUserInfo:
    """构建用户公开信息响应."""
    return PublicUserInfo(
        id=user.id,
        username=user.username,
        nickname=user.nickname,
        phone=mask_phone(user.phone),
        avatar=user.avatar,
        status=user.status,
        created_at=user.created_at,
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
    db_user = AuthService.register_public_user(
        db,
        username=body.username,
        password=body.password,
        phone=body.phone,
        nickname=body.nickname,
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
    summary="C端用户登录",
    description="C端用户使用用户名密码登录，返回JWT令牌",
    responses={
        401: {"description": "用户名或密码错误"},
        403: {"description": "非C端用户或账号被禁用"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_LOGIN)
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSessionDep,
) -> PublicLoginResponse:
    """C端用户登录，验证用户名密码后返回JWT令牌."""
    user = AuthService.authenticate_user(db, form_data.username, form_data.password)

    if not has_customer_identity(user):
        msg = "此接口仅限C端用户登录"
        raise PermissionDeniedError(msg)

    # C 端登录固定签发 aud=c, role=customer 的令牌：
    # 即使主角色为 admin 但具备 customer 附加角色，C 端身份下 role claim 固定为 customer
    token_data = AuthService.create_tokens_for_user(
        db,
        user,
        audience=AUDIENCE_C,
        role_claim="customer",
    )

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
    token_data = AuthService.refresh_user_token(
        db,
        refresh_data.refresh_token,
        expected_audience="c",
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
) -> PublicUserInfo:
    """获取当前登录的C端用户信息."""
    return _build_user_info(current_user)


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
    _current_user: Annotated[User, Depends(require_roles(["customer"]))],
    db: DbSessionDep,
) -> PublicLogoutResponse:
    """C端退出登录，撤销当前 refresh_token.

    access_token 为 JWT 无状态令牌，短期过期自然失效；
    refresh_token 按 jti 撤销，防止退出后被重放刷新。
    """
    AuthService.revoke_refresh_token(db, body.refresh_token, expected_audience="c")
    return PublicLogoutResponse(message="退出登录成功")
