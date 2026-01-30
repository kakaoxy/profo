# backend/routers/admin.py
"""
小区管理路由
处理小区查询、搜索和合并操作
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, distinct, desc
from typing import Optional, List
import logging

from db import get_db
from models.community import Community
from models.property import PropertyCurrent
from schemas.community import (
    CommunityListResponse,
    CommunityResponse,
    CommunityMergeRequest,
    CommunityMergeResponse
)
from schemas.response import ApiResponse
from services.merger import CommunityMerger
from dependencies.auth import get_current_operator_user, get_current_admin_user
from models.user import User

logger = logging.getLogger(__name__)

router = APIRouter()

class CommunityQueryService:
    """
    小区查询服务
    建议：如果逻辑简单，其实可以直接写在路由函数里，或者作为独立函数。
    这里保留类结构，但优化内部实现。
    """
    
    @staticmethod
    def query_communities(
        db: Session,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50
    ) -> CommunityListResponse:
        """
        查询小区列表 (性能优化版)
        使用 Join 解决 N+1 问题
        """
        # 1. 构建基础查询：选择 Community 表的所有字段，以及 PropertyCurrent 的计数
        # 使用 outerjoin 以确保即使小区没有房源也能查出来，计数为 0
        stmt = db.query(
            Community,
            func.count(PropertyCurrent.id).label('property_count')
        ).outerjoin(
            PropertyCurrent,
            (PropertyCurrent.community_id == Community.id) & (PropertyCurrent.is_active.is_(True))
        ).filter(
            Community.is_active.is_(True)
        )

        # 2. 应用搜索条件
        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.filter(Community.name.like(search_pattern))

        # 3. 分组（必须按小区ID分组才能统计）
        stmt = stmt.group_by(Community.id)

        # 4. 获取总数 (注意：带 Group By 的 Count 查询需要特殊处理，或者分开查)
        # 性能权衡：为了分页准确，通常需要一次额外的 Count 查询。
        # 这里为了简单，我们单独查一次 Community 的 count，不带 join，性能更好
        count_query = db.query(func.count(Community.id)).filter(Community.is_active.is_(True))
        if search:
            count_query = count_query.filter(Community.name.like(f"%{search}%"))
        total = count_query.scalar()

        # 5. 应用分页和排序
        # 默认按创建时间倒序或名称排序
        stmt = stmt.order_by(Community.name).offset((page - 1) * page_size).limit(page_size)

        # 6. 执行主查询
        results = stmt.all()
        
        # 7. 组装数据
        # results 中的每一项都是一个元组: (Community对象, property_count整数)
        items = []
        for community, p_count in results:
            # 这种方式避免了循环查库，完全在内存中组装
            # 利用 Pydantic 的 from_orm 机制或者手动解包
            resp = CommunityResponse(
                id=community.id,
                name=community.name,
                city_id=community.city_id,
                district=community.district,
                business_circle=community.business_circle,
                avg_price_wan=community.avg_price_wan,
                total_properties=p_count, # 这里的 count 来自 SQL 聚合
                created_at=community.created_at
            )
            items.append(resp)

        logger.info(f"查询小区完成: 总数={total}, 页码={page}, 每页={page_size}, 返回={len(items)}")
        
        return CommunityListResponse(
            total=total,
            items=items
        )

# 将 Service 实例化移出路由，或使用 Dependency 模式（这里保持静态调用即可）
service = CommunityQueryService()

@router.get("/communities", response_model=ApiResponse[CommunityListResponse])
def get_communities(
    search: Optional[str] = Query(None, description="小区名称搜索（模糊匹配）"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_operator_user)
):
    """
    查询小区列表
    """
    result = service.query_communities(
        db=db,
        search=search,
        page=page,
        page_size=page_size
    )
    return ApiResponse.success(data=result.model_dump())


@router.get("/dictionaries")
def get_dictionaries(
    type: str = Query(..., description="字典类型: district | business_circle"),
    search: Optional[str] = Query(None, description="模糊搜索关键词"),
    limit: int = Query(50, ge=1, le=500, description="返回数量上限"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_operator_user)
):
    """
    返回行政区或商圈的去重列表
    """
    # 动态映射字段，消除 if/else 重复代码
    field_map = {
        "district": Community.district,
        "business_circle": Community.business_circle
    }
    
    if type not in field_map:
        raise HTTPException(status_code=400, detail="不支持的字典类型")
        
    target_column = field_map[type]

    # 构建查询
    query = db.query(distinct(target_column)).filter(
        target_column.isnot(None),
        target_column != ""  # 排除空字符串
    )

    if search:
        query = query.filter(target_column.like(f"%{search}%"))

    # 按拼音或字符排序通常更好体验
    query = query.order_by(target_column).limit(limit)
    
    results = query.all()
    
    # 扁平化结果 (SQLAlchemy 返回的是 Row 对象，例如 [('朝阳区',), ('海淀区',)])
    values = [r[0] for r in results if r[0]]
    
    return {"type": type, "items": values}


@router.post("/communities/merge", response_model=ApiResponse[CommunityMergeResponse])
def merge_communities(
    request: CommunityMergeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin_user)
):
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
        response_data = CommunityMergeResponse(
            success=True,
            affected_properties=result.affected_properties,
            message=result.message
        )
        return ApiResponse.success(data=response_data.model_dump())

    except ValueError as e:
        logger.warning(f"小区合并业务验证失败: {str(e)}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"小区合并发生未知错误: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="合并操作失败，请联系管理员")