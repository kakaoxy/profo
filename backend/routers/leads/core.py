"""线索核心 CRUD 路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from dependencies.common import PaginationDep
from models.common import LeadStatus
from schemas.lead import (
    LeadCreate,
    LeadFunnelResponse,
    LeadListItem,
    LeadResponse,
    LeadUpdate,
    PaginatedLeadListResponse,
)
from services.leads import LeadService

router = APIRouter()

_MAX_IMAGE_LENGTH = 500


def _lead_to_list_item(lead) -> LeadListItem:  # noqa: ANN001
    """将 Lead ORM 对象转换为 LeadListItem."""
    safe_images = [img for img in (lead.images or []) if isinstance(img, str) and len(img) < _MAX_IMAGE_LENGTH]

    return LeadListItem(
        id=lead.id,
        community_name=lead.community_name,
        community_id=lead.community_id,
        is_hot=lead.is_hot or 0,
        layout=lead.layout,
        orientation=lead.orientation,
        floor_info=lead.floor_info,
        area=float(lead.area) if lead.area else None,
        total_price=float(lead.total_price) if lead.total_price else None,
        unit_price=float(lead.unit_price) if lead.unit_price else None,
        eval_price=float(lead.eval_price) if lead.eval_price else None,
        status=lead.status,
        audit_reason=lead.audit_reason,
        auditor_id=lead.auditor_id,
        audit_time=lead.audit_time,
        images=safe_images,
        district=lead.district,
        business_area=lead.business_area,
        remarks=lead.remarks,
        creator_id=lead.creator_id,
        creator_name=lead.creator.nickname if lead.creator else None,
        source_property_id=lead.source_property_id,
        last_follow_up_at=lead.last_follow_up_at,
        created_at=lead.created_at,
        updated_at=lead.updated_at,
    )


@router.get("/")
def get_leads(  # noqa: PLR0913
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    pagination: PaginationDep,
    search: Annotated[str | None, Query(description="小区名称搜索")] = None,
    statuses: Annotated[list[LeadStatus] | None, Query(description="状态筛选")] = None,
    district: Annotated[str | None, Query(description="行政区筛选")] = None,
    creator_id: Annotated[str | None, Query(description="创建人筛选")] = None,
    layout: Annotated[str | None, Query(description="户型筛选")] = None,
    floor: Annotated[str | None, Query(description="楼层筛选")] = None,
) -> PaginatedLeadListResponse:
    """获取线索列表.

    使用手动序列化避免 ORM 关系遍历导致的性能问题.
    """
    service = LeadService(db)
    result = service.get_leads(
        page=pagination.page,
        page_size=pagination.page_size,
        search=search,
        statuses=statuses,
        district=district,
        creator_id=creator_id,
        layout=layout,
        floor=floor,
    )

    items = [_lead_to_list_item(lead) for lead in result["items"]]

    return PaginatedLeadListResponse(
        items=items,
        total=result["total"],
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post("/")
def create_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_in: LeadCreate,
) -> LeadResponse:
    """创建线索."""
    service = LeadService(db)
    db_lead = service.create_lead(lead_in, current_user.id)

    db_lead.creator = current_user
    return db_lead


@router.get("/{lead_id}")
def get_lead(
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> LeadResponse:
    """获取单个线索详情."""
    service = LeadService(db)
    return service.get_lead_or_404(lead_id)


@router.put("/{lead_id}")
@limiter.limit(RateLimits.LEAD_UPDATE)
def update_lead(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    lead_in: LeadUpdate,
) -> LeadResponse:
    """更新线索.

    速率限制：100次/小时.
    """
    service = LeadService(db)
    lead = service.update_lead(lead_id, lead_in, current_user.id)

    if not lead.creator:
        lead.creator = current_user
    return lead


@router.delete("/{lead_id}", status_code=204)
@limiter.limit(RateLimits.LEAD_DELETE)
def delete_lead(
    request: Request,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> None:
    """删除线索.

    速率限制：20次/小时.
    """
    service = LeadService(db)
    service.delete_lead(lead_id)


@router.get("/stats/funnel")
def get_leads_funnel(
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> LeadFunnelResponse:
    """获取线索漏斗统计数据."""
    service = LeadService(db)
    stats = service.query_service.get_funnel_stats()
    return LeadFunnelResponse(**stats)
