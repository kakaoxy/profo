"""小程序员工侧商户路由（前缀 /public/merchant，C 端令牌 + 后台身份）."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from dependencies.common import PaginationDep
from routers.merchant.deps import (
    MerchantCReadDep,
    MerchantCVisitDep,
    MerchantCWriteDep,
    MerchantCWriteVisitDep,
)
from schemas.merchant import (
    BrokerBindingResponse,
    BrokerBindRequest,
    BrokerChangeRequest,
    BrokerCompanyOptionListResponse,
    BrokerLeadListResponse,
    BrokerMyStoreResponse,
    BrokerQRCodeResolveResponse,
    BrokerQRCodeResponse,
    BrokerRegisterRequest,
    BrokerRegisterResult,
    BrokerResponse,
    BrokerStoreCreate,
    BrokerStoreOptionListResponse,
    BrokerUnbindRequest,
    BrokerUpdateRequest,
    MerchantBusinessCircleResponse,
    MerchantCompanyCreate,
    MerchantCompanyListResponse,
    MerchantCompanyResponse,
    MerchantDistrictListResponse,
    MerchantDuplicateCheckRequest,
    MerchantDuplicateCheckResponse,
    MerchantStoreCreate,
    MerchantStoreCreateResult,
    MerchantStoreListResponse,
    MerchantStorePhotosUpdate,
    MerchantStoreRelocateResponse,
    MerchantStoreResponse,
    MerchantStoreStatusChangeRequest,
    MerchantStoreStatusLogResponse,
    MerchantStoreStatusOptionsResponse,
    MerchantStoreUpdate,
    MerchantVisitCreate,
    MerchantVisitListResponse,
    MerchantVisitResponse,
)
from services.merchant.broker import MerchantBrokerService
from services.merchant.broker_qr import MerchantBrokerQRCodeService
from services.merchant.company import MerchantCompanyService
from services.merchant.scope import ensure_scope_role
from services.merchant.serializers import company_response, cooperation_label_map, store_response
from services.merchant.store import MerchantStoreService
from services.merchant.visit import MerchantVisitService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/merchant", tags=["merchant-employee"])


# -------------------- 公司 --------------------
@router.get("/companies", summary="公司搜索")
@limiter.limit(RateLimits.MERCHANT_READ)
def search_companies(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantCReadDep,
    keyword: Annotated[str | None, Query(description="公司名称关键词")] = None,
    include_disabled: Annotated[bool, Query(description="是否包含已停用公司")] = False,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
) -> MerchantCompanyListResponse:
    """按名称搜索公司."""
    return MerchantCompanyService(db).search(keyword, include_disabled=include_disabled, limit=limit)


@router.post("/companies", status_code=status.HTTP_201_CREATED, summary="新建公司")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_company(
    request: Request,
    body: MerchantCompanyCreate,
    db: DbSessionDep,
    current_user: MerchantCWriteDep,
) -> MerchantCompanyResponse:
    """员工现场建档时新建公司."""
    company = MerchantCompanyService(db).create(body, operator_id=str(current_user.id), request=request)
    return company_response(company)


# -------------------- 门店 --------------------
@router.get("/stores", summary="门店搜索")
@limiter.limit(RateLimits.MERCHANT_READ)
def search_stores(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantCReadDep,
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(description="名称/地址/公司/电话关键词")] = None,
    province: str | None = None,
    city: str | None = None,
    district: str | None = None,
    business_circle: str | None = None,
    cooperation_status: str | None = None,
    review_status: str | None = None,
    owner_employee_id: str | None = None,
    status: str | None = None,
    origin_lng: Annotated[
        float | None,
        Query(ge=-180, le=180, description="定位经度（GCJ-02），传了即按距离升序"),
    ] = None,
    origin_lat: Annotated[float | None, Query(ge=-90, le=90, description="定位纬度（GCJ-02）")] = None,
) -> MerchantStoreListResponse:
    """员工可搜索本人拓展/本人拜访的门店（D9/Q48）.

    REQ-IT4-02：传 origin_lng/origin_lat 时按距离由近到远排序，列表项回填 distance_m。
    """
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
        status=status,
        origin_lng=origin_lng,
        origin_lat=origin_lat,
    )


@router.post("/stores/check-duplicates", summary="门店查重")
@limiter.limit(RateLimits.MERCHANT_READ)
def check_store_duplicates(
    request: Request,
    body: MerchantDuplicateCheckRequest,
    db: DbSessionDep,
    _current_user: MerchantCReadDep,
) -> MerchantDuplicateCheckResponse:
    """门店查重提示（只提示不阻断）."""
    return MerchantStoreService(db).check_duplicates(body)


@router.post("/stores", status_code=status.HTTP_201_CREATED, summary="员工新建门店（首访可选）")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_store(
    request: Request,
    body: MerchantStoreCreate,
    db: DbSessionDep,
    current_user: MerchantCWriteVisitDep,
) -> MerchantStoreCreateResult:
    """员工现场新建门店（REQ-IT2-02：首访改为可选，不再强制登记）."""
    service = MerchantStoreService(db)
    store, duplicates, first_visit = service.create(
        body,
        actor_id=str(current_user.id),
        source="employee",
        is_privileged=ensure_scope_role(current_user),
        request=request,
    )
    visit_service = MerchantVisitService(db)
    return MerchantStoreCreateResult(
        store=store_response(store, cooperation_label_map(db)),
        first_visit=visit_service.build_response(first_visit) if first_visit is not None else None,
        duplicate_candidates=duplicates,
    )


@router.get("/stores/{store_id}", summary="门店详情")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_store(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantCReadDep,
) -> MerchantStoreResponse:
    """门店详情."""
    return MerchantStoreService(db).get(current_user, store_id)


@router.put("/stores/{store_id}", summary="编辑门店")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_store(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStoreUpdate,
    db: DbSessionDep,
    current_user: MerchantCWriteDep,
) -> MerchantStoreResponse | MerchantStoreRelocateResponse:
    """编辑门店（地址变化需选择纠错/搬迁）."""
    return MerchantStoreService(db).update(current_user, store_id, body, request=request)


@router.post("/stores/{store_id}/status", summary="变更合作状态")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def change_store_status(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStoreStatusChangeRequest,
    db: DbSessionDep,
    current_user: MerchantCWriteDep,
) -> MerchantStoreResponse:
    """员工仅可改为洽谈中；运营可改全部（Q19）."""
    return MerchantStoreService(db).change_cooperation_status(current_user, store_id, body, request=request)


@router.get("/stores/{store_id}/status-options", summary="合作状态可选项")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_store_status_options(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantCReadDep,
) -> MerchantStoreStatusOptionsResponse:
    """当前用户此刻可改成哪些合作状态（REQ-IT4-05）."""
    return MerchantStoreService(db).cooperation_status_options(current_user, store_id)


@router.get("/stores/{store_id}/status-logs", summary="合作状态时间线")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_store_status_logs(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantCReadDep,
) -> list[MerchantStoreStatusLogResponse]:
    """合作状态变更历史."""
    return MerchantStoreService(db).status_logs(current_user, store_id)


@router.put("/stores/{store_id}/photos", summary="门店照片补录")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_store_photos(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: MerchantStorePhotosUpdate,
    db: DbSessionDep,
    current_user: MerchantCWriteDep,
) -> MerchantStoreResponse:
    """门店照片补录/替换."""
    return MerchantStoreService(db).update_photos(current_user, store_id, body.photos, request=request)


@router.get("/districts", summary="区域（区县）字典")
@limiter.limit(RateLimits.MERCHANT_READ)
def districts(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantCReadDep,
) -> MerchantDistrictListResponse:
    """区域候选（REQ-IT1-04：门店建档从列表选择，避免手填错误）."""
    return MerchantDistrictListResponse(items=MerchantStoreService(db).districts())


@router.get("/business-circles", summary="商圈建议")
@limiter.limit(RateLimits.MERCHANT_READ)
def business_circles(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantCReadDep,
    district: Annotated[str | None, Query(description="区县")] = None,
) -> MerchantBusinessCircleResponse:
    """商圈候选."""
    return MerchantBusinessCircleResponse(items=MerchantStoreService(db).business_circles(district=district))


# -------------------- 经纪人（V04） --------------------
@router.get("/broker-qrcodes/{code}", summary="解析门店邀请二维码")
@limiter.limit(RateLimits.MERCHANT_READ)
def resolve_broker_qrcode(
    request: Request,
    code: Annotated[str, Path(description="二维码场景短码")],
    db: DbSessionDep,
) -> BrokerQRCodeResolveResponse:
    """扫码后解析门店与邀请员工（无需登录）."""
    return MerchantBrokerQRCodeService(db).resolve(code)


@router.post("/stores/{store_id}/broker-qrcode", summary="生成门店邀请二维码")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def generate_broker_qrcode(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantCWriteDep,
) -> BrokerQRCodeResponse:
    """门店归属员工生成二维码，经纪人扫码注册后自动绑定."""
    return MerchantBrokerQRCodeService(db).generate(current_user, store_id)


@router.post("/brokers/register", summary="经纪人认证建档")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def register_broker(
    request: Request,
    body: BrokerRegisterRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerRegisterResult:
    """微信登录 + 已绑定手机号后填写姓名；支持二维码/员工分享归因."""
    return MerchantBrokerService(db).register(current_user, body, request=request)


@router.get("/brokers/me", summary="我的经纪人档案")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_my_broker(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerResponse:
    """当前登录用户的经纪人档案."""
    profile = MerchantBrokerService(db).my_profile(current_user)
    if profile is None:
        from services.system.exceptions import ResourceNotFoundError

        msg = "尚未完成经纪人认证"
        raise ResourceNotFoundError(msg)
    return profile


@router.put("/brokers/me", summary="修改经纪人资料")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_my_broker(
    request: Request,
    body: BrokerUpdateRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerResponse:
    """修改姓名/手机号/备注（手机号需先在用户侧验证）."""
    return MerchantBrokerService(db).update_me(current_user, body, request=request)


@router.get("/brokers/me/store", summary="我的门店")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_my_broker_store(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerMyStoreResponse | None:
    """当前有效绑定门店（只读，不暴露内部跟进信息）."""
    return MerchantBrokerService(db).my_store(current_user)


@router.post("/brokers/me/bind", summary="绑定门店")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def bind_broker_store(
    request: Request,
    body: BrokerBindRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerResponse:
    """首次绑定免审直接生效；已有绑定时拒绝."""
    return MerchantBrokerService(db).bind_initial(current_user, body, request=request)


@router.post("/brokers/me/change", summary="换绑门店申请")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def request_broker_change(
    request: Request,
    body: BrokerChangeRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerBindingResponse:
    """换绑需运营审核，审核前原绑定持续有效."""
    return MerchantBrokerService(db).request_change(current_user, body, request=request)


@router.post("/brokers/me/unbind", summary="解绑门店申请")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def request_broker_unbind(
    request: Request,
    body: BrokerUnbindRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> BrokerBindingResponse:
    """解绑需运营审核，审核前绑定持续有效."""
    return MerchantBrokerService(db).request_unbind(current_user, body, request=request)


@router.get("/brokers/me/bindings", summary="绑定历史")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_my_bindings(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> list[BrokerBindingResponse]:
    """本人历次绑定门店记录."""
    return MerchantBrokerService(db).history(current_user)


@router.get("/brokers/me/leads", summary="我的推荐记录")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_my_broker_leads(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
    pagination: PaginationDep,
) -> BrokerLeadListResponse:
    """经纪人本人推荐线索及完整跟进记录（只读）."""
    return MerchantBrokerService(db).my_recommended_leads(
        current_user,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/broker-companies", summary="经纪人注册建店可选公司")
@limiter.limit(RateLimits.MERCHANT_READ)
def search_broker_companies(
    request: Request,
    db: DbSessionDep,
    _current_user: CurrentCustomerUserDep,
    keyword: Annotated[str | None, Query(max_length=100, description="公司名称关键词")] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
) -> BrokerCompanyOptionListResponse:
    """仅返回正常公司，不暴露联系人/电话."""
    return MerchantBrokerService(db).search_active_companies(keyword=keyword, limit=limit)


@router.get("/broker-stores", summary="经纪人可选门店搜索")
@limiter.limit(RateLimits.MERCHANT_READ)
def search_broker_stores(
    request: Request,
    db: DbSessionDep,
    _current_user: CurrentCustomerUserDep,
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(max_length=100, description="门店名称/地址/公司关键词")] = None,
) -> BrokerStoreOptionListResponse:
    """仅返回正常且已转正门店，不含联系人/电话."""
    return MerchantBrokerService(db).search_selectable_stores(
        page=pagination.page,
        page_size=pagination.page_size,
        keyword=keyword,
    )


@router.post("/brokers/me/store", status_code=status.HTTP_201_CREATED, summary="经纪人注册创建门店")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_store_as_broker(
    request: Request,
    body: MerchantStoreCreate,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> MerchantStoreCreateResult:
    """经纪人创建待审核门店，并自动绑定创建人."""
    store, duplicates = MerchantBrokerService(db).create_store_for_broker(current_user, body, request=request)
    return MerchantStoreCreateResult(
        store=store_response(store, cooperation_label_map(db)),
        first_visit=None,
        duplicate_candidates=duplicates,
    )


@router.post(
    "/stores/{store_id}/brokers",
    status_code=status.HTTP_201_CREATED,
    summary="门店下补录经纪人",
)
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_store_broker(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    body: BrokerStoreCreate,
    db: DbSessionDep,
    current_user: MerchantCWriteDep,
) -> BrokerResponse:
    """员工在门店下直接新增经纪人并立即绑定（REQ-IT5-05：发起协议缺签署人时补录）."""
    return MerchantBrokerService(db).create_for_store(current_user, store_id, body, request=request)


@router.get("/stores/{store_id}/brokers", summary="门店有效经纪人列表")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_store_brokers(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantCReadDep,
) -> list[BrokerResponse]:
    """线索录入二级联动：仅返回该门店有效绑定且启用的经纪人."""
    return MerchantBrokerService(db).list_store_brokers_for_user(current_user, store_id)


@router.get("/brokers/search", summary="经纪人搜索")
@limiter.limit(RateLimits.MERCHANT_READ)
def search_brokers(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantCReadDep,
    keyword: Annotated[str, Query(min_length=1, max_length=50, description="姓名/手机号关键词")],
) -> list[BrokerResponse]:
    """未选门店时按姓名/手机号搜索启用经纪人."""
    return MerchantBrokerService(db).search_active_brokers(keyword)


# -------------------- 拜访 --------------------
@router.post("/visits", status_code=status.HTTP_201_CREATED, summary="登记拜访")
@limiter.limit(RateLimits.MERCHANT_VISIT)
def create_visit(
    request: Request,
    body: MerchantVisitCreate,
    db: DbSessionDep,
    current_user: MerchantCVisitDep,
) -> MerchantVisitResponse:
    """已有门店拜访登记/补录（Q05/Q08）."""
    visit = MerchantVisitService(db).create(current_user, body, request=request)
    return MerchantVisitService(db).build_response(visit)


@router.get("/visits/{visit_id}", summary="拜访详情")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_visit(
    request: Request,
    visit_id: Annotated[str, Path(description="拜访ID")],
    db: DbSessionDep,
    current_user: MerchantCVisitDep,
) -> MerchantVisitResponse:
    """拜访详情（校验门店数据范围）."""
    service = MerchantVisitService(db)
    return service.build_response(service.get_visit(current_user, visit_id))


@router.get("/stores/{store_id}/visits", summary="门店拜访时间线")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_store_visits(
    request: Request,
    store_id: Annotated[str, Path(description="门店ID")],
    db: DbSessionDep,
    current_user: MerchantCVisitDep,
    pagination: PaginationDep,
) -> MerchantVisitListResponse:
    """门店拜访时间线（倒序）."""
    return MerchantVisitService(db).list_store_visits(
        current_user,
        store_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )
