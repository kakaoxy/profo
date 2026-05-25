"""认证相关路由.

直接返回 Pydantic 模型，不使用 ApiResponse 包装器.
"""

from typing import Annotated

from fastapi import APIRouter, Body, Depends, HTTPException, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from slowapi.util import get_remote_address

from common import RateLimits, limiter
from dependencies.auth import DbSessionDep, get_current_active_user
from models import User
from schemas.user import (
    ApiKeyCreateResponse,
    ApiKeyInfoResponse,
    ExchangeTokenRequest,
    LoginRequest,
    RefreshTokenRequest,
    TokenResponse,
    UserResponse,
    WechatAuthUrlResponse,
    WechatLoginRequest,
)
from services.system import ApiKeyService, AuthService
from services.system.exceptions import AuthenticationError, ResourceNotFoundError
from settings import settings

CurrentUserDep = Annotated[User, Depends(get_current_active_user)]

router = APIRouter(prefix="/auth", tags=["auth"])


def get_rate_key(request: Request, username: str = "") -> str:
    """获取速率限制的 key，基于 IP + 用户名."""
    return f"{get_remote_address(request)}:{username}"


@router.post("/token")
@limiter.limit(RateLimits.AUTH_LOGIN)
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSessionDep,
) -> TokenResponse:
    """OAuth2 兼容的 token 获取接口.

    Sync - Run in threadpool by FastAPI
    速率限制：5次/分钟.
    """
    try:
        user = AuthService.authenticate_user(db, form_data.username, form_data.password)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    result = AuthService.create_tokens_for_user(db, user, force_temp_token=True)

    if result.get("require_password_change"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HTTP_403",
                "message": "首次登录必须修改密码",
                "temp_token": result["temp_token"],
            },
            headers={"X-Must-Change-Password": "true"},
        )

    return result


@router.post("/login")
@limiter.limit(RateLimits.AUTH_LOGIN)
def login(
    request: Request,
    login_data: Annotated[LoginRequest, Body()],
    db: DbSessionDep,
) -> TokenResponse:
    """用户名密码登录.

    Sync - Run in threadpool by FastAPI
    速率限制：5次/分钟.
    """
    try:
        user = AuthService.authenticate_user(db, login_data.username, login_data.password)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from e

    return AuthService.create_tokens_for_user(db, user, force_temp_token=False)


@router.post("/refresh")
@limiter.limit(RateLimits.AUTH_REFRESH)
def refresh_access_token(
    request: Request,
    refresh_data: Annotated[RefreshTokenRequest, Body()],
    db: DbSessionDep,
) -> TokenResponse:
    """刷新令牌.

    Sync - Run in threadpool by FastAPI
    速率限制：10次/分钟.
    """
    return AuthService.refresh_user_token(db, refresh_data.refresh_token)


@router.get("/wechat/authorize")
def wechat_authorize(
    redirect_uri: Annotated[str | None, Query(description="重定向URL")] = None,
) -> WechatAuthUrlResponse:
    """生成微信登录授权URL."""
    auth_url = AuthService.generate_wechat_auth_url(redirect_uri)
    return WechatAuthUrlResponse(auth_url=auth_url)


@router.get("/wechat/callback")
async def wechat_callback(
    code: Annotated[str, Query(description="微信授权码")],
    _state: Annotated[str, Query(description="状态参数")],
    db: DbSessionDep,
) -> RedirectResponse:
    """微信授权回调 (Async for HTTP, run_in_threadpool for DB)."""
    token_data = await AuthService.fetch_wechat_access_token(code)

    openid = token_data.get("openid")
    access_token = token_data.get("access_token")
    unionid = token_data.get("unionid")

    userinfo_data = await AuthService.fetch_wechat_user_info(access_token, openid)

    user = await run_in_threadpool(
        AuthService.login_or_register_wechat_user,
        db=db,
        openid=openid,
        unionid=unionid,
        user_info=userinfo_data,
    )

    result = await run_in_threadpool(AuthService.create_tokens_for_user, db, user)

    auth_code = AuthService.store_temp_token(
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
    )

    frontend_url = f"http://localhost:3000/login?code={auth_code}"
    return RedirectResponse(url=frontend_url, status_code=status.HTTP_302_FOUND)


@router.post("/exchange-token")
@limiter.limit(RateLimits.AUTH_REFRESH)
def exchange_token(
    request: Request,
    exchange_data: Annotated[ExchangeTokenRequest, Body()],
    _db: DbSessionDep,
) -> dict[str, object]:
    """用一次性授权码兑换 Token.

    速率限制：10次/分钟.
    """
    try:
        entry = AuthService.exchange_temp_code(exchange_data.code)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
        ) from e
    return {
        "access_token": entry["access_token"],
        "refresh_token": entry["refresh_token"],
        "token_type": "bearer",
        "expires_in": settings.jwt_access_token_expire_minutes * 60,
    }


@router.post("/wechat/login")
@limiter.limit(RateLimits.AUTH_LOGIN)
async def wechat_app_login(
    request: Request,
    login_data: Annotated[WechatLoginRequest, Body()],
    db: DbSessionDep,
) -> TokenResponse:
    """微信小程序登录.

    Async for HTTP, run_in_threadpool for DB
    速率限制：5次/分钟.
    """
    auth_data = await AuthService.fetch_wechat_miniapp_session(login_data.code)

    openid = auth_data.get("openid")
    session_key = auth_data.get("session_key")
    unionid = auth_data.get("unionid")

    user = await run_in_threadpool(
        AuthService.login_or_register_wechat_user,
        db=db,
        openid=openid,
        unionid=unionid,
        session_key=session_key,
    )

    return await run_in_threadpool(AuthService.create_tokens_for_user, db, user)


@router.get("/me")
async def get_current_user_info(
    current_user: CurrentUserDep,
) -> UserResponse:
    """获取当前用户信息."""
    return current_user


@router.post("/api-key")
def create_api_key(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ApiKeyCreateResponse:
    """生成新的 API Key.

    每个用户只能有一个有效 Key，生成新 Key 会自动撤销旧 Key
    Key 仅显示一次，请妥善保存.
    """
    key_string, api_key = ApiKeyService.generate_api_key(db, str(current_user.id))
    return ApiKeyCreateResponse(
        api_key=key_string,
        prefix=api_key.key_prefix,
        created_at=api_key.created_at,
        expires_at=api_key.expires_at,
    )


@router.get("/api-key", response_model=ApiKeyInfoResponse | None)
def get_api_key_info(
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> ApiKeyInfoResponse | None:
    """获取当前用户的 API Key 信息.

    不返回完整的 Key，只返回前缀和状态信息.
    """
    api_key = ApiKeyService.get_api_key_info(db, str(current_user.id))
    if not api_key:
        return None

    return ApiKeyInfoResponse(
        id=api_key.id,
        prefix=api_key.key_prefix,
        status=api_key.status,
        created_at=api_key.created_at,
        last_used_at=api_key.last_used_at,
        expires_at=api_key.expires_at,
    )


@router.delete("/api-key", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(RateLimits.AUTH_API_KEY_DELETE)
def delete_api_key(
    request: Request,
    current_user: CurrentUserDep,
    db: DbSessionDep,
) -> None:
    """撤销当前用户的 API Key.

    速率限制：20次/小时.
    """
    try:
        ApiKeyService.revoke_api_key(db, str(current_user.id))
        db.commit()
    except ResourceNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=e.message,
        ) from e
