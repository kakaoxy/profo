"""共享依赖和配置.

用于避免循环导入.
"""

import ipaddress
import logging
from pathlib import Path

from fastapi import Request
from slowapi import Limiter

from settings import settings

logger = logging.getLogger(__name__)

# 预编译可信代理网段，避免每请求 try/except（PERF203）
# 启动期即校验配置，TRUSTED_PROXIES 拼写错误时 fail loud
_TRUSTED_PROXY_NETWORKS: list[ipaddress.IPv4Network | ipaddress.IPv6Network] = [
    ipaddress.ip_network(entry, strict=False) for entry in settings.trusted_proxies
]

# 启动期校验：Docker 环境下 TRUSTED_PROXIES 应包含 CIDR 网段（如 172.16.0.0/12）
# 否则所有请求共享 Docker 网关 IP 对应的限流桶，导致全站限流或限流失效
if Path("/.dockerenv").exists():
    _has_cidr = any("/" in entry for entry in settings.trusted_proxies)
    if not _has_cidr:
        logger.warning(
            "检测到 Docker 环境但 TRUSTED_PROXIES 未配置网段（如 172.16.0.0/12），"
            "所有限流将共享 Docker 网关 IP，可能导致全站限流或限流失效",
        )


def _is_trusted_proxy(host: str) -> bool:
    """检查 host 是否在可信代理列表中（支持精确 IP 与 CIDR 段）.

    Docker bridge 网络下代理 IP 动态分配，需通过 CIDR 段（如 172.16.0.0/12）
    覆盖；固定 IP 方案在每次 compose up 后会失效。
    """
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(ip in network for network in _TRUSTED_PROXY_NETWORKS)


def _get_client_ip(request: Request) -> str:
    """获取客户端真实 IP.

    仅当直接连接来自可信代理时才读取 X-Forwarded-For，
    防止攻击者伪造 XFF 头绕过速率限制。
    Docker bridge 网络下需通过 TRUSTED_PROXIES 环境变量配置代理网段，
    否则所有请求将共享代理 IP 对应的限流桶。

    XFF 解析采用「从右向左跳过可信代理」策略：
    - 最右侧 IP 由最近一跳可信代理写入（不可被客户端伪造）
    - 持续向左跳过可信代理，第一个非可信 IP 即真实客户端
    - 这避免了「取最左侧 IP」时被攻击者在 XFF 头塞入伪造 IP 绕过限流
      （nginx 默认使用 $proxy_add_x_forwarded_for 会追加而非覆盖客户端 XFF）
    """
    client_host = request.client.host if request.client else "unknown"
    if _is_trusted_proxy(client_host):
        xff = request.headers.get("X-Forwarded-For")
        if xff:
            # 过滤空条目（如 ", 1.2.3.4" 这种异常输入）
            ips = [ip.strip() for ip in xff.split(",") if ip.strip()]
            if ips:
                # 从右向左跳过可信代理，第一个非可信 IP 即真实客户端
                for ip in reversed(ips):
                    if not _is_trusted_proxy(ip):
                        return ip
                # 全部为可信代理（异常情况）— 回退到直连 host
                logger.warning("XFF all trusted proxies, fallback to client_host: %s", client_host)
                return client_host
    return client_host


limiter = Limiter(
    key_func=_get_client_ip,
    default_limits=["200/day", "50/hour"],
    strategy="moving-window",
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
    FILE_UPLOAD = "500/hour"
    CSV_IMPORT = "300/hour"
    # 任务状态查询：前端每 2 秒轮询，120/minute 提供 4 倍余量
    TASK_STATUS_QUERY = "120/minute"

    # ==================== 推送接口模块 ====================
    PUSH_API = "10/hour"

    # ==================== C端公开接口 ====================
    PUBLIC_PROFILE_UPDATE = "20/minute"
    PUBLIC_PROFILE_READ = "60/minute"
    PUBLIC_PHONE_UPDATE = "10/hour"
    PUBLIC_PHONE_CREATE = "10/hour"
    PUBLIC_PROJECT_LIST = "60/minute"
    PUBLIC_LEAD_CREATE = "10/hour"
    PUBLIC_LEAD_LIST = "60/minute"
    PUBLIC_FILE_UPLOAD = "300/hour"
    PUBLIC_COMMUNITY_SEARCH = "60/minute"
    PUBLIC_REGISTER = "10/hour"
    PUBLIC_LOGOUT = "60/minute"
