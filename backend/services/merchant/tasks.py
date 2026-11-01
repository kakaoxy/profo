"""商户通知每日任务与运行记录（V09 REQ-M14-006）.

调度口径（R-V09-05 建议）：每日执行一次，多实例通过 Redis ``SET NX EX``
互斥；Redis 不可用时降级为「无锁执行」——通知主体有全局唯一
``dedupe_key``，并发重复扫描只会命中去重，不会重复创建通知。

运行统计落 ``operation_logs``（``resource_type=merchant_notify_task``），
复用现有审计查询能力，避免新建任务表；单条投递失败只记录在统计里，
不中断整批（BR-M14-023）。
"""

import logging
import os
import time
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi import Request
from redis.exceptions import RedisError
from sqlalchemy.orm import Session

from models.system.operation_log import OperationLog
from schemas.merchant.notify import (
    MerchantNotifyRunRecord,
    MerchantNotifyRunResponse,
    MerchantNotifyTypeStats,
)
from services.merchant.agreement import MerchantAgreementService
from services.merchant.audit import add_audit_log
from services.merchant.notify import (
    AGREEMENT_WINDOW_DAYS,
    notify_agreement_expiring,
    notify_visit_overdue,
    run_date_of,
)
from utils.redis_client import get_redis_client

logger = logging.getLogger(__name__)

LOCK_KEY = "merchant:notify:daily:lock"
LOCK_TTL_SECONDS = 600
TASK_RESOURCE_TYPE = "merchant_notify_task"
TASK_ACTION = "notify_scan"
_LIST_LIMIT_MAX = 100
TASK_TIMEOUT_MS = 300_000
CONSECUTIVE_FAILURE_ALERT = 3
TASK_ALERT_ACTION = "notify_alert"
_SHANGHAI = ZoneInfo("Asia/Shanghai")
_RELEASE_LOCK_LUA = "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end"


def run_daily(
    db: Session,
    *,
    now: datetime | None = None,
    operator_id: str | None = None,
    request: Request | None = None,
    use_lock: bool = True,
) -> MerchantNotifyRunResponse:
    """执行一次商户通知任务（协议到期 + 拜访超期）.

    Args:
        db: 数据库会话
        now: 当前时间（测试注入）
        operator_id: 手动补跑的操作人（定时任务为空）
        request: 手动补跑请求（用于审计 IP/UA）
        use_lock: 是否获取 Redis 互斥锁（目标测试可关闭）

    Returns:
        本次执行统计；并发锁未获取时 ``locked=True`` 且各计数为 0。

    """
    started_at = _aware(now or datetime.now(timezone.utc))
    acquired, token = (True, None)
    if use_lock:
        acquired, token = _acquire_lock()
    if not acquired:
        finished_at = datetime.now(timezone.utc)
        return MerchantNotifyRunResponse(
            run_date=run_date_of(started_at),
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=0,
            locked=True,
            agreements=MerchantNotifyTypeStats(),
            visits=MerchantNotifyTypeStats(),
        )

    try:
        agreement_service = MerchantAgreementService(db)
        # REQ-M04-005：先把到期已签协议置为已过期（此前无调度调用，状态永不流转）
        expired = agreement_service.expire_due(now=started_at)
        if expired:
            add_audit_log(
                db,
                user_id=operator_id,
                action="expire_batch",
                resource_type="merchant_agreement",
                resource_id="batch",
                before=None,
                after={"count": expired, "run_date": run_date_of(started_at)},
                request=request,
            )
            db.commit()
        events = agreement_service.scan_expiring(
            days=AGREEMENT_WINDOW_DAYS,
            now=started_at,
        )
        agreements = notify_agreement_expiring(db, events, now=started_at)
        visits = notify_visit_overdue(db, now=started_at)
        finished_at = datetime.now(timezone.utc)
        duration_ms = max(0, int((finished_at - started_at).total_seconds() * 1000))
        result = MerchantNotifyRunResponse(
            run_date=run_date_of(started_at),
            started_at=started_at,
            finished_at=finished_at,
            duration_ms=duration_ms,
            locked=False,
            status="success",
            timed_out=duration_ms > TASK_TIMEOUT_MS,
            expired_agreements=expired,
            agreements=agreements,
            visits=visits,
        )
        _record_run(db, result, operator_id=operator_id, request=request)
        if result.timed_out:
            _alert(db, run_date=result.run_date, reason="timeout", detail={"duration_ms": duration_ms})
        return result
    finally:
        if token is not None:
            _release_lock(token)


