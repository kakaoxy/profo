"""pending 引用回填服务（BR-13，Task 13）.

从 ``building_review_service`` 拆分（单文件 ≤500 行约定）：
- ``backfill_reference``：按引用记录回填单据关联字段（幂等，重跑不重复写）；
- ``mark_reference_rejected``：机器链路 reject 分流（BR-27）；
- ``run_pending_backfill``：同步一轮批量回填（异步线程与重试端点共用）；
- ``_run_backfill_task``：异步线程入口（独立 Session）。
"""

import logging
import threading
import uuid

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


def _is_valid_biz_id(ref: BdPendingReference) -> bool:
    """校验引用 biz_id 格式（M5：写入/回填前先判别，避免脏 id 反复触发 PG 异常）.

    合法格式：lead/project 为 UUID；marketing 为整数；property 为 ``data_source:source_property_id``
    （两侧均非空）。审核脚本遗留的 ``__audit_*`` / 空串 / 非 UUID 串均判为脏。
    """
    biz_id = (ref.biz_id or "").strip()
    if not biz_id:
        return False
    if ref.biz_type == "lead":
        try:
            uuid.UUID(biz_id)
        except ValueError:
            return False
        return True
    if ref.biz_type == "project":
        try:
            uuid.UUID(biz_id)
        except ValueError:
            return False
        return True
    if ref.biz_type == "marketing":
        return biz_id.isdigit()
    if ref.biz_type == "property":
        ds, sep, spid = biz_id.partition(":")
        return bool(sep and ds and spid)
    return False


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


def backfill_reference(db: Session, ref: BdPendingReference, *, target_value: str) -> bool:
    """按引用记录回填单据关联字段并转 linked（幂等：重跑不重复写）.

    单条引用用 SAVEPOINT（begin_nested）隔离：脏数据（非法 biz_id 触发 PostgreSQL
    invalid input syntax）导致的失败只回滚本条，不毒化外层核心事务。

    M5 修复（状态机收敛）：原实现失败分支只 logger.exception，``status`` 永不改变
    → 脏引用永久滞留 open，``pending-backfill`` 每轮重复处理同一批脏数据且永远
    「处理成功但零变化」。现在两类情况都落 resolved（保留日志可追溯）：
    - biz_id 格式非法 / 单据已不存在 → 无回填对象，置 resolved 跳过；
    - 回填 SQL 异常 → 同样置 resolved（否则批次永不收敛），并记录警告。

    Returns:
        True 表示本次确实回填了业务单据字段；False 表示引用被关闭但无单据可改

    """
    if not _is_valid_biz_id(ref):
        ref.status = BdReferenceStatus.RESOLVED
        logger.warning("引用 biz_id 非法，已关闭（无单据可回填）: ref=%s biz=%s/%s", ref.id, ref.biz_type, ref.biz_id)
        return False
    try:
        with db.begin_nested():
            record = _find_biz_record(db, ref)
            if not record:
                ref.status = BdReferenceStatus.RESOLVED
                logger.warning(
                    "引用单据不存在（已删除？），引用已关闭: ref=%s biz=%s/%s",
                    ref.id,
                    ref.biz_type,
                    ref.biz_id,
                )
                return False
            apply_backfill(record, ref.field, target_value)
            record.dict_status = "linked"  # type: ignore[attr-defined]
            ref.status = BdReferenceStatus.RESOLVED
    except Exception:
        # 异常已由 SAVEPOINT 回滚本条，引用仍需关闭以保证批次可推进（M5）
        ref.status = BdReferenceStatus.RESOLVED
        logger.exception("引用回填失败，已关闭引用待人工核对: ref=%s biz=%s/%s", ref.id, ref.biz_type, ref.biz_id)
        return False
    return True


def mark_reference_rejected(db: Session, ref: BdPendingReference) -> bool:
    """机器链路 reject：单据 dict_status=rejected（原文保留，BR-27）。

    同样 SAVEPOINT 隔离：非法 biz_id 等脏数据只回滚本条，不毒化 resolve 事务。
    M5：与 backfill_reference 同口径——脏引用也要落 resolved，否则批次不收敛。
    """
    if not _is_valid_biz_id(ref):
        ref.status = BdReferenceStatus.RESOLVED
        logger.warning("reject 标记：biz_id 非法，引用已关闭: ref=%s biz=%s/%s", ref.id, ref.biz_type, ref.biz_id)
        return False
    try:
        with db.begin_nested():
            record = _find_biz_record(db, ref)
            if not record:
                ref.status = BdReferenceStatus.RESOLVED
                logger.warning("reject 标记：单据不存在，引用已关闭: ref=%s", ref.id)
                return False
            record.dict_status = "rejected"  # type: ignore[attr-defined]
            ref.status = BdReferenceStatus.RESOLVED
    except Exception:
        ref.status = BdReferenceStatus.RESOLVED
        logger.exception("reject 标记失败，已关闭引用待人工核对: ref=%s", ref.id)
        return False
    return True


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
