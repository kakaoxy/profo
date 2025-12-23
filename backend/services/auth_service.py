import logging
from datetime import datetime, timedelta
from typing import Optional, Dict, Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from models.user import User, Role
from schemas.user import TokenResponse
from settings import settings
from utils.auth import (
    verify_password,
    create_access_token,
    create_refresh_token,
    validate_token,
    get_password_hash,
)

logger = logging.getLogger(__name__)

class AuthService:
    """
    认证服务层
    将业务逻辑从路由中分离，处理并发阻塞问题：
    - 数据库操作 (Sync) -> 供路由层 run_in_threadpool 调用或 def 路由直接调用
    - 外部 API 调用 (Async) -> 供 async 路由调用
    """

    @staticmethod
    def authenticate_user(db: Session, username: str, password: str) -> User:
        """
        验证用户名密码 (Sync - Blocking)
        包含 bcrypt 验证（CPU 密集型）
        """
        user = db.query(User).filter(User.username == username).first()
        if not user or not verify_password(password, user.password):
            return None
        return user

    @staticmethod
    def create_tokens_for_user(db: Session, user: User, force_temp_token: bool = False) -> Dict[str, Any]:
        """
        为用户生成令牌 (Sync)
        处理登录后更新时间、生成 Token 的逻辑
        """
        # 检查是否强制修改密码逻辑
        if force_temp_token and user.must_change_password:
             # 生成临时 Token logic
            temp_expires = timedelta(minutes=10)
            temp_token = create_access_token(
                data={"sub": user.id, "role": user.role.code, "scope": "reset_password"},
                expires_delta=temp_expires
            )
            # 通过异常或特定返回结构传递给 Router 处理
            # 这里选择返回特定字典让 Router 抛出异常
            return {
                "require_password_change": True,
                "temp_token": temp_token
            }

        # 更新最后登录时间
        user.last_login_at = datetime.utcnow()
        db.commit()
        db.refresh(user)

        # 创建令牌
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

        return {
            "require_password_change": False,
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": int(access_token_expires.total_seconds()),
            "user": user
        }

    @staticmethod
    def refresh_user_token(db: Session, refresh_token: str) -> Dict[str, Any]:
        """
        刷新 Token (Sync)
        """
        payload = validate_token(refresh_token, token_type="refresh")
        if not payload:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="刷新令牌无效",
                headers={"WWW-Authenticate": "Bearer"},
            )
        
        user_id: str = payload.get("sub")
        if user_id is None:
             raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="刷新令牌无效",
                headers={"WWW-Authenticate": "Bearer"},
            )

        user = db.query(User).filter(User.id == user_id).first()
        if user is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="用户不存在",
                headers={"WWW-Authenticate": "Bearer"},
            )

        return AuthService.create_tokens_for_user(db, user)

    @staticmethod
    def generate_wechat_auth_url(redirect_uri: Optional[str] = None) -> str:
        """生成微信授权 URL"""
        callback_url = redirect_uri or settings.wechat_redirect_uri
        params = {
            "appid": settings.wechat_appid,
            "redirect_uri": callback_url,
            "response_type": "code",
            "scope": "snsapi_userinfo",
            "state": "wechat_login",
            "connect_redirect": 1
        }
        return settings.wechat_auth_url_base + "?" + urlencode(params) + "#wechat_redirect"

    @staticmethod
    async def fetch_wechat_access_token(code: str) -> Dict[str, Any]:
        """
        获取微信 Access Token (Async - IO Bound)
        """
        params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "code": code,
            "grant_type": "authorization_code"
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.wechat_token_url, params=params)
            data = response.json()
        
        if "errcode" in data:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"微信授权失败: {data.get('errmsg')}"
            )
        return data

    @staticmethod
    async def fetch_wechat_user_info(access_token: str, openid: str) -> Dict[str, Any]:
        """
        获取微信用户信息 (Async - IO Bound)
        """
        params = {
            "access_token": access_token,
            "openid": openid,
            "lang": "zh_CN"
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.wechat_userinfo_url, params=params)
            data = response.json()
            
        if "errcode" in data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"获取微信用户信息失败: {data.get('errmsg')}"
            )
        return data
    
    @staticmethod
    async def fetch_wechat_miniapp_session(code: str) -> Dict[str, Any]:
        """
        获取微信小程序 Session (Async - IO Bound)
        """
        params = {
            "appid": settings.wechat_appid,
            "secret": settings.wechat_secret,
            "js_code": code,
            "grant_type": "authorization_code"
        }
        async with httpx.AsyncClient() as client:
            response = await client.get(settings.wechat_jscode2session_url, params=params)
            data = response.json()

        if "errcode" in data and data["errcode"] != 0:
             raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"微信登录失败: {data.get('errmsg')}"
            )
        return data

    @staticmethod
    def login_or_register_wechat_user(
        db: Session, 
        openid: str, 
        unionid: Optional[str], 
        user_info: Dict[str, Any] = None,
        session_key: Optional[str] = None
    ) -> User:
        """
        处理微信用户登录/注册 (Sync - Blocking DB)
        """
        user = db.query(User).filter(User.wechat_openid == openid).first()
        
        if not user:
            # 注册新用户
            role = db.query(Role).filter(Role.code == "user").first()
            if not role:
                role = Role(
                    name="普通用户",
                    code="user",
                    description="仅拥有数据查看权限",
                    permissions=["view_data"]
                )
                db.add(role)
                db.commit()
                db.refresh(role)
            
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
                status="active"
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
                
            user.last_login_at = datetime.utcnow()
            db.commit()
            db.refresh(user)
            
        return user
