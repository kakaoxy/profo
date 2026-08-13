"""区域伙伴招募计划 C 端公开路由.

前缀 ``/public/recruit``，游客可访问活动详情与商圈选项，访问埋点/留资需 ``aud=c`` 登录态。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Request
from fastapi.concurrency import run_in_threadpool

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.recruit import (
    RecruitBusinessAreaItem,
    RecruitCampaignDetailResponse,
    RecruitLeadCreate,
    RecruitLeadSubmitResponse,
    RecruitVisitCreate,
    RecruitVisitResponse,
    RecruitVisitUpdate,
)
from services.recruit import RecruitAttributionService, RecruitCampaignService
from services.system.exceptions import ValidationError
from services.system.wechat import WeChatAuthService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/recruit", tags=["public-recruit"])


@router.get(
    "/campaigns/{campaign_id}",
    summary="招募活动详情",
    description="返回分享标题/配图/详情模板内容，游客可访问；活动停用或不存在返回统一错误",
)
def get_campaign(
    campaign_id: Annotated[str, Path(description="活动ID")],
    db: DbSessionDep,
) -> RecruitCampaignDetailResponse:
    """获取招募活动详情."""
    service = RecruitCampaignService(db)
    campaign = service.get_enabled(campaign_id)
    return RecruitCampaignDetailResponse.model_validate(campaign)


@router.get(
    "/business-areas",
    summary="主营商圈选项",
    description="聚合小区表 distinct business_circle（按出现频次降序）",
)
def get_business_areas(db: DbSessionDep) -> list[RecruitBusinessAreaItem]:
    """获取主营商圈下拉选项."""
    service = RecruitCampaignService(db)
    return [RecruitBusinessAreaItem(name=name, count=count) for name, count in service.list_business_areas()]


@router.post(
    "/visits",
    summary="创建访问记录",
    description="PV +1，UV 按 openid_hash 去重",
)
@limiter.limit(RateLimits.RECRUIT_VISIT)
def create_visit(
    request: Request,
    body: RecruitVisitCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitVisitResponse:
    """创建访问记录."""
    service = RecruitAttributionService(db)
    visit = service.create_visit(current_user, body)
    return RecruitVisitResponse(id=visit.id)


@router.put(
    "/visits/{visit_id}",
    summary="上报离开",
    description="上报停留时长/深度浏览/点击授权，后端复核 is_deep_view",
)
@limiter.limit(RateLimits.RECRUIT_VISIT)
def update_visit(
    request: Request,
    visit_id: Annotated[str, Path(description="访问记录ID")],
    body: RecruitVisitUpdate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitVisitResponse:
    """上报访问离开信息.

    仅允许上报当前用户自己的访问记录（service 校验 visitor_id == current_user.id）。
    """
    service = RecruitAttributionService(db)
    visit = service.update_visit(visit_id, body, user_id=current_user.id)
    return RecruitVisitResponse(id=visit.id)


@router.post(
    "/leads",
    summary="提交留资（核心）",
    description="微信一键授权解密手机号 → 归因引擎落库 → 返回 {lead_id, is_new}",
)
@limiter.limit(RateLimits.RECRUIT_LEAD_SUBMIT)
async def submit_lead(
    request: Request,
    body: RecruitLeadCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitLeadSubmitResponse:
    """提交留资并归因."""
    # 校验活动启用（存在性 + 启用态），未传 campaign_id 时跳过
    if body.campaign_id is not None:
        RecruitCampaignService(db).get_enabled(body.campaign_id)

    # 复用微信一键授权解密链路（同步阻塞，放线程池）
    phone_info = await run_in_threadpool(WeChatAuthService.fetch_wechat_phone_number, body.code)
    phone = phone_info.get("phoneNumber")
    if not phone:
        msg = "微信手机号授权失败，请重新获取"
        raise ValidationError(msg)

    service = RecruitAttributionService(db)
    lead, is_new = service.submit_lead(
        str(phone),
        campaign_id=body.campaign_id,
        main_business_area=body.main_business_area,
        referrer=body.referrer,
        source=body.source,
        visit_id=body.visit_id,
        user_id=current_user.id,
    )
    return RecruitLeadSubmitResponse(lead_id=lead.id, is_new=is_new)
