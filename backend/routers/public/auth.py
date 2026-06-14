"""C端公开认证路由.

注册、登录、刷新令牌、退出登录.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request, status
from fastapi.security import OAuth2PasswordRequestForm

from utils.common import RateLimits, limiter
from dependencies.auth import DbSessionDep, require_roles
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
from utils.formatters import mask_phone

router = APIRouter(prefix="/public/auth", tags=["public-auth"])


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
)
@limiter.limit(RateLimits.PUBLIC_REGISTER)
def register(
    request: Request,  # noqa: ARG001
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
)
@limiter.limit(RateLimits.AUTH_LOGIN)
def login_for_access_token(
    request: Request,  # noqa: ARG001
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSessionDep,
) -> PublicLoginResponse:
    """C端用户登录，验证用户名密码后返回JWT令牌."""
    user = AuthService.authenticate_user(db, form_data.username, form_data.password)

    if user.role.code != "customer":
        raise PermissionDeniedError("此接口仅限C端用户登录")

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
)
@limiter.limit(RateLimits.AUTH_REFRESH)
def refresh_access_token(
    request: Request,  # noqa: ARG001
    refresh_data: PublicRefreshTokenRequest,
    db: DbSessionDep,
) -> PublicLoginResponse:
    """C端刷新令牌，使用refresh_token获取新的access_token."""
    token_data = AuthService.refresh_user_token(db, refresh_data.refresh_token)

    return PublicLoginResponse(
        access_token=token_data["access_token"],
        refresh_token=token_data["refresh_token"],
        token_type=token_data["token_type"],
        expires_in=token_data["expires_in"],
    )


@router.post(
    "/logout",
    summary="C端退出登录",
    description="C端用户退出登录（当前JWT无状态机制下，服务端不撤销token，客户端应删除本地存储的token）",
)
@limiter.limit(RateLimits.PUBLIC_LOGOUT)
def logout(
    request: Request,  # noqa: ARG001
    _current_user: Annotated[User, Depends(require_roles(["customer"]))],
) -> PublicLogoutResponse:
    """C端退出登录，客户端应清除本地存储的token."""
    return PublicLogoutResponse(message="退出登录成功")
