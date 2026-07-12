"""应用配置文件.

备注: 当前 Settings 类混合了 JWT、WeChat、上传、CORS 等多领域配置。
未来可考虑按领域拆分为独立 BaseSettings 子类（如 JWTConfig、WechatConfig），
但需评估全项目 settings.* 引用点，收益相对较低，暂保持现状。
"""

import sys
from pathlib import Path
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings

_base_dir = Path(__file__).resolve().parent


class Settings(BaseSettings):
    """应用配置."""

    # 应用基础配置
    app_name: str = "Profo 房产数据中心"
    app_version: str = "0.9.0"
    debug: bool = False

    # 数据库配置
    database_url: str  # 必填，从环境变量读取（PostgreSQL: postgresql+psycopg://user:pass@host:5432/dbname）
    database_echo: bool = False  # 是否打印 SQL 语句

    # API 配置
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    frontend_url: str = (
        "http://localhost:3000"  # 前端URL（用于微信回调重定向等，生产环境通过 FRONTEND_URL 环境变量配置）
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:  # noqa: ANN401
        """解析逗号分隔的 CORS 来源字符串为列表."""
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        return v

    @field_validator("allowed_extensions", "allowed_mime_types", mode="before")
    @classmethod
    def parse_set_from_json(cls, v: Any) -> Any:  # noqa: ANN401
        """解析 JSON 格式的列表/集合环境变量."""
        if isinstance(v, str):
            import json  # noqa: PLC0415

            try:
                # 尝试解析 JSON 数组
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return set(parsed)
            except json.JSONDecodeError:
                # 如果不是 JSON，尝试按逗号分割
                return {i.strip() for i in v.split(",")}
        return v

    # 文件上传配置
    upload_dir: str = str(_base_dir / "static" / "uploads")
    max_upload_size: int = 100 * 1024 * 1024  # 100MB
    # 支持的文件类型：图片、PDF、Excel、Word文档、Markdown
    allowed_extensions: set[str] = {
        ".jpg",
        ".jpeg",
        ".png",
        ".webp",
        ".pdf",
        ".xlsx",
        ".xls",
        ".csv",  # Excel
        ".doc",
        ".docx",  # Word文档
        ".md",  # Markdown
    }
    allowed_mime_types: set[str] = {
        "image/jpeg",
        "image/png",
        "image/webp",
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",  # .xlsx
        "application/vnd.ms-excel",  # .xls
        "text/csv",  # .csv
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",  # .docx
        "application/msword",  # .doc
        "text/markdown",  # .md
    }

    # 分页配置
    default_page_size: int = 50
    max_page_size: int = 200  # 限制单页大小，防止配合 joinedload 消耗过多内存

    # 数据导入配置
    batch_commit_size: int = 1000  # 批量提交大小
    import_upload_dir: str = "temp/uploads"  # CSV导入任务文件存储目录

    # JWT配置
    jwt_secret_key: str  # 强制从环境变量读取，不再提供默认值
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 30  # 访问令牌过期时间(分钟)，符合行业安全标准
    jwt_refresh_token_expire_days: int = 7  # 刷新令牌过期时间(天)

    # JWT密钥轮换配置
    jwt_secret_key_old: str | None = None  # 旧密钥（用于密钥轮换过渡期）
    jwt_key_rotation_enabled: bool = False  # 是否启用密钥轮换

    # 敏感信息加密密钥（Fernet 对称加密，用于加密身份证/手机号/会话密钥等敏感字段）
    encryption_key: str  # 强制从环境变量读取，禁止硬编码

    # C端公开接口默认顾问配置
    default_consultant_phone: str = "400-xxx-xxxx"
    default_consultant_wechat: str = "400-xxx-xxxx"
    default_consultant_nickname: str = "Profo客服"

    # 微信配置
    wechat_appid: str  # 微信AppID (Required from env)
    wechat_secret: str  # 微信AppSecret (Required from env)
    wechat_redirect_uri: str = "http://localhost:8000/api/auth/wechat/callback"  # 微信回调地址

    # 微信 API URL
    wechat_auth_url_base: str = "https://open.weixin.qq.com/connect/oauth2/authorize"
    wechat_token_url: str = "https://api.weixin.qq.com/sns/oauth2/access_token"  # noqa: S105
    wechat_userinfo_url: str = "https://api.weixin.qq.com/sns/userinfo"
    wechat_jscode2session_url: str = "https://api.weixin.qq.com/sns/jscode2session"

    class Config:
        """Pydantic Settings 配置类."""

        env_file = ".env"
        env_file_encoding = "utf-8"


# 全局配置实例
try:
    settings = Settings()
except Exception as e:  # noqa: BLE001
    # 解析 Pydantic ValidationError 提取缺失字段
    if hasattr(e, "errors"):
        missing = [err["loc"][0] for err in e.errors() if err["type"] == "missing"]
        if missing:
            for field in missing:
                env_name = str(field).upper()
        else:
            pass
    else:
        pass

    sys.exit(1)
