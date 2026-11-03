"""经纪人档案、绑定与门店二维码 Schemas（V04）."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


def _normalize_phone(value: str | None) -> str | None:
    """去除手机号中的空格/连字符."""
    if value is None:
        return value
    return value.replace(" ", "").replace("-", "").strip()


class BrokerRegisterRequest(BaseModel):
    """经纪人认证建档请求（手机号必须已在 users 中绑定）."""

    name: str = Field(min_length=1, max_length=50, description="姓名")
    qrcode_code: str | None = Field(default=None, max_length=32, description="门店二维码场景短码")
    referrer: str | None = Field(default=None, max_length=36, description="员工分享 referrer")

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        return value.strip()


class BrokerUpdateRequest(BaseModel):
    """经纪人资料修改（手机号变更需走现有用户手机号流程后同步）."""

    name: str | None = Field(default=None, min_length=1, max_length=50)
    phone: str | None = Field(default=None, max_length=20)
    remark: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value else value

    @field_validator("phone")
    @classmethod
    def _strip_phone(cls, value: str | None) -> str | None:
        return _normalize_phone(value)


class BrokerBindRequest(BaseModel):
    """首次绑定门店请求."""

    store_id: str = Field(min_length=1, max_length=36, description="门店ID")
    qrcode_code: str | None = Field(
        default=None,
        max_length=64,
        description="门店邀请二维码短码（扫门店二维码绑定时传，用于记录扫码来源）",
    )


class BrokerChangeRequest(BaseModel):
    """换绑门店申请（运营审核后生效）."""

    store_id: str = Field(min_length=1, max_length=36, description="新门店ID")
    reason: str = Field(min_length=1, max_length=500, description="换绑原因")


class BrokerUnbindRequest(BaseModel):
    """解绑门店申请（运营审核后生效）."""

    reason: str = Field(min_length=1, max_length=500, description="解绑原因")


class BrokerBindingResponse(BaseModel):
    """绑定历史记录."""

    id: str
    broker_id: str | None = None
    broker_name: str | None = None
    store_id: str
    store_name: str
    status: str
    applied_at: datetime
    approved_at: datetime | None
    unbound_at: datetime | None
    reason: str | None
    bind_source: str
    inviter_employee_id: str | None


class BrokerBindingListResponse(BaseModel):
    """绑定历史分页响应（后台查看）."""

    items: list[BrokerBindingResponse]
    total: int
    page: int
    page_size: int


class BrokerResponse(BaseModel):
    """经纪人档案响应."""

    id: str
    user_id: str | None
    name: str
    phone_masked: str
    store_id: str | None
    store_name: str | None
    owner_employee_name: str | None = None
    bind_status: str
    source: str
    inviter_employee_id: str | None
    inviter_employee_name: str | None = None
    bind_source: str
    bound_at: datetime | None
    unbound_at: datetime | None
    remark: str | None
    recruit_lead_id: str | None = None
    created_at: datetime
    updated_at: datetime


class BrokerMyStoreResponse(BaseModel):
    """经纪人“我的门店”只读视图."""

    id: str
    store_name: str
    company_name: str
    address: str
    district: str
    business_circle: str
    cooperation_status: str
    cooperation_status_label: str
    review_status: str
    photos: list[dict] = Field(default_factory=list)
    bind_status: str
    bound_at: datetime | None
    owner_employee_name: str | None = None
    owner_employee_phone: str | None = Field(
        default=None,
        description="对接人（门店负责人）联系电话，供经纪人在经纪人中心直接拨打",
    )


class BrokerCompanyOption(BaseModel):
    """经纪人注册建店可选公司（仅 id/名称）."""

    id: str
    company_name: str


class BrokerCompanyOptionListResponse(BaseModel):
    """经纪人可选公司搜索响应."""

    items: list[BrokerCompanyOption]
    total: int


class BrokerStoreOption(BaseModel):
    """经纪人可选门店（不含联系人/电话等内部跟进信息）."""

    id: str
    store_name: str
    company_name: str
    address: str
    district: str
    business_circle: str
    cooperation_status: str
    cooperation_status_label: str
    review_status: str


class BrokerStoreOptionListResponse(BaseModel):
    """经纪人可选门店搜索响应."""

    items: list[BrokerStoreOption]
    total: int
    page: int
    page_size: int


class BrokerLeadFollowUpItem(BaseModel):
    """经纪人可见的跟进记录."""

    id: str
    method: str
    content: str
    conclusion: str | None
    followed_at: datetime


class BrokerLeadItem(BaseModel):
    """经纪人推荐线索（只读，含完整跟进记录）."""

    id: str
    community_name: str
    status: str
    layout: str | None
    area: float | None
    total_price: float | None
    created_at: datetime
    follow_ups: list[BrokerLeadFollowUpItem]


class BrokerLeadListResponse(BaseModel):
    """经纪人推荐记录分页响应."""

    items: list[BrokerLeadItem]
    total: int
    page: int
    page_size: int


class BrokerRegisterResult(BaseModel):
    """经纪人认证结果."""

    broker: BrokerResponse
    my_store: BrokerMyStoreResponse | None = None
    auto_bound: bool = False
    qr_invalid_reason: str | None = None


class BrokerQRCodeResponse(BaseModel):
    """门店二维码生成响应."""

    code: str
    image_base64: str
    expires_at: datetime
    page: str
    env_version: str


class BrokerQRCodeResolveResponse(BaseModel):
    """门店二维码解析结果（扫码注册前展示）."""

    valid: bool
    store_id: str | None
    store_name: str | None
    inviter_employee_id: str | None
    expires_at: datetime | None
    reason: str | None


class BrokerListItem(BaseModel):
    """后台经纪人列表项."""

    id: str
    name: str
    phone_masked: str
    store_id: str | None
    store_name: str | None
    owner_employee_name: str | None = None
    bind_status: str
    source: str
    bind_source: str
    inviter_employee_id: str | None
    inviter_employee_name: str | None = None
    recruit_lead_id: str | None = None
    recommendation_count: int
    updated_at: datetime


class BrokerListResponse(BaseModel):
    """后台经纪人分页列表."""

    items: list[BrokerListItem]
    total: int
    page: int
    page_size: int


class BrokerSummaryResponse(BaseModel):
    """后台经纪人概览计数（REQ-IT7-03 列表页 KPI / 分段筛选）."""

    total: int
    bound: int
    unbound: int
    pending: int
    disabled: int
    pending_binding_count: int


class BrokerOption(BaseModel):
    """线索录入门店→经纪人二级联动选项（不暴露手机号等敏感信息）."""

    id: str
    name: str
    store_id: str | None
    bind_status: str


class BrokerOptionListResponse(BaseModel):
    """经纪人下拉选项列表."""

    items: list[BrokerOption]


class BrokerAdminCreate(BaseModel):
    """后台新建经纪人."""

    name: str = Field(min_length=1, max_length=50)
    phone: str = Field(min_length=1, max_length=20)
    store_id: str | None = Field(default=None, max_length=36)
    remark: str | None = Field(default=None, max_length=500)

    @field_validator("phone")
    @classmethod
    def _strip_phone(cls, value: str) -> str:
        return _normalize_phone(value) or value


class BrokerAdminUpdate(BaseModel):
    """后台编辑经纪人."""

    name: str | None = Field(default=None, min_length=1, max_length=50)
    phone: str | None = Field(default=None, max_length=20)
    remark: str | None = Field(default=None, max_length=500)

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str | None) -> str | None:
        return value.strip() if value else value

    @field_validator("phone")
    @classmethod
    def _strip_phone(cls, value: str | None) -> str | None:
        return _normalize_phone(value)


class BrokerStoreCreate(BaseModel):
    """员工在门店下直接新建经纪人（REQ-IT5-05：协议发起页缺签署人时补录）."""

    name: str = Field(min_length=1, max_length=50, description="经纪人姓名")
    phone: str = Field(min_length=1, max_length=20, description="经纪人手机号（加密存储，哈希唯一）")
    remark: str | None = Field(default=None, max_length=500, description="备注（如补录原因）")

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            msg = "经纪人姓名不能为空"
            raise ValueError(msg)
        return stripped

    @field_validator("phone")
    @classmethod
    def _strip_phone(cls, value: str) -> str:
        return _normalize_phone(value) or value


class BrokerForceChangeRequest(BaseModel):
    """后台强制换绑经纪人."""

    store_id: str = Field(min_length=1, max_length=36)
    reason: str = Field(min_length=1, max_length=500)


class BrokerStatusChangeRequest(BaseModel):
    """后台停用/启用经纪人."""

    target_status: Literal["disabled", "unbound"]
    reason: str | None = Field(default=None, max_length=500)


class BindingApprovalRequest(BaseModel):
    """换绑/解绑审批."""

    approve: bool
    remark: str | None = Field(default=None, max_length=500)


__all__ = [
    "BindingApprovalRequest",
    "BrokerAdminCreate",
    "BrokerAdminUpdate",
    "BrokerBindRequest",
    "BrokerBindingResponse",
    "BrokerChangeRequest",
    "BrokerCompanyOption",
    "BrokerCompanyOptionListResponse",
    "BrokerForceChangeRequest",
    "BrokerLeadFollowUpItem",
    "BrokerLeadItem",
    "BrokerLeadListResponse",
    "BrokerListItem",
    "BrokerListResponse",
    "BrokerMyStoreResponse",
    "BrokerQRCodeResolveResponse",
    "BrokerQRCodeResponse",
    "BrokerRegisterRequest",
    "BrokerRegisterResult",
    "BrokerResponse",
    "BrokerStatusChangeRequest",
    "BrokerStoreOption",
    "BrokerStoreOptionListResponse",
    "BrokerUnbindRequest",
    "BrokerUpdateRequest",
]
