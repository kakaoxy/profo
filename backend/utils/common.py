"""共享依赖和配置.

用于避免循环导入.
"""

from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(
    key_func=get_remote_address,
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

    # ==================== 线索管理模块 ====================
    LEAD_UPDATE = "100/hour"
    LEAD_DELETE = "20/hour"

    # ==================== 市场情报模块 ====================
    COMMUNITY_MERGE = "20/hour"
    COMMUNITY_CREATE = "100/hour"

    # ==================== 监控模块 ====================
    MONITOR_DELETE = "20/hour"

    # ==================== 文件上传模块 ====================
    FILE_UPLOAD = "50/hour"
    CSV_IMPORT = "30/hour"

    # ==================== C端公开接口 ====================
    PUBLIC_PROFILE_UPDATE = "20/minute"
    PUBLIC_PROFILE_READ = "60/minute"
    PUBLIC_PHONE_UPDATE = "10/hour"
    PUBLIC_PHONE_CREATE = "10/hour"
    PUBLIC_PROJECT_LIST = "60/minute"
    PUBLIC_LEAD_CREATE = "10/hour"
    PUBLIC_LEAD_LIST = "60/minute"
    PUBLIC_COMMUNITY_SEARCH = "60/minute"
    PUBLIC_REGISTER = "10/hour"
    PUBLIC_LOGOUT = "60/minute"
