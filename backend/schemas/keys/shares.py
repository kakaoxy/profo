"""小程序员工端钥匙分享 Schema."""

from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator

# 无时区输入统一按东八区解析（与 schemas/project/sales.py 同口径）：
# 服务层以 utc_now()（tz-aware）比较 expires_at，naive 值与后者比较会抛 TypeError。
_CST = ZoneInfo("Asia/Shanghai")


def _attach_cst_if_naive(value: datetime | None) -> datetime | None:
    """无时区输入按东八区解析（显式带时区的输入原样保留，None 原样返回）."""
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=_CST)


class KeysPropertyItem(BaseModel):
    """我可操作的房源 + 钥匙徽章聚合（不显密文）."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    name: str
    community_name: str
    address: str
    status: str | None = None
    area: Decimal | None = None
    manager_key_set: bool = False
    normal_active_count: int = 0
    normal_pending_count: int = 0
    normal_disabled_count: int = 0
    active_share_count: int = 0
    total_view_count: int = 0


class KeysPropertiesResponse(BaseModel):
    """我可操作的房源列表."""

    items: list[KeysPropertyItem]


class KeysSummaryPeriod(BaseModel):
    """当前「周二周期」窗口（东八区日期，供 ⓘ 弹层展示）."""

    start: date  # 窗口起点日期（周二）
    end: date  # 窗口终点日期（下周一，含当日 24:00）
    text: str  # 展示文案「MM-DD 周X ~ MM-DD 周X · 剩 N 天」


class KeysSummaryResponse(BaseModel):
    """钥匙管理指标 hero 区聚合（列表页页首三指标 + 周期新增）.

    统计范围 = 当前用户可见房源（admin 全量 / 相关人仅关联房源，与
    /keys/properties 同权限口径）；「有钥匙」= 管理密码已设或 ≥1 组有效普通密码。
    """

    properties_with_keys: int = 0  # 有钥匙的房源数（总量）
    shares_total: int = 0  # 钥匙分享累计创建数（含过期/已回收）
    views_total: int = 0  # 钥匙被查看累计次数（按查看记录条数）
    period_new_properties: int = 0  # 本周期内首次录入有效密码的房源数
    period_new_shares: int = 0  # 本周期内新建的分享数
    period_new_views: int = 0  # 本周期内新增的查看次数
    period: KeysSummaryPeriod


class KeyShareCreateItem(BaseModel):
    """分享条目：一套房源 + 选中的一组有效普通密码."""

    project_id: UUID
    key_id: UUID


class KeyShareCreateRequest(BaseModel):
    """生成分享请求（有效期默认 1 天）."""

    items: list[KeyShareCreateItem] = Field(min_length=1, max_length=50)
    expires_in_days: int | None = Field(
        None, ge=1, le=365, description="有效期天数（自然日口径：当日为第 1 天，第 N 天 24 点失效）"
    )
    expires_at: datetime | None = Field(None, description="自定义失效时间，与 expires_in_days 二选一")

    @field_validator("expires_at", mode="after")
    @classmethod
    def _expires_at_cst(cls, v: datetime | None) -> datetime | None:
        """无时区输入按东八区解析（显式带时区原样保留）."""
        return _attach_cst_if_naive(v)


class KeyShareCreatedResponse(BaseModel):
    """生成分享成功响应."""

    id: UUID
    token: str
    expires_at: datetime


class KeyShareListItem(BaseModel):
    """分享记录列表条目."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    token: str
    status: str  # active | revoked
    is_expired: bool  # 派生态：active && expires_at < now
    community_names: list[str]  # 分享条目涉及房源的小区名（与条目顺序一致，脏条目跳过）
    items_count: int
    viewed_count: int  # 已查看条目数 n
    viewer_names: list[str]
    expires_at: datetime
    created_at: datetime
    revoked_at: datetime | None = None


class KeyShareListResponse(BaseModel):
    """分享记录列表."""

    items: list[KeyShareListItem]


class KeyShareDetailItem(BaseModel):
    """分享详情逐房源条目."""

    model_config = ConfigDict(from_attributes=True)

    project_id: UUID
    project_name: str
    address: str
    key_note: str | None = None  # 该房源的带看注意事项（与经纪人端 PublicKeyShareItem 同口径）
    key_id: UUID
    key_deleted: bool  # 密码组已删除或已停用 → 分享页显示「密码已失效」
    viewed: bool
    last_viewed_at: datetime | None = None
    viewer_names: list[str] = []


class KeyShareTimelineItem(BaseModel):
    """查看记录时间线条目."""

    model_config = ConfigDict(from_attributes=True)

    time: datetime
    action: str  # share_create/open_share/agent_view/share_revoke/share_extend/share_expire
    actor_type: str
    actor_name: str | None = None
    project_name: str | None = None
    detail: dict | None = None


class KeyShareDetailResponse(BaseModel):
    """分享详情（分享人视角）."""

    id: UUID
    token: str
    status: str
    is_expired: bool
    expires_at: datetime
    created_at: datetime
    revoked_at: datetime | None = None
    sharer_name: str
    items: list[KeyShareDetailItem]
    timeline: list[KeyShareTimelineItem]


class KeyShareExtendRequest(BaseModel):
    """延长有效期请求."""

    expires_in_days: int | None = Field(None, ge=1, le=365, description="延长天数")
    expires_at: datetime | None = Field(None, description="自定义新失效时间，与 expires_in_days 二选一")

    @field_validator("expires_at", mode="after")
    @classmethod
    def _expires_at_cst(cls, v: datetime | None) -> datetime | None:
        """无时区输入按东八区解析（显式带时区原样保留）."""
        return _attach_cst_if_naive(v)


class KeyShareActionResponse(BaseModel):
    """回收/延长等动作响应."""

    id: UUID
    status: str
    expires_at: datetime
    revoked_at: datetime | None = None
