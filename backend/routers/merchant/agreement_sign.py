"""商户侧协议签署路由（REQ-IT5-03，前缀 /public/merchant/agreement-sign）.

设计口径（用户决策 Q4=B）：
- 员工发起协议后把链接分享给商户；
- 商户用微信登录小程序（C 端令牌）后打开链接，凭链接里的 ``code`` 进入核对页；
- 核对协议正文与商户信息后手写签名提交，员工侧即看到“已签署”。

不挂 ``merchant:agreement`` 权限（商户没有该权限），仅校验 C 端身份 + 分享码，
因此不能复用 ``routers/merchant/agreement_public.py`` 的员工侧依赖。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.merchant import AgreementMerchantSignRequest, AgreementResponse, AgreementSignView
from services.merchant.agreement import MerchantAgreementService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/merchant/agreement-sign", tags=["merchant-merchant-agreement"])


@router.get("/{agreement_id}", summary="商户签署视图")
@limiter.limit(RateLimits.MERCHANT_READ)
def get_agreement_sign_view(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    db: DbSessionDep,
    _current_user: CurrentCustomerUserDep,
    code: Annotated[str, Query(min_length=8, max_length=36, description="分享链接中的签署码")],
) -> AgreementSignView:
    """商户打开分享链接后的核对视图（协议正文、主体、签署人信息与可签状态）."""
    return MerchantAgreementService(db).merchant_sign_view(agreement_id, code)


@router.post("/{agreement_id}", summary="商户提交签署")
@limiter.limit(RateLimits.MERCHANT_WRITE)
def submit_agreement_sign(
    request: Request,
    agreement_id: Annotated[str, Path(description="协议ID")],
    body: AgreementMerchantSignRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
    code: Annotated[str, Query(min_length=8, max_length=36, description="分享链接中的签署码")],
) -> AgreementResponse:
    """商户手写签名提交：生成 PDF、协议置已签署（门店主体自动联动已合作）."""
    return MerchantAgreementService(db).merchant_sign(
        agreement_id,
        code,
        body,
        signer_user_id=str(current_user.id),
        request=request,
    )
