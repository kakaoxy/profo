"""KPI 户室/楼栋计数的 Redis 缓存（慢查询报告 docs/Base/楼盘字典慢查询成因报告-2026-10-25.md §6.1a）.

**为什么存在**：`bd_rooms` 导入 735 万行后，KPI 的 `SELECT count(*) FROM bd_rooms`
在生产（1.6G 内存机）单次 6.3~9s——PG 的 MVCC 无行数计数器，COUNT 必须逐行扫；
1GB 表在 128MB shared_buffers 下每次从磁盘读约 440MB。该查询被并行进每次页面 SSR
（`Promise.all` 等最慢者）→ 搜索/翻页每次操作都付 6s+。业务口径（报告 §3.5 用户确认）：
户室/楼栋数字仅作展示，不需要每次加载实时重算。`count(*) FROM bd_buildings`（0.35~0.9s）
同理。其余三个 KPI（小区/已绑项目/待审核）实测 <3ms，保持实时精确，不入缓存。

**策略**（stale-while-revalidate + single-flight）：
- fresh 命中：直接返回（页面加载零全表扫）。
- fresh 过期、stale 存在：**立即返回 stale**，抢到重算锁者在后台线程重算
  （请求线程永远不等 COUNT——这是本缓存的关键不变量）。
- 冷启动（fresh/stale 皆无）：抢到锁的请求同步重算一次（有界：全集群同一时刻至多一个）；
  未抢到的短轮询等写回，超时回退本会话直算。
- Redis 故障：降级实时计算（缓存是优化手段，绝不导致业务 500）。

**失效**：户室/楼栋写路径（补录/删除/审核转正/导入）事务 commit 后调用
`invalidate_bd_counts()`：删 fresh + 后台重算（进程内 60s 限流收敛导入循环等高频触发；
即使被限流跳过，下一次读会走 stale 路径立即补一次后台重算，fresh 不会长期缺位）。
写事务失败时不失效——KPI 是展示数字，允许秒级~TTL 偏差，fresh TTL 兜底。

**与 `services/reports/cache.py` 的 `cached_report` 不同**：需要 stale 双键、
single-flight 锁、stale 立即返回 + 后台重算与启动预热，是专用机制；缓存读写/重算/失效/
预热是一个闭环，拆开割裂一致性审查视线，故独立成单一模块。
"""

from __future__ import annotations

import json
import logging
import os
import threading
import time
from typing import TypedDict

from redis import Redis
from redis.exceptions import RedisError
from sqlalchemy import func
from sqlalchemy.orm import Session

from db import SessionLocal
from models import BdBuilding, BdRoom
from utils.redis_client import get_redis_client

logger = logging.getLogger(__name__)

_FRESH_KEY = "bd:kpi:counts"
_STALE_KEY = "bd:kpi:counts:stale"
_LOCK_KEY = "bd:kpi:counts:lock"


def _env_int(name: str, default: int) -> int:
    """读环境变量正整数；非法值告警回退默认（缓存参数不该配崩应用）."""
    raw = os.getenv(name)
    if raw is None:
        return default
    try:
        value = int(raw)
    except ValueError:
        logger.warning("%s 非法（%r），回退默认 %d", name, raw, default)
        return default
    if value <= 0:
        logger.warning("%s 必须为正（%r），回退默认 %d", name, raw, default)
        return default
    return value


#: fresh 存活秒数（报告 §6.1a：10~30min；写路径显式失效，TTL 只是兜底上限）
_FRESH_TTL_SECONDS = _env_int("BD_KPI_TTL_SECONDS", 600)
#: stale 存活秒数：远大于 fresh，作重算期间/故障窗口的降级展示值
_STALE_TTL_SECONDS = 86400
#: 重算锁 TTL：须大于单次全表 COUNT 最坏耗时（生产实测 ~9s，留 30 倍余量），
#: 防持锁进程崩溃后锁悬挂
_LOCK_TTL_SECONDS = 300
#: 失效驱动的后台重算最小间隔（进程内限流）：导入循环等连续失效至多每分钟算一次
_RECOMPUTE_MIN_INTERVAL_SECONDS = 60.0
#: 冷启动未抢到锁时的短轮询（5×200ms=1s，等持锁者写回）
_POLL_ATTEMPTS = 5
_POLL_INTERVAL_SECONDS = 0.2

