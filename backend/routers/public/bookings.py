"""C端房源预约路由.

预约创建（幂等）、我的预约列表.
"""

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Query, Request

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.public import (
    PublicProjectBookingCreate,
    PublicProjectBookingItem,
    PublicProjectBookingResponse,
)
from services.marketing.public import PublicProjectService
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/bookings", tags=["public-bookings"])


def _build_item(
    *,
    booking_id: int,
    marketing_project_id: int,
    project_title: str,
    community_name: str | None,
    cover_image: str | None,
    layout: str,
    total_price: float,
    created_at: datetime,
) -> PublicProjectBookingItem:
    """组装预约列表项（快照字段来自房源当前数据）."""
    return PublicProjectBookingItem(
        id=booking_id,
        marketing_project_id=marketing_project_id,
        project_title=project_title,
        community_name=community_name,
        cover_image=cover_image,
        layout=layout,
        total_price=total_price,
        created_at=created_at,
    )


@router.post(
    "",
    summary="预约看房",
    description="C端登录用户预约看房；未绑手机号返回 409，同一用户对同一房源幂等（重复预约返回既有记录 is_new=false）",
    responses={
        404: {"description": "房源不存在或未发布"},
        409: {"description": "用户未绑定手机号"},
    },
)
@limiter.limit(RateLimits.PUBLIC_BOOKING_CREATE)
def create_booking(
    request: Request,
    body: PublicProjectBookingCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicProjectBookingResponse:
    """创建房源预约（幂等）.

    新建与幂等命中统一返回 200，由 is_new 区分，前端无需按状态码分支。
    """
    svc = PublicProjectService(db)
    booking, project, is_new = svc.create_booking(
        user=current_user,
        marketing_project_id=body.marketing_project_id,
        visitor_id=body.visitor_id,
    )

    cover_map = svc.resolve_cover_images_batch([project])
    cover_image, _ = cover_map[project.id]
    item = _build_item(
        booking_id=booking.id,
        marketing_project_id=booking.marketing_project_id,
        project_title=project.title,
        community_name=project.community_name,
        cover_image=cover_image,
        layout=project.layout,
        total_price=float(project.total_price),
        created_at=booking.created_at,
    )
    return PublicProjectBookingResponse(booking=item, is_new=is_new)


@router.get(
    "/my",
    summary="获取我的预约列表",
    description="当前用户的房源预约列表（含房源快照字段），按预约时间倒序，支持按房源过滤",
)
@limiter.limit(RateLimits.PUBLIC_BOOKING_LIST)
def get_my_bookings(
    request: Request,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
    marketing_project_id: Annotated[int | None, Query(description="按房源ID过滤")] = None,
) -> list[PublicProjectBookingItem]:
    """获取我的预约列表（含房源快照字段）."""
    svc = PublicProjectService(db)
    rows = svc.get_my_bookings(user_id=current_user.id, marketing_project_id=marketing_project_id)

    projects = [project for _, project in rows]
    cover_map = svc.resolve_cover_images_batch(projects)
    return [
        _build_item(
            booking_id=booking.id,
            marketing_project_id=booking.marketing_project_id,
            project_title=project.title,
            community_name=project.community_name,
            cover_image=cover_map[project.id][0],
            layout=project.layout,
            total_price=float(project.total_price),
            created_at=booking.created_at,
        )
        for booking, project in rows
    ]
