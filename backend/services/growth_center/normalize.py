"""获客中心归一规则与口径常量.

4 条分享获客链路（估价/房源预约/房源单/招募）的统一映射规则，
全部为只读口径，不回写各业务线。
"""

from datetime import datetime, timedelta

from models.common.base import LeadStatus
from schemas.growth_center import GrowthModule, LeadSource, UnifiedLeadStatus

# ─── 状态映射（unified_status，只读） ────────────────────────────────────────

# 估价 LeadStatus → 统一状态（房源单承接估价 leads，状态映射同估价）
VALUATION_STATUS_TO_UNIFIED: dict[LeadStatus, UnifiedLeadStatus] = {
    LeadStatus.PENDING_ASSESSMENT: UnifiedLeadStatus.NEW,
    LeadStatus.PENDING_VISIT: UnifiedLeadStatus.CONTACTED,
    LeadStatus.VISITED: UnifiedLeadStatus.HIGH_INTENT,
    LeadStatus.SIGNED: UnifiedLeadStatus.CONVERTED,
    LeadStatus.REJECTED: UnifiedLeadStatus.ELIMINATED,
    LeadStatus.LOST_TO_COMPETITOR: UnifiedLeadStatus.ELIMINATED,
}

# 预约原生即统一态（project_bookings.status 直接存储统一 5 态值）
# 招募 RecruitLeadStatus 原生即统一态（new/contacted/high_intent/converted/eliminated）
# 统一状态字符串集合（用于 SQL case 输出与筛选校验）
UNIFIED_STATUS_VALUES: frozenset[str] = frozenset(s.value for s in UnifiedLeadStatus)

# ─── 来源枚举 ────────────────────────────────────────────────────────────────

# share_type → 统一来源：card→卡片、poster/timeline→海报；referrer 为空→直接进入
SHARE_TYPE_TO_SOURCE: dict[str, LeadSource] = {
    "card": LeadSource.CARD,
    "poster": LeadSource.POSTER,
    "timeline": LeadSource.POSTER,
}
SOURCE_DIRECT = LeadSource.DIRECT


def normalize_source(share_type: str | None) -> LeadSource | None:
    """归一分享方式为统一来源枚举.

    Args:
        share_type: 分享方式原始值（card/poster/timeline）

    Returns:
        统一来源；无法识别时为 None

    """
    if share_type is None:
        return None
    return SHARE_TYPE_TO_SOURCE.get(share_type)


# ─── UV 口径 ─────────────────────────────────────────────────────────────────

UV_METRIC_RECRUIT = "openid_hash"  # 招募：登录态 openid_hash 去重
UV_METRIC_ANONYMOUS = "visitor_id"  # 其余模块：匿名 visitor_id 去重

UV_METRIC_BY_MODULE: dict[GrowthModule, str] = {
    GrowthModule.RECRUIT: UV_METRIC_RECRUIT,
    GrowthModule.VALUATION: UV_METRIC_ANONYMOUS,
    GrowthModule.BOOKING: UV_METRIC_ANONYMOUS,
    GrowthModule.SHEET: UV_METRIC_ANONYMOUS,
}

# ─── referrer 字段名差异（各模块归因字段） ───────────────────────────────────

REFERRER_FIELD_BY_MODULE: dict[GrowthModule, str] = {
    GrowthModule.VALUATION: "referrer_id",  # leads.referrer_id
    GrowthModule.SHEET: "referrer_id",  # leads.referrer_id（承接续传）
    GrowthModule.BOOKING: "referrer_user_id",  # project_bookings.referrer_user_id
    GrowthModule.RECRUIT: "referrer_employee_id",  # recruit_leads.referrer_employee_id
}

# ─── 模块归类规则 ────────────────────────────────────────────────────────────

# 房源单承接估价 leads（referrer 续传）：leads 表内无模块字段，
# 以 source_property_id（关联房源ID）非空作为「房源单承接」判别；为空视为估价线索。
# leads 表无 is_internal 字段（不要臆造），归一后恒为 False；招募以表内字段为准。


def map_valuation_status(status: LeadStatus) -> UnifiedLeadStatus:
    """估价/房源单原生状态 → 统一状态.

    Args:
        status: 估价线索原生状态

    Returns:
        统一线索状态；未知取值归为 new（防御分支，枚举全覆盖时不可达）

    """
    return VALUATION_STATUS_TO_UNIFIED.get(status, UnifiedLeadStatus.NEW)


def to_unified_status(module: GrowthModule, native_status: str) -> UnifiedLeadStatus:
    """模块原生状态字符串 → 统一状态.

    Args:
        module: 获客模块
        native_status: 原生状态值（枚举的 .value）

    Returns:
        统一线索状态

    """
    if module in (GrowthModule.BOOKING, GrowthModule.RECRUIT):
        # 预约/招募原生状态即统一 5 态（booking 存统一态值，recruit 枚举值同构）
        return UnifiedLeadStatus(native_status)
    return map_valuation_status(LeadStatus(native_status))


# ─── 时间窗口口径 ────────────────────────────────────────────────────────────


class Window:
    """统计时间窗口（左闭右开 [start, end)，Asia/Shanghai 自然日对齐）."""

    __slots__ = ("days", "end", "start")

    def __init__(self, days: int, start: datetime, end: datetime) -> None:
        self.days = days
        self.start = start
        self.end = end


def resolve_window(days: int, *, now: datetime | None = None) -> Window:
    """解析「近 N 天」窗口（含今日，Asia/Shanghai 自然日，左闭右开）.

    与 ``utils.time_windows.cst_today_start`` 口径一致：今日线索窗口为
    [今日 00:00, 明日 00:00)，近 N 天窗口向前对齐 N-1 个自然日。

    Args:
        days: 窗口天数（>=1）
        now: 基准时间（缺省取当前 Asia/Shanghai 时间）

    Returns:
        时间窗口对象

    """
    from utils.time_windows import cst_today_start

    if now is None:
        today_start = cst_today_start()
    else:
        from zoneinfo import ZoneInfo

        cst = ZoneInfo("Asia/Shanghai")
        local = now.astimezone(cst)
        today_start = local.replace(hour=0, minute=0, second=0, microsecond=0)
    start = today_start - timedelta(days=days - 1)
    end = today_start + timedelta(days=1)
    return Window(days=days, start=start, end=end)


def today_window() -> Window:
    """今日自然日窗口（Asia/Shanghai，左闭右开）.

    Returns:
        [今日 00:00, 明日 00:00) 窗口

    """
    return resolve_window(days=1)
