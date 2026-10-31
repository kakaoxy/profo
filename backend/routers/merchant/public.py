"""小程序员工侧商户路由（前缀 /public/merchant，C 端令牌 + 后台身份）."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from dependencies.auth import DbSessionDep
from dependencies.common import PaginationDep
from routers.merchant.deps import (
    MerchantCReadDep,
    MerchantCVisitDep,
    MerchantCWriteDep,
    MerchantCWriteVisitDep,
)
from schemas.merchant import (
    MerchantBusinessCircleResponse,
    MerchantCompanyCreate,
    MerchantCompanyListResponse,
    MerchantCompanyResponse,
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
    MerchantStoreUpdate,
    MerchantVisitCreate,
    MerchantVisitListResponse,
    MerchantVisitResponse,
)
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
) -> MerchantStoreListResponse:
    """员工可搜索本人拓展/本人拜访的门店（D9/Q48）."""
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


@router.post("/stores", status_code=status.HTTP_201_CREATED, summary="员工新建门店并登记首访")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_store(
    request: Request,
    body: MerchantStoreCreate,
    db: DbSessionDep,
    current_user: MerchantCWriteVisitDep,
) -> MerchantStoreCreateResult:
    """员工现场新建门店（必须与首访同事务，S01）."""
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
