"""营销项目通知聚合查询服务（admin 列表/详情 Sheet 数据源）.

批量聚合 latest_price_change（窗口期 7 天内最近一条调价）与
notify_summary（notify_logs 仅 success 口径计数），供 admin 营销
列表响应填充，全部 in_ 批量查询避免 N+1。
"""

from datetime import datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from models import L4MarketingNotifyLog, L4MarketingPriceChange, L4MarketingProject
from services.marketing.constants import BADGE_WINDOW_DAYS


def aggregate_notify_fields(
    db: Session,
    items: list[L4MarketingProject],
) -> dict[int, tuple[dict | None, dict]]:
    """批量聚合项目调价摘要与通知统计.

    Returns:
        {project_id: (latest_price_change_dict_or_None, notify_summary_dict)}
        notify_summary_dict = {new_listing_count, price_change_count}

    """
    result: dict[int, tuple[dict | None, dict]] = {
        item.id: (None, {"new_listing_count": 0, "price_change_count": 0}) for item in items
    }
    if not result:
        return result

    window_start = datetime.now(timezone.utc) - timedelta(days=BADGE_WINDOW_DAYS)
    ids = list(result)

    # 窗口期内最近一条调价（记录量小，Python 侧分组取首条）
    changes = (
        db.query(L4MarketingPriceChange)
        .filter(
            L4MarketingPriceChange.marketing_project_id.in_(ids),
            L4MarketingPriceChange.created_at >= window_start,
        )
        .order_by(L4MarketingPriceChange.created_at.desc())
        .all()
    )
    latest: dict[int, L4MarketingPriceChange] = {}
    for row in changes:
        latest.setdefault(row.marketing_project_id, row)

    # 通知成功计数（不窗口期限制：累计送达人数）
    counts = (
        db.query(
            L4MarketingNotifyLog.marketing_project_id,
            L4MarketingNotifyLog.notify_type,
            func.count(L4MarketingNotifyLog.id),
        )
        .filter(
            L4MarketingNotifyLog.marketing_project_id.in_(ids),
            L4MarketingNotifyLog.send_status == "success",
            L4MarketingNotifyLog.notify_type.in_(["new_listing", "price_change"]),
        )
        .group_by(
            L4MarketingNotifyLog.marketing_project_id,
            L4MarketingNotifyLog.notify_type,
        )
        .all()
    )
    summary_map: dict[int, dict[str, int]] = {}
    for project_id, notify_type, cnt in counts:
        summary_map.setdefault(project_id, {"new_listing_count": 0, "price_change_count": 0})
        summary_map[project_id][f"{notify_type}_count"] = int(cnt)

    for project_id in result:
        change = latest.get(project_id)
        price_change_dict = (
            {
                "old_price": float(change.old_price),
                "new_price": float(change.new_price),
                "direction": change.direction,
                "changed_at": change.created_at,
            }
            if change
            else None
        )
        default_summary = {"new_listing_count": 0, "price_change_count": 0}
        result[project_id] = (
            price_change_dict,
            summary_map.get(project_id, default_summary),
        )

    return result
