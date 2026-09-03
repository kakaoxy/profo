"""获客中心（跨模块聚合只读层）Pydantic Schemas.

覆盖 4 条分享获客链路（估价/房源预约/房源单/招募）的统一总览、漏斗、
员工排行与统一线索视图。严格与 SQLAlchemy Model 分离，服务层返回 dict，
由路由层映射为本模块响应模型。
"""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GrowthModule(str, Enum):
    """获客模块枚举（4 条分享获客链路）."""

    VALUATION = "valuation"  # 估价留资（leads）
    BOOKING = "booking"  # 房源预约（project_bookings）
    SHEET = "sheet"  # 房源单承接留资（leads，复用估价表）
    RECRUIT = "recruit"  # 区域伙伴招募（recruit_leads）


class UnifiedLeadStatus(str, Enum):
    """统一线索状态枚举（只读映射，不回写各业务线）."""

    NEW = "new"  # 新线索/未处理
    CONTACTED = "contacted"  # 已联系
    HIGH_INTENT = "high_intent"  # 意向高
    CONVERTED = "converted"  # 已转化
    ELIMINATED = "eliminated"  # 已淘汰


class LeadSource(str, Enum):
    """统一来源枚举."""

    CARD = "card"  # 分享卡片
    POSTER = "poster"  # 分享海报（含 timeline）
    DIRECT = "direct"  # 直接进入（referrer 为空）


# ----------------------
# 总览（Overview）
# ----------------------
class GrowthOverviewKpiResponse(BaseModel):
    """获客总览 KPI 响应."""

    today_leads: int = Field(description="今日线索数（4 链路今日留资合计，Asia/Shanghai 自然日）")
    pending_followups: int = Field(description="待跟进数（统一状态=new 的未处理量）")
    valid_new_customers: int = Field(description="有效新客数（近 30 天留资，剔除 is_internal）")
    conversion_rate: float | None = Field(
        description="整体转化率（%）＝有效新客 ÷ 分享次数（近 30 天），分享次数为 0 时为 null",
    )


class SourceBreakdownItem(BaseModel):
    """线索来源构成单项."""

    module: GrowthModule = Field(description="获客模块")
    count: int = Field(description="线索数")
    percent: float | None = Field(description="占比（%），总数为 0 时为 null")


class SourceBreakdownResponse(BaseModel):
    """线索来源构成响应."""

    days: int = Field(description="统计窗口天数")
    total: int = Field(description="4 模块线索总数")
    items: list[SourceBreakdownItem] = Field(description="各模块线索数与占比")


class TrendPoint(BaseModel):
    """逐日线索趋势点."""

    date: str = Field(description="日期（YYYY-MM-DD，Asia/Shanghai 自然日）")
    count: int = Field(description="当日线索数（4 链路合计）")


class TrendResponse(BaseModel):
    """逐日线索趋势响应（窗口内无数据日期补 0）."""

    days: int = Field(description="统计窗口天数")
    points: list[TrendPoint] = Field(description="逐日线索数数组")


# ----------------------
# 漏斗（Funnel）
# ----------------------
class FunnelStep(BaseModel):
    """漏斗单级."""

    key: str = Field(description="级别标识（share/pv/uv/deep_view/clicked_auth/leads 等）")
    label: str = Field(description="级别名称")
    value: int = Field(description="数值")
    conversion: float | None = Field(description="相对上一级转化率（%），上一级为 0 时为 null")


class FunnelResponse(BaseModel):
    """单模块漏斗响应."""

    module: GrowthModule = Field(description="获客模块")
    days: int = Field(description="统计窗口天数")
    uv_metric: str = Field(description="UV 口径标识（recruit=openid_hash，其余=visitor_id）")
    notes: str = Field(description="口径说明文案")
    steps: list[FunnelStep] = Field(description="漏斗各级（数值 + 相对上一级转化率）")


class FunnelCompareModuleRow(BaseModel):
    """漏斗对比单模块行（share 为基准 100%）."""

    module: GrowthModule = Field(description="获客模块")
    share_count: int = Field(description="分享次数（对比基准）")
    uv: int = Field(description="打开 UV")
    uv_percent: float | None = Field(
        description="打开 UV 占分享次数百分比（%，真实值，可 >100，由前端封顶渲染）",
    )
    leads: int = Field(description="留资/预约/承接留资数")
    leads_percent: float | None = Field(description="留资数占分享次数百分比（%）")


