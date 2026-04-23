"""
应用配置文件
"""
import os
from typing import Optional, Any
from pydantic import field_validator, Field
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

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        return v

    @field_validator("allowed_extensions", "allowed_mime_types", mode="before")
    @classmethod
    def parse_set_from_json(cls, v: Any) -> Any:
        """解析 JSON 格式的列表/集合环境变量"""
        if isinstance(v, str):
            import json
            try:
                # 尝试解析 JSON 数组
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return set(parsed)
            except json.JSONDecodeError:
                # 如果不是 JSON，尝试按逗号分割
                return set(i.strip() for i in v.split(","))
        return v

    # 文件上传配置
    upload_dir: str = "static/uploads"
    max_upload_size: int = 100 * 1024 * 1024  # 100MB
    # 支持的文件类型：图片、PDF、Excel、Word文档（合同和发票）
    allowed_extensions: set[str] = {
        '.jpg', '.jpeg', '.png', '.pdf', 
        '.xlsx', '.xls', '.csv',  # Excel
        '.doc', '.docx'  # Word文档
    }
    allowed_mime_types: set[str] = {
        'image/jpeg',
        'image/png',
        'application/pdf',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  # .xlsx
        'application/vnd.ms-excel',  # .xls
        'text/csv',  # .csv
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',  # .docx
        'application/msword',  # .doc
    }
    
    # 分页配置
    default_page_size: int = 50
    max_page_size: int = 1000
    
    # 数据导入配置
    batch_commit_size: int = 1000  # 批量提交大小
    import_upload_dir: str = "temp/uploads"  # CSV导入任务文件存储目录
    
    # JWT配置
    jwt_secret_key: str  # 强制从环境变量读取，不再提供默认值
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30  # 访问令牌过期时间(分钟)，符合行业安全标准
    jwt_refresh_token_expire_days: int = 7  # 刷新令牌过期时间(天)
    
    # JWT密钥轮换配置
    jwt_secret_key_old: Optional[str] = None  # 旧密钥（用于密钥轮换过渡期）
    jwt_key_rotation_enabled: bool = False  # 是否启用密钥轮换
    
    # 微信配置
    wechat_appid: str  # 微信AppID (Required from env)
    wechat_secret: str  # 微信AppSecret (Required from env)
    wechat_redirect_uri: str = "http://localhost:8000/api/auth/wechat/callback"  # 微信回调地址
    
    # 微信 API URL
    wechat_auth_url_base: str = "https://open.weixin.qq.com/connect/oauth2/authorize"
    wechat_token_url: str = "https://api.weixin.qq.com/sns/oauth2/access_token"
    wechat_userinfo_url: str = "https://api.weixin.qq.com/sns/userinfo"
    wechat_jscode2session_url: str = "https://api.weixin.qq.com/sns/jscode2session"
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置实例
settings = Settings()
