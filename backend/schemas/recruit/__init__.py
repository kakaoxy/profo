"""区域伙伴招募计划 Pydantic Schemas.

按 9.4 接口契约划分：活动配置、主营商圈、访问埋点、线索留资、后台线索列表、
跟进状态流转、6 级漏斗。严格与 SQLAlchemy Model 分离。
"""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from models.recruit import (
    RecruitCampaignStatus,
    RecruitLeadSource,
    RecruitLeadStatus,
)


# ----------------------
# Campaign（活动配置）
# ----------------------
class RecruitCampaignCreate(BaseModel):
    """创建招募活动请求."""

    name: str = Field(min_length=1, max_length=100, description="活动名称")
    title: str = Field(min_length=1, max_length=200, description="分享卡片标题")
    image_url: str | None = Field(default=None, max_length=500, description="分享配图 URL（5:4）")
    content: dict | None = Field(default=None, description="详情页内容（权益/要求/福利）")
    poster_bg_url: str | None = Field(default=None, max_length=500, description="海报背景图 URL（二期预留）")
    status: RecruitCampaignStatus = Field(default=RecruitCampaignStatus.ENABLED, description="启用状态")


class RecruitCampaignUpdate(BaseModel):
    """更新招募活动请求（全部可选）."""

    name: str | None = Field(default=None, min_length=1, max_length=100)
    title: str | None = Field(default=None, min_length=1, max_length=200)
    image_url: str | None = Field(default=None, max_length=500)
    content: dict | None = None
    poster_bg_url: str | None = Field(default=None, max_length=500)
    status: RecruitCampaignStatus | None = None


class RecruitCampaignResponse(BaseModel):
    """招募活动响应（后台）."""

    id: str
    name: str
    title: str
    image_url: str | None
    content: dict | None
    poster_bg_url: str | None
    status: RecruitCampaignStatus
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class RecruitCampaignDetailResponse(BaseModel):
    """招募活动详情响应（C 端游客可见，不含内部字段）."""

    id: str
    title: str
    image_url: str | None
    content: dict | None

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Business Area（主营商圈）
# ----------------------
class RecruitBusinessAreaItem(BaseModel):
    """主营商圈选项."""

    name: str = Field(description="商圈名称")
    count: int = Field(description="出现频次")


# ----------------------
# Visit（访问埋点）
# ----------------------
class RecruitVisitCreate(BaseModel):
    """创建访问记录请求."""

    campaign_id: str | None = Field(default=None, max_length=36, description="活动ID")
    referrer: str | None = Field(default=None, max_length=36, description="来源员工ID")
    source: RecruitLeadSource = Field(default=RecruitLeadSource.CARD, description="进入渠道")


class RecruitVisitUpdate(BaseModel):
    """上报离开请求."""

    stayed_ms: int | None = Field(default=None, ge=0, description="停留毫秒")
    is_deep_view: bool = Field(default=False, description="是否深度浏览（stayed_ms>=3000）")
    clicked_auth: bool = Field(default=False, description="是否点击报名且通过校验")


class RecruitVisitResponse(BaseModel):
    """创建访问记录响应."""

    id: str

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Lead（线索留资 / 后台列表 / 状态流转）
# ----------------------
class RecruitLeadCreate(BaseModel):
    """C 端提交留资请求（核心）."""

    code: str = Field(min_length=1, description="微信 getPhoneNumber 授权 code")
    campaign_id: str | None = Field(default=None, max_length=36, description="活动ID")
    main_business_area: str = Field(min_length=1, max_length=50, description="主营商圈（必填）")
    referrer: str | None = Field(default=None, max_length=36, description="来源员工ID")
    source: RecruitLeadSource = Field(default=RecruitLeadSource.CARD, description="来源渠道")
    visit_id: str | None = Field(default=None, max_length=36, description="关联访问记录ID")


class RecruitLeadSubmitResponse(BaseModel):
    """留资提交响应."""

    lead_id: str
    is_new: bool


class RecruitLeadListItem(BaseModel):
    """后台线索列表项（手机号脱敏，手动构造）."""

    id: str
    phone_masked: str | None
    main_business_area: str
    campaign_id: str | None
    source: RecruitLeadSource
    referrer_employee_id: str | None
    referrer_name: str | None
    status: RecruitLeadStatus
    is_internal: bool
    created_at: datetime
    updated_at: datetime


class RecruitLeadListResponse(BaseModel):
    """后台线索列表分页响应."""

    items: list[RecruitLeadListItem]
    total: int
    page: int
    page_size: int


class RecruitLeadStatusUpdate(BaseModel):
    """跟进状态流转请求."""

    status: RecruitLeadStatus = Field(description="目标状态")
    is_internal: bool | None = Field(default=None, description="是否内部员工（人工标记，可选）")


# ----------------------
# Funnel（6 级漏斗统计）
# ----------------------
class RecruitFunnelResponse(BaseModel):
    """招募 6 级漏斗统计响应."""

    share_count: int = Field(description="分享次数")
    pv: int = Field(description="打开次数 PV")
    uv: int = Field(description="打开人数 UV（openid 去重）")
    deep_view: int = Field(description="深度浏览人数")
    clicked_auth: int = Field(description="点击授权人数")
    authed: int = Field(description="授权成功数（原始留资）")
    valid_leads: int = Field(description="有效新客数（北极星指标）")


__all__ = [
    "RecruitBusinessAreaItem",
    "RecruitCampaignCreate",
    "RecruitCampaignDetailResponse",
    "RecruitCampaignResponse",
    "RecruitCampaignUpdate",
    "RecruitFunnelResponse",
    "RecruitLeadCreate",
    "RecruitLeadListItem",
    "RecruitLeadListResponse",
    "RecruitLeadStatusUpdate",
    "RecruitLeadSubmitResponse",
    "RecruitVisitCreate",
    "RecruitVisitResponse",
    "RecruitVisitUpdate",
]
