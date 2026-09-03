"""Leads Management Pydantic Schemas."""

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from models.common import FollowUpMethod, LeadStatus
from settings import settings


# ----------------------
# Follow Up Schemas
# ----------------------
class FollowUpBase(BaseModel):
    """跟进记录基础模型."""

    method: FollowUpMethod
    content: str


class FollowUpCreate(FollowUpBase):
    """创建跟进记录请求."""


class FollowUpResponse(FollowUpBase):
    """跟进记录响应."""

    id: str
    lead_id: str
    followed_at: datetime
    created_by_id: str
    created_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Price History Schemas
# ----------------------
class PriceHistoryBase(BaseModel):
    """价格历史基础模型."""

    price: float
    remark: str | None = None


class PriceHistoryCreate(PriceHistoryBase):
    """创建价格历史请求."""


class PriceHistoryResponse(PriceHistoryBase):
    """价格历史响应."""

    id: str
    lead_id: str
    recorded_at: datetime
    created_by_id: str
    created_by_name: str | None = None

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Lead Eval History Schemas
# ----------------------
class LeadEvalHistoryCreate(BaseModel):
    """创建评估历史请求."""

    eval_price: Decimal = Field(gt=0, decimal_places=2, description="评估价格(万)")
    remark: str | None = Field(None, max_length=500, description="评估备注")


class LeadEvalHistoryResponse(BaseModel):
    """评估历史响应."""

    id: str
    lead_id: str
    eval_price: float
    remark: str | None
    evaluator_id: str
    evaluator_name: str | None = None
    evaluated_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ----------------------
# Lead Schemas
# ----------------------
class LeadBase(BaseModel):
    """线索基础模型."""

    community_name: str
    community_id: str | None = None
    is_hot: int = 0
    layout: str | None = None
    orientation: str | None = None
    floor_info: str | None = None
    area: float | None = None
    total_price: float | None = None
    unit_price: float | None = None
    eval_price: float | None = None
    expected_price: float | None = Field(None, gt=0)

    district: str | None = None
    business_area: str | None = None
    remarks: str | None = None

    source_property_id: int | None = None


class LeadCreate(LeadBase):
    """创建线索请求."""

    status: LeadStatus | None = LeadStatus.PENDING_ASSESSMENT
    images: list[str] = Field(default_factory=list)
    # 允许导入场景显式指定创建时间；未提供时由 DB 默认值填充当前时间
    created_at: datetime | None = None


class LeadUpdate(BaseModel):
    """更新线索请求."""

    community_name: str | None = None
    community_id: str | None = None
    is_hot: int | None = None
    layout: str | None = None
    orientation: str | None = None
    floor_info: str | None = None
    area: float | None = None
    total_price: float | None = None
    unit_price: float | None = None
    expected_price: float | None = Field(None, gt=0)

    status: LeadStatus | None = None
    audit_reason: str | None = None

    images: list[str] | None = None
    district: str | None = None
    business_area: str | None = None
    remarks: str | None = None

    last_follow_up_at: datetime | None = None
    # 用于数据导入修复场景，一般业务更新不应改动创建时间
    created_at: datetime | None = None


class LeadResponse(LeadBase):
    """线索响应."""

    id: str
    status: LeadStatus
    audit_reason: str | None = None
    auditor_id: str | None = None
    audit_time: datetime | None = None

    images: list[str] = Field(default_factory=list)

    creator_id: str | None = None
    creator_name: str | None = None
    referrer_id: str | None = None
    referrer_name: str | None = None

    last_follow_up_at: datetime | None = None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PaginatedLeadResponse(BaseModel):
    """分页线索响应."""

    items: list[LeadResponse]
    total: int
    page: int
    page_size: int


