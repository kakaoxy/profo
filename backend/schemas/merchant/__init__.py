"""商户管理域 Pydantic Schemas（V02 公司/门店、V03 拜访）.

严格与 SQLAlchemy Model 分离；请求/响应按 ``*Create/*Update/*Response/*Request`` 命名。
"""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

StorePhotoType = Literal["head", "interior", "other"]
StoreChangeType = Literal["edit", "correct", "relocate"]


# ----------------------
# 公司（V02 M01A）
# ----------------------
class MerchantCompanyCreate(BaseModel):
    """创建公司请求."""

    company_name: str = Field(min_length=1, max_length=200, description="公司名称")
    contact_name: str | None = Field(default=None, max_length=50, description="联系人")
    contact_phone: str | None = Field(default=None, max_length=20, description="联系电话")
    remark: str | None = Field(default=None, max_length=500, description="备注")


class MerchantCompanyUpdate(BaseModel):
    """更新公司请求（全部可选）."""

    company_name: str | None = Field(default=None, min_length=1, max_length=200)
    status: Literal["normal", "disabled"] | None = None
    contact_name: str | None = Field(default=None, max_length=50)
    contact_phone: str | None = Field(default=None, max_length=20)
    remark: str | None = Field(default=None, max_length=500)


class MerchantCompanyResponse(BaseModel):
    """公司响应（列表/详情）."""

    id: str
    company_name: str
    status: str
    contact_name: str | None
    contact_phone_masked: str | None
    remark: str | None
    created_at: datetime
    updated_at: datetime


class MerchantCompanyListResponse(BaseModel):
    """公司搜索响应."""

    items: list[MerchantCompanyResponse]
    total: int


# ----------------------
# 门店（V02 M01B / M02）
# ----------------------
class StorePhotoItem(BaseModel):
    """门店照片项."""

    file_url: str = Field(min_length=1, max_length=500, description="文件地址")
    photo_type: StorePhotoType = Field(default="other", description="照片类型：head/interior/other")
    uploaded_by: str | None = Field(default=None, max_length=36, description="上传人ID")
    uploaded_at: datetime | None = Field(default=None, description="上传时间")


class MerchantStoreCreate(BaseModel):
    """创建门店请求（员工小程序 / 后台 / 经纪人复用）."""

    company_id: str = Field(min_length=1, max_length=36, description="所属公司ID")
    store_name: str = Field(min_length=1, max_length=200, description="门店名称")
    province: str = Field(min_length=1, max_length=50, description="省")
    city: str = Field(min_length=1, max_length=50, description="市")
    district: str = Field(min_length=1, max_length=50, description="区县")
    business_circle: str = Field(min_length=1, max_length=100, description="商圈")
    address: str = Field(min_length=1, max_length=500, description="详细地址")
    lng: float = Field(ge=-180, le=180, description="经度 GCJ-02")
    lat: float = Field(ge=-90, le=90, description="纬度 GCJ-02")
    contact_name: str = Field(min_length=1, max_length=50, description="联系人")
    contact_phone: str = Field(min_length=1, max_length=20, description="联系电话")
    cooperation_status: Literal["not_cooperated", "negotiating"] = Field(
        default="not_cooperated",
        description="新建门店合作状态仅允许未合作/洽谈中",
    )
    owner_employee_id: str | None = Field(default=None, max_length=36, description="负责人（后台新建时可指定）")
    photos: list[StorePhotoItem] = Field(default_factory=list, max_length=20, description="门店照片")
    remark: str | None = Field(default=None, max_length=500, description="备注")
    force_create_reason: str | None = Field(
        default=None,
        max_length=200,
        description="查重命中时的强制新建理由",
    )
    first_visit: "MerchantVisitCreate | None" = Field(
        default=None,
        description="员工现场建档时的首访信息（与门店同事务）",
    )


class MerchantStoreUpdate(BaseModel):
    """更新门店请求（全部可选；地址变更需声明 change_type）."""

    company_id: str | None = Field(default=None, max_length=36)
    store_name: str | None = Field(default=None, min_length=1, max_length=200)
    province: str | None = Field(default=None, min_length=1, max_length=50)
    city: str | None = Field(default=None, min_length=1, max_length=50)
    district: str | None = Field(default=None, min_length=1, max_length=50)
    business_circle: str | None = Field(default=None, min_length=1, max_length=100)
    address: str | None = Field(default=None, min_length=1, max_length=500)
    lng: float | None = Field(default=None, ge=-180, le=180)
    lat: float | None = Field(default=None, ge=-90, le=90)
    contact_name: str | None = Field(default=None, min_length=1, max_length=50)
    contact_phone: str | None = Field(default=None, min_length=1, max_length=20)
    owner_employee_id: str | None = Field(default=None, max_length=36)
    photos: list[StorePhotoItem] | None = Field(default=None, max_length=20)
    remark: str | None = Field(default=None, max_length=500)
    change_type: StoreChangeType = Field(default="edit", description="变更类型：edit/correct/relocate")
    change_reason: str | None = Field(default=None, max_length=500, description="变更/搬迁原因")


