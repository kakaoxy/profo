"""C端公开房源展示路由.

房源列表、详情、顾问联系方式、成交案例、平台统计.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from dependencies.common import PaginationDep
from models.common import RenovationStage
from schemas.public import (
    PublicConsultantContact,
    PublicConsultantInfo,
    PublicCustomerBookingItem,
    PublicMediaItem,
    PublicPlatformStats,
    PublicProjectDetail,
    PublicProjectFilter,
    PublicProjectListItem,
    PublicProjectListResponse,
    PublicRenovationStage,
    PublicShareEventRequest,
    PublicShareStatsResponse,
    PublicSoldProjectItem,
    PublicSoldProjectListResponse,
    PublicTrackingEventResponse,
    PublicVisitEventRequest,
)
from services.marketing.public import PublicProjectService
from services.system.exceptions import ResourceNotFoundError
from settings import settings
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone

router = APIRouter(prefix="/public", tags=["public-projects"])


@router.get(
    "/projects",
    summary="获取房源列表",
    description="获取已发布的房源列表，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_projects(
    request: Request,
    db: DbSessionDep,
    pagination: PaginationDep,
    filters: Annotated[PublicProjectFilter, Depends()],
) -> PublicProjectListResponse:
    """获取已发布的房源列表."""
    svc = PublicProjectService(db)
    items, total = svc.get_published_projects(
        project_status=filters.project_status,
        keyword=filters.keyword,
        layout=filters.layout,
        min_price=filters.min_price,
        max_price=filters.max_price,
        min_area=filters.min_area,
        max_area=filters.max_area,
        min_floor=filters.min_floor,
        max_floor=filters.max_floor,
        sort_by=filters.sort_by,
        sort_order=filters.sort_order,
        page=pagination.page,
        page_size=pagination.page_size,
    )

    cover_map = svc.resolve_cover_images_batch(items)
    result_items = []
    for item in items:
        cover_image, cover_thumbnail_url = cover_map[item.id]
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
                cover_thumbnail_url=cover_thumbnail_url,
                tags=item.tags or [],
                project_status=item.project_status,
                decoration_style=item.decoration_style,
            ),
        )

    return PublicProjectListResponse(
        items=result_items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
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
    pagination: PaginationDep,
    keyword: Annotated[str | None, Query(max_length=100, description="搜索关键词(小区名或商圈)")] = None,
    min_floor: Annotated[int | None, Query(ge=1, description="最小所在楼层")] = None,
    max_floor: Annotated[int | None, Query(ge=1, description="最大所在楼层")] = None,
) -> PublicSoldProjectListResponse:
    """获取已成交的房源案例列表."""
    svc = PublicProjectService(db)
    items, total = svc.get_sold_projects(
        keyword=keyword,
        min_floor=min_floor,
        max_floor=max_floor,
        page=pagination.page,
        page_size=pagination.page_size,
    )

    cover_map = svc.resolve_cover_images_batch(items)
    result_items = []
    for item in items:
        cover_image, cover_thumbnail_url = cover_map[item.id]

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
                cover_thumbnail_url=cover_thumbnail_url,
                sold_days=sold_days,
                decoration_style=item.decoration_style,
            ),
        )

    return PublicSoldProjectListResponse(
        items=result_items,
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.post(
    "/projects/{marketing_project_id}/visit-events",
    summary="上报房源访问埋点",
    description="免登录，PV +1，UV 按匿名 visitor_id 去重；房源不存在返回 404",
    responses={404: {"description": "房源不存在"}},
)
@limiter.limit(RateLimits.PROJECT_VISIT)
def create_visit_event(
    request: Request,
    marketing_project_id: int,
    body: PublicVisitEventRequest,
    db: DbSessionDep,
) -> PublicTrackingEventResponse:
    """上报房源详情页访问埋点."""
    visit = PublicProjectService(db).create_visit_event(marketing_project_id, body)
    return PublicTrackingEventResponse(id=visit.id)


@router.post(
    "/projects/{marketing_project_id}/share-events",
    summary="上报房源分享事件",
    description="需 C 端登录态（员工经附加 customer 角色访问），employee_id 服务端取当前用户；限流",
    responses={404: {"description": "房源不存在"}},
)
@limiter.limit(RateLimits.PROJECT_SHARE)
def create_share_event(
    request: Request,
    marketing_project_id: int,
    body: PublicShareEventRequest,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicTrackingEventResponse:
    """上报房源分享事件."""
    event = PublicProjectService(db).create_share_event(current_user, marketing_project_id, body)
    return PublicTrackingEventResponse(id=event.id)


@router.get(
    "/projects/my/share-stats",
    summary="我的房源分享统计",
    description="当前员工的房源分享次数 / 经我分享打开 PV/UV / 归属我的预约留资（今日 + 累计），需登录",
)
def get_my_share_stats(
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicShareStatsResponse:
    """我的房源分享统计."""
    data = PublicProjectService(db).get_my_share_stats(current_user)
    return PublicShareStatsResponse(**data)


@router.get(
    "/projects/my/customers",
    summary="归属我的预约客户列表",
    description="当前员工房源分享归因的预约客户列表（含客户脱敏手机号与房源快照），按预约时间倒序，需登录",
)
def get_my_customer_bookings(
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> list[PublicCustomerBookingItem]:
    """归属我的预约客户列表."""
    return PublicProjectService(db).get_my_customer_bookings(current_user.id)


@router.get(
    "/projects/{marketing_project_id}",
    summary="获取房源详情",
    description="获取指定房源的详细信息，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_project_detail(
    request: Request,
    marketing_project_id: int,
    db: DbSessionDep,
) -> PublicProjectDetail:
    """获取指定房源的详细信息."""
    svc = PublicProjectService(db)
    project = svc.get_project_detail(marketing_project_id)

    if not project:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)

    media_list = svc.get_project_media(marketing_project_id)

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
    stage_groups: dict[RenovationStage, int] = {}
    for m in renovation_media:
        stage = m.renovation_stage
        if stage not in stage_groups:
            stage_groups[stage] = 0
        stage_groups[stage] += 1
    # 阶段完成日期 - 合并「有照片」与「有完成日期」的阶段，
    # 确保即使某阶段已标记完成但未上传照片，C端仍能展示其完成时间
    stage_dates = project.stage_completed_dates or {}
    merged_stages: dict[RenovationStage, int] = dict(stage_groups)
    for stage_value in stage_dates:
        try:
            stage_enum = RenovationStage(stage_value)
        except ValueError:
            continue
        if stage_enum not in merged_stages:
            merged_stages[stage_enum] = 0
    renovation_stages = [
        PublicRenovationStage(
            stage=stage,
            photo_count=count,
            completed_date=stage_dates.get(stage.value),
        )
        for stage, count in merged_stages.items()
    ]

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
        project_images = [m.file_url for m in media_items if m.media_type == "image" and m.file_url]

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
    "/projects/{marketing_project_id}/consultant",
    summary="获取顾问联系方式",
    description="获取指定房源的顾问联系方式，无需登录；可选 referrer 指定内部分享人，命中时返回分享人联系方式",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_consultant_contact(
    request: Request,
    marketing_project_id: int,
    db: DbSessionDep,
    referrer: Annotated[str | None, Query(max_length=36, description="分享归属用户ID(内部用户)")] = None,
) -> PublicConsultantContact:
    """获取指定房源的顾问联系方式."""
    svc = PublicProjectService(db)
    project = svc.get_project_detail(marketing_project_id)

    if not project:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)

    # 内部分享人：referrer 为有效内部用户时展示其联系方式（分享人优先于房源顾问）
    if referrer:
        sharer = svc.get_internal_contact_user(referrer)
        if sharer:
            # 与顾问一致：未单独配置微信号，微信复用其手机号
            phone = sharer.phone or ""
            return PublicConsultantContact(
                phone=phone,
                wechat_number=phone,
                nickname=sharer.nickname or "",
                avatar=sharer.avatar,
                is_referrer=True,
            )

    if project.consultant_id:
        consultant = svc.get_consultant(project.consultant_id)
        if consultant:
            # 联系方式端点供拨打/复制使用，返回真实手机号；
            # 顾问未单独配置微信号，微信复用其手机号（业务上多同号）
            phone = consultant.phone or ""
            return PublicConsultantContact(
                phone=phone,
                wechat_number=phone,
                nickname=consultant.nickname or "",
                avatar=consultant.avatar,
                is_referrer=False,
            )

    return PublicConsultantContact(
        phone=settings.default_consultant_phone,
        wechat_number=settings.default_consultant_wechat,
        nickname=settings.default_consultant_nickname,
        avatar=None,
        is_referrer=False,
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
    total_owners, on_sale_count, total_sold = svc.get_platform_stats()

    return PublicPlatformStats(
        total_owners=total_owners,
        on_sale_count=on_sale_count,
        total_sold=total_sold,
    )
