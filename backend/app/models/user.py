"""
用户模型
"""
from datetime import datetime
from typing import Optional
from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    """用户表"""
    __tablename__ = "users"
    
    id: Optional[int] = Field(default=None, primary_key=True)
    username: Optional[str] = Field(default=None, max_length=150, unique=True, index=True)
    hashed_password: Optional[str] = Field(default=None, max_length=255)
    nickname: Optional[str] = Field(default=None, max_length=150)
    avatar_url: Optional[str] = Field(default=None)
    phone: Optional[str] = Field(default=None, max_length=50)
    wx_openid: Optional[str] = Field(default=None, max_length=255, unique=True, index=True)
    wx_unionid: Optional[str] = Field(default=None, max_length=255, unique=True, index=True)
    is_active: bool = Field(default=True)
    is_superuser: bool = Field(default=False)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
