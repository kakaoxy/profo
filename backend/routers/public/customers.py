"""C端公开「我的客户」路由（小程序员工侧跨模块聚合）.

鉴权/当前用户解析对齐 ``routers/public/leads.py`` 的 my/acquired 模式
（C 端令牌 CurrentCustomerUserDep），归属收窄在服务层强制。
注意：/my/{module}/{lead_id} 系列动态路由必须定义在 /my/* 静态路由之后。
"""

import logging
from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status
from fastapi.concurrency import run_in_threadpool

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.growth_center import (
    CustomerFollowUpCreate,
    GrowthModule,
    MyCustomerBadgeResponse,
    MyCustomerDetailResponse,
    MyCustomerFollowUpItem,
    MyCustomerListResponse,
    MyCustomerPhoneResponse,
    MyCustomerShareStatsResponse,
    MyCustomerStatusUpdateRequest,
    MyCustomerStatusUpdateResponse,
    MyCustomerSubscribeTemplateResponse,
    UnifiedLeadStatus,
)
from services.growth_center.my_customers import MyCustomerService
from services.growth_center.my_customers_flow import MyCustomerFlowService
from settings import settings
from utils.common import RateLimits, limiter

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/public/customers", tags=["public-customers"])

# 小程序列表页固定 page_size=10，上限保护防止单页过大
MAX_PAGE_SIZE = 50
DEFAULT_PAGE_SIZE = 10


@router.get(
    "/my/badge",
    summary="我的客户角标",
    description="统一状态为 new 的线索计数（该用户全部线索口径）",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_customers_badge(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> MyCustomerBadgeResponse:
    """我的客户角标（profile 入口红点）."""
    new_count = MyCustomerService(db).badge(user_id=current_user.id)
    return MyCustomerBadgeResponse(new_count=new_count)


@router.get(
    "/my",
    summary="我的客户列表",
    description="跨 4 链路（估价/预约/房源单/招募）归属当前员工的统一线索分页列表，"
    "含 module_counts/status_counts（全部线索口径）",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_customers(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
    module: Annotated[GrowthModule | None, Query(description="模块筛选（缺省=全部）")] = None,
    lead_status: Annotated[UnifiedLeadStatus | None, Query(alias="status", description="统一状态筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE, description="每页数量")] = DEFAULT_PAGE_SIZE,
) -> MyCustomerListResponse:
    """我的客户统一列表（归属收窄 + 模块/统一状态筛选）."""
    result = MyCustomerService(db).list(
        user_id=current_user.id,
        page=page,
        page_size=page_size,
        module=module,
        status=lead_status,
    )
    return MyCustomerListResponse.model_validate(result)


@router.get(
    "/my/share-stats",
    summary="我的客户分享统计",
    description="四链路 share-stats 逐字段求和（昨日/累计 × 分享/PV/UV/留资），口径与各线一致",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_customers_share_stats(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> MyCustomerShareStatsResponse:
    """我的客户漏斗统计卡（列表页顶部）."""
    data = MyCustomerService(db).share_stats(current_user)
    return MyCustomerShareStatsResponse(**data)


@router.get(
    "/my/subscribe-template",
    summary="我的客户订阅消息模板配置",
    description="返回订阅消息模板ID（settings 未配置时为 null）；实际推送为二期，当前仅用于小程序端订阅授权",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_customers_subscribe_template(
    request: Request,
    current_user: CurrentCustomerUserDep,
) -> MyCustomerSubscribeTemplateResponse:
    """订阅模板配置查询（二期推送预留）."""
    template_id = settings.wechat_customer_lead_template_id or None
    return MyCustomerSubscribeTemplateResponse(template_id=template_id)


@router.get(
    "/my/{module}/{lead_id}",
    summary="我的客户线索详情",
    description="归属校验（非归属统一 404）+ 归因时间线 + 模块差异业务字段 + 统一状态",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_customer_detail(
    request: Request,
    module: GrowthModule,
    lead_id: Annotated[str, Path(description="线索ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> MyCustomerDetailResponse:
    """我的客户线索详情（详情页）."""
    result = MyCustomerService(db).detail(module=module, lead_id=lead_id, user_id=current_user.id)
    return MyCustomerDetailResponse.model_validate(result)


@router.get(
    "/my/{module}/{lead_id}/phone",
    summary="查看客户完整手机号",
    description="归属校验后返回解密手机号；招募线查看即视为已联系（new→contacted），其余线状态不变；隐私敏感限流",
)
@limiter.limit(RateLimits.RECRUIT_PHONE_VIEW)
def get_my_customer_phone(
    request: Request,
    module: GrowthModule,
    lead_id: Annotated[str, Path(description="线索ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> MyCustomerPhoneResponse:
    """联系客户闭环：查看完整号码."""
    data = MyCustomerService(db).phone(module=module, lead_id=lead_id, user=current_user)
    # 记录访问日志（操作人/模块/线索ID），与 recruit/valuations 线口径一致
    logger.info(
        "C端查看我的客户完整号码：module=%s, lead_id=%s, operator=%s",
        module.value,
        lead_id,
        current_user.id,
    )
    return MyCustomerPhoneResponse(**data)


@router.put(
    "/my/{module}/{lead_id}/status",
    summary="我的客户状态流转",
    description="统一状态矩阵校验（非法流转 409）；估价/房源单仅支持淘汰旁路（reason 必填）；"
    "预约状态机二期一律 409；remark 非空自动落一条系统跟进记录",
)
@limiter.limit(RateLimits.LEAD_UPDATE)
async def update_my_customer_status(
    request: Request,
    module: GrowthModule,
    lead_id: Annotated[str, Path(description="线索ID")],
    body: MyCustomerStatusUpdateRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> MyCustomerStatusUpdateResponse:
    """状态流转（唯一写路径；行级锁在 Service 层，放线程池避免阻塞事件循环）."""
    result = await run_in_threadpool(
        MyCustomerFlowService(db).update_status,
        module=module,
        lead_id=lead_id,
        user_id=current_user.id,
        req=body,
    )
    return MyCustomerStatusUpdateResponse(**result)


@router.get(
    "/my/{module}/{lead_id}/follow-ups",
    summary="我的客户跟进记录",
    description="归属校验后按跟进时间倒序返回",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_customer_follow_ups(
    request: Request,
    module: GrowthModule,
    lead_id: Annotated[str, Path(description="线索ID")],
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> list[MyCustomerFollowUpItem]:
    """跟进记录时间线（详情页）."""
    rows = MyCustomerFlowService(db).list_follow_ups(module=module, lead_id=lead_id, user_id=current_user.id)
    return [MyCustomerFollowUpItem.model_validate(row) for row in rows]


@router.post(
    "/my/{module}/{lead_id}/follow-ups",
    status_code=status.HTTP_201_CREATED,
    summary="新增我的客户跟进记录",
    description="content 必填（1-500 字符），写入 created_by_id=当前用户",
)
@limiter.limit(RateLimits.LEAD_UPDATE)
def create_my_customer_follow_up(
    request: Request,
    module: GrowthModule,
    lead_id: Annotated[str, Path(description="线索ID")],
    body: CustomerFollowUpCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> MyCustomerFollowUpItem:
    """新增跟进记录."""
    row = MyCustomerFlowService(db).create_follow_up(
        module=module,
        lead_id=lead_id,
        user_id=current_user.id,
        content=body.content,
    )
    return MyCustomerFollowUpItem.model_validate(row)
