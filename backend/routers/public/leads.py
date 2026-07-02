"""C端公开线索（卖房估价）路由.

提交估价、我的估价列表、估价详情.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from dependencies.common import PaginationDep
from schemas.lead import LeadCreate
from schemas.public import (
    PublicFollowupItem,
    PublicLeadCreate,
    PublicLeadDetail,
    PublicLeadListItem,
    PublicLeadListResponse,
    PublicLeadResponse,
)
from services.leads.core import LeadService

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
        layout=body.layout,
        area=body.area,
        floor_info=body.floor_info,
        orientation=body.orientation,
        remarks=body.remarks,
        images=body.images,
    )

    lead = service.create_lead(lead_data, creator_id=current_user.id)

    return PublicLeadResponse(
        id=lead.id,
        community_name=lead.community_name,
        layout=lead.layout,
        area=float(lead.area) if lead.area else None,
        floor_info=lead.floor_info,
        orientation=lead.orientation,
        total_price=float(lead.total_price) if lead.total_price else None,
        unit_price=float(lead.unit_price) if lead.unit_price else None,
        eval_price=float(lead.eval_price) if lead.eval_price else None,
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
    "/{lead_id}",
    summary="获取估价详情",
    description="获取指定线索的详细信息，仅能查看自己创建的线索",
)
@limiter.limit(RateLimits.PUBLIC_LEAD_LIST)
def get_lead_detail(
    request: Request,
    lead_id: str,
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
        eval_price=float(lead.eval_price) if lead.eval_price else None,
        status=status_code,
        status_display=status_display,
        status_color=status_color,
        remarks=lead.remarks,
        images=lead.images or [],
        follow_ups=followup_items,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )
