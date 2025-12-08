"""
应用配置文件
"""
import os
from typing import Optional
from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    """应用配置"""
    
    # 应用基础配置
    app_name: str = "Profo 房产数据中心"
    app_version: str = "0.1.0"
    debug: bool = True
    
    # 数据库配置
    database_url: str = "sqlite:///./data.db"
    database_echo: bool = False  # 是否打印 SQL 语句
    
    # API 配置
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    
    # 文件上传配置
    max_upload_size: int = 100 * 1024 * 1024  # 100MB
    allowed_extensions: list[str] = [".csv"]
    
    # 分页配置
    default_page_size: int = 50
    max_page_size: int = 1000
    
    # 数据导入配置
    batch_commit_size: int = 1000  # 批量提交大小
    
    # JWT配置
    jwt_secret_key: str  # 强制从环境变量读取，不再提供默认值
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30  # 访问令牌过期时间(分钟)
    jwt_refresh_token_expire_days: int = 7  # 刷新令牌过期时间(天)
    
    # JWT密钥轮换配置
    jwt_secret_key_old: Optional[str] = None  # 旧密钥（用于密钥轮换过渡期）
    jwt_key_rotation_enabled: bool = False  # 是否启用密钥轮换
    
    # 微信配置
    wechat_appid: str = "your-wechat-appid"  # 微信AppID
    wechat_secret: str = "your-wechat-secret"  # 微信AppSecret
    wechat_redirect_uri: str = "http://localhost:8000/api/auth/wechat/callback"  # 微信回调地址
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置实例
settings = Settings()
