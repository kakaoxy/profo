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

    XFF 解析采用「从右向左跳过可信代理」策略：
    - 最右侧 IP 由最近一跳可信代理写入（不可被客户端伪造）
    - 持续向左跳过可信代理，第一个非可信 IP 即真实客户端
    - 这避免了「取最左侧 IP」时被攻击者在 XFF 头塞入伪造 IP 绕过限流
      （nginx 默认使用 $proxy_add_x_forwarded_for 会追加而非覆盖客户端 XFF）

    无论 request.client.host 是否为可信代理，只要 XFF 存在就执行解析：
    Docker 生产环境 uvicorn --forwarded-allow-ips "*" 会用 XFF 最左侧值覆盖
    request.client.host，此时基于 client_host 的 gate 校验失效；右向左解析
    可抵御最左侧伪造。部署保证 backend 仅绑定 127.0.0.1（nginx 独占可达），
    XFF 必经 nginx，故无需再以 client_host 作为信任前置.
    """
    client_host = request.client.host if request.client else "unknown"
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        # 过滤空条目（如 ", 1.2.3.4" 这种异常输入）
        ips = [ip.strip() for ip in xff.split(",") if ip.strip()]
        if ips:
            # 从右向左跳过可信代理，第一个非可信 IP 即真实客户端
            for ip in reversed(ips):
                if not _is_trusted_proxy(ip):
                    return ip
            # XFF 全为可信代理 — 回退到直连 host
            # 本地开发或单层代理场景下常见（Next.js dev server 转发请求时 XFF
            # 中只有本地回环 IP），并非真正异常，降级为 DEBUG 避免刷屏。
            # 真正的 XFF 污染攻击会通过其他机制（限流异常等）发现。
            logger.debug("XFF all trusted proxies, fallback to client_host: %s", client_host)
            return client_host
    return client_host


limiter = Limiter(
    key_func=_get_client_ip,
    # 默认限流：仅作用于未显式配置 limit 的端点（主要为 GET 查询/列表/详情）。
    # 调高至不影响人工批量录入历史数据：600/minute 足够多人共享出口 IP 协同操作，
    # 6000/hour 保证一天业务不受影响。安全敏感端点已在 RateLimits 中显式覆盖。
    default_limits=["6000/hour", "600/minute"],
    strategy="moving-window",
    storage_uri=settings.redis_url,  # Redis 后端，多 worker 一致
    in_memory_fallback_enabled=True,  # Redis 宕机时降级到进程内限流，避免全站 500
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
    AUTH_LOGOUT = "60/minute"
    AUTH_API_KEY_DELETE = "20/hour"
    AUTH_API_KEY_CREATE = "20/hour"

    # ==================== 用户管理模块 ====================
    # USER_CREATE/RESET/CHANGE_PASSWORD/INIT_DATA 为安全敏感操作，保持严格
    USER_LIST = "120/minute"
    USER_CREATE = "10/hour"
    USER_UPDATE = "500/hour"
    USER_DELETE = "100/hour"
    USER_RESET_PASSWORD = "5/hour"  # noqa: S105
    USER_CHANGE_PASSWORD = "3/minute"  # noqa: S105
    USER_UNBIND_WECHAT = "20/hour"
    USER_INIT_DATA = "3/hour"

    # ==================== 角色管理模块 ====================
    ROLE_UPDATE = "500/hour"
    ROLE_DELETE = "100/hour"

    # ==================== 项目管理模块 ====================
    PROJECT_CREATE = "1000/hour"
    PROJECT_EXPORT = "60/hour"
    PROJECT_UPDATE = "1000/hour"
    PROJECT_DELETE = "200/hour"
    PROJECT_STATUS_UPDATE = "1000/hour"
    PROJECT_BANK_CARD = "60/hour"  # 银行卡号为敏感金融数据，独立限流

    # ==================== 装修管理模块 ====================
    RENOVATION_UPDATE = "1000/hour"
    RENOVATION_DELETE = "200/hour"

    # ==================== 销售管理模块 ====================
    SALES_UPDATE = "1000/hour"
    SALES_DELETE = "200/hour"

    # ==================== 现金流模块 ====================
    CASHFLOW_DELETE = "200/hour"

    # ==================== 科目管理模块 ====================
    # 科目为财务配置表，写操作低频；删除需更严格限流防误操作
    SUBJECT_WRITE = "100/hour"
    SUBJECT_DELETE = "20/hour"

    # ==================== 营销管理模块 ====================
    MARKETING_CREATE = "1000/hour"
    MARKETING_UPDATE = "1000/hour"
    MARKETING_DELETE = "200/hour"

    # ==================== 投资管理（跟投管理）模块 ====================
    INVESTMENT_CREATE = "1000/hour"
    INVESTMENT_UPDATE = "1000/hour"
    INVESTMENT_DELETE = "200/hour"
    INVESTMENT_EXPORT = "60/hour"
    INVESTMENT_INVESTOR_WRITE = "1000/hour"
    INVESTMENT_SETTLE = "500/hour"

    # ==================== 线索管理模块 ====================
    LEAD_UPDATE = "1000/hour"
    LEAD_DELETE = "200/hour"

    # ==================== 市场情报模块 ====================
    # COMMUNITY_MERGE 为高危操作，保持严格
    COMMUNITY_MERGE = "20/hour"
    COMMUNITY_CREATE = "1000/hour"
    COMMUNITY_UPDATE = "1000/hour"
    # 小区户型图库：上传复用 FILE_UPLOAD，删除/编辑低频
    COMMUNITY_IMAGE_UPDATE = "1000/hour"
    COMMUNITY_IMAGE_DELETE = "200/hour"

    # ==================== 监控模块 ====================
    MONITOR_DELETE = "200/hour"

    # ==================== 文件上传模块 ====================
    FILE_UPLOAD = "2000/hour"
    CSV_IMPORT = "1000/hour"
    # 任务状态查询：前端每 2 秒轮询，120/minute 提供 4 倍余量
    TASK_STATUS_QUERY = "120/minute"

    # ==================== 推送接口模块 ====================
    # 推送接口使用 API Key 认证，受信任客户端；单次最多 1000 条，每小时 1000 次
    # 理论上限 100 万条/小时，覆盖业主实际批量推送需求
    PUSH_API = "1000/hour"

    # ==================== C端公开接口 ====================
    PUBLIC_PROFILE_UPDATE = "20/minute"
    PUBLIC_PROFILE_READ = "60/minute"
    PUBLIC_PHONE_UPDATE = "10/hour"
    PUBLIC_PHONE_CREATE = "10/hour"
    PUBLIC_PHONE_WECHAT = "10/hour"
    PUBLIC_USER_MERGE = "10/hour"
    PUBLIC_PROJECT_LIST = "60/minute"
    PUBLIC_LEAD_CREATE = "10/hour"
    PUBLIC_LEAD_LIST = "60/minute"
    # 「我的分享统计」：估价/房源/房源单/招募四链路共用的登录态读取端点，
    # 单请求触发多表聚合查询，收敛频次防刷（对齐 PUBLIC_LEAD_LIST 读取量级）
    PUBLIC_MY_SHARE_STATS = "60/minute"
    # 房源预约：创建与线索提交同量级收敛防刷，列表为高频读取
    PUBLIC_BOOKING_CREATE = "10/hour"
    PUBLIC_BOOKING_LIST = "60/minute"
    PUBLIC_FILE_UPLOAD = "300/hour"
    PUBLIC_COMMUNITY_SEARCH = "60/minute"
    PUBLIC_COMMUNITY_ANALYSIS = "60/minute"
    PUBLIC_REGISTER = "10/hour"
    PUBLIC_LOGOUT = "60/minute"

    # ==================== 招募计划 C 端接口 ====================
    # 访问埋点：C 端进入/离开高频，限流放宽；留资提交涉及微信解密，收敛频次
    RECRUIT_VISIT = "120/minute"
    RECRUIT_LEAD_SUBMIT = "10/hour"
    RECRUIT_SHARE = "60/minute"
    RECRUIT_QR_SCENE = "120/minute"
    # 员工生成小程序码：每次调用微信接口生成图片，收敛频次防刷
    RECRUIT_QR_GENERATE = "20/hour"
    # 查看线索完整手机号：隐私敏感数据，收敛频次防遍历爬取
    RECRUIT_PHONE_VIEW = "30/minute"

    # ==================== 房源/评估分享埋点 C 端接口 ====================
    # 访问埋点免登录高频，分享事件需登录，量级对齐 RECRUIT_* 同类端点
    PROJECT_VISIT = "120/minute"
    PROJECT_SHARE = "60/minute"
    VALUATION_VISIT = "120/minute"
    VALUATION_SHARE = "60/minute"
    # 订阅模板 ID 下发：纯内存配置读取，每次估价页 onLoad 触发一次，防恶意刷接口
    VALUATION_SUBSCRIBE_TEMPLATE = "60/minute"

    # ==================== 房源单（多房源分享）C 端接口 ====================
    # 量级对齐 RECRUIT_*/PROJECT_* 同类端点：qr 解析与访问埋点免登录高频，
    # 详情/consultant/mine 共用读取限流，qrcode 每次实时调微信接口需收敛防刷；
    # 创建需登录但有 1 主表+最多 10 明细的写放大，显式收敛（不落默认限流）
    PROPERTY_SHEET_CREATE = "30/minute"
    PROPERTY_SHEET_QR_SCENE = "120/minute"
    PROPERTY_SHEET_VISIT = "120/minute"
    PROPERTY_SHEET_DETAIL = "60/minute"
    PROPERTY_SHEET_SHARE = "60/minute"
    PROPERTY_SHEET_QRCODE = "20/hour"
