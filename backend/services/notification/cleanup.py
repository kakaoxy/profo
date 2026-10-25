"""站内信保留策略清理（迭代二 SPEC §7.4 / K9）.

策略：删除「已读 **且** 通知创建时间超过 ``NOTIFICATION_RETENTION_DAYS``」的
收件行，然后删除已无收件行的通知。**未读永久保留**——跑错会丢用户消息，
因此所有删除条件都以 ``read_at IS NOT NULL`` 为前提。
"""

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session

from models import Notification, NotificationRecipient
from settings import settings

logger = logging.getLogger(__name__)


def cleanup_expired(db: Session, *, retention_days: int | None = None, dry_run: bool = False) -> dict[str, int]:
    """清理过期站内信（幂等，可 dry-run）.

    Args:
        db: 数据库会话
        retention_days: 保留天数（缺省读 settings）
        dry_run: True 时只统计不删除

    Returns:
        ``{"recipients": 删除的收件行数, "notifications": 删除的通知行数}``

    """
    days = retention_days if retention_days is not None else settings.notification_retention_days
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    # 目标收件行：已读 且 所属通知创建早于 cutoff
    target_recipients = (
        select(NotificationRecipient.id)
        .join(Notification, Notification.id == NotificationRecipient.notification_id)
        .where(
            NotificationRecipient.read_at.is_not(None),
            Notification.created_at < cutoff,
        )
    )
    recipient_ids = list(db.execute(target_recipients).scalars().all())

    if dry_run:
        # 无收件行的通知（含本次将清空后的）
        notification_ids = list(
            db.execute(
                select(Notification.id).where(
                    Notification.created_at < cutoff,
                    ~exists().where(NotificationRecipient.notification_id == Notification.id),
                )
            )
            .scalars()
            .all()
        )
        return {"recipients": len(recipient_ids), "notifications": len(notification_ids)}

    if not recipient_ids:
        return {"recipients": 0, "notifications": 0}

    db.execute(delete(NotificationRecipient).where(NotificationRecipient.id.in_(recipient_ids)))
    db.flush()

    # 删除已无收件行的通知（只删创建早于 cutoff 的，避免误删刚建的空通知）
    orphan_notifications = list(
        db.execute(
            select(Notification.id).where(
                Notification.created_at < cutoff,
                ~exists().where(NotificationRecipient.notification_id == Notification.id),
            )
        )
        .scalars()
        .all()
    )
    if orphan_notifications:
        db.execute(delete(Notification).where(Notification.id.in_(orphan_notifications)))

    db.commit()
    return {"recipients": len(recipient_ids), "notifications": len(orphan_notifications)}


__all__ = ["cleanup_expired"]
