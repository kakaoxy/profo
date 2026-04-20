"""
线索核心 CRUD 路由
"""
from typing import Annotated, Optional
from datetime import datetime
import uuid

from fastapi import APIRouter, Query, HTTPException
from sqlalchemy import desc
from sqlalchemy.orm import joinedload, noload

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from models import User, Lead, LeadPriceHistory, LeadStatus
from schemas.lead import (
    LeadCreate,
    LeadUpdate,
    LeadResponse,
    PaginatedLeadListResponse,
)
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
    # 构建查询，优化关系加载
    query = db.query(Lead).options(
        # 只加载 creator 关系用于获取 creator_name
        joinedload(Lead.creator),
        # 列表页不需要以下关联，完全禁止加载
        noload(Lead.auditor),
        noload(Lead.follow_ups),
        noload(Lead.price_history),
    )

    # 应用过滤条件
    if search:
        query = query.filter(Lead.community_name.contains(search))
    if statuses:
        query = query.filter(Lead.status.in_(statuses))
    if district:
        query = query.filter(Lead.district.contains(district))
    if creator_id:
        query = query.filter(Lead.creator_id == creator_id)
    if layout:
        query = query.filter(Lead.layout.contains(layout))
    if floor:
        query = query.filter(Lead.floor_info.contains(floor))

    # 计算总数和获取分页数据
    total = query.count()
    items = (
        query.order_by(desc(Lead.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # 手动序列化，避免 Pydantic 遍历 ORM 关系
    serialized_items = [serialize_lead_for_list(lead) for lead in items]

    return {
        "items": serialized_items,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.post("/", response_model=LeadResponse)
def create_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_in: LeadCreate,
):
    """创建线索"""
    db_lead = Lead(
        **lead_in.model_dump(),
        id=str(uuid.uuid4()),
        creator_id=current_user.id,
    )

    db.add(db_lead)

    if lead_in.total_price:
        # 自动记录初始价格历史
        price_rec = LeadPriceHistory(
            id=str(uuid.uuid4()),
            lead_id=db_lead.id,
            price=lead_in.total_price,
            remark="Initial Creation",
            created_by_id=current_user.id,
        )
        db.add(price_rec)

    db.commit()
    db.refresh(db_lead)

    # 避免查询 for creator
    db_lead.creator = current_user
    return db_lead


@router.get("/{lead_id}", response_model=LeadResponse)
def get_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: str,
):
    """获取单个线索详情"""
    lead = (
        db.query(Lead)
        .options(joinedload(Lead.creator))
        .filter(Lead.id == lead_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.put("/{lead_id}", response_model=LeadResponse)
def update_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: str,
    lead_in: LeadUpdate,
):
    """更新线索"""
    lead = (
        db.query(Lead)
        .options(joinedload(Lead.creator))
        .filter(Lead.id == lead_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    update_data = lead_in.model_dump(exclude_unset=True)

    # 价格更新时记录历史
    new_price = update_data.get("total_price")
    if new_price is not None and new_price != float(lead.total_price or 0):
        price_rec = LeadPriceHistory(
            id=str(uuid.uuid4()),
            lead_id=lead.id,
            price=new_price,
            remark=update_data.get("remarks") or "Update Price",
            created_by_id=current_user.id,
        )
        db.add(price_rec)

    for field, value in update_data.items():
        setattr(lead, field, value)

    lead.updated_at = datetime.now()
    db.add(lead)
    db.commit()
    db.refresh(lead)
    return lead


@router.delete("/{lead_id}", status_code=204)
def delete_lead(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    lead_id: str,
):
    """删除线索"""
    lead = db.query(Lead).filter(Lead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    db.delete(lead)
    db.commit()
    return None