def record_failure(db: Session, error: Exception, *, operator_id: str | None = None) -> None:
    """记录一次任务失败并在连续失败达到阈值时告警（REQ-M14-006）.

    由调度线程的异常分支调用；失败本身不中断线程。

    Args:
        db: 数据库会话
        error: 捕获到的异常
        operator_id: 手动补跑的操作人（定时任务为空）

    """
    now = datetime.now(timezone.utc)
    message = f"{type(error).__name__}: {error}"[:500]
    result = MerchantNotifyRunResponse(
        run_date=run_date_of(now),
        started_at=now,
        finished_at=now,
        duration_ms=0,
        locked=False,
        status="failed",
        error=message,
        agreements=MerchantNotifyTypeStats(),
        visits=MerchantNotifyTypeStats(),
    )
    _record_run(db, result, operator_id=operator_id, request=None)
    recent = (
        db.query(OperationLog)
        .filter(
            OperationLog.resource_type == TASK_RESOURCE_TYPE,
            OperationLog.action == TASK_ACTION,
        )
        .order_by(OperationLog.created_at.desc())
        .limit(CONSECUTIVE_FAILURE_ALERT)
        .all()
    )
    failures = 0
    for row in recent:
        stats = _parse_stats(row.after)
        if stats is None or stats.status != "failed":
            break
        failures += 1
    if failures >= CONSECUTIVE_FAILURE_ALERT:
        _alert(
            db,
            run_date=result.run_date,
            reason="consecutive_failures",
            detail={"count": failures, "error": message},
        )


def _alert(db: Session, *, run_date: str, reason: str, detail: dict[str, object]) -> None:
    """写入任务告警审计并记录错误日志（无外部告警通道时以审计 + 日志兜底）."""
    logger.error("商户通知任务告警：%s %s", reason, detail)
    try:
        add_audit_log(
            db,
            user_id=None,
            action=TASK_ALERT_ACTION,
            resource_type=TASK_RESOURCE_TYPE,
            resource_id=run_date,
            before=None,
            after={"reason": reason, **detail},
            request=None,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("商户通知任务告警写入失败")


def list_runs(
    db: Session,
    *,
    run_date: str | None = None,
    notify_type: str | None = None,
    limit: int = 30,
) -> list[MerchantNotifyRunRecord]:
    """按日期/通知类型查询历史任务执行记录.

    Args:
        db: 数据库会话
        run_date: 任务日期（Asia/Shanghai，YYYY-MM-DD）
        notify_type: ``agreement`` 或 ``visit``；过滤该类型有扫描量的记录
        limit: 返回上限（1~100）

    Returns:
        倒序执行记录。

    """
    query = db.query(OperationLog).filter(
        OperationLog.resource_type == TASK_RESOURCE_TYPE,
        OperationLog.action == TASK_ACTION,
    )
    if run_date:
        start, end = _day_range(run_date)
        query = query.filter(OperationLog.created_at >= start, OperationLog.created_at < end)

    rows = query.order_by(OperationLog.created_at.desc()).limit(max(1, min(limit, _LIST_LIMIT_MAX))).all()
    records: list[MerchantNotifyRunRecord] = []
    for row in rows:
        stats = _parse_stats(row.after)
        if notify_type and stats is not None:
            type_stats = stats.agreements if notify_type == "agreement" else stats.visits
            if type_stats.scanned == 0:
                continue
        records.append(MerchantNotifyRunRecord(id=str(row.id), created_at=row.created_at, stats=stats))
    return records


def _record_run(
    db: Session,
    result: MerchantNotifyRunResponse,
    *,
    operator_id: str | None,
    request: Request | None,
) -> None:
    """把本次运行统计写入 operation_logs（失败只记日志，不影响已投递通知）."""
    try:
        add_audit_log(
            db,
            user_id=operator_id,
            action=TASK_ACTION,
            resource_type=TASK_RESOURCE_TYPE,
            resource_id=result.run_date,
            before=None,
            after=result.model_dump(mode="json"),
            request=request,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("商户通知任务运行记录写入失败（统计未落库）")


def _parse_stats(payload: object) -> MerchantNotifyRunResponse | None:
    """历史记录反序列化（坏数据返回 None，不影响列表）."""
    if not isinstance(payload, dict):
        return None
    try:
        return MerchantNotifyRunResponse.model_validate(payload)
    except ValueError:
        logger.warning("商户通知任务历史统计格式异常，已跳过", exc_info=True)
        return None


def _day_range(run_date: str) -> tuple[datetime, datetime]:
    """把上海时区日期转成 UTC 半开区间 [start, end)."""
    day = datetime.strptime(run_date, "%Y-%m-%d").replace(tzinfo=_SHANGHAI)
    start = day.astimezone(timezone.utc)
    return start, start + timedelta(days=1)


def _acquire_lock() -> tuple[bool, str | None]:
    """获取 Redis 互斥锁；Redis 不可用时放行（fail-open）."""
    token = f"{os.getpid()}:{time.time_ns()}"
    try:
        client = get_redis_client()
        if client.set(LOCK_KEY, token, nx=True, ex=LOCK_TTL_SECONDS):
            return True, token
    except RedisError:
        logger.warning("Redis 不可用，商户通知任务降级为无锁执行", exc_info=True)
        return True, None
    return False, None


def _release_lock(token: str) -> None:
    """比较并删除锁（失败留给 TTL 过期，不影响正确性）."""
    try:
        client = get_redis_client()
        client.eval(_RELEASE_LOCK_LUA, 1, LOCK_KEY, token)
    except RedisError:
        logger.debug("商户通知任务锁释放失败（将由 TTL 过期）", exc_info=True)


def _aware(value: datetime) -> datetime:
    """统一为带时区时间."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


__all__ = [
    "TASK_ACTION",
    "TASK_RESOURCE_TYPE",
    "list_runs",
    "run_daily",
]