class MerchantStoreResponse(BaseModel):
    """门店响应（详情）."""

    id: str
    company_id: str
    company_name: str
    store_name: str
    province: str
    city: str
    district: str
    business_circle: str
    address: str
    lng: float | None
    lat: float | None
    coordinate_system: str
    contact_name: str
    contact_phone: str
    cooperation_status: str
    cooperation_status_label: str
    source: str
    owner_employee_id: str | None
    last_visit_at: datetime | None
    status: str
    review_status: str
    created_by_broker_id: str | None
    merged_to_store_id: str | None
    former_store_no: str | None
    relocated_to_store_id: str | None
    photos: list[StorePhotoItem]
    remark: str | None
    created_at: datetime
    updated_at: datetime


class MerchantStoreListItem(BaseModel):
    """门店列表项（手机号脱敏）."""

    id: str
    company_name: str
    store_name: str
    province: str
    city: str
    district: str
    business_circle: str
    address: str
    contact_name: str
    contact_phone_masked: str
    cooperation_status: str
    cooperation_status_label: str
    source: str
    review_status: str
    owner_employee_id: str | None
    owner_employee_name: str | None
    last_visit_at: datetime | None
    status: str
    created_at: datetime
    updated_at: datetime


class MerchantStoreListResponse(BaseModel):
    """门店分页列表响应."""

    items: list[MerchantStoreListItem]
    total: int
    page: int
    page_size: int


class MerchantDuplicateCandidate(BaseModel):
    """查重候选门店."""

    id: str
    store_name: str
    address: str
    contact_name: str
    cooperation_status: str
    cooperation_status_label: str
    distance_m: int | None
    matched_by: list[str]


class MerchantDuplicateCheckRequest(BaseModel):
    """门店查重请求."""

    store_name: str = Field(min_length=1, max_length=200)
    address: str = Field(min_length=1, max_length=500)
    lng: float | None = Field(default=None, ge=-180, le=180)
    lat: float | None = Field(default=None, ge=-90, le=90)
    contact_phone: str | None = Field(default=None, max_length=20)


class MerchantDuplicateCheckResponse(BaseModel):
    """门店查重响应（只提示不阻断）."""

    candidates: list[MerchantDuplicateCandidate]
    completed: bool


class MerchantStoreRelocateResponse(BaseModel):
    """门店搬迁结果（原门店标记已搬迁 + 新门店承接后续拜访）."""

    old_store_id: str
    new_store: MerchantStoreResponse


class MerchantStoreDeleteRequest(BaseModel):
    """门店软删除请求."""

    reason: str = Field(min_length=1, max_length=500, description="删除原因")


class MerchantStoreMergeRequest(BaseModel):
    """门店合并请求."""

    keep_store_id: str = Field(min_length=1, max_length=36, description="保留门店ID")
    merged_store_id: str = Field(min_length=1, max_length=36, description="被合并门店ID")
    reason: str = Field(min_length=1, max_length=500, description="合并原因")


class MerchantStoreReviewRequest(BaseModel):
    """经纪人自建门店审核请求."""

    action: Literal["approve", "merge"]
    target_store_id: str | None = Field(default=None, max_length=36, description="合并时保留门店ID")
    remark: str | None = Field(default=None, max_length=500)


class MerchantLeadStats(BaseModel):
    """门店线索统计."""

    total: int
    month_new: int


class MerchantStoreStatusChangeRequest(BaseModel):
    """门店合作状态变更请求."""

    target_status: Literal["not_cooperated", "negotiating", "cooperated", "paused", "terminated"]
    reason: str = Field(min_length=1, max_length=500, description="变更原因")


class MerchantStoreStatusLogResponse(BaseModel):
    """门店合作状态变更记录."""

    id: str
    from_status: str
    to_status: str
    reason: str
    operator_id: str | None
    created_at: datetime


class MerchantBusinessCircleResponse(BaseModel):
    """商圈建议响应."""

    items: list[str]


class MerchantStorePhotosUpdate(BaseModel):
    """门店照片补录/替换请求."""

    photos: list[StorePhotoItem] = Field(max_length=20, description="完整照片列表")


# ----------------------
# 拜访（V03 M03）
# ----------------------
class MerchantVisitCreate(BaseModel):
    """拜访登记/补录请求.

    ``store_id`` 在首访内嵌场景可空（由门店创建服务回填）。
    """

    store_id: str | None = Field(default=None, max_length=36, description="门店ID")
    visited_at: datetime | None = Field(default=None, description="拜访时间（缺省当前时间）")
    contact_name: str = Field(min_length=1, max_length=50, description="本次联系人")
    contact_phone: str | None = Field(default=None, max_length=20, description="联系电话")
    photos: list[StorePhotoItem] = Field(default_factory=list, max_length=20, description="拜访照片")
    lng: float | None = Field(default=None, ge=-180, le=180, description="到店经度 GCJ-02")
    lat: float | None = Field(default=None, ge=-90, le=90, description="到店纬度 GCJ-02")
    address: str | None = Field(default=None, max_length=500, description="定位地址")
    result: str | None = Field(default=None, max_length=50, description="拜访结果字典 code")
    remark: str | None = Field(default=None, max_length=500, description="备注")
    is_backfill: bool = Field(default=False, description="是否补录")
    backfill_reason: str | None = Field(default=None, max_length=200, description="补录原因（写入 remark）")
    distance_abnormal_reason: str | None = Field(
        default=None,
        max_length=200,
        description="距离超过 500 米的原因",
    )
    location_failure_reason: str | None = Field(default=None, max_length=100, description="无法定位的原因")
    location_status: Literal["normal", "degraded", "missing"] = Field(
        default="normal",
        description="定位状态：normal/degraded/missing",
    )