class FunnelCompareResponse(BaseModel):
    """四模块漏斗并排对比响应."""

    days: int = Field(description="统计窗口天数")
    notes: str = Field(description="口径说明文案（含 UV 口径差异与封顶渲染说明）")
    modules: list[FunnelCompareModuleRow] = Field(description="各模块对比行")


# ----------------------
# 员工排行 / 下钻（Employees）
# ----------------------
class EmployeeTopItem(BaseModel):
    """员工获客排行单项."""

    employee_id: str = Field(description="员工ID")
    employee_name: str | None = Field(description="员工名称（nickname 缺失回退 username）")
    share_count: int = Field(description="分享次数（4 模块合计）")
    lead_count: int = Field(description="分享归因线索数（4 模块合计）")
    conversion_rate: float | None = Field(description="转化率（%）＝线索数 ÷ 分享次数，分享为 0 时为 null")


class EmployeeTopResponse(BaseModel):
    """员工获客 TOP 榜响应."""

    days: int = Field(description="统计窗口天数")
    limit: int = Field(description="返回条数上限")
    items: list[EmployeeTopItem] = Field(description="按归因线索数倒序的员工 TOP")


class EmployeeDrilldownRow(BaseModel):
    """员工维度漏斗下钻单行.

    ``employee_id`` 为 null 表示未归因（referrer/分享人为空的事件聚合行），
    用于保证各行合计与该模块漏斗一致。
    """

    employee_id: str | None = Field(description="员工ID（未归因聚合行为 null）")
    employee_name: str | None = Field(description="员工名称（未归因行为 null）")
    steps: list[FunnelStep] = Field(description="该员工在漏斗各级的数值")


class EmployeeDrilldownResponse(BaseModel):
    """员工维度漏斗下钻响应（各行合计与单模块漏斗一致）."""

    module: GrowthModule = Field(description="获客模块")
    days: int = Field(description="统计窗口天数")
    uv_metric: str = Field(description="UV 口径标识")
    notes: str = Field(description="口径说明文案")
    items: list[EmployeeDrilldownRow] = Field(description="按首级（分享）倒序的员工行")


# ----------------------
# 统一线索（Leads）
# ----------------------
class UnifiedLeadListItem(BaseModel):
    """统一线索列表项（手机号脱敏）."""

    id: str = Field(description="线索ID（各模块原生ID转字符串）")
    module: GrowthModule = Field(description="获客模块")
    unified_status: UnifiedLeadStatus = Field(description="统一状态（只读映射，不回写）")
    native_status: str = Field(description="模块原生状态值")
    phone_masked: str | None = Field(description="脱敏手机号（估价线索无手机号为 null）")
    employee_id: str | None = Field(description="归属员工ID（referrer）")
    employee_name: str | None = Field(description="归属员工名称")
    source: LeadSource | None = Field(
        description="来源（card/poster/direct）；估价/预约/房源单归因线索的分享方式未埋点为 null",
    )
    created_at: datetime = Field(description="留资时间")
    campaign_name: str | None = Field(description="来源活动名（仅招募有，其余 null）")
    is_internal: bool = Field(description="是否内部员工（仅招募可标记，其余恒为 false）")


class UnifiedLeadListResponse(BaseModel):
    """统一线索分页列表响应."""

    items: list[UnifiedLeadListItem]
    total: int
    page: int
    page_size: int


class TimelineEvent(BaseModel):
    """归因链路时间线事件."""

    event: str = Field(description="事件标识（share/visit/deep_view/lead_submit）")
    label: str = Field(description="事件名称")
    occurred: bool = Field(description="是否发生/已埋点（未发生为 false）")
    occurred_at: datetime | None = Field(description="事件时间（未发生为 null）")
    share_type: str | None = Field(default=None, description="分享方式（share 事件）")
    source: str | None = Field(default=None, description="进入渠道（visit 事件）")
    stayed_ms: int | None = Field(default=None, description="停留毫秒（deep_view 事件）")


