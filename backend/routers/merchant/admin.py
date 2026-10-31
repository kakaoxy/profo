"""商户管理后台路由（前缀 /admin/merchant）."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from dependencies.auth import (
    DbSessionDep,
    MerchantReadPermDep,
    MerchantVisitPermDep,
    MerchantWritePermDep,
)
from dependencies.common import PaginationDep
from schemas.merchant import (
    MerchantBusinessCircleResponse,
    MerchantCompanyCreate,
    MerchantCompanyListResponse,
    MerchantCompanyResponse,
    MerchantCompanyUpdate,
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
    MerchantVisitListResponse,
)
from services.merchant.company import MerchantCompanyService
from services.merchant.serializers import company_response, cooperation_label_map, store_response
from services.merchant.store import MerchantStoreService
from services.merchant.visit import MerchantVisitService
from utils.common import RateLimits, limiter

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