# Lua compare-and-delete：只删除自己持有的锁（防锁过期后误删他人新锁）
_RELEASE_LOCK_LUA = """
if redis.call("get", KEYS[1]) == ARGV[1] then
    return redis.call("del", KEYS[1])
end
return 0
"""


class BdCounts(TypedDict):
    """缓存载荷：户室/楼栋两个精确计数（字段与 BdKpiResponse 同名子集）."""

    building_count: int
    room_count: int


def _compute_counts(db: Session) -> BdCounts:
    """在给定会话上计算两个计数——口径与 BuildingDictReadService.get_kpi 逐字一致."""
    return BdCounts(
        building_count=int(db.query(func.count(BdBuilding.id)).scalar() or 0),
        room_count=int(db.query(func.count(BdRoom.id)).scalar() or 0),
    )


def _compute_in_new_session() -> BdCounts:
    """后台线程用：自开独立 Session（仿 building_review_backfill 线程模式）."""
    db = SessionLocal()
    try:
        return _compute_counts(db)
    finally:
        db.close()


def _write_both(client: Redis, counts: BdCounts) -> None:
    """结果同时写 fresh（短 TTL）与 stale（长 TTL）."""
    payload = json.dumps(counts, ensure_ascii=False)
    client.set(_FRESH_KEY, payload, ex=_FRESH_TTL_SECONDS)
    client.set(_STALE_KEY, payload, ex=_STALE_TTL_SECONDS)


def _read_payload(client: Redis, key: str) -> BdCounts | None:
    """读取并校验缓存值；JSON 损坏/字段缺失视为 miss 并删除该键."""
    raw = client.get(key)
    if raw is None:
        return None
    try:
        data = json.loads(raw)
        return BdCounts(building_count=int(data["building_count"]), room_count=int(data["room_count"]))
    except (ValueError, TypeError, KeyError):
        logger.warning("KPI 计数缓存损坏/字段缺失（key=%s），丢弃", key)
        client.delete(key)
        return None


# 失效驱动的后台重算进程内限流（读路径 stale 重算与冷启动不受此限，见调用点注释）
_gate_lock = threading.Lock()
_last_invalidate_recompute_ts: float = 0.0


def _allow_invalidate_recompute() -> bool:
    """判定失效驱动的后台重算是否放行（跨进程由 Redis 锁再收敛一层）."""
    global _last_invalidate_recompute_ts
    with _gate_lock:
        now = time.monotonic()
        if now - _last_invalidate_recompute_ts < _RECOMPUTE_MIN_INTERVAL_SECONDS:
            return False
        _last_invalidate_recompute_ts = now
        return True


def _try_acquire_lock(client: Redis) -> str | None:
    """SET NX 抢重算锁；成功返回 token，失败/异常返回 None."""
    token = f"{os.getpid()}:{time.time_ns()}"
    try:
        if client.set(_LOCK_KEY, token, nx=True, ex=_LOCK_TTL_SECONDS):
            return token
    except RedisError:
        logger.warning("Redis 不可用，跳过 KPI 计数重算锁", exc_info=True)
    return None


def _release_lock(client: Redis, token: str) -> None:
    """比较并删除重算锁（失败留给 TTL 过期，不影响正确性）."""
    try:
        client.eval(_RELEASE_LOCK_LUA, 1, _LOCK_KEY, token)
    except RedisError:
        logger.debug("KPI 重算锁释放失败（将由 TTL 过期）", exc_info=True)


def _spawn_recompute(client: Redis, token: str) -> None:
    """守护线程：用已持有的锁重算并写回，完成后释放锁."""

    def _run() -> None:
        try:
            _write_both(client, _compute_in_new_session())
            logger.info("KPI 户室/楼栋计数缓存重算完成")
        except RedisError:
            logger.warning("KPI 计数重算写回失败（TTL/stale 兜底）", exc_info=True)
        except Exception:
            logger.exception("KPI 计数后台重算失败（下次读取将重试）")
        finally:
            _release_lock(client, token)

    threading.Thread(target=_run, name="bd-kpi-recompute", daemon=True).start()


