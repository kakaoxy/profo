"""
C端公开房源展示路由
房源列表、详情、顾问联系方式、成交案例、平台统计
"""
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import func, and_, desc, case

from dependencies.auth import DbSessionDep
from models import L4MarketingProject, L4MarketingMedia, User
from schemas.l4_marketing.enums import PublishStatus, MarketingProjectStatus
from settings import settings
from utils.formatters import mask_phone, escape_like
from common import limiter, RateLimits
from schemas.public import (
    PublicProjectListItem,
    PublicProjectListResponse,
    PublicMediaItem,
    PublicRenovationStage,
    PublicConsultantInfo,
    PublicProjectDetail,
    PublicConsultantContact,
    PublicSoldProjectItem,
    PublicSoldProjectListResponse,
    PublicPlatformStats,
)

router = APIRouter(prefix="/public", tags=["public-projects"])

ALLOWED_SORT_FIELDS = {
    "created_at": L4MarketingProject.created_at,
    "total_price": L4MarketingProject.total_price,
    "unit_price": L4MarketingProject.unit_price,
    "area": L4MarketingProject.area,
}


@router.get(
    "/projects",
    response_model=PublicProjectListResponse,
    summary="获取房源列表",
    description="获取已发布的房源列表，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_projects(
    request: Request,
    db: DbSessionDep,
    project_status: Optional[str] = Query(None, description="项目状态筛选"),
    community_name: Optional[str] = Query(None, description="小区名称搜索"),
    layout: Optional[str] = Query(None, description="户型筛选"),
    min_price: Optional[float] = Query(None, description="最低总价(万)"),
    max_price: Optional[float] = Query(None, description="最高总价(万)"),
    min_area: Optional[float] = Query(None, description="最小面积(m²)"),
    max_area: Optional[float] = Query(None, description="最大面积(m²)"),
    sort_by: Optional[str] = Query("created_at", description="排序字段"),
    sort_order: Optional[str] = Query("desc", description="排序方向 asc/desc"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取已发布的房源列表"""
    query = db.query(L4MarketingProject).filter(
        L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
        L4MarketingProject.is_deleted.is_(False),
    )

    if project_status:
        query = query.filter(L4MarketingProject.project_status == project_status)
    if community_name:
        query = query.filter(L4MarketingProject.community_name.like(f"%{escape_like(community_name)}%"))
    if layout:
        query = query.filter(L4MarketingProject.layout == layout)
    if min_price is not None:
        query = query.filter(L4MarketingProject.total_price >= min_price)
    if max_price is not None:
        query = query.filter(L4MarketingProject.total_price <= max_price)
    if min_area is not None:
        query = query.filter(L4MarketingProject.area >= min_area)
    if max_area is not None:
        query = query.filter(L4MarketingProject.area <= max_area)

    total = query.count()

    sort_column = ALLOWED_SORT_FIELDS.get(sort_by, L4MarketingProject.created_at)
    if sort_order == "asc":
        query = query.order_by(sort_column.asc())
    else:
        query = query.order_by(sort_column.desc())

    offset = (page - 1) * page_size
    items = query.offset(offset).limit(page_size).all()

    result_items = []
    for item in items:
        images = item.images or []
        cover_image = images[0] if images else None
        result_items.append(PublicProjectListItem(
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
        ))

    return PublicProjectListResponse(
        items=result_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/projects/sold",
    response_model=PublicSoldProjectListResponse,
    summary="获取成交案例列表",
    description="获取已成交的房源案例列表，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_sold_projects(
    request: Request,
    db: DbSessionDep,
    community_name: Optional[str] = Query(None, description="小区名称筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
):
    """获取已成交的房源案例列表"""
    query = db.query(L4MarketingProject).filter(
        L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value,
        L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
        L4MarketingProject.is_deleted.is_(False),
    )

    if community_name:
        query = query.filter(L4MarketingProject.community_name.like(f"%{escape_like(community_name)}%"))

    total = query.count()

    items = query.order_by(desc(L4MarketingProject.created_at)).offset((page - 1) * page_size).limit(page_size).all()

    result_items = []
    for item in items:
        images = item.images or []
        cover_image = images[0] if images else None
        sold_days = None
        if item.updated_at and item.created_at:
            delta = item.updated_at - item.created_at
            sold_days = delta.days

        result_items.append(PublicSoldProjectItem(
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
        ))

    return PublicSoldProjectListResponse(
        items=result_items,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/projects/{project_id}",
    response_model=PublicProjectDetail,
    summary="获取房源详情",
    description="获取指定房源的详细信息，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_project_detail(
    request: Request,
    project_id: int,
    db: DbSessionDep,
):
    """获取指定房源的详细信息"""
    project = db.query(L4MarketingProject).filter(
        and_(
            L4MarketingProject.id == project_id,
            L4MarketingProject.is_deleted.is_(False),
        )
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )

    media_list = db.query(L4MarketingMedia).filter(
        L4MarketingMedia.marketing_project_id == project_id,
        L4MarketingMedia.is_deleted.is_(False),
    ).order_by(L4MarketingMedia.sort_order).all()

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

    renovation_stages = []
    renovation_media = [m for m in media_items if m.photo_category == "renovation" and m.renovation_stage]
    stage_groups = {}
    for m in renovation_media:
        stage = m.renovation_stage
        if stage not in stage_groups:
            stage_groups[stage] = 0
        stage_groups[stage] += 1
    renovation_stages = [
        PublicRenovationStage(stage=stage, photo_count=count)
        for stage, count in stage_groups.items()
    ]

    consultant_info = None
    if project.consultant_id:
        consultant = db.query(User).filter(User.id == project.consultant_id).first()
        if consultant:
            consultant_info = PublicConsultantInfo(
                nickname=consultant.nickname,
                phone=mask_phone(consultant.phone),
            )

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
        images=project.images or [],
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
    response_model=PublicConsultantContact,
    summary="获取顾问联系方式",
    description="获取指定房源的顾问联系方式，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_consultant_contact(
    request: Request,
    project_id: int,
    db: DbSessionDep,
):
    """获取指定房源的顾问联系方式"""
    project = db.query(L4MarketingProject).filter(
        and_(
            L4MarketingProject.id == project_id,
            L4MarketingProject.is_deleted.is_(False),
        )
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="项目不存在"
        )

    if project.consultant_id:
        consultant = db.query(User).filter(User.id == project.consultant_id).first()
        if consultant:
            return PublicConsultantContact(
                phone=mask_phone(consultant.phone) or "",
                wechat_number=getattr(consultant, 'wechat_number', None) or "",
                nickname=consultant.nickname or "",
            )

    return PublicConsultantContact(
        phone=settings.default_consultant_phone,
        wechat_number=settings.default_consultant_wechat,
        nickname=settings.default_consultant_nickname,
    )


@router.get(
    "/stats/platform",
    response_model=PublicPlatformStats,
    summary="获取平台统计数据",
    description="获取平台统计数据，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_PROJECT_LIST)
def get_platform_stats(
    request: Request,
    db: DbSessionDep,
):
    """获取平台统计数据"""
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

    stats = db.query(
        func.count(func.distinct(
            case(
                (
                    and_(
                        L4MarketingProject.is_deleted.is_(False),
                        L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
                    ),
                    L4MarketingProject.community_id,
                ),
                else_=None,
            )
        )).label("total_owners"),
        func.count(
            case(
                (
                    and_(
                        L4MarketingProject.is_deleted.is_(False),
                        L4MarketingProject.publish_status == PublishStatus.PUBLISHED.value,
                        L4MarketingProject.project_status == MarketingProjectStatus.FOR_SALE.value,
                    ),
                    L4MarketingProject.id,
                ),
                else_=None,
            )
        ).label("on_sale_count"),
        func.count(
            case(
                (
                    and_(
                        L4MarketingProject.is_deleted.is_(False),
                        L4MarketingProject.project_status == MarketingProjectStatus.SOLD.value,
                        L4MarketingProject.updated_at >= month_start,
                    ),
                    L4MarketingProject.id,
                ),
                else_=None,
            )
        ).label("current_month_sold"),
    ).first()

    if not stats:
        return PublicPlatformStats(
            total_owners=0,
            on_sale_count=0,
            current_month_sold=0,
        )

    return PublicPlatformStats(
        total_owners=stats.total_owners or 0,
        on_sale_count=stats.on_sale_count or 0,
        current_month_sold=stats.current_month_sold or 0,
    )
