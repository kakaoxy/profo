"""区域伙伴招募计划 C 端公开路由.

前缀 ``/public/recruit``，游客可访问活动详情与商圈选项，访问埋点/留资需 ``aud=c`` 登录态。
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Path, Query, Request
from fastapi.concurrency import run_in_threadpool

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from dependencies.common import PaginationDep
from models.recruit import RecruitLeadStatus
from schemas.growth_center import GrowthModule
from schemas.recruit import (
    RecruitBusinessAreaItem,
    RecruitCampaignDetailResponse,
    RecruitLeadCreate,
    RecruitLeadSubmitResponse,
    RecruitMyLeadItem,
    RecruitMyLeadListResponse,
    RecruitMyLeadPhoneResponse,
    RecruitMyShareStatsResponse,
    RecruitQRCodeResponse,
    RecruitQRSceneResponse,
    RecruitShareEventCreate,
    RecruitShareEventResponse,
    RecruitVisitCreate,
    RecruitVisitResponse,
    RecruitVisitUpdate,
)
from services.growth_center.customer_notify import notify_new_customer_lead
from services.recruit import (
    RecruitAttributionService,
    RecruitCampaignService,
    RecruitLeadService,
    RecruitQRCodeService,
)
from services.system.exceptions import ValidationError
from services.system.wechat import WeChatAuthService
from settings import settings
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone

router = APIRouter(prefix="/public/recruit", tags=["public-recruit"])

logger = logging.getLogger(__name__)


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
    response = RecruitCampaignDetailResponse.model_validate(campaign)
    # 订阅消息模板 ID 从 settings 透出（未配置为 None），供 C 端发起订阅授权
    response.subscribe_template_id = settings.wechat_recruit_lead_template_id or None
    return response


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
    # 仅首次新线索创建成功后触发员工订阅消息通知（阻塞调用放线程池；
    # 通知内部捕获一切异常仅记日志，绝不影响留资结果）
    if is_new:
        await run_in_threadpool(service.notify_new_lead, lead)
        # 「我的客户」新线索通知（customer 模板，与 notify_new_lead 模板不同、
        # 订阅授权独立，两者并存不算重复推送；customer 模板未配置时静默跳过）
        await run_in_threadpool(
            notify_new_customer_lead,
            db,
            GrowthModule.RECRUIT.value,
            lead.id,
            lead.referrer_employee_id,
            lead.main_business_area,
        )
    return RecruitLeadSubmitResponse(lead_id=lead.id, is_new=is_new)


@router.post(
    "/share-events",
    summary="上报分享事件",
    description="分享事件写入（漏斗第 1 级数据源），需 aud=c 登录态 + 限流",
)
@limiter.limit(RateLimits.RECRUIT_SHARE)
def create_share_event(
    request: Request,
    body: RecruitShareEventCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitShareEventResponse:
    """创建分享事件."""
    service = RecruitAttributionService(db)
    event = service.create_share_event(current_user, body)
    return RecruitShareEventResponse(id=event.id)


@router.get(
    "/campaigns/{campaign_id}/qrcode",
    summary="生成员工专属小程序码",
    description="员工登录态生成带自己归属参数的活动小程序码，同一（活动,员工）复用短码，返回短码与 base64 图片",
)
@limiter.limit(RateLimits.RECRUIT_QR_GENERATE)
def generate_my_campaign_qrcode(
    request: Request,
    campaign_id: Annotated[str, Path(description="活动ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitQRCodeResponse:
    """生成员工专属活动小程序码（employee_id 取当前登录用户，禁止前端传入）."""
    service = RecruitQRCodeService(db)
    result = service.generate(campaign_id, current_user.id)
    return RecruitQRCodeResponse(**result)


@router.get(
    "/my/leads",
    summary="我的线索",
    description="归属当前员工的招募线索（手机号脱敏），分页 + 可选跟进状态筛选；归属强制服务端过滤",
)
def list_my_leads(
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
    pagination: PaginationDep,
    status: Annotated[RecruitLeadStatus | None, Query(description="跟进状态（可选）")] = None,
) -> RecruitMyLeadListResponse:
    """我的线索列表."""
    result = RecruitLeadService(db).list_my_leads(
        current_user,
        page=pagination.page,
        page_size=pagination.page_size,
        status=status,
    )
    items = [
        RecruitMyLeadItem(
            id=lead.id,
            phone_masked=mask_phone(lead.phone),
            main_business_area=lead.main_business_area,
            status=lead.status,
            source=lead.source,
            created_at=lead.created_at,
        )
        for lead in result["items"]
    ]
    return RecruitMyLeadListResponse(
        items=items,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get(
    "/my/leads/{lead_id}/phone",
    summary="查看我的线索完整手机号",
    description="归属当前员工的线索返回完整手机号（解密），查看即视为已联系（new 自动流转 contacted）；"
    "不存在或不归属统一 404，隐私敏感限流",
)
@limiter.limit(RateLimits.RECRUIT_PHONE_VIEW)
def get_my_lead_phone(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitMyLeadPhoneResponse:
    """查看我的线索完整手机号（联系客户闭环入口）.

    归属强制服务端过滤（service 内 referrer_employee_id == current_user.id），
    查看后 new 线索自动流转为 contacted 并返回最新状态。
    """
    phone, lead_status = RecruitLeadService(db).get_my_lead_phone(current_user, lead_id)
    # 记录访问日志（操作人/线索ID），与后台 get_lead_phone 口径一致
    logger.info("C端查看线索完整号码：lead_id=%s, operator=%s", lead_id, current_user.id)
    return RecruitMyLeadPhoneResponse(phone=phone, status=lead_status)


@router.get(
    "/my/share-stats",
    summary="我的分享统计",
    description="分享次数 / 经我分享的打开 PV/UV / 归属我的线索数",
)
@limiter.limit(RateLimits.PUBLIC_MY_SHARE_STATS)
def get_my_share_stats(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> RecruitMyShareStatsResponse:
    """我的分享统计."""
    data = RecruitLeadService(db).get_my_share_stats(current_user)
    return RecruitMyShareStatsResponse(**data)


@router.get(
    "/qr/{code}",
    summary="解析小程序码短码",
    description="游客可访问，限流；返回活动ID与来源员工ID",
)
@limiter.limit(RateLimits.RECRUIT_QR_SCENE)
def resolve_qr_code(
    request: Request,
    code: Annotated[str, Path(min_length=1, max_length=8, description="8位短码")],
    db: DbSessionDep,
) -> RecruitQRSceneResponse:
    """解析短码."""
    service = RecruitQRCodeService(db)
    result = service.resolve(code)
    return RecruitQRSceneResponse(**result)
