"""共享依赖和配置.

用于避免循环导入.
"""

from fastapi import Request
from slowapi import Limiter

TRUSTED_PROXIES = {"127.0.0.1", "::1"}


def _get_client_ip(request: Request) -> str:
    """获取客户端真实 IP.

    仅当直接连接来自可信代理时才读取 X-Forwarded-For，
    防止攻击者伪造 XFF 头绕过速率限制。
    """
    client_host = request.client.host if request.client else "unknown"
    if client_host in TRUSTED_PROXIES:
        xff = request.headers.get("X-Forwarded-For")
        if xff:
            return xff.split(",")[0].strip()
    return client_host


limiter = Limiter(
    key_func=_get_client_ip,
    default_limits=["200/day", "50/hour"],
    config_filename=".slowapi.env",
)


class RateLimits:
    """统一速率限制配置.

    所有路由的速率限制值集中管理，避免魔法字符串散布在代码中。
    修改速率限制只需在此处调整，无需逐个文件查找。
    """

    # ==================== 认证模块 ====================
    AUTH_LOGIN = "5/minute"
    AUTH_REFRESH = "10/minute"
    AUTH_API_KEY_DELETE = "20/hour"
    AUTH_API_KEY_CREATE = "20/hour"

    # ==================== 用户管理模块 ====================
    USER_LIST = "60/minute"
    USER_CREATE = "10/hour"
    USER_UPDATE = "100/hour"
    USER_DELETE = "20/hour"
    USER_RESET_PASSWORD = "5/hour"  # noqa: S105
    USER_CHANGE_PASSWORD = "3/minute"  # noqa: S105
    USER_INIT_DATA = "3/hour"

    # ==================== 角色管理模块 ====================
    ROLE_UPDATE = "100/hour"
    ROLE_DELETE = "20/hour"

    # ==================== 项目管理模块 ====================
    PROJECT_CREATE = "100/hour"
    PROJECT_EXPORT = "10/hour"
    PROJECT_UPDATE = "100/hour"
    PROJECT_DELETE = "20/hour"
    PROJECT_STATUS_UPDATE = "100/hour"

    # ==================== 装修管理模块 ====================
    RENOVATION_UPDATE = "100/hour"
    RENOVATION_DELETE = "20/hour"

    # ==================== 销售管理模块 ====================
    SALES_UPDATE = "100/hour"
    SALES_DELETE = "20/hour"

    # ==================== 现金流模块 ====================
    CASHFLOW_DELETE = "20/hour"

    # ==================== 营销管理模块 ====================
    MARKETING_CREATE = "100/hour"
    MARKETING_UPDATE = "100/hour"
    MARKETING_DELETE = "20/hour"

    # ==================== 投资管理（跟投管理）模块 ====================
    INVESTMENT_CREATE = "100/hour"
    INVESTMENT_UPDATE = "100/hour"
    INVESTMENT_DELETE = "20/hour"
    INVESTMENT_EXPORT = "10/hour"
    INVESTMENT_INVESTOR_WRITE = "200/hour"
    INVESTMENT_SETTLE = "50/hour"

    # ==================== 线索管理模块 ====================
    LEAD_UPDATE = "100/hour"
    LEAD_DELETE = "20/hour"

    # ==================== 市场情报模块 ====================
    COMMUNITY_MERGE = "20/hour"
    COMMUNITY_CREATE = "100/hour"
    COMMUNITY_UPDATE = "100/hour"

    # ==================== 监控模块 ====================
    MONITOR_DELETE = "20/hour"

    # ==================== 文件上传模块 ====================
    FILE_UPLOAD = "50/hour"
    CSV_IMPORT = "30/hour"

    # ==================== 推送模块 ====================
    PUSH_API = "10/hour"

    # ==================== C端公开接口 ====================
    PUBLIC_PROFILE_UPDATE = "20/minute"
    PUBLIC_PROFILE_READ = "60/minute"
    PUBLIC_PHONE_UPDATE = "10/hour"
    PUBLIC_PHONE_CREATE = "10/hour"
    PUBLIC_PROJECT_LIST = "60/minute"
    PUBLIC_LEAD_CREATE = "10/hour"
    PUBLIC_LEAD_LIST = "60/minute"
    PUBLIC_FILE_UPLOAD = "30/hour"
    PUBLIC_COMMUNITY_SEARCH = "60/minute"
    PUBLIC_REGISTER = "10/hour"
    PUBLIC_LOGOUT = "60/minute"
