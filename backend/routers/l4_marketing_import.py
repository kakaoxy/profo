"""
L4 市场营销层导入路由
负责从L3项目导入数据相关API
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import get_current_operator_user
from services.l4_marketing_query import L4MarketingQueryService
from services.l4_marketing_import import L4MarketingImportService
from schemas.l4_project_import import (
    L3ProjectListResponse,
    L3ProjectBriefResponse,
    L3ProjectImportResponse
)

router = APIRouter(
    prefix="/admin/l4-marketing",
    tags=["L4-Marketing-Import"],
    dependencies=[Depends(get_current_operator_user)]
)


# ============================================================================
# 依赖注入函数
# ============================================================================

def get_query_service(db: Session = Depends(get_db)) -> L4MarketingQueryService:
    return L4MarketingQueryService(db)


def get_import_service(db: Session = Depends(get_db)) -> L4MarketingImportService:
    return L4MarketingImportService(db)


# ============================================================================
# L3 项目查询 API
# ============================================================================

@router.get(
    "/available-projects",
    response_model=L3ProjectListResponse,
    summary="获取可关联的L3项目列表"
)
async def list_available_projects(
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    status: Optional[str] = Query(None, description="项目状态筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=200, description="每页大小"),
    service: L4MarketingQueryService = Depends(get_query_service)
) -> L3ProjectListResponse:
    """获取可用于关联的L3项目列表
    
    用于在创建营销房源时选择关联的L3项目
    """
    items, total = service.get_available_l3_projects(
        community_name=community_name,
        status=status,
        page=page,
        page_size=page_size
    )
    return L3ProjectListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.get(
    "/available-projects/{project_id}",
    response_model=L3ProjectBriefResponse,
    summary="获取L3项目详情"
)
async def get_l3_project_detail(
    project_id: str,
    service: L4MarketingQueryService = Depends(get_query_service)
) -> L3ProjectBriefResponse:
    """获取单个L3项目详情

    用于项目选择器中预览项目信息
    """
    project = service.get_l3_project_for_import(project_id)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在或已删除"
        )

    return L3ProjectBriefResponse(
        id=project.id,
        name=project.name or "未命名项目",
        community_name=project.community_name or "",
        address=project.address or "",
        area=project.area,
        layout=project.layout,
        orientation=project.orientation,
        status=project.status.value if hasattr(project.status, 'value') else str(project.status)
    )


# ============================================================================
# L3 项目导入 API
# ============================================================================

@router.post(
    "/projects/import-from-l3/{project_id}",
    response_model=L3ProjectImportResponse,
    summary="从L3项目导入数据"
)
async def import_from_l3_project(
    project_id: str,
    query_service: L4MarketingQueryService = Depends(get_query_service),
    import_service: L4MarketingImportService = Depends(get_import_service)
) -> L3ProjectImportResponse:
    """从L3项目导入数据
    
    根据L3项目ID获取可导入的数据，用于创建营销房源
    采用写时复制(CoW)模式，L4独立存储数据
    """
    # 先检查项目是否存在
    if not query_service.check_project_exists(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在或已删除"
        )

    # 导入数据
    result = import_service.import_from_l3_project(project_id)
    if not result:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="导入数据失败"
        )

    return result
