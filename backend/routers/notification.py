"""通知中心路由（迭代二 SPEC §6.1）.

6 个端点全部要求登录态；所有查询在 Service 层 SQL 强制 ``user_id = 当前用户``（K7），
标记他人通知返回 404（不用 403，避免探测）。
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request

from dependencies.auth import CurrentActiveUserDep, DbSessionDep
from schemas.notification import (
    MarkAllReadRequest,
    MarkAllReadResponse,
    NotificationCategory,
    NotificationListItem,
    NotificationListResponse,
    NotificationPreferencesResponse,
    NotificationPreferencesUpdateRequest,
    NotificationPriority,
    NotificationReadResponse,
    UnreadCountResponse,
)
from services.notification import preferences as prefs_service
from services.notification.events import CATEGORY_META, CATEGORY_TEMPLATE_KEY, is_closeable_category
from services.notification.service import NotificationFilter, NotificationService
from services.system.exceptions import ResourceNotFoundError, ValidationError
from settings import settings
from utils.common import RateLimits, get_login_user_identifier, limiter

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", summary="通知列表（仅自己）")
@limiter.limit(RateLimits.NOTIFICATION_READ, key_func=get_login_user_identifier)
def list_notifications(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[
        int,
        # 上限取配置（与 dependencies/common.py 的 le=settings.max_page_size 同范式）
        Query(ge=1, le=settings.notification_page_size_max, description="每页数量"),
    ] = 20,
    unread: Annotated[bool, Query(description="仅未读")] = False,
    category: Annotated[NotificationCategory | None, Query(description="分类筛选")] = None,
    priority: Annotated[NotificationPriority | None, Query(description="优先级筛选")] = None,
    days: Annotated[int | None, Query(ge=1, le=365, description="最近 N 天（设计稿「近 30 天」筛选）")] = None,
) -> NotificationListResponse:
    """分页查询当前用户的站内信（SPEC §6.1 #1）."""
    service = NotificationService(db)
    filter_spec = NotificationFilter(
        unread_only=unread,
        category=category,
        priority=priority,
        days=days,
    )
    items, total, unread_in_filter = service.list_for_user(
        str(current_user.id),
        filter_spec=filter_spec,
        page=page,
        page_size=page_size,
    )
    unread_total = service.unread_count(str(current_user.id))["total"]
    return NotificationListResponse(
        items=[NotificationListItem.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
        unread_total=unread_total,
        unread_in_filter=unread_in_filter,
    )


@router.get("/unread-count", summary="未读统计（总数 + 按分类）")
@limiter.limit(RateLimits.NOTIFICATION_READ, key_func=get_login_user_identifier)
def get_unread_count(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> UnreadCountResponse:
    """未读数（铃铛角标 + 抽屉 tabs 计数）."""
    return UnreadCountResponse(**NotificationService(db).unread_count(str(current_user.id)))


@router.get("/preferences", summary="读取通知偏好")
def get_preferences(
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> NotificationPreferencesResponse:
    """读取偏好（缺行 = 默认全开，K5）."""
    return _build_preferences_response(db, current_user)


@router.put("/preferences", summary="保存通知偏好")
def update_preferences(
    req: NotificationPreferencesUpdateRequest,
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> NotificationPreferencesResponse:
    """保存偏好（`system`/`security` 关闭站内信 → 400）."""
    # 校验分类合法（未知分类 422 语义由 Literal 未覆盖此处，显式拒绝）
    unknown = set(req.categories) - set(CATEGORY_META)
    if unknown:
        msg = f"未知的通知分类：{sorted(unknown)}"
        raise ValidationError(msg)

    merged = prefs_service.load_preferences(db, str(current_user.id))
    for category, channels in req.categories.items():
        for channel in ("in_app", "wechat"):
            if channel in channels:
                merged[category][channel] = bool(channels[channel])

    try:
        prefs_service.save_preferences(db, str(current_user.id), merged)
    except ValueError as exc:
        # K5：system/security 不可关闭 → 400（SPEC §6.1 错误语义）
        raise ValidationError(str(exc)) from exc

    return _build_preferences_response(db, current_user)


@router.post("/read-all", summary="全部标记已读（可按分类）")
def mark_all_read(
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
    req: MarkAllReadRequest | None = None,
) -> MarkAllReadResponse:
    """全部已读（抽屉/消息中心共用；支持 ``category`` 收敛当前 tab）."""
    category = req.category if req is not None else None
    affected = NotificationService(db).mark_all_read(str(current_user.id), category=category)
    return MarkAllReadResponse(affected=affected)


@router.post("/{notification_id}/read", summary="标记单条已读（幂等）")
def mark_read(
    notification_id: uuid.UUID,
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> NotificationReadResponse:
    """标记单条已读；非收件人 → 404（K7）."""
    try:
        read_at = NotificationService(db).mark_read(str(current_user.id), notification_id)
    except LookupError as exc:
        raise ResourceNotFoundError(str(exc)) from exc
    return NotificationReadResponse(id=notification_id, read_at=read_at)


def _build_preferences_response(
    db: DbSessionDep, current_user: CurrentActiveUserDep
) -> NotificationPreferencesResponse:
    """组装偏好响应（含分类元数据、模板可用性、微信可用性）."""
    prefs = prefs_service.load_preferences(db, str(current_user.id))
    template_ok = prefs_service.template_status(db)
    categories: dict[str, dict[str, object]] = {}
    for category, meta in CATEGORY_META.items():
        category_prefs = prefs.get(category, {"in_app": True, "wechat": True})
        wechat_only = bool(meta["wechat_only"])
        categories[category] = {
            "label": meta["label"],
            "description": meta["description"],
            "in_app": bool(category_prefs.get("in_app", True)),
            "wechat": bool(category_prefs.get("wechat", True)),
            "in_app_locked": not is_closeable_category(category),
            "wechat_only": wechat_only,
            # 无独立模板的分类（CATEGORY_TEMPLATE_KEY 为 None）不算「模板缺失」，而是「不支持微信」
            "wechat_template_missing": bool(
                CATEGORY_TEMPLATE_KEY.get(category) and not template_ok.get(category, False)
            ),
        }
    return NotificationPreferencesResponse(
        categories=categories,  # type: ignore[arg-type]
        wechat_available=prefs_service.wechat_available(db, current_user),
        template_missing_count=prefs_service.template_missing_count(db),
    )


__all__ = ["router"]
