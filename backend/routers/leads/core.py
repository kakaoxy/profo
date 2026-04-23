"""
线索核心 CRUD 路由
"""
from typing import Annotated, Optional

from fastapi import APIRouter, Path, Query

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from models.common import LeadStatus
from schemas.lead import (
    LeadCreate,
    LeadUpdate,
    LeadResponse,
    PaginatedLeadListResponse,
    LeadListItem,
)
from services.leads import LeadService

router = APIRouter()


def _lead_to_list_item(lead) -> LeadListItem:
    """将 Lead ORM 对象转换为 LeadListItem"""
    # 过滤错误存储的大型数据（如 base64 图片），只保留正常的 URL（通常 < 500 字符）
    safe_images = []
    if lead.images:
        for img in lead.images:
            if isinstance(img, str) and len(img) < 500:
                safe_images.append(img)

    return LeadListItem(
        id=lead.id,
        community_name=lead.community_name,
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


@router.get("/", response_model=PaginatedLeadListResponse)
def get_leads(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 20,
    search: Annotated[Optional[str], Query(description="小区名称搜索")] = None,
    statuses: Annotated[Optional[list[LeadStatus]], Query(description="状态筛选")] = None,
    district: Annotated[Optional[str], Query(description="行政区筛选")] = None,
    creator_id: Annotated[Optional[str], Query(description="创建人筛选")] = None,
    layout: Annotated[Optional[str], Query(description="户型筛选")] = None,
    floor: Annotated[Optional[str], Query(description="楼层筛选")] = None,
) -> PaginatedLeadListResponse:
    """
    获取线索列表
    使用手动序列化避免 ORM 关系遍历导致的性能问题
    """
    service = LeadService(db)
    result = service.get_leads(
        page=page,
        page_size=page_size,
        search=search,
        statuses=statuses,
        district=district,
        creator_id=creator_id,
        layout=layout,
        floor=floor,
    )

    # 手动序列化为 Pydantic 模型，避免 ORM 关系遍历
    items = [_lead_to_list_item(lead) for lead in result["items"]]

    return PaginatedLeadListResponse(
        items=items,
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.post("/", response_model=LeadResponse)
def create_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_in: LeadCreate,
):
    """创建线索"""
    service = LeadService(db)
    db_lead = service.create_lead(lead_in, current_user.id)

    # 避免查询 for creator
    db_lead.creator = current_user
    return db_lead


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
):
    """获取单个线索详情"""
    service = LeadService(db)
    return service.get_lead_or_404(lead_id)


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
    lead_in: LeadUpdate,
):
    """更新线索"""
    service = LeadService(db)
    lead = service.update_lead(lead_id, lead_in, current_user.id)

    # 确保 creator 关系已加载
    if not lead.creator:
        lead.creator = current_user
    return lead


@router.delete("/{lead_id}", status_code=204)
def delete_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: Annotated[str, Path(description="线索ID")],
):
    """删除线索"""
    service = LeadService(db)
    service.delete_lead(lead_id)
    return None
