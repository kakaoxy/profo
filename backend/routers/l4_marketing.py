"""
L4 市场营销层路由
符合项目指南的 API 设计规范
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import get_current_operator_user
from services.l4_marketing_service import (
    L4MarketingProjectService,
    L4MarketingMediaService,
    L4ConsultantService,
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
    # Consultant schemas
    L4ConsultantCreate,
    L4ConsultantUpdate,
    L4ConsultantResponse,
    L4ConsultantListResponse,
    # Response schemas
    L4SyncResponse,
    L4RefreshResponse,
)
from schemas.project_renovation import RenovationPhotoResponse

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


def get_consultant_service(db: Session = Depends(get_db)) -> L4ConsultantService:
    return L4ConsultantService(db)


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
    size: int = Query(20, ge=1, le=100, description="每页大小"),
    is_published: Optional[bool] = Query(None, description="是否已发布"),
    project_status: Optional[str] = Query(None, description="项目状态: 在途/在售/已售"),
    consultant_id: Optional[str] = Query(None, description="顾问ID"),
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4MarketingProjectListResponse:
    """获取营销项目列表 - 统一分页格式"""
    skip = (page - 1) * size
    items, total = service.get_projects(
        skip=skip,
        limit=size,
        is_published=is_published,
        project_status=project_status,
        consultant_id=consultant_id
    )
    return L4MarketingProjectListResponse(
        items=items,
        total=total,
        page=page,
        size=size
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
    project_id: str,
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
    project_id: str,
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
    project_id: str,
    service: L4MarketingProjectService = Depends(get_project_service)
) -> None:
    """逻辑删除营销项目"""
    if not service.delete_project(project_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found"
        )


@router.post(
    "/projects/sync",
    response_model=L4SyncResponse,
    summary="同步 L3 项目"
)
async def sync_projects_from_l3(
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4SyncResponse:
    """从 L3 项目层同步所有未同步的项目"""
    count = service.sync_all_from_l3()
    return L4SyncResponse(total_synced=count)


@router.put(
    "/projects/{project_id}/refresh",
    response_model=L4RefreshResponse,
    summary="刷新硬字段"
)
async def refresh_project_fields(
    project_id: str,
    service: L4MarketingProjectService = Depends(get_project_service)
) -> L4RefreshResponse:
    """从关联的 L3 项目刷新硬字段"""
    success = service.refresh_hard_fields(project_id)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Refresh failed: project not found or not linked to L3 project"
        )
    return L4RefreshResponse(success=True)


# ============================================================================
# L4 Marketing Media API
# ============================================================================

@router.get(
    "/projects/{project_id}/media",
    response_model=L4MarketingMediaListResponse,
    summary="获取媒体列表"
)
async def list_marketing_media(
    project_id: str,
    page: int = Query(1, ge=1),
    size: int = Query(100, ge=1, le=200),
    service: L4MarketingMediaService = Depends(get_media_service)
) -> L4MarketingMediaListResponse:
    """获取营销项目的媒体列表"""
    skip = (page - 1) * size
    items, total = service.get_media_list(project_id, skip=skip, limit=size)
    return L4MarketingMediaListResponse(
        items=items,
        total=total,
        page=page,
        size=size
    )


@router.post(
    "/projects/{project_id}/media",
    response_model=L4MarketingMediaResponse,
    status_code=status.HTTP_201_CREATED,
    summary="添加媒体"
)
async def create_marketing_media(
    project_id: str,
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
    media_id: str,
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
    media_id: str,
    service: L4MarketingMediaService = Depends(get_media_service)
) -> None:
    """逻辑删除媒体"""
    if not service.delete_media(media_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media not found"
        )


@router.get(
    "/projects/{project_id}/source-photos",
    response_model=List[RenovationPhotoResponse],
    summary="获取来源照片"
)
async def get_source_photos(
    project_id: str,
    service: L4MarketingMediaService = Depends(get_media_service)
) -> List[RenovationPhotoResponse]:
    """获取关联 L3 项目的照片素材"""
    return service.get_source_photos(project_id)


# ============================================================================
# L4 Consultants API
# ============================================================================

@router.get(
    "/consultants",
    response_model=L4ConsultantListResponse,
    summary="获取顾问列表"
)
async def list_consultants(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    is_active: Optional[bool] = Query(None, description="是否在职"),
    service: L4ConsultantService = Depends(get_consultant_service)
) -> L4ConsultantListResponse:
    """获取顾问列表 - 统一分页格式"""
    skip = (page - 1) * size
    items, total = service.get_consultants(
        skip=skip,
        limit=size,
        is_active=is_active
    )
    return L4ConsultantListResponse(
        items=items,
        total=total,
        page=page,
        size=size
    )


@router.post(
    "/consultants",
    response_model=L4ConsultantResponse,
    status_code=status.HTTP_201_CREATED,
    summary="创建顾问"
)
async def create_consultant(
    data: L4ConsultantCreate,
    service: L4ConsultantService = Depends(get_consultant_service)
) -> L4ConsultantResponse:
    """创建顾问"""
    return service.create_consultant(data)


@router.get(
    "/consultants/{consultant_id}",
    response_model=L4ConsultantResponse,
    summary="获取顾问详情"
)
async def get_consultant(
    consultant_id: str,
    service: L4ConsultantService = Depends(get_consultant_service)
) -> L4ConsultantResponse:
    """获取顾问详情"""
    item = service.get_consultant(consultant_id)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultant not found"
        )
    return item


@router.put(
    "/consultants/{consultant_id}",
    response_model=L4ConsultantResponse,
    summary="更新顾问"
)
async def update_consultant(
    consultant_id: str,
    data: L4ConsultantUpdate,
    service: L4ConsultantService = Depends(get_consultant_service)
) -> L4ConsultantResponse:
    """更新顾问信息"""
    item = service.update_consultant(consultant_id, data)
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultant not found"
        )
    return item


@router.delete(
    "/consultants/{consultant_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除顾问"
)
async def delete_consultant(
    consultant_id: str,
    service: L4ConsultantService = Depends(get_consultant_service)
) -> None:
    """逻辑删除顾问"""
    if not service.delete_consultant(consultant_id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Consultant not found"
        )