# ----------------------
# 列表展示专用 Schema (性能优化)
# ----------------------
class LeadListItem(BaseModel):
    """列表展示专用 Schema.

    不使用 from_attributes，手动构造以避免 ORM 关系遍历导致的性能问题.
    """

    id: str
    community_name: str
    community_id: str | None = None
    is_hot: int = 0
    layout: str | None = None
    orientation: str | None = None
    floor_info: str | None = None
    area: float | None = None
    total_price: float | None = None
    unit_price: float | None = None
    eval_price: float | None = None
    expected_price: float | None = None
    status: LeadStatus
    audit_reason: str | None = None
    auditor_id: str | None = None
    audit_time: datetime | None = None
    images: list[str] = Field(default_factory=list)
    district: str | None = None
    business_area: str | None = None
    remarks: str | None = None
    creator_id: str | None = None
    creator_name: str | None = None
    referrer_id: str | None = None
    referrer_name: str | None = None
    source_property_id: int | None = None
    last_follow_up_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class PaginatedLeadListResponse(BaseModel):
    """列表分页响应 - 使用 LeadListItem 避免性能问题."""

    items: list[LeadListItem]
    total: int
    page: int
    page_size: int


# ----------------------
# 漏斗统计 Schema
# ----------------------
class LeadFunnelResponse(BaseModel):
    """线索漏斗统计响应."""

    total: int = Field(description="线索总数")
    evaluating: int = Field(description="评估中数量")
    rejected: int = Field(description="已放弃数量（含他司已成交）")
    visiting: int = Field(description="带看中数量")
    signed: int = Field(description="已签约数量")


class LeadStatsResponse(BaseModel):
    """线索状态统计响应（不受分页影响）."""

    pending_assessment: int = Field(description="待评估数量")
    pending_visit: int = Field(description="待看房数量")
    visited: int = Field(description="已看房数量")
    signed: int = Field(description="已签约数量")
    rejected: int = Field(description="已放弃数量")
    lost_to_competitor: int = Field(description="他司已成交数量（展示端与已放弃合并汇总）")


# ----------------------
# 小程序员工侧评估工作台 Schema
# ----------------------
class PendingAssessmentFilter(BaseModel):
    """待评估工作台队列查询参数（search 仅作用于待评估段）."""

    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(
        default=settings.default_page_size,
        ge=1,
        le=settings.max_page_size,
        description="每页数量",
    )
    search: str | None = Field(None, max_length=50, description="小区名称搜索")


class PendingAssessmentQueueItem(BaseModel):
    """待评估队列项（工作台卡片，兼作授权页详情数据源）.

    业主报价口径 = expected_price 回退 total_price（与 admin 总价列/C 端列表一致）；
    images 裁剪前 3 张。
    """

    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    district: str | None = Field(None, description="行政区")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    floor_info: str | None = Field(None, description="楼层信息")
    orientation: str | None = Field(None, description="朝向")
    remarks: str | None = Field(None, description="业主备注")
    expected_price: float | None = Field(None, description="业主报价(万) = expected_price 回退 total_price")
    images: list[str] = Field(default_factory=list, description="图片URL（前 3 张）")
    source: Literal["customer_share", "employee_entry"] = Field(description="来源：客户分享/员工录入")
    submitter_nickname: str | None = Field(None, description="提交人昵称（线索创建人）")
    submitter_phone: str | None = Field(None, description="提交人手机号（已脱敏）")
    created_at: datetime = Field(description="创建时间")


