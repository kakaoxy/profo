"""pending 引用回填服务（BR-13，Task 13）.

从 ``building_review_service`` 拆分（单文件 ≤500 行约定）：
- ``backfill_reference``：按引用记录回填单据关联字段（幂等，重跑不重复写）；
- ``mark_reference_rejected``：机器链路 reject 分流（BR-27）；
- ``run_pending_backfill``：同步一轮批量回填（异步线程与重试端点共用）；
- ``_run_backfill_task``：异步线程入口（独立 Session）。
"""

import logging
import threading

from sqlalchemy.orm import Session

from models import (
    BdPendingEntry,
    BdPendingReference,
    BdReferenceStatus,
    L4MarketingProject,
    Lead,
    Project,
    PropertyCurrent,
)

logger = logging.getLogger(__name__)

# 引用回填批次大小（BR-13 分批）
BACKFILL_BATCH_SIZE = 200


def apply_backfill(
    record: Project | Lead | L4MarketingProject | PropertyCurrent, field: str, target_value: str
) -> None:
    """按字段名回填（community_id/building_id/room_id）."""
    if field == "community_id":
        record.community_id = target_value
    elif field == "building_id":
        record.building_id = int(target_value)
    elif field == "room_id":
        record.room_id = int(target_value)


def _find_biz_record(
    db: Session,
    ref: BdPendingReference,
) -> "Project | Lead | L4MarketingProject | PropertyCurrent | None":
    """按引用类型定位业务单据（biz_id：property 为 data_source:source_property_id）."""
    if ref.biz_type == "project":
        return db.query(Project).filter(Project.id == ref.biz_id).first()
    if ref.biz_type == "lead":
        return db.query(Lead).filter(Lead.id == ref.biz_id).first()
    if ref.biz_type == "marketing":
        return db.query(L4MarketingProject).filter(L4MarketingProject.id == int(ref.biz_id)).first()
    if ref.biz_type == "property":
        ds, _, spid = ref.biz_id.partition(":")
        return (
            db.query(PropertyCurrent)
            .filter(PropertyCurrent.data_source == ds, PropertyCurrent.source_property_id == spid)
            .first()
        )
    return None


def backfill_reference(db: Session, ref: BdPendingReference, *, target_value: str) -> None:
    """按引用记录回填单据关联字段并转 linked（幂等：重跑不重复写）.

    单条引用用 SAVEPOINT（begin_nested）隔离：脏数据（如非法 biz_id 触发
    PostgreSQL invalid input syntax）导致的失败只回滚本条，不毒化外层核心事务
    （BR-13：失败留 open 待办由异步重试兑底，禁止半提交）。
    """
    try:
        with db.begin_nested():
            record = _find_biz_record(db, ref)
            if record:
                apply_backfill(record, ref.field, target_value)
                record.dict_status = "linked"  # type: ignore[attr-defined]
            ref.status = BdReferenceStatus.RESOLVED
    except Exception:
        logger.exception("引用回填失败（留 open 待办）: ref=%s biz=%s/%s", ref.id, ref.biz_type, ref.biz_id)


def mark_reference_rejected(db: Session, ref: BdPendingReference) -> None:
    """机器链路 reject：单据 dict_status=rejected（原文保留，BR-27）。

    同样 SAVEPOINT 隔离：非法 biz_id 等脏数据只回滚本条，不毒化 resolve 事务。
    """
    try:
        with db.begin_nested():
            record = _find_biz_record(db, ref)
            if record:
                record.dict_status = "rejected"  # type: ignore[attr-defined]
            ref.status = BdReferenceStatus.RESOLVED
    except Exception:
        logger.exception("reject 标记失败（留 open 待办）: ref=%s", ref.id)


def run_pending_backfill(db: Session) -> int:
    """同步执行一轮 pending 引用回填（幂等：仅处理 open 引用，重跑不重复写）.

    供异步线程与重试端点共用。返回本轮处理条数。
    """
    refs = (
        db.query(BdPendingReference)
        .filter(BdPendingReference.status == BdReferenceStatus.OPEN)
        .limit(BACKFILL_BATCH_SIZE)
        .all()
    )
    if not refs:
        return 0
    processed = 0
    for ref in refs:
        entry = db.get(BdPendingEntry, ref.pending_id)
        if not entry or not entry.resolved_target_id:
            continue
        backfill_reference(db, ref, target_value=entry.resolved_target_id)
        processed += 1
    db.commit()
    logger.info("pending 引用回填完成: %d 条", processed)
    return processed


def _run_backfill_task() -> None:
    """异步回填线程入口（独立 Session）。"""
    from db import SessionLocal

    db = SessionLocal()
    try:
        run_pending_backfill(db)
    except Exception:
        logger.exception("异步引用回填失败")
    finally:
        db.close()


def schedule_async_backfill() -> None:
    """调度异步幂等回填任务（BR-13：分批/可重试/失败留待办）."""
    thread = threading.Thread(target=_run_backfill_task, name="bd-pending-backfill", daemon=True)
    thread.start()
