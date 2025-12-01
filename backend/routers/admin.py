"""
小区管理路由
处理小区查询、搜索和合并操作
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, or_, distinct
from typing import Optional
import logging

from db import get_db
from models.community import Community
from models.property import PropertyCurrent
from schemas.community import (
    CommunityResponse,
    CommunityListResponse,
    CommunityMergeRequest,
    CommunityMergeResponse
)
from services.merger import CommunityMerger


logger = logging.getLogger(__name__)

router = APIRouter()


class CommunityQueryService:
    """小区查询服务"""
    
    def query_communities(
        self,
        db: Session,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ) -> CommunityListResponse:
        """
        查询小区列表
        
        Args:
            db: 数据库会话
            search: 小区名称搜索（模糊匹配）
            page: 页码
            page_size: 每页数量
        
        Returns:
            CommunityListResponse: 小区列表响应
        """
        # 构建基础查询
        query = db.query(Community).filter(Community.is_active == True)
        
        # 应用搜索条件
        if search:
            search_pattern = f"%{search}%"
            query = query.filter(Community.name.like(search_pattern))
        
        # 获取总数
        total = query.count()
        
        # 应用分页
        offset = (page - 1) * page_size
        query = query.order_by(Community.name).offset(offset).limit(page_size)
        
        # 执行查询
        communities = query.all()
        
        # 为每个小区统计房源数量
        items = []
        for community in communities:
            # 实时统计房源数量
            property_count = db.query(PropertyCurrent).filter(
                PropertyCurrent.community_id == community.id,
                PropertyCurrent.is_active == True
            ).count()
            
            # 创建响应对象
            community_response = CommunityResponse(
                id=community.id,
                name=community.name,
                city_id=community.city_id,
                district=community.district,
                business_circle=community.business_circle,
                avg_price_wan=community.avg_price_wan,
                total_properties=property_count,
                created_at=community.created_at
            )
            items.append(community_response)
        
        logger.info(f"查询小区完成: 总数={total}, 页码={page}, 每页={page_size}, 返回={len(items)}")
        
        return CommunityListResponse(
            total=total,
            items=items
        )


@router.get("/communities", response_model=CommunityListResponse)
async def get_communities(
    search: Optional[str] = Query(None, description="小区名称搜索（模糊匹配）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    db: Session = Depends(get_db)
):
    """
    查询小区列表
    
    支持按名称搜索和分页
    
    Args:
        search: 小区名称搜索关键词
        page: 页码
        page_size: 每页数量
        db: 数据库会话
    
    Returns:
        CommunityListResponse: 小区列表响应
    """
    service = CommunityQueryService()
    result = service.query_communities(
        db=db,
        search=search,
        page=page,
        page_size=page_size
    )
    
    return result


@router.get("/dictionaries")
async def get_dictionaries(
    type: str = Query(..., description="字典类型: district | business_circle"),
    search: Optional[str] = Query(None, description="模糊搜索关键词"),
    limit: int = Query(50, ge=1, le=500, description="返回数量上限"),
    db: Session = Depends(get_db)
):
    """
    返回行政区或商圈的去重列表，支持模糊搜索
    """
    if type not in {"district", "business_circle"}:
        raise HTTPException(status_code=400, detail="不支持的字典类型")

    query = db.query(Community)
    # 仅选择非空字段
    if type == "district":
        query = query.filter(Community.district.isnot(None))
        if search:
            query = query.filter(Community.district.like(f"%{search}%"))
        query = query.with_entities(distinct(Community.district)).order_by(Community.district)
    else:
        query = query.filter(Community.business_circle.isnot(None))
        if search:
            query = query.filter(Community.business_circle.like(f"%{search}%"))
        query = query.with_entities(distinct(Community.business_circle)).order_by(Community.business_circle)

    results = query.limit(limit).all()
    # 扁平化结果
    values = [r[0] for r in results if r and r[0]]
    return {"type": type, "items": values}


@router.post("/communities/merge", response_model=CommunityMergeResponse)
async def merge_communities(
    request: CommunityMergeRequest,
    db: Session = Depends(get_db)
):
    """
    合并小区
    
    将多个小区合并到一个主小区，包括：
    1. 创建别名映射
    2. 更新所有关联房源
    3. 软删除被合并的小区
    
    Args:
        request: 合并请求（包含主小区ID和要合并的小区ID列表）
        db: 数据库会话
    
    Returns:
        CommunityMergeResponse: 合并结果
    """
    logger.info(f"收到小区合并请求: primary_id={request.primary_id}, merge_ids={request.merge_ids}")
    
    # 执行合并
    merger = CommunityMerger()
    result = merger.merge_communities(
        primary_id=request.primary_id,
        merge_ids=request.merge_ids,
        db=db
    )
    
    # 返回结果
    if result.success:
        logger.info(f"小区合并成功: {result.message}")
        return CommunityMergeResponse(
            success=True,
            affected_properties=result.affected_properties,
            message=result.message
        )
    else:
        logger.error(f"小区合并失败: {result.message}")
        raise HTTPException(
            status_code=400,
            detail=result.message
        )