class LeadDetailResponse(BaseModel):
    """统一线索详情响应（归因时间线 + 模块差异化字段）."""

    id: str
    module: GrowthModule
    unified_status: UnifiedLeadStatus
    native_status: str
    phone_masked: str | None
    employee_id: str | None
    employee_name: str | None
    source: LeadSource | None
    created_at: datetime
    campaign_name: str | None
    is_internal: bool
    timeline: list[TimelineEvent] = Field(description="归因链路时间线（按时间排序）")

    # 模块差异化字段（估价）
    community_name: str | None = Field(default=None, description="小区名称（估价）")
    area: float | None = Field(default=None, description="面积㎡（估价）")
    layout: str | None = Field(default=None, description="户型（估价）")
    total_price: float | None = Field(default=None, description="当前授权总价万（估价）")
    eval_price: float | None = Field(default=None, description="评估价格万（估价）")
    expected_price: float | None = Field(default=None, description="业主心理预期价万（估价）")

    # 模块差异化字段（预约）
    property_title: str | None = Field(default=None, description="房源名称（预约）")
    booking_time: datetime | None = Field(default=None, description="预约时间（预约）")

    # 模块差异化字段（房源单）
    sheet_code: str | None = Field(default=None, description="来源房源单短码（取不到为 null）")

    # 模块差异化字段（招募）
    main_business_area: str | None = Field(default=None, description="主营商圈（招募）")

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# 小程序「我的客户」（My Customers，员工侧聚合）
# ----------------------
class MyCustomerListItem(BaseModel):
    """我的客户列表项（归属收窄为当前员工，手机号脱敏）."""

    id: str = Field(description="线索ID（各模块原生ID转字符串）")
    module: GrowthModule = Field(description="获客模块")
    unified_status: UnifiedLeadStatus = Field(description="统一状态")
    native_status: str = Field(description="模块原生状态值")
    phone_masked: str | None = Field(description="脱敏手机号（无手机号为 null）")
    source: LeadSource | None = Field(
        description="来源（card/poster/direct）；估价/预约/房源单归因线索的分享方式未埋点为 null",
    )
    created_at: datetime = Field(description="留资时间")
    campaign_name: str | None = Field(default=None, description="来源活动名（仅招募，其余 null）")

    # 模块差异摘要字段（估价/房源单共用 leads 表）
    community_name: str | None = Field(default=None, description="小区名称（估价/房源单）")
    layout: str | None = Field(default=None, description="户型（估价/房源单）")
    area: float | None = Field(default=None, description="面积㎡（估价/房源单）")
    expected_price: float | None = Field(default=None, description="业主心理预期价万（估价/房源单）")
    # 模块差异摘要字段（预约）
    property_title: str | None = Field(default=None, description="房源名称（预约）")
    booking_time: datetime | None = Field(default=None, description="预约时间（预约）")
    # 模块差异摘要字段（房源单；分页后回表解析，详见服务层）
    sheet_code: str | None = Field(default=None, description="来源房源单短码（取不到为 null）")
    sheet_item_count: int | None = Field(default=None, description="来源房源单共 N 套房源（取不到为 null）")
    # 模块差异摘要字段（招募）
    main_business_area: str | None = Field(default=None, description="主营商圈（招募）")


class MyCustomerListResponse(BaseModel):
    """我的客户分页列表响应."""

    items: list[MyCustomerListItem]
    total: int = Field(description="当前筛选条件下总数")
    page: int
    page_size: int
    module_counts: dict[GrowthModule, int] = Field(
        description="各模块线索计数（该用户全部线索口径，不受当前筛选影响）",
    )
    status_counts: dict[UnifiedLeadStatus, int] = Field(
        description="各统一状态线索计数（该用户全部线索口径，不受当前筛选影响）",
    )


class MyCustomerBadgeResponse(BaseModel):
    """我的客户角标响应（统一状态为 new 的计数）."""

    new_count: int = Field(description="统一状态 new 的线索数")


class MyCustomerShareStatsResponse(BaseModel):
    """我的客户分享统计响应（4 链路求和，字段口径与各线 my/share-stats 一致）."""

    share_count: int = Field(description="累计分享次数（4 链路合计）")
    pv: int = Field(description="累计经我分享的打开次数 PV（4 链路合计）")
    uv: int = Field(description="累计打开人数 UV（4 链路求和，招募=openid_hash 口径，其余=匿名 visitor_id）")
    lead_count: int = Field(description="累计归属我的线索数（4 链路合计）")
    yesterday_share_count: int = Field(description="昨日分享次数")
    yesterday_pv: int = Field(description="昨日经我分享的打开次数 PV")
    yesterday_uv: int = Field(description="昨日打开人数 UV")
    yesterday_lead_count: int = Field(description="昨日归属我的线索数")