class MerchantVisitResponse(BaseModel):
    """拜访记录响应."""

    id: str
    store_id: str
    store_name: str | None
    employee_id: str
    employee_name: str | None
    visited_at: datetime
    contact_name: str
    contact_phone: str | None
    photos: list[StorePhotoItem]
    lng: float | None
    lat: float | None
    distance_m: int | None
    distance_abnormal_reason: str | None
    location_failure_reason: str | None
    location_status: str
    visit_source: str
    address: str | None
    result: str | None
    remark: str | None
    is_backfill: bool
    created_at: datetime


class MerchantVisitListResponse(BaseModel):
    """门店拜访时间线响应."""

    items: list[MerchantVisitResponse]
    total: int
    page: int
    page_size: int


class MerchantStoreCreateResult(BaseModel):
    """门店创建结果（含首访与查重提示）."""

    store: MerchantStoreResponse
    first_visit: MerchantVisitResponse | None = None
    duplicate_candidates: list[MerchantDuplicateCandidate] = Field(default_factory=list)


class MerchantStoreDetailResponse(BaseModel):
    """门店详情聚合（Q39：档案、经纪人、拜访、协议、线索统计）."""

    store: MerchantStoreResponse
    brokers: list[dict] = Field(default_factory=list)
    visits: MerchantVisitListResponse
    agreements: list[dict] = Field(default_factory=list)
    lead_stats: MerchantLeadStats
    status_logs: list[MerchantStoreStatusLogResponse] = Field(default_factory=list)


MerchantStoreCreate.model_rebuild()

# 经纪人相关 Schema（V04）
# 地图与轨迹 Schema（V08）
# 合作协议 Schema（V05）
from .agreement import (  # noqa: E402
    AgreementCreateRequest,
    AgreementExpiringEvent,
    AgreementListResponse,
    AgreementResponse,
    AgreementReviewRequest,
    AgreementScanUploadRequest,
    AgreementSignRequest,
    AgreementSupplementCreate,
    AgreementTemplateCreate,
    AgreementTemplateResponse,
    AgreementTemplateUpdate,
    AgreementVoidRequest,
)
from .broker import (  # noqa: E402
    BindingApprovalRequest,
    BrokerAdminCreate,
    BrokerAdminUpdate,
    BrokerBindingResponse,
    BrokerBindRequest,
    BrokerChangeRequest,
    BrokerCompanyOption,
    BrokerCompanyOptionListResponse,
    BrokerForceChangeRequest,
    BrokerLeadFollowUpItem,
    BrokerLeadItem,
    BrokerLeadListResponse,
    BrokerListItem,
    BrokerListResponse,
    BrokerMyStoreResponse,
    BrokerQRCodeResolveResponse,
    BrokerQRCodeResponse,
    BrokerRegisterRequest,
    BrokerRegisterResult,
    BrokerResponse,
    BrokerStatusChangeRequest,
    BrokerStoreOption,
    BrokerStoreOptionListResponse,
    BrokerUnbindRequest,
    BrokerUpdateRequest,
)
from .map import (  # noqa: E402
    MerchantMapPoint,
    MerchantMapResponse,
    MerchantMapStats,
    MerchantTrackItem,
    MerchantTrackResponse,
    MerchantTrackStats,
)
from .notify import (  # noqa: E402
    MerchantNotifyRunRecord,
    MerchantNotifyRunResponse,
    MerchantNotifyTypeStats,
)

__all__ = [
    "AgreementCreateRequest",
    "AgreementExpiringEvent",
    "AgreementListResponse",
    "AgreementResponse",
    "AgreementReviewRequest",
    "AgreementScanUploadRequest",
    "AgreementSignRequest",
    "AgreementSupplementCreate",
    "AgreementTemplateCreate",
    "AgreementTemplateResponse",
    "AgreementTemplateUpdate",
    "AgreementVoidRequest",
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
    "MerchantLeadStats",
    "MerchantMapPoint",
    "MerchantMapResponse",
    "MerchantMapStats",
    "MerchantNotifyRunRecord",
    "MerchantNotifyRunResponse",
    "MerchantNotifyTypeStats",
    "MerchantStoreDeleteRequest",
    "MerchantStoreDetailResponse",
    "MerchantStoreMergeRequest",
    "MerchantStoreReviewRequest",
    "MerchantTrackItem",
    "MerchantTrackResponse",
    "MerchantTrackStats",
]
