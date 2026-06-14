"""C端公开房源展示路由.

房源列表、详情、顾问联系方式、成交案例、平台统计.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request

from utils.common import RateLimits, limiter
from dependencies.auth import DbSessionDep
from schemas.public import (
    PublicConsultantContact,
    PublicConsultantInfo,
    PublicMediaItem,
    PublicPlatformStats,
    PublicProjectDetail,
    PublicProjectListItem,
    PublicProjectListResponse,
    PublicRenovationStage,
    PublicSoldProjectItem,
    PublicSoldProjectListResponse,
)
from services.marketing.public import PublicProjectService
from services.system.exceptions import ResourceNotFoundError
from settings import settings
from utils.formatters import mask_phone

router = APIRouter(prefix="/public", tags=["public-projects"])


@router.get(
    "/projects",
    summary="获取房源列表",
    description="获取已发布的房源列表，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_projects(  # noqa: PLR0913
    request: Request,
    db: DbSessionDep,
    project_status: Annotated[str | None, Query(description="项目状态筛选")] = None,
    community_name: Annotated[str | None, Query(description="小区名称搜索")] = None,
    layout: Annotated[str | None, Query(description="户型筛选")] = None,
    min_price: Annotated[float | None, Query(description="最低总价(万)")] = None,
    max_price: Annotated[float | None, Query(description="最高总价(万)")] = None,
    min_area: Annotated[float | None, Query(description="最小面积(m²)")] = None,
    max_area: Annotated[float | None, Query(description="最大面积(m²)")] = None,
    sort_by: Annotated[str | None, Query(description="排序字段")] = "created_at",
    sort_order: Annotated[str | None, Query(description="排序方向 asc/desc")] = "desc",
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页数量")] = 20,
) -> PublicProjectListResponse:
    """获取已发布的房源列表."""
    svc = PublicProjectService(db)
    items, total = svc.get_published_projects(
        project_status=project_status,
        community_name=community_name,
        layout=layout,
        min_price=min_price,
        max_price=max_price,
        min_area=min_area,
        max_area=max_area,
        sort_by=sort_by or "created_at",
        sort_order=sort_order or "desc",
        page=page,
        page_size=page_size,
    )

    result_items = []
    for item in items:
        cover_image = svc.resolve_cover_image(item)
        result_items.append(
            PublicProjectListItem(
                id=item.id,
                community_name=item.community_name,
                layout=item.layout,
                orientation=item.orientation,
                floor_info=item.floor_info,
                area=float(item.area),
                total_price=float(item.total_price),
                unit_price=float(item.unit_price),
                title=item.title,
                cover_image=cover_image,
                tags=item.tags or [],
                project_status=item.project_status,
                decoration_style=item.decoration_style,
            ),
        )

    return PublicProjectListResponse(
        items=result_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/projects/sold",
    summary="获取成交案例列表",
    description="获取已成交的房源案例列表，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_sold_projects(
    request: Request,
    db: DbSessionDep,
    community_name: Annotated[str | None, Query(description="小区名称筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页数量")] = 20,
) -> PublicSoldProjectListResponse:
    """获取已成交的房源案例列表."""
    svc = PublicProjectService(db)
    items, total = svc.get_sold_projects(
        community_name=community_name,
        page=page,
        page_size=page_size,
    )

    result_items = []
    for item in items:
        cover_image = svc.resolve_cover_image(item)

        sold_days = None
        if item.updated_at and item.created_at:
            delta = item.updated_at - item.created_at
            sold_days = delta.days

        result_items.append(
            PublicSoldProjectItem(
                id=item.id,
                community_name=item.community_name,
                layout=item.layout,
                area=float(item.area),
                total_price=float(item.total_price),
                unit_price=float(item.unit_price),
                title=item.title,
                cover_image=cover_image,
                sold_days=sold_days,
                decoration_style=item.decoration_style,
            ),
        )

    return PublicSoldProjectListResponse(
        items=result_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/projects/{project_id}",
    summary="获取房源详情",
    description="获取指定房源的详细信息，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_project_detail(
    request: Request,
    project_id: int,
    db: DbSessionDep,
) -> PublicProjectDetail:
    """获取指定房源的详细信息."""
    svc = PublicProjectService(db)
    project = svc.get_project_detail(project_id)

    if not project:
        raise ResourceNotFoundError("项目不存在")

    media_list = svc.get_project_media(project_id)

    media_items = [
        PublicMediaItem(
            id=m.id,
            file_url=m.file_url,
            thumbnail_url=m.thumbnail_url,
            media_type=m.media_type,
            photo_category=m.photo_category,
            renovation_stage=m.renovation_stage,
            description=m.description,
            sort_order=m.sort_order,
        )
        for m in media_list
    ]

    renovation_media = [m for m in media_items if m.photo_category == "renovation" and m.renovation_stage]
    stage_groups: dict[str, int] = {}
    for m in renovation_media:
        stage = m.renovation_stage
        if stage not in stage_groups:
            stage_groups[stage] = 0
        stage_groups[stage] += 1
    renovation_stages = [PublicRenovationStage(stage=stage, photo_count=count) for stage, count in stage_groups.items()]

    consultant_info = None
    if project.consultant_id:
        consultant = svc.get_consultant(project.consultant_id)
        if consultant:
            consultant_info = PublicConsultantInfo(
                nickname=consultant.nickname,
                phone=mask_phone(consultant.phone),
            )

    project_images = project.images or []
    if not project_images:
        project_images = [
            m.file_url
            for m in media_items
            if m.media_type == "image" and m.file_url
        ]

    return PublicProjectDetail(
        id=project.id,
        community_name=project.community_name,
        layout=project.layout,
        orientation=project.orientation,
        floor_info=project.floor_info,
        area=float(project.area),
        total_price=float(project.total_price),
        unit_price=float(project.unit_price),
        title=project.title,
        images=project_images,
        tags=project.tags or [],
        project_status=project.project_status,
        decoration_style=project.decoration_style,
        description=None,
        media=media_items,
        renovation_stages=renovation_stages,
        consultant=consultant_info,
        created_at=project.created_at,
        updated_at=project.updated_at,
    )


@router.get(
    "/projects/{project_id}/consultant",
    summary="获取顾问联系方式",
    description="获取指定房源的顾问联系方式，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_consultant_contact(
    request: Request,
    project_id: int,
    db: DbSessionDep,
) -> PublicConsultantContact:
    """获取指定房源的顾问联系方式."""
    svc = PublicProjectService(db)
    project = svc.get_project_detail(project_id)

    if not project:
        raise ResourceNotFoundError("项目不存在")

    if project.consultant_id:
        consultant = svc.get_consultant(project.consultant_id)
        if consultant:
            return PublicConsultantContact(
                phone=mask_phone(consultant.phone) or "",
                wechat_number=getattr(consultant, "wechat_number", None) or "",
                nickname=consultant.nickname or "",
            )

    return PublicConsultantContact(
        phone=settings.default_consultant_phone,
        wechat_number=settings.default_consultant_wechat,
        nickname=settings.default_consultant_nickname,
    )


@router.get(
    "/stats/platform",
    summary="获取平台统计数据",
    description="获取平台统计数据，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_platform_stats(
    request: Request,
    db: DbSessionDep,
) -> PublicPlatformStats:
    """获取平台统计数据."""
    svc = PublicProjectService(db)
    total_owners, on_sale_count, current_month_sold = svc.get_platform_stats()

    return PublicPlatformStats(
        total_owners=total_owners,
        on_sale_count=on_sale_count,
        current_month_sold=current_month_sold,
    )
