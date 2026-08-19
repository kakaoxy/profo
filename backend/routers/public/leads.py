"""C端公开线索（卖房估价）路由.

提交估价、我的估价列表、估价详情.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from dependencies.common import PaginationDep
from models.common import LeadStatus
from schemas.lead import LeadCreate
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
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone
from utils.image_processing import derive_thumbnail_url

router = APIRouter(prefix="/public/leads", tags=["public-leads"])

LEAD_STATUS_DISPLAY_MAP = {
    "pending_assessment": ("待评估", "#FFA500"),
    "pending_visit": ("待看房", "#2196F3"),
    "rejected": ("已驳回", "#F44336"),
    "visited": ("已看房", "#4CAF50"),
    "signed": ("已签约", "#9C27B0"),
}


def _get_status_display(status_code: str) -> tuple[str, str]:
    """获取状态显示名称和颜色."""
    display, color = LEAD_STATUS_DISPLAY_MAP.get(status_code, ("未知", "#999999"))
    return display, color


def get_lead_service(db: DbSessionDep) -> LeadService:
    """获取线索服务实例."""
    return LeadService(db)


LeadServiceDep = Annotated[LeadService, Depends(get_lead_service)]


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

    # 分享归因：referrer 透传 Service，由其校验员工存在且 active；
    # 无效（不存在或非 active）静默忽略（referrer_id=None），不阻断提交
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
                expected_price=float(lead.expected_price) if lead.expected_price is not None else None,
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
                expected_price=float(lead.expected_price) if lead.expected_price is not None else None,
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

    followup_items = [
        PublicFollowupItem(
            id=fu.id,
            method=fu.method.value if hasattr(fu.method, "value") else str(fu.method),
            content=fu.content,
            followed_at=fu.followed_at,
        )
        for fu in follow_ups
    ]

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
        expected_price=float(lead.expected_price) if lead.expected_price is not None else None,
        status=status_code,
        status_display=status_display,
        status_color=status_color,
        remarks=lead.remarks,
        images=lead.images or [],
        image_thumbnails=[t for t in (derive_thumbnail_url(u) for u in (lead.images or [])) if t] or None,
        follow_ups=followup_items,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )
