"""
认证相关路由
"""
from datetime import timedelta, datetime
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from typing import Optional
import httpx
import logging

from db import get_db
from models.user import User, Role
from schemas.user import (
    LoginRequest,
    TokenResponse,
    RefreshTokenRequest,
    UserResponse,
    WechatLoginRequest,
)
from utils.auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    validate_token,
    get_password_hash,
)
from dependencies.auth import get_current_active_user
from settings import settings


logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/token", response_model=TokenResponse)
async def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db)
):
    """
    OAuth2密码流登录，获取访问令牌
    
    Args:
        form_data: OAuth2密码表单数据
        db: 数据库会话
        
    Returns:
        TokenResponse: 包含访问令牌、刷新令牌和用户信息的响应
        
    Raises:
        HTTPException: 401 Unauthorized - 用户名或密码错误
        HTTPException: 403 Forbidden - 必须修改密码
    """
    # 验证用户
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not verify_password(form_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 检查是否必须修改密码
    if user.must_change_password:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="首次登录必须修改密码",
            headers={"X-Must-Change-Password": "true"}
        )
    
    # 更新最后登录时间
    from datetime import datetime
    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role.code},
        expires_delta=access_token_expires
    )
    
    # 创建刷新令牌
    refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
    refresh_token = create_refresh_token(
        data={"sub": user.id},
        expires_delta=refresh_token_expires
    )
    
    # 返回响应
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=int(access_token_expires.total_seconds()),
        user=user
    )


@router.post("/login", response_model=TokenResponse)
async def login(
    login_data: LoginRequest,
    db: Session = Depends(get_db)
):
    """
    用户名密码登录，获取访问令牌
    
    Args:
        login_data: 登录请求数据
        db: 数据库会话
        
    Returns:
        TokenResponse: 包含访问令牌、刷新令牌和用户信息的响应
        
    Raises:
        HTTPException: 401 Unauthorized - 用户名或密码错误
    """
    # 验证用户
    user = db.query(User).filter(User.username == login_data.username).first()
    if not user or not verify_password(login_data.password, user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户名或密码错误",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 更新最后登录时间
    from datetime import datetime
    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    # 创建访问令牌
    access_token_expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role.code},
        expires_delta=access_token_expires
    )
    
    # 创建刷新令牌
    refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
    refresh_token = create_refresh_token(
        data={"sub": user.id},
        expires_delta=refresh_token_expires
    )
    
    # 返回响应
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=int(access_token_expires.total_seconds()),
        user=user
    )


@router.post("/refresh", response_model=TokenResponse)
async def refresh_access_token(
    refresh_data: RefreshTokenRequest,
    db: Session = Depends(get_db)
):
    """
    使用刷新令牌获取新的访问令牌
    
    Args:
        refresh_data: 刷新令牌请求数据
        db: 数据库会话
        
    Returns:
        TokenResponse: 包含新的访问令牌、刷新令牌和用户信息的响应
        
    Raises:
        HTTPException: 401 Unauthorized - 刷新令牌无效
    """
    # 验证刷新令牌
    payload = validate_token(refresh_data.refresh_token, token_type="refresh")
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 获取用户ID
    user_id: str = payload.get("sub")
    if user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="刷新令牌无效",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 获取用户
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="用户不存在",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 更新最后登录时间
    from datetime import datetime
    user.last_login_at = datetime.utcnow()
    db.commit()
    db.refresh(user)
    
    # 创建新的访问令牌
    access_token_expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
    access_token = create_access_token(
        data={"sub": user.id, "role": user.role.code},
        expires_delta=access_token_expires
    )
    
    # 创建新的刷新令牌
    refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
    refresh_token = create_refresh_token(
        data={"sub": user.id},
        expires_delta=refresh_token_expires
    )
    
    # 返回响应
    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=int(access_token_expires.total_seconds()),
        user=user
    )


@router.get("/wechat/authorize")
async def wechat_authorize(
    redirect_uri: Optional[str] = None
):
    """
    生成微信登录授权URL
    
    Args:
        redirect_uri: 自定义重定向URI，可选
        
    Returns:
        dict: 包含微信授权URL的响应
    """
    from urllib.parse import urlencode
    
    # 使用配置的回调地址或自定义回调地址
    callback_url = redirect_uri or settings.wechat_redirect_uri
    
    # 构建微信授权URL
    wechat_auth_url = "https://open.weixin.qq.com/connect/oauth2/authorize?"
    params = {
        "appid": settings.wechat_appid,
        "redirect_uri": callback_url,
        "response_type": "code",
        "scope": "snsapi_userinfo",  # 静默授权获取用户信息
        "state": "wechat_login",
        "connect_redirect": 1
    }
    
    auth_url = wechat_auth_url + urlencode(params) + "#wechat_redirect"
    
    return {"auth_url": auth_url}


