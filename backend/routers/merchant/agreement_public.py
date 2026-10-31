"""小程序员工侧电子协议路由（前缀 /public/merchant）."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from dependencies.auth import DbSessionDep
from dependencies.common import PaginationDep
from routers.merchant.deps import MerchantCAgreementDep
from schemas.merchant import (
    AgreementCreateRequest,
    AgreementListResponse,
    AgreementResponse,
    AgreementScanUploadRequest,
    AgreementSignRequest,
    AgreementSupplementCreate,
    AgreementTemplateResponse,
)
from services.merchant.agreement import MerchantAgreementService
from services.merchant.scope import ensure_scope_role
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/merchant", tags=["merchant-employee-agreement"])


@router.get("/agreement-templates", summary="可用协议模板")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_agreement_templates(
    request: Request,
    db: DbSessionDep,
    _current_user: MerchantCAgreementDep,
) -> list[AgreementTemplateResponse]:
    """员工发起协议时可选模板（仅启用）."""
    return MerchantAgreementService(db).list_templates(include_disabled=False)


@router.post("/agreements", status_code=status.HTTP_201_CREATED, summary="发起协议")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def create_agreement(
    request: Request,
    body: AgreementCreateRequest,
    db: DbSessionDep,
    current_user: MerchantCAgreementDep,
) -> AgreementResponse:
    """发起后状态未发起、review_status=待审核（S05）."""
    return MerchantAgreementService(db).create(current_user, body, request=request)


@router.get("/agreements", summary="协议列表")
@limiter.limit(RateLimits.MERCHANT_READ)
def list_agreements(
    request: Request,
    db: DbSessionDep,
    current_user: MerchantCAgreementDep,
    pagination: PaginationDep,
    store_id: str | None = None,
    company_id: str | None = None,
    agreement_status: Annotated[str | None, Query(alias="status")] = None,
    agreement_no: str | None = None,
) -> AgreementListResponse:
    """按门店/公司/状态/编号筛选（数据范围过滤）."""
    return MerchantAgreementService(db).search(
        current_user,
        page=pagination.page,
        page_size=pagination.page_size,
        store_id=store_id,
        company_id=company_id,
        status=agreement_status,
        agreement_no=agreement_no,
    )


@router.get("/agreements/{agreement_id}", summary="协议详情")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_agreement(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    db: DbSessionDep,
    current_user: MerchantCAgreementDep,
) -> AgreementResponse:
    """协议详情（校验数据范围）."""
    return MerchantAgreementService(db).get(current_user, agreement_id)


@router.post("/agreements/{agreement_id}/sign", summary="手写签名并生成 PDF")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def sign_agreement(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    body: AgreementSignRequest,
    db: DbSessionDep,
    current_user: MerchantCAgreementDep,
) -> AgreementResponse:
    """签署后生成 PDF；门店主体协议联动合作状态为已合作."""
    return MerchantAgreementService(db).sign(
        agreement_id,
        body,
        signer_id=str(current_user.id),
        privileged=ensure_scope_role(current_user),
        request=request,
    )


@router.post("/agreements/{agreement_id}/scan", summary="员工上传线下盖章扫描件")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def upload_agreement_scan(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    body: AgreementScanUploadRequest,
    db: DbSessionDep,
    current_user: MerchantCAgreementDep,
) -> AgreementResponse:
    """校验门店数据范围后归档盖章件，签署人须与记录一致（运营可代传）."""
    service = MerchantAgreementService(db)
    service.get(current_user, agreement_id)
    return service.upload_scan(
        agreement_id,
        body,
        operator_id=str(current_user.id),
        privileged=ensure_scope_role(current_user),
        request=request,
    )


@router.post("/agreements/{agreement_id}/supplement", status_code=status.HTTP_201_CREATED, summary="新增补充协议")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def add_supplement(
    request: Request,
    agreement_id: Annotated[str, Path(description="原协议ID")],
    body: AgreementSupplementCreate,
    db: DbSessionDep,
    current_user: MerchantCAgreementDep,
) -> AgreementResponse:
    """补充协议独立记录并关联原协议."""
    return MerchantAgreementService(db).add_supplement(current_user, agreement_id, body, request=request)
