"""线索核心 CRUD 路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import (
    DbSessionDep,
    LeadCreatePermDep,
    LeadReadPermDep,
    LeadWritePermDep,
)
from dependencies.common import PaginationDep
from models.common import LeadStatus
from models.lead import Lead
from schemas.community_image import CommunityImageListResponse
from schemas.lead import (
    LeadCreate,
    LeadFunnelResponse,
    LeadListItem,
    LeadResponse,
    LeadStatsResponse,
    LeadUpdate,
    PaginatedLeadListResponse,
)
from services.leads import LeadService
from services.market.community_image_service import CommunityImageService
from services.system.exceptions import ResourceNotFoundError
from utils.common import RateLimits, limiter

router = APIRouter()

_MAX_IMAGE_LENGTH = 500


def _lead_to_list_item(lead: Lead) -> LeadListItem:
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
        eval_price=float(lead.eval_price) if lead.eval_price is not None else None,
        expected_price=float(lead.expected_price) if lead.expected_price is not None else None,
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


@router.get("")
def get_leads(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    pagination: PaginationDep,
    search: Annotated[str | None, Query(max_length=100, description="小区名称搜索")] = None,
    statuses: Annotated[list[LeadStatus] | None, Query(description="状态筛选")] = None,
    district: Annotated[str | None, Query(max_length=100, description="行政区筛选")] = None,
    creator_id: Annotated[str | None, Query(max_length=100, description="创建人筛选")] = None,
    layout: Annotated[str | None, Query(max_length=100, description="户型筛选")] = None,
    floor: Annotated[str | None, Query(max_length=100, description="楼层筛选")] = None,
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


@router.post("")
@limiter.limit(RateLimits.LEAD_UPDATE)
def create_lead(
    request: Request,
    db: DbSessionDep,
    current_user: LeadCreatePermDep,
    lead_in: LeadCreate,
) -> LeadResponse:
    """创建线索.

    权限：lead:create（普通员工录入）或 lead:write（admin/operator 全权）。
    """
    service = LeadService(db)
    return service.create_lead(lead_in, current_user.id, creator=current_user)


@router.get("/stats")
def get_leads_stats(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
) -> LeadStatsResponse:
    """获取线索状态统计（不受分页影响）."""
    service = LeadService(db)
    return LeadStatsResponse(**service.get_stats())


@router.get("/{lead_id}")
def get_lead(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
) -> LeadResponse:
    """获取单个线索详情."""
    service = LeadService(db)
    return service.get_lead_or_404(lead_id)


@router.get("/{lead_id}/community-images")
def get_lead_community_images(
    db: DbSessionDep,
    _current_user: LeadReadPermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    pagination: PaginationDep,
) -> CommunityImageListResponse:
    """获取线索关联小区的户型图列表.

    供前端创建/编辑线索时从户型图库选择户型图。
    """
    lead_service = LeadService(db)
    lead = lead_service.get_lead(lead_id)
    if lead is None:
        msg = "线索不存在"
        raise ResourceNotFoundError(msg)

    # community_id 为空时返回空列表（前端提示"请先选择小区"）
    if not lead.community_id:
        return CommunityImageListResponse(total=0, items=[])

    return CommunityImageService.list_by_community(
        db=db,
        community_id=lead.community_id,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.put("/{lead_id}")
@limiter.limit(RateLimits.LEAD_UPDATE)
def update_lead(
    request: Request,
    db: DbSessionDep,
    current_user: LeadWritePermDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    lead_in: LeadUpdate,
) -> LeadResponse:
    """更新线索.

    速率限制：100次/小时.
    """
    service = LeadService(db)
    return service.update_lead(lead_id, lead_in, current_user.id, creator=current_user)


@router.delete("/{lead_id}", status_code=204)
@limiter.limit(RateLimits.LEAD_DELETE)
def delete_lead(
    request: Request,
    db: DbSessionDep,
    _current_user: LeadWritePermDep,
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
    _current_user: LeadReadPermDep,
) -> LeadFunnelResponse:
    """获取线索漏斗统计数据."""
    service = LeadService(db)
    stats = service.query_service.get_funnel_stats()
    return LeadFunnelResponse(**stats)
