"""C端公开房源订阅通知路由.

房源频道订阅（上新/调价）：模板下发（免登录）+ 额度状态查询 + 授权结果上报。
对齐 routers/public/valuations.py 的 subscribe-template 先例与
routers/public/projects.py 的路由风格。
"""

from typing import Annotated

from fastapi import APIRouter, Request
from fastapi import Path as PathParam

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.l4_marketing import (
    PublicMarketingProjectSubscriptionStatusResponse,
    PublicMarketingSubscribeReportRequest,
    PublicMarketingSubscribeReportResponse,
    PublicMarketingSubscribeTemplateResponse,
    PublicMarketingSubscriptionStatusResponse,
)
from services.marketing.subscription import MarketingSubscriptionService
from services.system import subscribe_templates
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/marketing", tags=["public-marketing"])


@router.get(
    "/subscribe-template",
    summary="获取房源订阅提醒模板 ID",
    description="免登录下发房源上新/调价提醒的订阅消息模板 ID；两个模板均未配置时 subscribe_enabled=false",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def get_subscribe_template(request: Request, db: DbSessionDep) -> PublicMarketingSubscribeTemplateResponse:
    """下发房源订阅提醒模板 ID（未配置返回 null，前端隐藏订阅入口）."""
    new_listing_id = subscribe_templates.resolve_template_id(db, "project_new")
    price_change_id = subscribe_templates.resolve_template_id(db, "project_price_change")
    return PublicMarketingSubscribeTemplateResponse(
        subscribe_enabled=bool(new_listing_id or price_change_id),
        new_listing_template_id=new_listing_id or None,
        price_change_template_id=price_change_id or None,
    )


@router.get(
    "/subscriptions/status",
    summary="获取我的订阅额度状态",
    description="当前 C 端用户的上新/调价提醒剩余额度与最近订阅时间，需登录",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def get_subscription_status(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicMarketingSubscriptionStatusResponse:
    """查询当前用户订阅额度状态."""
    status = MarketingSubscriptionService(db).get_status(str(current_user.id))
    return PublicMarketingSubscriptionStatusResponse(**status)


@router.post(
    "/subscriptions/report",
    summary="上报订阅授权结果",
    description="小程序 requestSubscribeMessage 结果上报；仅 accept 计入对应频道额度（额度累计），需登录",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def report_subscription(
    request: Request,
    body: PublicMarketingSubscribeReportRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicMarketingSubscribeReportResponse:
    """上报订阅授权结果（accept 累计额度，其余状态仅留痕不计数）."""
    quotas = MarketingSubscriptionService(db).report_result(
        user_id=str(current_user.id),
        results=[(item.template_id, item.status) for item in body.results],
    )
    return PublicMarketingSubscribeReportResponse(**quotas)


@router.get(
    "/projects/{project_id}/subscription",
    summary="查询房源级订阅状态",
    description="当前用户对指定房源的调价提醒订阅状态（额度/最近订阅时间），需登录；未登录 401（前端静默）",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def get_project_subscription_status(
    request: Request,
    project_id: Annotated[int, PathParam(ge=1, description="房源ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicMarketingProjectSubscriptionStatusResponse:
    """查询当前用户对指定房源的订阅状态."""
    status = MarketingSubscriptionService(db).get_project_status(
        user_id=str(current_user.id),
        marketing_project_id=project_id,
    )
    return PublicMarketingProjectSubscriptionStatusResponse(**status)


@router.post(
    "/projects/{project_id}/subscription/report",
    summary="上报房源级订阅授权结果",
    description="小程序 requestSubscribeMessage 结果上报（房源级调价提醒，涨降都推）；"
    "仅 accept 计入房源级额度 +1，需登录。模板 ID 映射复用 project_price_change 配置；房源不存在时 404",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def report_project_subscription(
    request: Request,
    project_id: Annotated[int, PathParam(ge=1, description="房源ID")],
    body: PublicMarketingSubscribeReportRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicMarketingProjectSubscriptionStatusResponse:
    """上报房源级订阅授权结果（accept 累计房源级额度，其余状态仅留痕不计数）."""
    status = MarketingSubscriptionService(db).report_project_result(
        user_id=str(current_user.id),
        marketing_project_id=project_id,
        results=[(item.template_id, item.status) for item in body.results],
    )
    return PublicMarketingProjectSubscriptionStatusResponse(**status)


@router.post(
    "/projects/{project_id}/subscription/cancel",
    summary="取消房源级调价提醒",
    description="清零该用户对此房源的调价提醒剩余额度（后续调价不再推送），保留订阅行；"
    "需登录；幂等（未订阅时返回未订阅状态），房源不存在时 404",
)
@limiter.limit(RateLimits.VALUATION_SUBSCRIBE_TEMPLATE)
def cancel_project_subscription(
    request: Request,
    project_id: Annotated[int, PathParam(ge=1, description="房源ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicMarketingProjectSubscriptionStatusResponse:
    """取消房源级调价提醒（清零剩余额度，保留订阅行）."""
    status = MarketingSubscriptionService(db).cancel_project_subscription(
        user_id=str(current_user.id),
        marketing_project_id=project_id,
    )
    return PublicMarketingProjectSubscriptionStatusResponse(**status)