class MyCustomerSubscribeTemplateResponse(BaseModel):
    """我的客户订阅消息模板配置响应（二期推送预留，当前仅用于小程序端订阅授权）."""

    template_id: str | None = Field(description="订阅消息模板ID（未配置为 null）")


class MyCustomerDetailResponse(LeadDetailResponse):
    """我的客户线索详情响应.

    字段复用统一线索详情（归因时间线 + 模块差异化字段），独立 schema 名
    便于 openapi/前端类型区分；归属校验（referrer=当前员工）在服务层强制。
    """


class MyCustomerPhoneResponse(BaseModel):
    """我的客户完整手机号响应.

    招募线查看即视为已联系（new→contacted 隐式流转），其余线状态不变；
    status 恒为查看后的最新统一状态。
    """

    phone: str | None = Field(description="完整手机号（解密）")
    unified_status: UnifiedLeadStatus = Field(description="查看后的统一状态")
    native_status: str = Field(description="查看后的模块原生状态值")


class MyCustomerStatusUpdateRequest(BaseModel):
    """我的客户状态流转请求（触发动作类，*Request 后缀）."""

    status: UnifiedLeadStatus = Field(description="目标统一状态")
    remark: str | None = Field(default=None, max_length=500, description="流转备注（非空时自动落一条系统跟进记录）")
    reason: Literal["no_intent", "invalid_info", "lost_to_competitor"] | None = Field(
        default=None,
        description="淘汰原因（仅 status=eliminated 时必填）",
    )


class MyCustomerStatusUpdateResponse(BaseModel):
    """我的客户状态流转响应（返回流转后的最新状态）."""

    unified_status: UnifiedLeadStatus = Field(description="流转后的统一状态")
    native_status: str = Field(description="流转后的模块原生状态值")


class AdminLeadPhoneResponse(BaseModel):
    """管理端线索完整手机号响应.

    recruit/booking 返回解密原生号码，valuation/sheet 返回 creator 手机号；
    查看不改变任何线索状态（区别于 C 端「查看即联系」）。
    """

    phone: str = Field(description="完整手机号（解密）")


class CustomerFollowUpCreate(BaseModel):
    """我的客户跟进记录创建请求."""

    content: str = Field(min_length=1, max_length=500, description="跟进内容（1-500 字符）")


class MyCustomerFollowUpItem(BaseModel):
    """我的客户跟进记录项."""

    id: str
    module: GrowthModule
    lead_id: str = Field(description="线索ID（各模块主键转字符串）")
    content: str
    created_by_id: str = Field(description="跟进人ID")
    created_by_name: str | None = Field(description="跟进人名称（nickname 缺失回退 username）")
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


__all__ = [
    "AdminLeadPhoneResponse",
    "CustomerFollowUpCreate",
    "EmployeeDrilldownResponse",
    "EmployeeDrilldownRow",
    "EmployeeTopItem",
    "EmployeeTopResponse",
    "FunnelCompareModuleRow",
    "FunnelCompareResponse",
    "FunnelResponse",
    "FunnelStep",
    "GrowthModule",
    "GrowthOverviewKpiResponse",
    "LeadDetailResponse",
    "LeadSource",
    "MyCustomerBadgeResponse",
    "MyCustomerDetailResponse",
    "MyCustomerFollowUpItem",
    "MyCustomerListItem",
    "MyCustomerListResponse",
    "MyCustomerPhoneResponse",
    "MyCustomerShareStatsResponse",
    "MyCustomerStatusUpdateRequest",
    "MyCustomerStatusUpdateResponse",
    "MyCustomerSubscribeTemplateResponse",
    "SourceBreakdownItem",
    "SourceBreakdownResponse",
    "TimelineEvent",
    "TrendPoint",
    "TrendResponse",
    "UnifiedLeadListItem",
    "UnifiedLeadListResponse",
    "UnifiedLeadStatus",
]
