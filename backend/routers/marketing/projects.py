"""L4 市场营销层路由.

符合项目指南的 API 设计规范.
"""

from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, Path, Query, Request, status
from fastapi.concurrency import run_in_threadpool

from dependencies.auth import (
    DbSessionDep,
    L4MarketingReadPermDep,
    L4MarketingWritePermDep,
)
from dependencies.common import PaginationDep
from models.marketing.l4_marketing import MarketingProjectStatus, PublishStatus
from schemas.l4_marketing import (
    L4MarketingMediaCreate,
    L4MarketingMediaListResponse,
    L4MarketingMediaResponse,
    L4MarketingMediaUpdate,
    L4MarketingNotifySummary,
    L4MarketingPriceChangeSummary,
    L4MarketingPriceChangeTimelineResponse,
    L4MarketingProjectCreate,
    L4MarketingProjectListResponse,
    L4MarketingProjectResponse,
    L4MarketingProjectUpdate,
    L4MarketingSubscriptionStatsResponse,
    L4SyncResponse,
    MediaSortOrderUpdate,
)
from services.marketing import (
    MarketingMediaService as L4MarketingMediaService,
)
from services.marketing import (
    MarketingProjectService as L4MarketingProjectService,
)
from services.marketing.aggregate import aggregate_notify_fields
from services.marketing.notify import notify_project_price_changed, notify_projects_published
from services.marketing.public import PublicProjectService
from services.marketing.subscription import MarketingSubscriptionService
from services.system.exceptions import ResourceNotFoundError
from utils.common import RateLimits, limiter

