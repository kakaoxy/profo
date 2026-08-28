"""C端公开线索（卖房估价）路由.

提交估价、我的估价列表、估价详情.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status

from dependencies.auth import CurrentCInternalUserDep, CurrentCustomerUserDep, DbSessionDep
from dependencies.common import PaginationDep
from models.common import LeadStatus
from models.lead import Lead
from schemas.lead import (
    HandledAssessmentQueueResponse,
    HandledItem,
    LeadAssessmentAuthorizeRequest,
    LeadAssessmentAuthorizeResponse,
    LeadCreate,
    LeadEvalHistoryCreate,
    LeadEvalHistoryResponse,
    PendingAssessmentFilter,
    PendingAssessmentQueueItem,
    PendingAssessmentQueueResponse,
)
from schemas.public import (
    PublicAcquiredLeadListItem,
    PublicAcquiredLeadListResponse,
    PublicAcquiredLeadPhoneResponse,
    PublicAcquiredLeadStatsResponse,
    PublicFollowupItem,
    PublicLeadCountResponse,
    PublicLeadCreate,
    PublicLeadDetail,
    PublicLeadListItem,
    PublicLeadListResponse,
    PublicLeadResponse,
)
from services.leads.core import LeadService
from settings import settings
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone
from utils.image_processing import derive_thumbnail_url

router = APIRouter(prefix="/public/leads", tags=["public-leads"])

LEAD_STATUS_DISPLAY_MAP = {
    "pending_assessment": ("待评估", "#FFA500"),
    "pending_visit": ("待看房", "#2196F3"),
    "rejected": ("已放弃", "#F44336"),
    "visited": ("已看房", "#4CAF50"),
    "signed": ("已签约", "#9C27B0"),
    "lost_to_competitor": ("他司已成交", "#B7410E"),
}


def _effective_expected_price(lead: Lead) -> float | None:
    """业主心理预期价：优先取 expected_price，缺失时回退 total_price.

    与 admin/leads「总价列」口径一致——员工录入等场景仅写入 total_price（用户报价），
    不填 expected_price，回退后 C 端详情/列表方能正确展示业主预期价.
    """
    if lead.expected_price is not None:
        return float(lead.expected_price)
    if lead.total_price is not None:
        return float(lead.total_price)
    return None


def _get_status_display(status_code: str) -> tuple[str, str]:
    """获取状态显示名称和颜色."""
    display, color = LEAD_STATUS_DISPLAY_MAP.get(status_code, ("未知", "#999999"))
    return display, color


def _lead_source(lead: Lead) -> str:
    """线索来源标签：客户分享（customer_share）或 员工直录（employee_entry）.

    判定顺序：
    - 存在分享归因（referrer_id，C 端经员工分享提交）→ customer_share；
    - creator 存在且无后台身份（纯 C 端注册用户直接提交）→ customer_share；
    - 其余（员工创建 / 创建人缺失的历史数据）→ employee_entry。

    仅按 referrer_id 有无判定会在「C 端用户直接提交」场景误标员工直录：
    此类线索 referrer_id 为空但 creator 是普通 C 端用户。
    依赖查询层已预加载 creator 的 role/roles（has_backend_identity 需主/附加角色），
    避免此处逐行懒加载 N+1。

    Args:
        lead: 线索对象（需含已加载的 creator 关系）

    Returns:
        "customer_share" 或 "employee_entry"

    """
    if lead.referrer_id:
        return "customer_share"
    creator = lead.creator
    if creator is not None:
        # 方法内 import 避免潜在循环依赖（与 LeadService._resolve_referrer_id 一致）
        from services.system.auth import AuthService

        if not AuthService.has_backend_identity(creator):
            return "customer_share"
    return "employee_entry"


def get_lead_service(db: DbSessionDep) -> LeadService:
    """获取线索服务实例."""
    return LeadService(db)


LeadServiceDep = Annotated[LeadService, Depends(get_lead_service)]


def _pending_assessment_filter(
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[
        int,
        Query(ge=1, le=settings.max_page_size, description="每页数量"),
    ] = settings.default_page_size,
    search: Annotated[str | None, Query(max_length=50, description="小区名称搜索（作用于待评估段）")] = None,
) -> PendingAssessmentFilter:
    """解析待评估工作台查询参数.

    Returns:
        PendingAssessmentFilter: page/page_size/search 查询参数模型

    """
    return PendingAssessmentFilter(page=page, page_size=page_size, search=search)


PendingAssessmentFilterDep = Annotated[PendingAssessmentFilter, Depends(_pending_assessment_filter)]


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="提交卖房估价",
    description="C端用户提交卖房估价线索",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_CREATE)
def create_lead(
    request: Request,
    body: PublicLeadCreate,
    current_user: CurrentCustomerUserDep,
    service: LeadServiceDep,
) -> PublicLeadResponse:
    """C端用户提交卖房估价线索."""
    lead_data = LeadCreate(
        community_name=body.community_name,
        community_id=body.community_id,
        district=body.district,
        business_area=body.business_area,
        layout=body.layout,
        area=body.area,
        floor_info=body.floor_info,
        orientation=body.orientation,
        remarks=body.remarks,
        # 业主心理预期价即初始报价：写入 total_price 使 admin 总价列展示，
        # service.create_lead 据此生成 Initial Creation 价格历史；expected_price 保留为原始心理预期
        total_price=body.expected_price,
        expected_price=body.expected_price,
        images=body.images,
    )

    # 分享归因：referrer 透传 Service，由其校验员工存在、active 且有后台身份；
    # 无效（不存在/非 active/无后台身份）静默忽略（referrer_id=None），不阻断提交
    lead = service.create_lead(lead_data, creator_id=current_user.id, referrer=body.referrer)

    return PublicLeadResponse(
        id=lead.id,
        community_name=lead.community_name,
        layout=lead.layout,
        area=float(lead.area) if lead.area else None,
        floor_info=lead.floor_info,
        orientation=lead.orientation,
        total_price=float(lead.total_price) if lead.total_price else None,
        unit_price=float(lead.unit_price) if lead.unit_price else None,
        eval_price=float(lead.eval_price) if lead.eval_price is not None else None,
        # total_price 与 expected_price 在上方同源赋值，直接取 expected_price，
        # 不走 _effective_expected_price 的 total_price 回退（该回退仅适用于员工录入等
        # 只写 total_price 的场景），避免重复转换导致口径漂移
        expected_price=float(lead.expected_price) if lead.expected_price is not None else None,
        status=lead.status.value if hasattr(lead.status, "value") else str(lead.status),
        remarks=lead.remarks,
        images=lead.images or [],
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


@router.get(
    "/mine",
    summary="获取我的估价列表",
    description="获取当前用户创建的线索列表",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_leads(
    request: Request,
    current_user: CurrentCustomerUserDep,
    service: LeadServiceDep,
    pagination: PaginationDep,
) -> PublicLeadListResponse:
    """获取当前用户创建的线索列表（此路由必须在 /{lead_id} 之前定义以避免路径冲突）."""
    result = service.get_my_leads(user_id=current_user.id, page=pagination.page, page_size=pagination.page_size)

    items = []
    for lead in result["items"]:
        status_code = lead.status.value if hasattr(lead.status, "value") else str(lead.status)
        status_display, status_color = _get_status_display(status_code)
        items.append(
            PublicLeadListItem(
                id=lead.id,
                community_name=lead.community_name,
                layout=lead.layout,
                area=float(lead.area) if lead.area else None,
                total_price=float(lead.total_price) if lead.total_price else None,
                expected_price=_effective_expected_price(lead),
                status=status_code,
                status_display=status_display,
                status_color=status_color,
                created_at=lead.created_at,
                updated_at=lead.updated_at,
            ),
        )

    return PublicLeadListResponse(
        items=items,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get(
    "/count",
    summary="获取线索总数",
    description="C端公开接口，返回未删除线索总条数，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_lead_count(
    request: Request,
    service: LeadServiceDep,
) -> PublicLeadCountResponse:
    """获取未删除线索总条数（无需登录）."""
    return PublicLeadCountResponse(total=service.count_total())


@router.get(
    "/my/acquired",
    summary="获取我的获客列表",
    description="获取当前员工获客线索列表（分享归因 + 直接录入），此路由必须在 /{lead_id} 之前定义",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_acquired(
    request: Request,
    current_user: CurrentCustomerUserDep,
    service: LeadServiceDep,
    pagination: PaginationDep,
    lead_status: Annotated[LeadStatus | None, Query(alias="status", description="状态筛选")] = None,
) -> PublicAcquiredLeadListResponse:
    """获取当前员工获客线索列表（分享归因 + 直接录入）."""
    result = service.get_my_acquired(
        user_id=current_user.id,
        page=pagination.page,
        page_size=pagination.page_size,
        status=lead_status,
    )

    items = []
    for lead in result["items"]:
        status_code = lead.status.value if hasattr(lead.status, "value") else str(lead.status)
        status_display, status_color = _get_status_display(status_code)
        source = "customer_share" if lead.referrer_id == current_user.id else "employee_entry"
        phone_masked = None
        if lead.referrer_id == current_user.id and lead.creator is not None and lead.creator.phone:
            phone_masked = mask_phone(lead.creator.phone)
        items.append(
            PublicAcquiredLeadListItem(
                id=lead.id,
                community_name=lead.community_name,
                layout=lead.layout,
                area=float(lead.area) if lead.area is not None else None,
                expected_price=_effective_expected_price(lead),
                status=status_code,
                status_display=status_display,
                status_color=status_color,
                source=source,
                phone_masked=phone_masked,
                created_at=lead.created_at,
            ),
        )

    return PublicAcquiredLeadListResponse(
        items=items,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get(
    "/my/acquired/stats",
    summary="获取我的获客统计",
    description="获取当前员工获客线索各状态数量统计（与列表同口径）",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_acquired_stats(
    request: Request,
    current_user: CurrentCustomerUserDep,
    service: LeadServiceDep,
) -> PublicAcquiredLeadStatsResponse:
    """获取当前员工获客线索状态统计."""
    stats = service.get_my_acquired_stats(user_id=current_user.id)
    # 显式映射而非 **stats 展开：Service 返回的 dict 键为 LeadStatus 枚举值集合，
    # 未来 LeadStatus 新增枚举时，多余键会导致响应构造 500。
    # 此处逐字段 .get(默认 0)，新枚举计数在 schema 同步扩展前静默忽略，接口保持可用。
    return PublicAcquiredLeadStatsResponse(
        total=stats.get("total", 0),
        pending_assessment=stats.get(LeadStatus.PENDING_ASSESSMENT.value, 0),
        pending_visit=stats.get(LeadStatus.PENDING_VISIT.value, 0),
        visited=stats.get(LeadStatus.VISITED.value, 0),
        signed=stats.get(LeadStatus.SIGNED.value, 0),
        rejected=stats.get(LeadStatus.REJECTED.value, 0),
        lost_to_competitor=stats.get(LeadStatus.LOST_TO_COMPETITOR.value, 0),
    )


@router.get(
    "/pending-assessment",
    summary="获取待评估工作台队列",
    description="待评估分页队列 + 今日新增计数（仅 admin/operator）；「已处理」段请用 /handled-assessment",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_pending_assessment(
    request: Request,
    operator: CurrentCInternalUserDep,
    service: LeadServiceDep,
    filters: PendingAssessmentFilterDep,
) -> PendingAssessmentQueueResponse:
    """小程序员工侧待评估工作台「待评估」段."""
    result = service.get_pending_assessment_queue(
        page=filters.page,
        page_size=filters.page_size,
        search=filters.search,
    )

    items_pending = [
        PendingAssessmentQueueItem(
            id=lead.id,
            community_name=lead.community_name,
            district=lead.district,
            layout=lead.layout,
            area=float(lead.area) if lead.area is not None else None,
            floor_info=lead.floor_info,
            orientation=lead.orientation,
            remarks=lead.remarks,
            expected_price=_effective_expected_price(lead),
            images=(lead.images or [])[:3],
            source=_lead_source(lead),
            created_at=lead.created_at,
        )
        for lead in result["items_pending"]
    ]

    return PendingAssessmentQueueResponse(
        items_pending=items_pending,
        pending_total=result["pending_total"],
        pending_today=result["pending_today"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get(
    "/handled-assessment",
    summary="获取评估工作台已处理列表",
    description="本人经手线索全量分页（audit_time 倒序），search 按小区名过滤（仅 admin/operator）",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_handled_assessment(
    request: Request,
    operator: CurrentCInternalUserDep,
    service: LeadServiceDep,
    pagination: PaginationDep,
    search: Annotated[str | None, Query(max_length=50, description="小区名称搜索")] = None,
) -> HandledAssessmentQueueResponse:
    """小程序员工侧评估工作台「已处理」段（分页）."""
    result = service.get_handled_leads(
        user_id=operator.id,
        page=pagination.page,
        page_size=pagination.page_size,
        search=search,
    )

    items = []
    for lead in result["items"]:
        status_code = lead.status.value if hasattr(lead.status, "value") else str(lead.status)
        status_display, _ = _get_status_display(status_code)
        items.append(
            HandledItem(
                id=lead.id,
                community_name=lead.community_name,
                district=lead.district,
                layout=lead.layout,
                area=float(lead.area) if lead.area is not None else None,
                floor_info=lead.floor_info,
                orientation=lead.orientation,
                remarks=lead.remarks,
                expected_price=_effective_expected_price(lead),
                images=(lead.images or [])[:3],
                source=_lead_source(lead),
                status=lead.status,
                status_display=status_display,
                eval_price=float(lead.eval_price) if lead.eval_price is not None else None,
                audit_time=lead.audit_time,
            ),
        )

    return HandledAssessmentQueueResponse(
        items=items,
        handled_total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get(
    "/my/acquired/{lead_id}/phone",
    summary="获取获客线索客户手机号",
    description="获取当前员工分享归因线索的客户真实手机号（直接录入或非本人线索返回 null）",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_my_acquired_phone(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    current_user: CurrentCustomerUserDep,
    service: LeadServiceDep,
) -> PublicAcquiredLeadPhoneResponse:
    """获取当前员工获客线索的客户手机号."""
    phone = service.get_my_acquired_phone(user_id=current_user.id, lead_id=lead_id)
    return PublicAcquiredLeadPhoneResponse(phone=phone)


@router.post(
    "/my/acquired/{lead_id}/authorize-assessment",
    summary="评估价授权",
    description="对 pending_assessment 线索执行 approve/reject/lost 单事务流转（仅 admin/operator）",
)
@limiter.limit(RateLimits.LEAD_UPDATE)
def authorize_assessment(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    body: LeadAssessmentAuthorizeRequest,
    operator: CurrentCInternalUserDep,
    service: LeadServiceDep,
) -> LeadAssessmentAuthorizeResponse:
    """小程序员工侧评估授权（approve/reject/lost 原子流转）."""
    lead = service.authorize_assessment(user_id=operator.id, lead_id=lead_id, req=body)
    status_code = lead.status.value if hasattr(lead.status, "value") else str(lead.status)
    status_display, _ = _get_status_display(status_code)
    return LeadAssessmentAuthorizeResponse(
        id=lead.id,
        status=lead.status,
        status_display=status_display,
        eval_price=float(lead.eval_price) if lead.eval_price is not None else None,
    )


@router.post(
    "/my/acquired/{lead_id}/evaluations",
    status_code=status.HTTP_201_CREATED,
    summary="再次评估（调整评估价）",
    description="对 pending_visit/visited 线索追加评估记录并更新评估价，不改状态（仅 admin/operator）",
)
@limiter.limit(RateLimits.LEAD_UPDATE)
def create_reevaluation(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    body: LeadEvalHistoryCreate,
    operator: CurrentCInternalUserDep,
    service: LeadServiceDep,
) -> LeadEvalHistoryResponse:
    """小程序员工侧再次评估（语义对齐 admin「调整评估价」）."""
    rec = service.create_reevaluation(
        user_id=operator.id,
        lead_id=lead_id,
        eval_price=body.eval_price,
        remark=body.remark,
    )
    return LeadEvalHistoryResponse.model_validate(rec)


@router.get(
    "/my/acquired/{lead_id}/evaluations",
    summary="获取评估历史",
    description="按评估时间倒序返回线索评估记录（仅 admin/operator）",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_lead_evaluations(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    operator: CurrentCInternalUserDep,
    service: LeadServiceDep,
) -> list[LeadEvalHistoryResponse]:
    """小程序员工侧评估历史（最新一条为当前评估价）."""
    records = service.get_lead_evaluations(lead_id)
    return [LeadEvalHistoryResponse.model_validate(rec) for rec in records]


@router.get(
    "/my/acquired/{lead_id}/follow-ups",
    summary="获取线索跟进记录",
    description="员工侧查看线索跟进记录（仅 admin/operator），按跟进时间倒序",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_lead_followups(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    operator: CurrentCInternalUserDep,
    service: LeadServiceDep,
) -> list[PublicFollowupItem]:
    """小程序员工侧线索跟进记录（授权详情页「跟进记录」区块）."""
    follow_ups = service.get_lead_followups(lead_id)
    return [
        PublicFollowupItem(
            id=fu.id,
            method=fu.method.value if hasattr(fu.method, "value") else str(fu.method),
            content=fu.content,
            followed_at=fu.followed_at,
        )
        for fu in follow_ups
    ]


@router.get(
    "/{lead_id}",
    summary="获取估价详情",
    description="获取指定线索的详细信息，仅能查看自己创建的线索",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_lead_detail(
    request: Request,
    lead_id: Annotated[str, Path(description="线索ID")],
    current_user: CurrentCustomerUserDep,
    service: LeadServiceDep,
) -> PublicLeadDetail:
    """获取指定线索的详细信息，仅能查看自己创建的线索."""
    result = service.get_lead_detail(lead_id=lead_id, user_id=current_user.id)
    lead = result["lead"]
    follow_ups = result["follow_ups"]
    eval_histories = result["eval_histories"]

    followup_items = [
        PublicFollowupItem(
            id=fu.id,
            method=fu.method.value if hasattr(fu.method, "value") else str(fu.method),
            content=fu.content,
            followed_at=fu.followed_at,
        )
        for fu in follow_ups
    ]

    # 出评估价产生的意见摘要并入跟进时间线，使 C 端详情/Web 有处查看（method 用合成值 evaluation）
    eval_items = [
        PublicFollowupItem(
            id=f"eval:{e.id}",
            method="evaluation",
            content=(f"评估价 {float(e.eval_price)}万" + (f" · {e.remark}" if e.remark else "")),
            followed_at=e.evaluated_at,
        )
        for e in eval_histories
    ]
    timeline_items = sorted(
        [*followup_items, *eval_items],
        key=lambda item: item.followed_at,
        reverse=True,
    )

    status_code = lead.status.value if hasattr(lead.status, "value") else str(lead.status)
    status_display, status_color = _get_status_display(status_code)

    return PublicLeadDetail(
        id=lead.id,
        community_name=lead.community_name,
        layout=lead.layout,
        area=float(lead.area) if lead.area else None,
        floor_info=lead.floor_info,
        orientation=lead.orientation,
        total_price=float(lead.total_price) if lead.total_price else None,
        unit_price=float(lead.unit_price) if lead.unit_price else None,
        eval_price=float(lead.eval_price) if lead.eval_price is not None else None,
        expected_price=_effective_expected_price(lead),
        status=status_code,
        status_display=status_display,
        status_color=status_color,
        remarks=lead.remarks,
        images=lead.images or [],
        image_thumbnails=[t for t in (derive_thumbnail_url(u) for u in (lead.images or [])) if t] or None,
        follow_ups=timeline_items,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )
