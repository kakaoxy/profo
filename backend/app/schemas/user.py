"""
用户相关的Pydantic模式
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class UserBase(BaseModel):
    """用户基础模式"""
    username: Optional[str] = None
    nickname: Optional[str] = None
    avatar_url: Optional[str] = None
    phone: Optional[str] = None
    is_active: bool = True


class UserCreate(UserBase):
    """创建用户模式"""
    username: str
    password: str


class UserUpdate(UserBase):
    """更新用户模式"""
    password: Optional[str] = None


class UserResponse(UserBase):
    """用户响应模式"""
    id: int
    wx_openid: Optional[str] = None
    wx_unionid: Optional[str] = None
    is_superuser: bool
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class UserLogin(BaseModel):
    """用户登录模式"""
    username: str
    password: str


class WechatLogin(BaseModel):
    """微信登录模式"""
    code: str


class Token(BaseModel):
    """JWT令牌模式"""
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
