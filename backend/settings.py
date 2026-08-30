"""应用配置文件.

备注: 当前 Settings 类混合了 JWT、WeChat、上传、CORS 等多领域配置。
未来可考虑按领域拆分为独立 BaseSettings 子类（如 JWTConfig、WechatConfig），
但需评估全项目 settings.* 引用点，收益相对较低，暂保持现状。
"""

import sys
from pathlib import Path
from typing import Any

from pydantic import field_validator, model_validator
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

    # Redis 配置（限流与缓存后端，多 worker 部署必需）
    redis_url: str  # 必填，从 REDIS_URL 环境变量读取

    # API 配置
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]
    frontend_url: str = (
        "http://localhost:3000"  # 前端URL（用于微信回调重定向等，生产环境通过 FRONTEND_URL 环境变量配置）
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: Any) -> Any:
        """解析逗号分隔的 CORS 来源字符串为列表."""
        if isinstance(v, str) and not v.startswith("["):
            return [i.strip() for i in v.split(",")]
        return v

    # 可信代理 IP/CIDR 列表（用于 _get_client_ip 读取 X-Forwarded-For）
    # Docker bridge 网络下 nginx/容器 IP 不在 127.0.0.1 中，需通过环境变量配置代理网段
    # 示例：TRUSTED_PROXIES=["127.0.0.1","::1","172.16.0.0/12"]
    trusted_proxies: list[str] = ["127.0.0.1", "::1"]

    @field_validator("trusted_proxies", mode="before")
    @classmethod
    def parse_trusted_proxies(cls, v: Any) -> Any:
        """解析逗号分隔的可信代理列表为列表.

        空字符串/空列表会清空默认值，导致 forwarded_allow_ips="" 时 uvicorn
        信任所有代理（IP 伪造风险）。此处对空值显式报错，强制用户配置。
        """
        if isinstance(v, str) and not v.startswith("["):
            result = [i.strip() for i in v.split(",") if i.strip()]
            if not result:
                msg = "trusted_proxies 不能为空，请配置至少一个可信代理 IP/CIDR"
                raise ValueError(msg)
            return result
        return v

    @field_validator("allowed_extensions", "allowed_mime_types", mode="before")
    @classmethod
    def parse_set_from_json(cls, v: Any) -> Any:
        """解析 JSON 格式的列表/集合环境变量."""
        if isinstance(v, str):
            import json

            try:
                # 尝试解析 JSON 数组
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return set(parsed)
            except json.JSONDecodeError:
                # 如果不是 JSON，尝试按逗号分割
                return {i.strip() for i in v.split(",")}
        return v

    # 存储后端配置（local=本地文件系统，oss=阿里云OSS）
    storage_backend: str = "local"

    @field_validator("storage_backend")
    @classmethod
    def validate_storage_backend(cls, v: str) -> str:
        """校验存储后端为合法值，避免拼写错误静默回退到 local."""
        if v not in ("local", "oss"):
            msg = f"storage_backend 必须为 'local' 或 'oss'，实际收到: {v!r}"
            raise ValueError(msg)
        return v

    oss_access_key_id: str | None = None
    oss_access_key_secret: str | None = None
    oss_bucket_name: str | None = None
    oss_endpoint: str | None = None  # 内网endpoint，如 oss-cn-shanghai-internal.aliyuncs.com
    oss_public_base_url: str | None = None  # 公网/CDN访问基址，无尾斜杠

    # 文件上传配置
    upload_dir: str = str(_base_dir / "static" / "uploads")
    max_upload_size: int = 524288000  # 500MB，支持视频上传
    # 支持的文件类型：图片、PDF、Excel、Word文档、Markdown、视频
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
        ".mp4",
        ".mov",
        ".webm",  # 视频
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
        "video/mp4",
        "video/quicktime",
        "video/webm",  # 视频
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
    # 小程序全局 access_token（cgi-bin/token，用于服务端调用 getPhoneNumber 等接口）
    wechat_miniapp_token_url: str = "https://api.weixin.qq.com/cgi-bin/token"  # noqa: S105
    # 小程序手机号授权接口（wx.getPhoneNumber 的 code 换取手机号）
    wechat_phone_url: str = "https://api.weixin.qq.com/wxa/business/getuserphonenumber"
    # 小程序码生成接口（getwxacodeunlimit）
    wechat_miniapp_qrcode_url: str = "https://api.weixin.qq.com/wxa/getwxacodeunlimit"
    # 小程序订阅消息推送接口（message/subscribe/send）
    wechat_subscribe_send_url: str = "https://api.weixin.qq.com/cgi-bin/message/subscribe/send"
    # 招募新线索订阅消息模板 ID（env 可配，空 = 功能关闭）
    wechat_recruit_lead_template_id: str = ""
    # 估价授权价变更订阅消息模板 ID（授权评估价/调整评估价时推送客户，env 可配，空 = 功能关闭）
    wechat_valuation_price_template_id: str = ""

    @model_validator(mode="after")
    def validate_oss_config(self) -> "Settings":
        """当 storage_backend=oss 时，校验 OSS 必填配置."""
        if self.storage_backend == "oss":
            required_fields = {
                "oss_access_key_id": self.oss_access_key_id,
                "oss_access_key_secret": self.oss_access_key_secret,
                "oss_bucket_name": self.oss_bucket_name,
                "oss_endpoint": self.oss_endpoint,
                "oss_public_base_url": self.oss_public_base_url,
            }
            missing = [name for name, value in required_fields.items() if not value]
            if missing:
                msg = f"storage_backend=oss 时以下配置必填: {', '.join(missing)}"
                raise ValueError(msg)
        return self

    @model_validator(mode="after")
    def validate_trusted_proxies_not_empty(self) -> "Settings":
        """确保 trusted_proxies 非空，防止 forwarded_allow_ips 空值时 uvicorn 信任所有代理.

        parse_trusted_proxies 的 before 校验仅覆盖逗号分隔字符串场景；
        JSON 数组 "[]" 或编程式传入 [] 会绕过该校验，故追加 after 兜底.
        """
        if not self.trusted_proxies:
            msg = "trusted_proxies 不能为空，请配置至少一个可信代理 IP/CIDR"
            raise ValueError(msg)
        return self

    class Config:
        """Pydantic Settings 配置类."""

        env_file = ("../.env", ".env")
        env_file_encoding = "utf-8"
        # 根目录 .env 同时供 docker-compose 使用（含 POSTGRES_USER 等 backend 不需要的字段），允许额外字段
        extra = "ignore"


# 全局配置实例
try:
    settings = Settings()
except Exception as e:
    # Fail Loud: 打印配置错误后再退出，避免静默失败导致排障困难
    print(f"[FATAL] 配置加载失败: {e}", file=sys.stderr)
    sys.exit(1)
