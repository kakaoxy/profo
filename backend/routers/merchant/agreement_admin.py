"""后台电子协议与模板路由（前缀 /admin/merchant）."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from dependencies.auth import (
    DbSessionDep,
    MerchantAgreementPermDep,
    MerchantAgreementReviewPermDep,
)
from dependencies.common import PaginationDep
from schemas.merchant import (
    AgreementCreateRequest,
    AgreementExpiringEvent,
    AgreementListResponse,
    AgreementResponse,
    AgreementReviewRequest,
    AgreementScanUploadRequest,
    AgreementTemplateCreate,
    AgreementTemplateResponse,
    AgreementTemplateUpdate,
    AgreementVoidRequest,
)
from services.merchant.agreement import MerchantAgreementService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/admin/merchant", tags=["merchant-admin-agreement"])


# -------------------- 模板 --------------------
@router.get("/agreement-templates", summary="协议模板列表")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_templates(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantAgreementPermDep,
) -> list[AgreementTemplateResponse]:
    """协议模板列表（含停用，便于维护）."""
    return MerchantAgreementService(db).list_templates(include_disabled=True)


@router.post("/agreement-templates", status_code=status.HTTP_201_CREATED, summary="新建协议模板")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_template(
    request: Request,
    body: AgreementTemplateCreate,
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
) -> AgreementTemplateResponse:
    """运营维护多套模板."""
    return MerchantAgreementService(db).create_template(
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.put("/agreement-templates/{template_id}", summary="编辑协议模板")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def update_template(
    request: Request,
    template_id: Annotated[str, Path(description="模板ID")],
    body: AgreementTemplateUpdate,
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
) -> AgreementTemplateResponse:
    """停用不影响已发起协议."""
    return MerchantAgreementService(db).update_template(
        template_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


# -------------------- 协议 --------------------
@router.get("/agreements", summary="协议列表")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_agreements(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
    pagination: PaginationDep,
    store_id: str | None = None,
    company_id: str | None = None,
    agreement_status: Annotated[str | None, Query(alias="status")] = None,
    agreement_no: str | None = None,
) -> AgreementListResponse:
    """后台协议列表（数据范围过滤）."""
    return MerchantAgreementService(db).search(
        current_user,
        page=pagination.page,
        page_size=pagination.page_size,
        store_id=store_id,
        company_id=company_id,
        status=agreement_status,
        agreement_no=agreement_no,
    )


@router.post("/agreements", status_code=status.HTTP_201_CREATED, summary="后台发起协议")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_agreement(
    request: Request,
    body: AgreementCreateRequest,
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
) -> AgreementResponse:
    """运营代发起协议."""
    return MerchantAgreementService(db).create(current_user, body, request=request)


@router.get("/agreements/expiring-events", summary="协议到期事件扫描")
@limiter.limit(RateLimits.MERCHANT_READ)
def scan_agreement_expiring(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantAgreementPermDep,
    days: Annotated[int, Query(ge=1, le=90)] = 30,
) -> list[AgreementExpiringEvent]:
    """返回距到期 ≤N 天的已签署协议事件（V09 消费）."""
    return MerchantAgreementService(db).scan_expiring(days=days)


@router.post("/agreements/expire-scan", summary="手动执行到期状态扫描")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def run_expire_scan(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantAgreementPermDep,
) -> dict[str, int]:
    """将已到期协议置为已过期，返回更新条数."""
    return {"updated": MerchantAgreementService(db).expire_due()}


@router.get("/agreements/{agreement_id}", summary="协议详情")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_agreement(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
) -> AgreementResponse:
    """协议详情."""
    return MerchantAgreementService(db).get(current_user, agreement_id)


@router.post("/agreements/{agreement_id}/review", summary="审核协议")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def review_agreement(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    body: AgreementReviewRequest,
    db: DbSessionDep,
    current_user: MerchantAgreementReviewPermDep,
) -> AgreementResponse:
    """通过进入待签署；驳回记录原因（仅 admin/operator，BR-M04-031）."""
    return MerchantAgreementService(db).review(
        agreement_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/agreements/{agreement_id}/scan", summary="上传盖章扫描件")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def upload_agreement_scan(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    body: AgreementScanUploadRequest,
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
) -> AgreementResponse:
    """线下盖章件归档，协议置已签署."""
    return MerchantAgreementService(db).upload_scan(
        agreement_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/agreements/{agreement_id}/void", summary="作废协议")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def void_agreement(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    body: AgreementVoidRequest,
    db: DbSessionDep,
    current_user: MerchantAgreementPermDep,
) -> AgreementResponse:
    """作废保留文件与历史."""
    return MerchantAgreementService(db).void(
        agreement_id,
        body,
        operator_id=str(current_user.id),
        request=request,
    )
