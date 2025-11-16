"""
应用配置文件
"""
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
    
    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置实例
settings = Settings()