def get_or_compute_bd_counts(db: Session) -> BdCounts:
    """取户室/楼栋精确计数：fresh > stale（后台重算）> 冷启动抢锁同步算 > 回退直算.

    不变量：只要 stale 存在，请求线程绝不做全表 COUNT（立即返回 stale，重算进后台）。

    Args:
        db: 请求数据库会话（仅冷启动/降级路径使用，口径与 get_kpi 一致）

    Returns:
        ``{building_count, room_count}``

    """
    try:
        client = get_redis_client()
    except RedisError:
        logger.warning("Redis 不可用，KPI 计数降级实时计算")
        return _compute_counts(db)

    try:
        fresh = _read_payload(client, _FRESH_KEY)
        if fresh is not None:
            return fresh

        token = _try_acquire_lock(client)

        stale = _read_payload(client, _STALE_KEY)
        if stale is not None:
            # stale 路径不受失效限流（每个 fresh TTL 周期至多触发一次、且被全局锁收敛），
            # 保证 fresh 过期后第一时间补算；若本次抢锁失败说明他人在算，直接回 stale。
            if token is not None:
                _spawn_recompute(client, token)
            return stale

        if token is not None:
            # 冷启动且抢到锁：唯一会同步等 COUNT 的请求（重启预热后极少发生）
            try:
                counts = _compute_counts(db)
                _write_both(client, counts)
                return counts
            finally:
                _release_lock(client, token)

        # 冷启动未抢到锁：短轮询等持锁者写回，超时回退直算（宁可多算一次也不挂请求）
        for _ in range(_POLL_ATTEMPTS):
            time.sleep(_POLL_INTERVAL_SECONDS)
            fresh = _read_payload(client, _FRESH_KEY)
            if fresh is not None:
                return fresh
        logger.info("KPI 计数冷启动未等到重算结果，回退本会话直算")
        return _compute_counts(db)
    except RedisError:
        logger.warning("KPI 计数缓存读写异常，降级实时计算", exc_info=True)
        return _compute_counts(db)


def invalidate_bd_counts() -> None:
    """户室/楼栋写事务 commit 后调用：删 fresh + 调度后台重算（KPI 常态保持 warm）.

    「删 + 重算」而非只删：只删会让下一个页面加载走冷路径付一次全表 COUNT（生产秒级）。
    高频失效（导入逐小区 commit）由进程内 60s 限流 + 全局 Redis 锁收敛；即使限流跳过
    重算，fresh 已被删，下一次读会走 stale 路径立即补一次后台重算，fresh 不会长期缺位。

    Redis 不可达时静默跳过——读路径本就降级实时计算，正确性不受影响。
    """
    try:
        client = get_redis_client()
        client.delete(_FRESH_KEY)
    except RedisError:
        logger.warning("Redis 不可用，跳过 KPI 计数缓存失效（读路径实时计算）")
        return
    if not _allow_invalidate_recompute():
        return
    token = _try_acquire_lock(client)
    if token is not None:
        _spawn_recompute(client, token)


def prewarm_bd_counts() -> None:
    """应用启动时调用：fresh 缺失则后台预热，避免重启后首个页面加载付全表 COUNT.

    幂等、绝不抛异常（预热失败只留日志，首个读请求会走冷/ stale 路径自愈）。
    """
    try:
        client = get_redis_client()
        if client.get(_FRESH_KEY) is not None:
            return
    except RedisError:
        logger.info("Redis 不可用，跳过 KPI 计数缓存预热")
        return

    def _run() -> None:
        try:
            _write_both(client, _compute_in_new_session())
            logger.info("KPI 户室/楼栋计数缓存预热完成")
        except Exception:
            logger.exception("KPI 计数缓存预热失败（首个读取自愈）")

    threading.Thread(target=_run, name="bd-kpi-prewarm", daemon=True).start()


__all__ = ["BdCounts", "get_or_compute_bd_counts", "invalidate_bd_counts", "prewarm_bd_counts"]
