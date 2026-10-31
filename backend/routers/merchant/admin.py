"""商户管理后台路由（前缀 /admin/merchant）."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status
from fastapi.responses import StreamingResponse

from dependencies.auth import (
    DbSessionDep,
    MerchantBrokerPermDep,
    MerchantReadPermDep,
    MerchantVisitPermDep,
    MerchantWritePermDep,
)
from dependencies.common import PaginationDep
from schemas.merchant import (
    BindingApprovalRequest,
    BrokerAdminCreate,
    BrokerAdminUpdate,
    BrokerBindingResponse,
    BrokerForceChangeRequest,
    BrokerListResponse,
    BrokerOptionListResponse,
    BrokerResponse,
    BrokerStatusChangeRequest,
    MerchantBusinessCircleResponse,
    MerchantCompanyCreate,
    MerchantCompanyListResponse,
    MerchantCompanyResponse,
    MerchantCompanyUpdate,
    MerchantDuplicateCheckRequest,
    MerchantDuplicateCheckResponse,
    MerchantStoreCreate,
    MerchantStoreCreateResult,
    MerchantStoreDeleteRequest,
    MerchantStoreDetailResponse,
    MerchantStoreListResponse,
    MerchantStoreMergeRequest,
    MerchantStorePhotosUpdate,
    MerchantStoreRelocateResponse,
    MerchantStoreResponse,
    MerchantStoreReviewRequest,
    MerchantStoreStatusChangeRequest,
    MerchantStoreStatusLogResponse,
    MerchantStoreUpdate,
    MerchantVisitListResponse,
)
from services.merchant.broker import MerchantBrokerService
from services.merchant.company import MerchantCompanyService
from services.merchant.serializers import company_response, cooperation_label_map, store_response
from services.merchant.store import MerchantStoreService
from services.merchant.visit import MerchantVisitService
from utils.common import RateLimits, limiter
from utils.csv_exporter import generate_csv_response

router = APIRouter(prefix="/admin/merchant", tags=["merchant-admin"])


# -------------------- 公司 --------------------
@router.get("/companies", summary="公司搜索")
@limiter.limit(RateLimits.MERCHANT_READ)
def search_companies(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantReadPermDep,
    keyword: Annotated[str | None, Query(description="公司名称关键词")] = None,
    include_disabled: Annotated[bool, Query(description="是否包含已停用公司")] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> MerchantCompanyListResponse:
    """按名称搜索公司；空关键词返回空列表（REQ-M01A-002）."""
    return MerchantCompanyService(db).search(keyword, include_disabled=include_disabled, limit=limit)


@router.post("/companies", status_code=status.HTTP_201_CREATED, summary="新建公司")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_company(
    request: Request,
    body: MerchantCompanyCreate,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantCompanyResponse:
    """后台新建公司（同名提示不阻断，R-V02-02）."""
    company = MerchantCompanyService(db).create(body, operator_id=str(current_user.id), request=request)
    return company_response(company)


@router.put("/companies/{company_id}", summary="编辑公司")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_company(
    request: Request,
    company_id: Annotated[str, Path(description="公司ID")],
    body: MerchantCompanyUpdate,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantCompanyResponse:
    """编辑公司；停用后不可再被新建门店选择."""
    company = MerchantCompanyService(db).update(
        company_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )
    return company_response(company)


# -------------------- 门店 --------------------
@router.get("/stores", summary="门店列表")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_stores(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantReadPermDep,
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(description="名称/地址/公司/电话关键词")] = None,
    province: str | None = None,
    city: str | None = None,
    district: str | None = None,
    business_circle: str | None = None,
    cooperation_status: str | None = None,
    review_status: str | None = None,
    owner_employee_id: str | None = None,
    store_status: Annotated[str | None, Query(alias="status", description="门店状态筛选")] = None,
) -> MerchantStoreListResponse:
    """门店分页列表（按数据范围过滤）."""
    return MerchantStoreService(db).search(
        current_user,
        page=pagination.page,
        page_size=pagination.page_size,
        keyword=keyword,
        province=province,
        city=city,
        district=district,
        business_circle=business_circle,
        cooperation_status=cooperation_status,
        review_status=review_status,
        owner_employee_id=owner_employee_id,
        status=store_status,
    )


@router.post("/stores/check-duplicates", summary="门店查重")
@limiter.limit(RateLimits.MERCHANT_READ)
def check_store_duplicates(
    request: Request,
    body: MerchantDuplicateCheckRequest,
    db: DbSessionDep,
    _current_user: MerchantReadPermDep,
) -> MerchantDuplicateCheckResponse:
    """按名称、地址、500 米、电话召回疑似重复门店（只提示不阻断）."""
    return MerchantStoreService(db).check_duplicates(body)


@router.post("/stores", status_code=status.HTTP_201_CREATED, summary="后台新建门店")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_store(
    request: Request,
    body: MerchantStoreCreate,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantStoreCreateResult:
    """后台代建门店（source=backoffice，不创建首访）."""
    service = MerchantStoreService(db)
    store, duplicates, _first_visit = service.create(
        body,
        actor_id=str(current_user.id),
        source="backoffice",
        is_privileged=True,
        request=request,
    )
    return MerchantStoreCreateResult(
        store=store_response(store, cooperation_label_map(db)),
        first_visit=None,
        duplicate_candidates=duplicates,
    )


@router.get("/stores/export", summary="导出门店 CSV")
@limiter.limit(RateLimits.MERCHANT_READ)
def export_stores(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantReadPermDep,
    keyword: Annotated[str | None, Query(description="名称/地址/公司/电话关键词")] = None,
    province: str | None = None,
    city: str | None = None,
    district: str | None = None,
    business_circle: str | None = None,
    cooperation_status: str | None = None,
    review_status: str | None = None,
    owner_employee_id: str | None = None,
    store_status: Annotated[str | None, Query(alias="status")] = None,
) -> StreamingResponse:
    """按当前筛选导出商店列表（手机号脱敏）."""
    result = MerchantStoreService(db).search(
        current_user,
        page=1,
        page_size=10000,
        keyword=keyword,
        province=province,
        city=city,
        district=district,
        business_circle=business_circle,
        cooperation_status=cooperation_status,
        review_status=review_status,
        owner_employee_id=owner_employee_id,
        status=store_status,
    )
    rows = [
        [
            item.store_name,
            item.company_name,
            f"{item.province}{item.city}{item.district}",
            item.business_circle,
            item.address,
            item.contact_name,
            item.contact_phone_masked,
            item.cooperation_status_label,
            item.review_status,
            item.owner_employee_name or "",
            item.last_visit_at.isoformat() if item.last_visit_at else "",
            item.status,
        ]
        for item in result.items
    ]
    return generate_csv_response(
        [
            "门店名称",
            "公司",
            "区域",
            "商圈",
            "地址",
            "联系人",
            "联系电话",
            "合作状态",
            "审核状态",
            "负责人",
            "最近拜访",
            "门店状态",
        ],
        rows,
        "merchant_stores_export",
    )


@router.get("/brokers/export", summary="导出经纪人 CSV")
@limiter.limit(RateLimits.MERCHANT_READ)
def export_brokers(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantBrokerPermDep,
    keyword: Annotated[str | None, Query(description="姓名/手机号关键词")] = None,
    store_id: str | None = None,
    bind_status: str | None = None,
) -> StreamingResponse:
    """按当前筛选导出经纪人列表（手机号脱敏）."""
    result = MerchantBrokerService(db).list_admin(
        page=1,
        page_size=10000,
        keyword=keyword,
        store_id=store_id,
        bind_status=bind_status,
    )
    rows = [
        [
            item.name,
            item.phone_masked,
            item.store_name or "",
            item.bind_status,
            item.source,
            item.recommendation_count,
        ]
        for item in result.items
    ]
    return generate_csv_response(
        ["姓名", "手机号", "所属门店", "绑定状态", "来源", "推荐线索数"],
        rows,
        "merchant_brokers_export",
    )


@router.get("/stores/{store_id}/detail", summary="门店详情聚合")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_store_detail(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantReadPermDep,
) -> MerchantStoreDetailResponse:
    """门店档案 + 经纪人 + 拜访 + 协议 + 线索统计."""
    return MerchantStoreService(db).detail(current_user, store_id)


@router.post("/stores/{store_id}/delete", summary="门店软删除")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def delete_store(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStoreDeleteRequest,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> dict[str, bool]:
    """有关联数据时拒绝删除."""
    MerchantStoreService(db).soft_delete(current_user, store_id, body, request=request)
    return {"deleted": True}


@router.post("/stores/merge", summary="门店合并")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def merge_stores(
    request: Request,
    body: MerchantStoreMergeRequest,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> dict[str, int]:
    """迁移拜访/绑定/线索/协议并标记原门店已合并."""
    return MerchantStoreService(db).merge_stores(current_user, body, request=request)


@router.post("/stores/{store_id}/review", summary="经纪人自建门店审核")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def review_broker_store(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStoreReviewRequest,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantStoreResponse:
    """转正或合并待审核门店（仅 admin）."""
    if (current_user.role.code if current_user.role else None) != "admin":
        msg = "仅管理员可审核经纪人自建门店"
        from services.system.exceptions import PermissionDeniedError

        raise PermissionDeniedError(msg)
    return MerchantStoreService(db).review_broker_store(current_user, store_id, body, request=request)


@router.get("/stores/{store_id}", summary="门店详情")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_store(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantReadPermDep,
) -> MerchantStoreResponse:
    """门店详情（越权返回 403）."""
    return MerchantStoreService(db).get(current_user, store_id)


@router.put("/stores/{store_id}", summary="编辑门店")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_store(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStoreUpdate,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantStoreResponse | MerchantStoreRelocateResponse:
    """编辑门店；地址/坐标变化必须选择纠错或搬迁."""
    return MerchantStoreService(db).update(current_user, store_id, body, request=request)


@router.post("/stores/{store_id}/status", summary="变更门店合作状态")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def change_store_status(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStoreStatusChangeRequest,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantStoreResponse:
    """变更合作状态（已合作需已签协议）."""
    return MerchantStoreService(db).change_cooperation_status(current_user, store_id, body, request=request)


@router.get("/stores/{store_id}/status-logs", summary="门店合作状态时间线")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_store_status_logs(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantReadPermDep,
) -> list[MerchantStoreStatusLogResponse]:
    """门店合作状态变更历史（倒序）."""
    return MerchantStoreService(db).status_logs(current_user, store_id)


@router.put("/stores/{store_id}/photos", summary="门店照片补录")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_store_photos(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStorePhotosUpdate,
    db: DbSessionDep,
    current_user: MerchantWritePermDep,
) -> MerchantStoreResponse:
    """补录/替换门店照片（全部选拍）."""
    return MerchantStoreService(db).update_photos(current_user, store_id, body.photos, request=request)


@router.get("/stores/{store_id}/visits", summary="门店拜访时间线")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_store_visits(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantVisitPermDep,
    pagination: PaginationDep,
) -> MerchantVisitListResponse:
    """门店拜访时间线（倒序）."""
    return MerchantVisitService(db).list_store_visits(
        current_user,
        store_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )


# -------------------- 经纪人（V04/V07） --------------------
@router.get("/brokers", summary="经纪人列表")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_brokers(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantBrokerPermDep,
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(description="姓名/手机号关键词")] = None,
    store_id: str | None = None,
    bind_status: str | None = None,
) -> BrokerListResponse:
    """后台经纪人分页列表."""
    return MerchantBrokerService(db).list_admin(
        page=pagination.page,
        page_size=pagination.page_size,
        keyword=keyword,
        store_id=store_id,
        bind_status=bind_status,
    )


@router.get("/brokers/options", summary="经纪人下拉选项（线索录入二级联动）")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_broker_options(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantReadPermDep,
    store_id: str | None = None,
    keyword: Annotated[str | None, Query(max_length=100, description="姓名/手机号关键词")] = None,
    bind_status: Annotated[str | None, Query(description="绑定状态筛选（门店联动传 bound）")] = None,
) -> BrokerOptionListResponse:
    """仅返回 id/姓名/门店/绑定状态，供线索录入门店→经纪人二级联动."""
    return MerchantBrokerService(db).list_options(
        store_id=store_id,
        keyword=keyword,
        bind_status=bind_status,
    )


@router.post("/brokers", status_code=status.HTTP_201_CREATED, summary="新建经纪人")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_broker(
    request: Request,
    body: BrokerAdminCreate,
    db: DbSessionDep,
    current_user: MerchantBrokerPermDep,
) -> BrokerResponse:
    """后台新建经纪人（手机号加密，哈希唯一）."""
    return MerchantBrokerService(db).create_admin(
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.get("/brokers/{broker_id}", summary="经纪人详情")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_broker(
    request: Request,
    broker_id: Annotated[str, Path(description="经纪人ID")],
    db: DbSessionDep,
    _current_user: MerchantBrokerPermDep,
) -> BrokerResponse:
    """后台经纪人档案."""
    return MerchantBrokerService(db).get_admin(broker_id)


@router.put("/brokers/{broker_id}", summary="编辑经纪人")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_broker(
    request: Request,
    broker_id: Annotated[str, Path(description="经纪人ID")],
    body: BrokerAdminUpdate,
    db: DbSessionDep,
    current_user: MerchantBrokerPermDep,
) -> BrokerResponse:
    """编辑姓名/手机号/备注."""
    return MerchantBrokerService(db).update_admin(
        broker_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/brokers/{broker_id}/status", summary="停用/启用经纪人")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def change_broker_status(
    request: Request,
    broker_id: Annotated[str, Path(description="经纪人ID")],
    body: BrokerStatusChangeRequest,
    db: DbSessionDep,
    current_user: MerchantBrokerPermDep,
) -> BrokerResponse:
    """停用时自动解绑当前门店."""
    return MerchantBrokerService(db).change_status_admin(
        broker_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/brokers/{broker_id}/unbind", summary="强制解绑经纪人")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def force_unbind_broker(
    request: Request,
    broker_id: Annotated[str, Path(description="经纪人ID")],
    reason: Annotated[str, Query(min_length=1, description="解绑原因")],
    db: DbSessionDep,
    current_user: MerchantBrokerPermDep,
) -> BrokerResponse:
    """后台强制解绑（保留历史并留痕）."""
    return MerchantBrokerService(db).force_unbind(
        broker_id,
        reason,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/brokers/{broker_id}/change", summary="强制换绑经纪人")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def force_change_broker(
    request: Request,
    broker_id: Annotated[str, Path(description="经纪人ID")],
    body: BrokerForceChangeRequest,
    db: DbSessionDep,
    current_user: MerchantBrokerPermDep,
) -> BrokerResponse:
    """原绑定解绑留痕，新门店绑定立即生效（不迁移历史线索）."""
    return MerchantBrokerService(db).force_change(
        broker_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.get("/bindings/pending", summary="待审核绑定申请")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_pending_bindings(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantBrokerPermDep,
) -> list[BrokerBindingResponse]:
    """换绑/解绑待审核列表."""
    return MerchantBrokerService(db).list_pending_bindings()


@router.post("/bindings/{binding_id}/approve", summary="审批绑定申请")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def approve_binding(
    request: Request,
    binding_id: Annotated[str, Path(description="绑定申请ID")],
    body: BindingApprovalRequest,
    db: DbSessionDep,
    current_user: MerchantBrokerPermDep,
) -> BrokerBindingResponse:
    """通过后原绑定失效，新绑定生效；拒绝保留原绑定."""
    return MerchantBrokerService(db).approve_binding(
        binding_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.get("/business-circles", summary="商圈建议")
@limiter.limit(RateLimits.MERCHANT_READ)
def business_circles(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantReadPermDep,
    district: Annotated[str | None, Query(description="区县")] = None,
) -> MerchantBusinessCircleResponse:
    """商圈候选（小区商圈优先，允许手工新增）."""
    return MerchantBusinessCircleResponse(items=MerchantStoreService(db).business_circles(district=district))
