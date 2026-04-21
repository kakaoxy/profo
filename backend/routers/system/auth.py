"""
认证相关路由
直接返回 Pydantic 模型，不使用 ApiResponse 包装器
"""
from typing import Annotated
from fastapi import APIRouter, Body, Depends, HTTPException, status, Query, Request
from fastapi.responses import RedirectResponse
from fastapi.security import OAuth2PasswordRequestForm
from fastapi.concurrency import run_in_threadpool
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

from db import get_db
from models import User
from schemas.user import (
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    UserResponse,
    WechatLoginRequest,
)
from dependencies.auth import get_current_active_user
from services.system import AuthService
from services.system.exceptions import AuthenticationError
from common import limiter


DBSessionDep = Annotated[Session, Depends(get_db)]
CurrentUserDep = Annotated[User, Depends(get_current_active_user)]

router = APIRouter(prefix="/auth", tags=["auth"])


# ==================== 速率限制依赖 ====================
def get_rate_key(request: Request, username: str = "") -> str:
    """获取速率限制的 key，基于 IP + 用户名"""
    return f"{get_remote_address(request)}:{username}"


@router.post("/token", response_model=TokenResponse)
@limiter.limit("5/minute")
def login_for_access_token(
    request: Request,
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    db: DBSessionDep
) -> TokenResponse:
    """
    OAuth2 兼容的 token 获取接口 (Sync - Run in threadpool by FastAPI)
    速率限制：5次/分钟
    """
    try:
        user = AuthService.authenticate_user(db, form_data.username, form_data.password)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 生成 Token (包含强制修改密码逻辑)
    result = AuthService.create_tokens_for_user(db, user, force_temp_token=True)

    # 如果需要强制修改密码
    if result.get("require_password_change"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "code": "HTTP_403",
                "message": "首次登录必须修改密码",
                "temp_token": result["temp_token"]
            },
            headers={"X-Must-Change-Password": "true"}
        )

    return result


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
def login(
    request: Request,
    login_data: Annotated[LoginRequest, Body()],
    db: DBSessionDep
) -> TokenResponse:
    """
    用户名密码登录 (Sync - Run in threadpool by FastAPI)
    速率限制：5次/分钟
    """
    try:
        user = AuthService.authenticate_user(db, login_data.username, login_data.password)
    except AuthenticationError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=e.message,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # 普通登录接口暂时不强制检查密码修改，或者也可以加上
    # 这里保持原有逻辑，原有逻辑没有抛出 403，只更新了 login time
    # 但 Service 统一处理了。如果原有逻辑没加 force_check，这里可以传 False
    return AuthService.create_tokens_for_user(db, user, force_temp_token=False)


@router.post("/refresh", response_model=TokenResponse)
def refresh_access_token(
    refresh_data: Annotated[RefreshTokenRequest, Body()],
    db: DBSessionDep
) -> TokenResponse:
    """
    刷新令牌 (Sync - Run in threadpool by FastAPI)
    """
    return AuthService.refresh_user_token(db, refresh_data.refresh_token)


@router.get("/wechat/authorize")
def wechat_authorize(
    redirect_uri: Annotated[str | None, Query(description="重定向URL")] = None
):
    """
    生成微信登录授权URL
    """
    # 纯逻辑计算，无阻塞，sync 即可
    auth_url = AuthService.generate_wechat_auth_url(redirect_uri)
    return {"auth_url": auth_url}


@router.get("/wechat/callback")
async def wechat_callback(
    code: Annotated[str, Query(description="微信授权码")],
    state: Annotated[str, Query(description="状态参数")],
    db: DBSessionDep
) -> RedirectResponse:
    """
    微信授权回调 (Async for HTTP, run_in_threadpool for DB)
    """
    # 1. Async: 获取 Access Token
    token_data = await AuthService.fetch_wechat_access_token(code)
    
    openid = token_data.get("openid")
    access_token = token_data.get("access_token")
    # refresh_token = token_data.get("refresh_token") # 暂未使用
    unionid = token_data.get("unionid")
    
    # 2. Async: 获取用户信息
    userinfo_data = await AuthService.fetch_wechat_user_info(access_token, openid)
    
    # 3. Sync (Blocking): DB 操作 -> 放入线程池
    user = await run_in_threadpool(
        AuthService.login_or_register_wechat_user,
        db=db,
        openid=openid,
        unionid=unionid,
        user_info=userinfo_data
    )
    
    # 4. Sync (Blocking): 生成令牌 -> 放入线程池 (虽然计算量不大，但涉及 DB commit)
    result = await run_in_threadpool(AuthService.create_tokens_for_user, db, user)
    
    # 5. 重定向
    frontend_url = f"http://localhost:3000/login?token={result['access_token']}&refresh_token={result['refresh_token']}"
    return RedirectResponse(url=frontend_url, status_code=status.HTTP_302_FOUND)


@router.post("/wechat/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def wechat_app_login(
    request: Request,
    login_data: Annotated[WechatLoginRequest, Body()],
    db: DBSessionDep
) -> TokenResponse:
    """
    微信小程序登录 (Async for HTTP, run_in_threadpool for DB)
    速率限制：5次/分钟
    """
    # 1. Async: 获取 Session
    auth_data = await AuthService.fetch_wechat_miniapp_session(login_data.code)
    
    openid = auth_data.get("openid")
    session_key = auth_data.get("session_key")
    unionid = auth_data.get("unionid")
    
    # 2. Sync (Blocking): DB 操作
    user = await run_in_threadpool(
        AuthService.login_or_register_wechat_user,
        db=db,
        openid=openid,
        unionid=unionid,
        session_key=session_key
    )
    
    # 3. Sync: 生成令牌
    return await run_in_threadpool(AuthService.create_tokens_for_user, db, user)


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUserDep
) -> UserResponse:
    """
    获取当前用户信息
    """
    return current_user
