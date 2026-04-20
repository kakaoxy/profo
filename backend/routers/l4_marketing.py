"""
L4 市场营销层路由
符合项目指南的 API 设计规范
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import get_current_operator_user
from services.l4_marketing_service import (
    L4MarketingProjectService,
    L4MarketingMediaService,
)
from schemas.l4_marketing import (
    # Project schemas
    L4MarketingProjectCreate,
    L4MarketingProjectUpdate,
    L4MarketingProjectResponse,
    L4MarketingProjectListResponse,
    # Media schemas
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
    L4MarketingMediaResponse,
    L4MarketingMediaListResponse,
    # Response schemas
    L4SyncResponse,
    L4RefreshResponse,
)


# ============================================================================
# 批量排序更新 Schema
# ============================================================================

class MediaSortOrderUpdate(BaseModel):
    """媒体排序更新项"""
    media_id: int = Field(..., description="媒体ID")
    sort_order: int = Field(..., ge=0, description="排序值")

router = APIRouter(
    prefix="/admin/l4-marketing",
    tags=["L4-Marketing"],
    dependencies=[Depends(get_current_operator_user)]
)


# ============================================================================
# 依赖注入函数
# ============================================================================

def get_project_service(db: Session = Depends(get_db)) -> L4MarketingProjectService:
    return L4MarketingProjectService(db)


def get_media_service(db: Session = Depends(get_db)) -> L4MarketingMediaService:
    return L4MarketingMediaService(db)


# ============================================================================
# L4 Marketing Projects API
# ============================================================================

@router.get(
    "/projects",
    response_model=L4MarketingProjectListResponse,
    summary="获取营销项目列表"
)
async def list_marketing_projects(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=200, description="每页大小"),
    publish_status: Optional[str] = Query(None, description="发布状态: 草稿/发布"),
    project_status: Optional[str] = Query(None, description="项目状态: 在途/在售/已售"),
    consultant_id: Optional[int] = Query(None, description="顾问ID"),
    community_id: Optional[int] = Query(None, description="小区ID"),
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4MarketingProjectListResponse:
    """获取营销项目列表 - 统一分页格式"""
    skip = (page - 1) * page_size
    items, total = service.get_projects(
        skip=skip,
        limit=page_size,
        publish_status=publish_status,
        project_status=project_status,
        consultant_id=consultant_id,
        community_id=community_id,
    )
    return L4MarketingProjectListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post(
    "/projects",
    response_model=L4MarketingProjectResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建独立营销项目"
)
async def create_marketing_project(
    data: L4MarketingProjectCreate,
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4MarketingProjectResponse:
    """创建独立营销项目 (不关联 L3 项目)"""
    return service.create_project(data)


@router.get(
    "/projects/{project_id}",
    response_model=L4MarketingProjectResponse,
    summary="获取营销项目详情"
)
async def get_marketing_project(
    project_id: int,
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4MarketingProjectResponse:
    """获取营销项目详情"""
    item = service.get_project(project_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return item


@router.put(
    "/projects/{project_id}",
    response_model=L4MarketingProjectResponse,
    summary="更新营销项目"
)
async def update_marketing_project(
    project_id: int,
    data: L4MarketingProjectUpdate,
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4MarketingProjectResponse:
    """更新营销项目"""
    item = service.update_project(project_id, data)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )
    return item


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除营销项目"
)
async def delete_marketing_project(
    project_id: int,
    service: L4MarketingProjectService = Depends(get_project_service)
) -> None:
    """逻辑删除营销项目"""
    if not service.delete_project(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )


# ============================================================================
# L4 Marketing Media API
# ============================================================================

@router.get(
    "/projects/{project_id}/media",
    response_model=L4MarketingMediaListResponse,
    summary="获取媒体列表"
)
async def list_marketing_media(
    project_id: int,
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(100, ge=1, le=200, description="每页大小"),
    service: L4MarketingMediaService = Depends(get_media_service)
) -> L4MarketingMediaListResponse:
    """获取营销项目的媒体列表"""
    skip = (page - 1) * page_size
    items, total = service.get_media_list(project_id, skip=skip, limit=page_size)
    return L4MarketingMediaListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size
    )


@router.post(
    "/projects/{project_id}/media",
    response_model=L4MarketingMediaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="添加媒体"
)
async def create_marketing_media(
    project_id: int,
    data: L4MarketingMediaCreate,
    service: L4MarketingMediaService = Depends(get_media_service)
) -> L4MarketingMediaResponse:
    """为营销项目添加媒体"""
    return service.create_media(data, project_id)


@router.put(
    "/media/{media_id}",
    response_model=L4MarketingMediaResponse,
    summary="更新媒体"
)
async def update_marketing_media(
    media_id: int,
    data: L4MarketingMediaUpdate,
    service: L4MarketingMediaService = Depends(get_media_service)
) -> L4MarketingMediaResponse:
    """更新媒体信息"""
    item = service.update_media(media_id, data)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )
    return item


@router.delete(
    "/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除媒体"
)
async def delete_marketing_media(
    media_id: int,
    service: L4MarketingMediaService = Depends(get_media_service)
) -> None:
    """逻辑删除媒体"""
    if not service.delete_media(media_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )


@router.put(
    "/projects/{project_id}/media/sort-order",
    response_model=L4SyncResponse,
    summary="批量更新媒体排序"
)
async def update_media_sort_order(
    project_id: int,
    sort_updates: List[MediaSortOrderUpdate],
    service: L4MarketingMediaService = Depends(get_media_service)
) -> L4SyncResponse:
    """批量更新媒体排序顺序"""
    updates = [{"media_id": u.media_id, "sort_order": u.sort_order} for u in sort_updates]
    updated_count = service.batch_update_sort_order(project_id, updates)
    return L4SyncResponse(total_synced=updated_count)
