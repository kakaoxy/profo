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
)
from services.leads import LeadService
from .utils import serialize_lead_for_list

router = APIRouter()


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
):
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

    # 手动序列化，避免 Pydantic 遍历 ORM 关系
    serialized_items = [serialize_lead_for_list(lead) for lead in result["items"]]

    return {
        "items": serialized_items,
        "total": result["total"],
        "page": result["page"],
        "page_size": result["page_size"],
    }


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
