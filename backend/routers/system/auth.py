"""认证相关路由.

直接返回 Pydantic 模型，不使用 ApiResponse 包装器.
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Body, Depends, Query, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm

from dependencies.auth import CurrentActiveUserDep, CurrentInternalUserDep, DbSessionDep
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
from services.system import ApiKeyService, AuthService, WeChatAuthService, permission_service
from services.system.exceptions import AuthenticationError, BusinessLogicError
from settings import settings
from utils.common import RateLimits, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post(
    "/token",
    responses={
        401: {"description": "用户名或密码错误"},
        403: {"description": "账号被禁用或无权登录后台"},
        422: {"description": "首次登录需修改密码"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_LOGIN)
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DbSessionDep,
) -> TokenResponse:
    """OAuth2 兼容的 token 获取接口.

    Sync - Run in threadpool by FastAPI
    速率限制：5次/分钟.
    拒绝 C 端 customer 角色登录后台.
    """
    user = AuthService.authenticate_backend_user(db, form_data.username, form_data.password)

    result = AuthService.create_tokens_for_user(db, user, force_temp_token=True)

    if result["require_password_change"]:
        msg = "首次登录必须修改密码"
        raise BusinessLogicError(
            msg,
            headers={"X-Must-Change-Password": "true", "X-Temp-Token": result["temp_token"]},
        )

    return result


@router.post(
    "/login",
    responses={
        401: {"description": "用户名或密码错误"},
        403: {"description": "账号被禁用或无权登录后台"},
        422: {"description": "首次登录需修改密码"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_LOGIN)
def login(
    request: Request,
    login_data: Annotated[LoginRequest, Body()],
    db: DbSessionDep,
) -> TokenResponse:
    """用户名密码登录.

    Sync - Run in threadpool by FastAPI
    速率限制：5次/分钟.
    拒绝 C 端 customer 角色登录后台；统一处理强制改密策略.
    """
    user = AuthService.authenticate_backend_user(db, login_data.username, login_data.password)

    result = AuthService.create_tokens_for_user(db, user, force_temp_token=True)

    if result["require_password_change"]:
        msg = "首次登录必须修改密码"
        raise BusinessLogicError(
            msg,
            headers={"X-Must-Change-Password": "true", "X-Temp-Token": result["temp_token"]},
        )

    return result


@router.post(
    "/refresh",
    responses={
        401: {"description": "刷新令牌无效或已失效"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_REFRESH)
def refresh_access_token(
    request: Request,
    refresh_data: Annotated[RefreshTokenRequest, Body()],
    db: DbSessionDep,
) -> TokenResponse:
    """刷新令牌.

    Sync - Run in threadpool by FastAPI
    速率限制：10次/分钟.
    仅接受后台受众(aud=admin)的刷新令牌，拒绝C端Token.
    """
    return AuthService.refresh_user_token(
        db,
        refresh_data.refresh_token,
        expected_audience="admin",
    )


@router.get("/wechat/authorize")
@limiter.limit(RateLimits.AUTH_LOGIN)
def wechat_authorize(
    request: Request,
    db: DbSessionDep,
    redirect_uri: Annotated[str | None, Query(max_length=100, description="重定向URL")] = None,
) -> WechatAuthUrlResponse:
    """生成微信登录授权URL（含随机 state，回调时校验防 CSRF）."""
    auth_url, _state = WeChatAuthService.generate_wechat_auth_url(db, redirect_uri)
    return WechatAuthUrlResponse(auth_url=auth_url)


@router.get("/wechat/callback")
@limiter.limit(RateLimits.AUTH_LOGIN)
async def wechat_callback(
    request: Request,
    code: Annotated[str, Query(max_length=100, description="微信授权码")],
    state: Annotated[str, Query(max_length=100, description="状态参数，用于防 CSRF")],
    db: DbSessionDep,
) -> RedirectResponse:
    """微信授权回调 (Async for HTTP, run_in_threadpool for DB).

    严格校验 state 与服务端签发的一致，防止 CSRF / 登录态劫持。
    """
    if not WeChatAuthService.consume_wechat_state(db, state):
        logger.warning("微信回调 state 校验失败，疑似 CSRF 攻击")
        msg = "state 校验失败，请重新发起微信登录"
        raise BusinessLogicError(msg)

    token_data = await WeChatAuthService.fetch_wechat_access_token(code)

    openid = token_data.get("openid")
    access_token = token_data.get("access_token")
    unionid = token_data.get("unionid")

    userinfo_data = await WeChatAuthService.fetch_wechat_user_info(access_token, openid)

    user = await run_in_threadpool(
        WeChatAuthService.login_or_register_wechat_user,
        db=db,
        openid=openid,
        unionid=unionid,
        user_info=userinfo_data,
    )

    result = await run_in_threadpool(AuthService.create_tokens_for_user, db, user)

    auth_code = WeChatAuthService.store_temp_token(
        db,
        access_token=result["access_token"],
        refresh_token=result["refresh_token"],
    )

    frontend_url = f"{settings.frontend_url}/login?code={auth_code}"
    return RedirectResponse(url=frontend_url, status_code=status.HTTP_302_FOUND)


@router.post(
    "/exchange-token",
    responses={
        401: {"description": "授权码无效或已过期"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_REFRESH)
def exchange_token(
    request: Request,
    exchange_data: Annotated[ExchangeTokenRequest, Body()],
    db: DbSessionDep,
) -> TokenResponse:
    """用一次性授权码兑换 Token.

    速率限制：10次/分钟.
    """
    entry = WeChatAuthService.exchange_temp_code(db, exchange_data.code)
    return TokenResponse(
        access_token=entry["access_token"],
        refresh_token=entry["refresh_token"],
        token_type="bearer",  # noqa: S106
        expires_in=settings.jwt_access_token_expire_minutes * 60,
    )


@router.post(
    "/wechat/login",
    responses={
        401: {"description": "微信登录失败或用户标识无效"},
        429: {"description": "请求过于频繁"},
    },
)
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
    auth_data = await WeChatAuthService.fetch_wechat_miniapp_session(login_data.code)

    openid = auth_data.get("openid")
    session_key = auth_data.get("session_key")
    unionid = auth_data.get("unionid")

    if not openid:
        msg = "微信登录失败，未获取到用户标识"
        raise AuthenticationError(msg)

    user = await run_in_threadpool(
        WeChatAuthService.login_or_register_wechat_user,
        db=db,
        openid=openid,
        unionid=unionid,
        session_key=session_key,
    )

    return await run_in_threadpool(AuthService.create_tokens_for_user, db, user)


@router.get(
    "/me",
    responses={
        401: {"description": "未认证"},
        403: {"description": "账号已禁用"},
    },
)
@limiter.exempt
def get_current_user_info(
    current_user: CurrentActiveUserDep,
    db: DbSessionDep,
) -> UserResponse:
    """获取当前用户信息."""
    perm_codes = permission_service.get_user_permission_codes(db, current_user)
    response = UserResponse.model_validate(current_user)
    response.permissions = sorted(perm_codes)
    return response


@router.post(
    "/api-key",
    responses={
        401: {"description": "未认证"},
        403: {"description": "无权限（仅限内部角色）"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_API_KEY_CREATE)
def create_api_key(
    request: Request,
    current_user: CurrentInternalUserDep,
    db: DbSessionDep,
) -> ApiKeyCreateResponse:
    """生成新的 API Key.

    每个用户只能有一个有效 Key，生成新 Key 会自动撤销旧 Key
    Key 仅显示一次，请妥善保存.
    仅限后台内部角色(admin/operator)生成，避免 C 端用户调用机器接口.
    """
    key_string, api_key = ApiKeyService.generate_api_key(db, str(current_user.id))
    return ApiKeyCreateResponse(
        api_key=key_string,
        prefix=api_key.key_prefix,
        created_at=api_key.created_at,
        expires_at=api_key.expires_at,
    )


@router.get(
    "/api-key",
    response_model=ApiKeyInfoResponse | None,
    responses={
        401: {"description": "未认证"},
        403: {"description": "无权限（仅限内部角色）"},
    },
)
def get_api_key_info(
    current_user: CurrentInternalUserDep,
    db: DbSessionDep,
) -> ApiKeyInfoResponse | None:
    """获取当前用户的 API Key 信息.

    不返回完整的 Key，只返回前缀和状态信息.
    仅限后台内部角色(admin/operator)访问.
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


@router.delete(
    "/api-key",
    status_code=status.HTTP_204_NO_CONTENT,
    responses={
        401: {"description": "未认证"},
        403: {"description": "无权限（仅限内部角色）"},
        429: {"description": "请求过于频繁"},
    },
)
@limiter.limit(RateLimits.AUTH_API_KEY_DELETE)
def delete_api_key(
    request: Request,
    current_user: CurrentInternalUserDep,
    db: DbSessionDep,
) -> None:
    """撤销当前用户的 API Key.

    速率限制：20次/小时.
    仅限后台内部角色(admin/operator)访问.
    """
    ApiKeyService.revoke_api_key(db, str(current_user.id))
