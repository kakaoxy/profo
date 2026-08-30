"""C端估价页分享埋点路由.

访问/分享埋点与「我的分享统计」（与房源侧同构，免登录 visitor_id UV 口径）.
"""

from fastapi import APIRouter, Request

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.public import (
    PublicShareEventRequest,
    PublicShareStatsResponse,
    PublicTrackingEventResponse,
    PublicValuationSubscribeTemplateResponse,
    PublicVisitEventRequest,
)
from services.leads.share_tracking import ValuationShareTrackingService
from settings import settings
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/valuations", tags=["public-valuations"])


@router.get(
    "/subscribe-template",
    summary="获取授权价提醒订阅模板 ID",
    description="免登录下发估价授权价变更提醒的订阅消息模板 ID；后端未配置时返回 null",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def get_subscribe_template(request: Request) -> PublicValuationSubscribeTemplateResponse:
    """下发估价授权价提醒订阅模板 ID（未配置返回 null，前端隐藏授权入口）."""
    template_id = settings.wechat_valuation_price_template_id
    return PublicValuationSubscribeTemplateResponse(
        subscribe_template_id=template_id or None,
    )


@router.post(
    "/visit-events",
    summary="上报估价页访问埋点",
    description="免登录，PV +1，UV 按匿名 visitor_id 去重",
)
@limiter.limit(RateLimits.VALUATION_VISIT)
def create_visit_event(
    request: Request,
    body: PublicVisitEventRequest,
    db: DbSessionDep,
) -> PublicTrackingEventResponse:
    """上报估价页访问埋点."""
    visit = ValuationShareTrackingService(db).create_visit_event(body)
    return PublicTrackingEventResponse(id=visit.id)


@router.post(
    "/share-events",
    summary="上报估价页分享事件",
    description="需 C 端登录态（员工经附加 customer 角色访问），employee_id 服务端取当前用户；限流",
)
@limiter.limit(RateLimits.VALUATION_SHARE)
def create_share_event(
    request: Request,
    body: PublicShareEventRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicTrackingEventResponse:
    """上报估价页分享事件."""
    event = ValuationShareTrackingService(db).create_share_event(current_user, body)
    return PublicTrackingEventResponse(id=event.id)


@router.get(
    "/my/share-stats",
    summary="我的评估分享统计",
    description="当前员工的估价页分享次数 / 经我分享打开 PV/UV / 分享归因我的线索数（昨日 + 累计），需登录",
)
def get_my_share_stats(
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicShareStatsResponse:
    """我的评估分享统计."""
    data = ValuationShareTrackingService(db).get_my_share_stats(current_user)
    return PublicShareStatsResponse(**data)
