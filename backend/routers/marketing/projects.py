"""L4 市场营销层路由.

符合项目指南的 API 设计规范.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status

from utils.common import RateLimits, limiter
from dependencies.auth import DbSessionDep, require_roles
from dependencies.common import PaginationDep
from schemas.l4_marketing import (
    L4MarketingMediaCreate,
    L4MarketingMediaListResponse,
    L4MarketingMediaResponse,
    L4MarketingMediaUpdate,
    L4MarketingProjectCreate,
    L4MarketingProjectListResponse,
    L4MarketingProjectResponse,
    L4MarketingProjectUpdate,
    L4SyncResponse,
    MediaSortOrderUpdate,
)
from services.marketing import (
    MarketingMediaService as L4MarketingMediaService,
)
from services.marketing import (
    MarketingProjectService as L4MarketingProjectService,
)
from services.system.exceptions import ResourceNotFoundError

router = APIRouter(
    prefix="/admin/l4-marketing",
    tags=["l4-marketing"],
    dependencies=[Depends(require_roles(["admin", "operator"]))],
)


def get_project_service(db: DbSessionDep) -> L4MarketingProjectService:
    """创建营销项目服务实例."""
    return L4MarketingProjectService(db)


def get_media_service(db: DbSessionDep) -> L4MarketingMediaService:
    """创建营销媒体服务实例."""
    return L4MarketingMediaService(db)


_ProjectServiceDep = Annotated[L4MarketingProjectService, Depends(get_project_service)]
_MediaServiceDep = Annotated[L4MarketingMediaService, Depends(get_media_service)]


@router.get(
    "/projects",
    summary="获取营销项目列表",
)
def list_marketing_projects(  # noqa: PLR0913
    service: _ProjectServiceDep,
    pagination: PaginationDep,
    publish_status: Annotated[str | None, Query(description="发布状态: 草稿/发布")] = None,
    project_status: Annotated[str | None, Query(description="项目状态: 在途/在售/已售")] = None,
    consultant_id: Annotated[str | None, Query(description="顾问ID")] = None,
    community_id: Annotated[str | None, Query(description="小区ID")] = None,
) -> L4MarketingProjectListResponse:
    """获取营销项目列表 - 统一分页格式，包含摘要统计."""
    summary = service.get_projects_summary(
        publish_status=publish_status,
        project_status=project_status,
        consultant_id=consultant_id,
        community_id=community_id,
    )

    skip = (pagination.page - 1) * pagination.page_size
    items, total = service.get_projects(
        skip=skip,
        limit=pagination.page_size,
        publish_status=publish_status,
        project_status=project_status,
        consultant_id=consultant_id,
        community_id=community_id,
    )

    return L4MarketingProjectListResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
        summary=summary,
    )


@router.post(
    "/projects",
    status_code=status.HTTP_201_CREATED,
    summary="创建独立营销项目",
)
@limiter.limit(RateLimits.MARKETING_CREATE)
def create_marketing_project(
    request: Request,
    data: L4MarketingProjectCreate,
    service: _ProjectServiceDep,
) -> L4MarketingProjectResponse:
    """创建独立营销项目.

    速率限制：100次/小时.
    """
    return service.create_project(data)


@router.get(
    "/projects/{project_id}",
    summary="获取营销项目详情",
)
def get_marketing_project(
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    service: _ProjectServiceDep,
) -> L4MarketingProjectResponse:
    """获取营销项目详情."""
    item = service.get_project(project_id)
    if not item:
        raise ResourceNotFoundError("项目不存在")
    return item


@router.put(
    "/projects/{project_id}",
    summary="更新营销项目",
)
@limiter.limit(RateLimits.MARKETING_UPDATE)
def update_marketing_project(
    request: Request,
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    data: L4MarketingProjectUpdate,
    service: _ProjectServiceDep,
) -> L4MarketingProjectResponse:
    """更新营销项目.

    速率限制：100次/小时.
    """
    item = service.update_project(project_id, data)
    if not item:
        raise ResourceNotFoundError("项目不存在")
    return item


@router.delete(
    "/projects/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除营销项目",
)
@limiter.limit(RateLimits.MARKETING_DELETE)
def delete_marketing_project(
    request: Request,
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    service: _ProjectServiceDep,
) -> None:
    """逻辑删除营销项目.

    速率限制：20次/小时.
    """
    if not service.delete_project(project_id):
        raise ResourceNotFoundError("项目不存在")


@router.get(
    "/projects/{project_id}/media",
    summary="获取媒体列表",
)
def list_marketing_media(
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    service: _MediaServiceDep,
    pagination: PaginationDep,
) -> L4MarketingMediaListResponse:
    """获取营销项目的媒体列表."""
    skip = (pagination.page - 1) * pagination.page_size
    items, total = service.get_media_list(project_id, skip=skip, limit=pagination.page_size)
    return L4MarketingMediaListResponse(
        items=items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post(
    "/projects/{project_id}/media",
    status_code=status.HTTP_201_CREATED,
    summary="添加媒体",
)
def create_marketing_media(
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    data: L4MarketingMediaCreate,
    service: _MediaServiceDep,
) -> L4MarketingMediaResponse:
    """为营销项目添加媒体."""
    return service.create_media(data, project_id)


@router.put(
    "/media/{media_id}",
    summary="更新媒体",
)
@limiter.limit(RateLimits.MARKETING_UPDATE)
def update_marketing_media(
    request: Request,
    media_id: Annotated[int, Path(ge=1, description="媒体ID")],
    data: L4MarketingMediaUpdate,
    service: _MediaServiceDep,
) -> L4MarketingMediaResponse:
    """更新媒体信息.

    速率限制：100次/小时.
    """
    item = service.update_media(media_id, data)
    if not item:
        raise ResourceNotFoundError("媒体不存在")
    return item


@router.delete(
    "/media/{media_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除媒体",
)
@limiter.limit(RateLimits.MARKETING_DELETE)
def delete_marketing_media(
    request: Request,
    media_id: Annotated[int, Path(ge=1, description="媒体ID")],
    service: _MediaServiceDep,
) -> None:
    """逻辑删除媒体.

    速率限制：20次/小时.
    """
    if not service.delete_media(media_id):
        raise ResourceNotFoundError("媒体不存在")


@router.put(
    "/projects/{project_id}/media/sort-order",
    summary="批量更新媒体排序",
)
@limiter.limit(RateLimits.MARKETING_UPDATE)
def update_media_sort_order(
    request: Request,
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    sort_updates: list[MediaSortOrderUpdate],
    service: _MediaServiceDep,
) -> L4SyncResponse:
    """批量更新媒体排序顺序.

    速率限制：100次/小时.
    """
    updated_count = service.batch_update_sort_order(project_id, sort_updates)
    return L4SyncResponse(total_synced=updated_count)