@router.get("/wechat/callback")
async def wechat_callback(
    code: str = Query(...),
    state: str = Query(...),
    db: Session = Depends(get_db)
):
    """
    微信授权回调处理
    
    Args:
        code: 微信授权码
        state: 状态参数
        db: 数据库会话
        
    Returns:
        dict: 包含登录结果的响应
    """
    try:
        # 1. 使用授权码获取access_token和openid
        token_url = "https://api.weixin.qq.com/sns/oauth2/access_token"
        token_params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "code": code,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            token_response = await client.get(token_url, params=token_params)
            token_data = token_response.json()
        
        if "errcode" in token_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"微信授权失败: {token_data.get('errmsg')}"
            )
        
        openid = token_data.get("openid")
        access_token = token_data.get("access_token")
        refresh_token = token_data.get("refresh_token")
        unionid = token_data.get("unionid")
        
        # 2. 使用access_token获取用户信息
        userinfo_url = "https://api.weixin.qq.com/sns/userinfo"
        userinfo_params = {
            "access_token": access_token,
            "openid": openid,
            "lang": "zh_CN"
        }
        
        async with httpx.AsyncClient() as client:
            userinfo_response = await client.get(userinfo_url, params=userinfo_params)
            userinfo_data = userinfo_response.json()
        
        if "errcode" in userinfo_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"获取微信用户信息失败: {userinfo_data.get('errmsg')}"
            )
        
        # 3. 处理用户登录或注册
        # 查找现有用户
        user = db.query(User).filter(User.wechat_openid == openid).first()
        
        if not user:
            # 创建新用户
            # 查找默认角色（普通用户）
            role = db.query(Role).filter(Role.code == "user").first()
            if not role:
                # 如果没有默认角色，创建一个
                role = Role(
                    name="普通用户",
                    code="user",
                    description="仅拥有数据查看权限",
                    permissions=["view_data"]
                )
                db.add(role)
                db.commit()
                db.refresh(role)
            
            # 创建新用户
            user = User(
                username=f"wechat_{openid[:10]}",
                password=get_password_hash(openid),  # 使用openid作为初始密码
                nickname=userinfo_data.get("nickname", "微信用户"),
                avatar=userinfo_data.get("headimgurl"),
                wechat_openid=openid,
                wechat_unionid=unionid,
                role_id=role.id,
                status="active"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        
        # 4. 更新用户微信信息
        user.nickname = userinfo_data.get("nickname", user.nickname)
        user.avatar = userinfo_data.get("headimgurl", user.avatar)
        if unionid:
            user.wechat_unionid = unionid
        user.last_login_at = datetime.utcnow()
        db.commit()
        db.refresh(user)
        
        # 5. 创建JWT令牌
        access_token_expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
        access_token = create_access_token(
            data={"sub": user.id, "role": user.role.code},
            expires_delta=access_token_expires
        )
        
        refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
        refresh_token = create_refresh_token(
            data={"sub": user.id},
            expires_delta=refresh_token_expires
        )
        
        # 6. 返回登录结果（重定向到前端）
        frontend_url = f"http://localhost:3000/login?token={access_token}&refresh_token={refresh_token}"
        from fastapi.responses import RedirectResponse
        return RedirectResponse(url=frontend_url, status_code=status.HTTP_302_FOUND)
        
    except Exception as e:
        logger.error(f"微信登录回调处理失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信登录处理失败"
        )


@router.post("/wechat/login", response_model=TokenResponse)
async def wechat_app_login(
    login_data: WechatLoginRequest,
    db: Session = Depends(get_db)
):
    """
    微信小程序登录
    
    Args:
        login_data: 微信登录请求数据
        db: 数据库会话
        
    Returns:
        TokenResponse: 包含访问令牌、刷新令牌和用户信息的响应
        
    Raises:
        HTTPException: 400 Bad Request - 微信登录失败
    """
    try:
        # 1. 使用小程序code获取session_key和openid
        auth_url = "https://api.weixin.qq.com/sns/jscode2session"
        auth_params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "js_code": login_data.code,
            "grant_type": "authorization_code"
        }
        
        async with httpx.AsyncClient() as client:
            auth_response = await client.get(auth_url, params=auth_params)
            auth_data = auth_response.json()
        
        if "errcode" in auth_data and auth_data["errcode"] != 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"微信登录失败: {auth_data.get('errmsg')}"
            )
        
        openid = auth_data.get("openid")
        session_key = auth_data.get("session_key")
        unionid = auth_data.get("unionid")
        
        # 2. 处理用户登录或注册
        user = db.query(User).filter(User.wechat_openid == openid).first()
        
        if not user:
            # 创建新用户
            # 查找默认角色（普通用户）
            role = db.query(Role).filter(Role.code == "user").first()
            if not role:
                # 如果没有默认角色，创建一个
                role = Role(
                    name="普通用户",
                    code="user",
                    description="仅拥有数据查看权限",
                    permissions=["view_data"]
                )
                db.add(role)
                db.commit()
                db.refresh(role)
            
            # 创建新用户
            user = User(
                username=f"wechat_{openid[:10]}",
                password=get_password_hash(openid),  # 使用openid作为初始密码
                nickname="微信用户",
                wechat_openid=openid,
                wechat_session_key=session_key,
                wechat_unionid=unionid,
                role_id=role.id,
                status="active"
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        else:
            # 更新用户信息
            user.wechat_session_key = session_key
            if unionid:
                user.wechat_unionid = unionid
            user.last_login_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
        
        # 3. 创建JWT令牌
        access_token_expires = timedelta(minutes=settings.jwt_access_token_expire_minutes)
        access_token = create_access_token(
            data={"sub": user.id, "role": user.role.code},
            expires_delta=access_token_expires
        )
        
        refresh_token_expires = timedelta(days=settings.jwt_refresh_token_expire_days)
        refresh_token = create_refresh_token(
            data={"sub": user.id},
            expires_delta=refresh_token_expires
        )
        
        # 4. 返回响应
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            token_type="bearer",
            expires_in=int(access_token_expires.total_seconds()),
            user=user
        )
        
    except Exception as e:
        logger.error(f"微信小程序登录失败: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="微信登录处理失败"
        )


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: User = Depends(get_current_active_user)
):
    """
    获取当前用户信息
    
    Args:
        current_user: 当前认证用户，通过依赖注入自动获取
        
    Returns:
        UserResponse: 当前用户信息
        
    Raises:
        HTTPException: 401 Unauthorized - 用户未认证
        HTTPException: 400 Bad Request - 用户未激活
    """
    return current_user
