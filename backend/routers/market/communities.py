# backend/routers/admin.py
"""
小区管理路由
处理小区查询、搜索和合并操作
"""
from fastapi import APIRouter, Query, HTTPException
from typing import Annotated, Optional
import logging

from models.property import Community
from schemas.community import (
    CommunityListResponse,
    CommunityResponse,
    CommunityMergeRequest,
    CommunityMergeResponse,
    DictionaryResponse,
    CommunityCreateRequest,
)
from services.market import CommunityMerger
from services.market.community_service import CommunityQueryService, _find_existing_community_by_name
from dependencies.auth import CurrentOperatorUserDep, CurrentAdminUserDep, DbSessionDep
from datetime import datetime, timezone
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(tags=["L1-小区管理"])

# 将 Service 实例化移出路由，或使用 Dependency 模式（这里保持静态调用即可）
service = CommunityQueryService()

@router.get("/communities", response_model=CommunityListResponse)
def get_communities(
    db: DbSessionDep,
    current_user: CurrentOperatorUserDep,
    search: Annotated[str | None, Query(description="小区名称搜索（模糊匹配）")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> CommunityListResponse:
    """
    查询小区列表
    """
    result = service.query_communities(
        db=db,
        search=search,
        page=page,
        page_size=page_size
    )
    return result


@router.get("/dictionaries", response_model=DictionaryResponse)
def get_dictionaries(
    db: DbSessionDep,
    current_user: CurrentOperatorUserDep,
    type: Annotated[str, Query(description="字典类型: district | business_circle")],
    search: Annotated[str | None, Query(description="模糊搜索关键词")] = None,
    limit: Annotated[int, Query(ge=1, le=500, description="返回数量上限")] = 50,
) -> DictionaryResponse:
    """
    返回行政区或商圈的去重列表
    """
    try:
        return service.query_dictionaries(db=db, type=type, search=search, limit=limit)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/communities/merge", response_model=CommunityMergeResponse)
def merge_communities(
    request: CommunityMergeRequest,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> CommunityMergeResponse:
    """
    合并小区操作
    """
    logger.info(f"收到小区合并请求: primary_id={request.primary_id}, merge_ids={request.merge_ids}")

    # 建议：CommunityMerger 也可以通过 Depends 注入，方便管理 DB session 生命周期
    # 但如果 Merger 内部逻辑简单，直接传递 db 也可以
    merger = CommunityMerger()

    try:
        # 假设 merger 内部处理了事务回滚，如果没有，建议在这里处理
        result = merger.merge_communities(
            primary_id=request.primary_id,
            merge_ids=request.merge_ids,
            db=db
        )

        if not result.success:
            raise ValueError(result.message)

        logger.info(f"小区合并成功: {result.message}")
        return CommunityMergeResponse(
            success=True,
            affected_properties=result.affected_properties,
            message=result.message
        )

    except ValueError as e:
        logger.warning(f"小区合并业务验证失败: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"小区合并发生未知错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="合并操作失败，请联系管理员")


@router.post("/communities", response_model=CommunityResponse)
def create_community(
    request: CommunityCreateRequest,
    db: DbSessionDep,
    current_user: CurrentOperatorUserDep,
) -> CommunityResponse:
    """
    创建新小区
    
    如果小区名称已存在，则返回已存在的小区
    """
    from sqlalchemy.exc import IntegrityError
    
    # 1. 检查是否已存在同名小区（不区分大小写）
    existing = _find_existing_community_by_name(db, request.name)
    
    if existing:
        logger.info(f"小区已存在，直接返回: {existing.name} (ID: {existing.id})")
        return CommunityResponse(
            id=existing.id,
            name=existing.name,
            city_id=existing.city_id,
            district=existing.district,
            business_circle=existing.business_circle,
            avg_price_wan=existing.avg_price_wan,
            total_properties=existing.total_properties,
            created_at=existing.created_at
        )
    
    # 2. 创建新小区
    new_community = Community(
        id=str(uuid.uuid4()),
        name=request.name.strip(),
        district=request.district,
        business_circle=request.business_circle,
        city_id=None,
        avg_price_wan=None,
        total_properties=0,
        is_active=True,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc)
    )
    
    db.add(new_community)
    
    try:
        db.commit()
        db.refresh(new_community)
        logger.info(f"创建新小区成功: {new_community.name} (ID: {new_community.id})")
    except IntegrityError as e:
        db.rollback()
        logger.warning(f"创建小区时发生唯一约束冲突: {request.name}, 错误: {str(e)}")
        # 并发情况下可能另一个请求已创建，再次尝试查找
        existing = _find_existing_community_by_name(db, request.name)
        if existing:
            return CommunityResponse(
                id=existing.id,
                name=existing.name,
                city_id=existing.city_id,
                district=existing.district,
                business_circle=existing.business_circle,
                avg_price_wan=existing.avg_price_wan,
                total_properties=existing.total_properties,
                created_at=existing.created_at
            )
        raise HTTPException(status_code=500, detail="创建小区失败")
    except Exception as e:
        db.rollback()
        logger.error(f"创建小区失败: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="创建小区失败")
    
    return CommunityResponse(
        id=new_community.id,
        name=new_community.name,
        city_id=new_community.city_id,
        district=new_community.district,
        business_circle=new_community.business_circle,
        avg_price_wan=new_community.avg_price_wan,
        total_properties=new_community.total_properties,
        created_at=new_community.created_at
    )