router = APIRouter(
    prefix="/admin/marketing",
    tags=["marketing"],
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
def list_marketing_projects(
    db: DbSessionDep,
    service: _ProjectServiceDep,
    _current_user: L4MarketingReadPermDep,
    pagination: PaginationDep,
    publish_status: Annotated[PublishStatus | None, Query(description="发布状态: 草稿/发布")] = None,
    project_status: Annotated[MarketingProjectStatus | None, Query(description="项目状态: 在途/在售/已售")] = None,
    consultant_id: Annotated[str | None, Query(max_length=100, description="顾问ID")] = None,
    community_id: Annotated[str | None, Query(max_length=100, description="小区ID")] = None,
    is_new_listing: Annotated[bool | None, Query(description="仅新上房源(首次发布≤7天)")] = None,
    has_price_change: Annotated[bool | None, Query(description="仅近期调价房源(≤7天)")] = None,
) -> L4MarketingProjectListResponse:
    """获取营销项目列表 - 统一分页格式，包含摘要统计."""
    summary = service.get_projects_summary(
        publish_status=publish_status,
        project_status=project_status,
        consultant_id=consultant_id,
        community_id=community_id,
        is_new_listing=is_new_listing,
        has_price_change=has_price_change,
    )

    skip = (pagination.page - 1) * pagination.page_size
    items, total = service.get_projects(
        skip=skip,
        limit=pagination.page_size,
        publish_status=publish_status,
        project_status=project_status,
        consultant_id=consultant_id,
        community_id=community_id,
        is_new_listing=is_new_listing,
        has_price_change=has_price_change,
    )

    # 复用C端封面规则（营销照片首张图片，跳过视频），保证列表标题图与C端一致
    cover_map = PublicProjectService(db).resolve_cover_images_batch(items)
    # 新上徽标（与 C 端 is_new_listing 同口径：published_at ≤ BADGE_WINDOW_DAYS）
    badge_map = PublicProjectService(db).resolve_listing_badges(items)
    # 调价摘要 + 通知统计批量聚合（admin 通知列 / 总价副行 / 详情 Sheet 数据源）
    notify_map = aggregate_notify_fields(db, items)
    result_items = []
    for item in items:
        resp = L4MarketingProjectResponse.model_validate(item)
        cover_image, cover_thumbnail_url = cover_map[item.id]
        resp.cover_image = cover_image
        resp.cover_thumbnail_url = cover_thumbnail_url
        resp.is_new_listing = badge_map[item.id][0]
        latest_change, notify_summary = notify_map[item.id]
        resp.latest_price_change = L4MarketingPriceChangeSummary(**latest_change) if latest_change else None
        resp.notify_summary = L4MarketingNotifySummary(**notify_summary)
        result_items.append(resp)

    return L4MarketingProjectListResponse(
        items=result_items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
        summary=summary,
    )


@router.get(
    "/projects/{project_id}/price-changes",
    summary="获取调价历史时间线",
)
def list_price_change_timeline(
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    service: _ProjectServiceDep,
    _current_user: L4MarketingReadPermDep,
) -> L4MarketingPriceChangeTimelineResponse:
    """获取营销项目调价历史时间线（倒序，含分次 notify success/skipped/failed 计数）."""
    items, total = service.get_price_change_timeline(project_id)
    return L4MarketingPriceChangeTimelineResponse(items=items, total=total)


@router.get(
    "/subscription-stats",
    summary="获取全局订阅统计",
)
def get_subscription_stats(
    db: DbSessionDep,
    _current_user: L4MarketingReadPermDep,
) -> L4MarketingSubscriptionStatsResponse:
    """获取订阅漏斗全局统计（Router 禁 SQL，聚合全部在 Service）."""
    return MarketingSubscriptionService(db).get_global_stats()


@router.post(
    "/projects",
    status_code=status.HTTP_201_CREATED,
    summary="创建独立营销项目",
)
@limiter.limit(RateLimits.MARKETING_CREATE)
def create_marketing_project(
    request: Request,
    background_tasks: BackgroundTasks,
    data: L4MarketingProjectCreate,
    service: _ProjectServiceDep,
    current_user: L4MarketingWritePermDep,
) -> L4MarketingProjectResponse:
    """创建独立营销项目.

    速率限制：100次/小时.
    创建即发布视为上新：响应返回后由后台任务触发上新订阅消息通知
    （notify 入口自建会话并吞掉一切异常仅记日志，绝不影响创建结果）。
    """
    project, is_new_listing = service.create_project(data)
    if is_new_listing:
        background_tasks.add_task(notify_projects_published, project.id)
    return project


@router.get(
    "/projects/{project_id}",
    summary="获取营销项目详情",
)
def get_marketing_project(
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    service: _ProjectServiceDep,
    db: DbSessionDep,
    _current_user: L4MarketingReadPermDep,
) -> L4MarketingProjectResponse:
    """获取营销项目详情."""
    item = service.get_project(project_id)
    if not item:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
    resp = L4MarketingProjectResponse.model_validate(item)
    # 调价摘要 + 通知统计与列表同口径聚合（详情 Sheet 订阅通知区块数据源）
    latest_change, notify_summary = aggregate_notify_fields(db, [item])[item.id]
    resp.latest_price_change = L4MarketingPriceChangeSummary(**latest_change) if latest_change else None
    resp.notify_summary = L4MarketingNotifySummary(**notify_summary)
    return resp


@router.put(
    "/projects/{project_id}",
    summary="更新营销项目",
)
@limiter.limit(RateLimits.MARKETING_UPDATE)
async def update_marketing_project(
    request: Request,
    background_tasks: BackgroundTasks,
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    data: L4MarketingProjectUpdate,
    service: _ProjectServiceDep,
    current_user: L4MarketingWritePermDep,
) -> L4MarketingProjectResponse:
    """更新营销项目.

    速率限制：100次/小时.
    首次发布（上新）/ 已发布房源调价时由后台任务触发订阅消息通知
    （notify 入口自建会话并吞掉一切异常仅记日志，绝不影响更新结果）。
    """
    result = await run_in_threadpool(service.update_project, project_id, data)
    if not result:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
    item, change_signal = result
    if change_signal.is_new_listing:
        background_tasks.add_task(notify_projects_published, item.id)
    if change_signal.price_signal is not None:
        background_tasks.add_task(notify_project_price_changed, item.id, change_signal.price_signal)
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
    current_user: L4MarketingWritePermDep,
) -> None:
    """逻辑删除营销项目.

    速率限制：20次/小时.
    """
    if not service.delete_project(project_id):
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)


@router.get(
    "/projects/{project_id}/media",
    summary="获取媒体列表",
)
def list_marketing_media(
    project_id: Annotated[int, Path(ge=1, description="项目ID")],
    service: _MediaServiceDep,
    _current_user: L4MarketingReadPermDep,
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
    current_user: L4MarketingWritePermDep,
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
    current_user: L4MarketingWritePermDep,
) -> L4MarketingMediaResponse:
    """更新媒体信息.

    速率限制：100次/小时.
    """
    item = service.update_media(media_id, data)
    if not item:
        msg = "媒体不存在"
        raise ResourceNotFoundError(msg)
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
    current_user: L4MarketingWritePermDep,
) -> None:
    """逻辑删除媒体.

    速率限制：20次/小时.
    """
    if not service.delete_media(media_id):
        msg = "媒体不存在"
        raise ResourceNotFoundError(msg)


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
    current_user: L4MarketingWritePermDep,
) -> L4SyncResponse:
    """批量更新媒体排序顺序.

    速率限制：100次/小时.
    """
    updated_count = service.batch_update_sort_order(project_id, sort_updates)
    return L4SyncResponse(total_synced=updated_count)