class HandledItem(BaseModel):
    """本人经手线索项（「已处理」段，audit_time 倒序全量分页）.

    展示字段与 PendingAssessmentQueueItem 对齐（区域/面积/楼层/朝向/图片/来源），
    支撑工作台已处理卡与待评估卡同构渲染；
    pending_visit/visited 线索支持再次调整评估价（对齐 admin/leads 口径）。
    """

    id: str = Field(description="线索ID")
    community_name: str = Field(description="小区名称")
    district: str | None = Field(None, description="行政区")
    layout: str | None = Field(None, description="户型")
    area: float | None = Field(None, description="面积(m²)")
    floor_info: str | None = Field(None, description="楼层信息")
    orientation: str | None = Field(None, description="朝向")
    remarks: str | None = Field(None, description="业主备注")
    expected_price: float | None = Field(None, description="业主报价(万)")
    images: list[str] = Field(default_factory=list, description="图片URL（前 3 张）")
    source: Literal["customer_share", "employee_entry"] = Field(description="来源：客户分享/员工录入")
    submitter_nickname: str | None = Field(None, description="提交人昵称（线索创建人）")
    submitter_phone: str | None = Field(None, description="提交人手机号（已脱敏）")
    status: LeadStatus = Field(description="流转后状态")
    status_display: str = Field(description="状态显示名称")
    eval_price: float | None = Field(None, description="授权评估价(万)，reject/lost 为空")
    audit_time: datetime = Field(description="审核时间")


class PendingAssessmentQueueResponse(BaseModel):
    """待评估工作台「待评估」段响应."""

    items_pending: list[PendingAssessmentQueueItem] = Field(description="待评估队列（分页，created_at 倒序）")
    pending_total: int = Field(description="待评估总数")
    pending_today: int = Field(description="今日（Asia/Shanghai 自然日）新增待评估数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class HandledAssessmentQueueResponse(BaseModel):
    """待评估工作台「已处理」段响应（本人经手线索，audit_time 倒序全量分页）."""

    items: list[HandledItem] = Field(description="本人经手线索（分页）")
    handled_total: int = Field(description="过滤后本人经手总数")
    page: int = Field(description="当前页码")
    page_size: int = Field(description="每页数量")


class LeadAssessmentAuthorizeRequest(BaseModel):
    """评估价授权请求（触发动作类，approve/reject/lost 三动作单事务原子化）.

    语义对齐 admin PendingAssessmentPanel 三动作组合：
    - approve = 录评估价（插评估历史 + 刷 eval_price）+ 流转 pending_visit；
    - reject = 不建评估记录，仅流转 rejected（audit_reason 取 remark）；
    - lost = 不建评估记录，仅流转 lost_to_competitor（audit_reason 取 remark）。
    """

    action: Literal["approve", "reject", "lost"] = Field(description="授权动作")
    eval_price: Decimal | None = Field(
        None,
        gt=0,
        decimal_places=2,
        description="评估价格(万)，approve 必填",
    )
    remark: str | None = Field(None, max_length=500, description="评估意见/原因，三动作均选填")

    @model_validator(mode="after")
    def _approve_requires_eval_price(self) -> "LeadAssessmentAuthorizeRequest":
        """模型级校验：approve 必带 eval_price，reject/lost 无必填项（对齐 admin 选填语义）."""
        if self.action == "approve" and self.eval_price is None:
            msg = "approve 动作必须提供 eval_price"
            raise ValueError(msg)
        return self


class LeadAssessmentAuthorizeResponse(BaseModel):
    """评估价授权响应（更新后的简要对象）."""

    id: str = Field(description="线索ID")
    status: LeadStatus = Field(description="流转后状态")
    status_display: str = Field(description="状态显示名称")
    eval_price: float | None = Field(None, description="授权评估价(万)，reject/lost 为空")


__all__ = [
    "FollowUpBase",
    "FollowUpCreate",
    "FollowUpResponse",
    "HandledAssessmentQueueResponse",
    "HandledItem",
    "LeadAssessmentAuthorizeRequest",
    "LeadAssessmentAuthorizeResponse",
    "LeadBase",
    "LeadCreate",
    "LeadEvalHistoryCreate",
    "LeadEvalHistoryResponse",
    "LeadFunnelResponse",
    "LeadListItem",
    "LeadResponse",
    "LeadStatsResponse",
    "LeadUpdate",
    "PaginatedLeadListResponse",
    "PaginatedLeadResponse",
    "PendingAssessmentFilter",
    "PendingAssessmentQueueItem",
    "PendingAssessmentQueueResponse",
    "PriceHistoryBase",
    "PriceHistoryCreate",
    "PriceHistoryResponse",
]
