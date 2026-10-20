"""迁移执行器：锁 → 建表 → 加载状态 → 校验和 → 门禁 → 逐条执行（迭代一 T1.3 / T1.4）。

**与旧实现的差异**（只增加账本，不改任何迁移函数逻辑，spec §1.3 Out of Scope）：
- 旧：``_run_all_migrations`` 一次性顺序调用 82 个函数，无记录、无失败落库；
- 新：只执行「未 applied」的版本，逐条备份 → 执行 → 落库；失败写 ``failed`` 并 raise。

**关键口径**
- K3：不包裹外层大事务（迁移函数内部自行 ``engine.begin()`` 提交）；
- K6：失败 → ``status='failed'`` + error 堆栈前 4000 字符 + ``backup_path`` → raise；
  下次启动检测到 ``failed`` **直接阻断**并给出可执行指令（不自动重试）；
- K7：空版本表 + 既有库 → 阻断（``MIGRATION_AUTO_BASELINE`` 仅 DEBUG 生效）；
- K8：``MIGRATION_LEGACY_MODE=true`` → 直接走旧硬编码路径 + WARNING；
- K11：备份失败 → 迁移不执行，写 ``failed``（``error`` 前缀 ``backup_failed``），raise；
- K14：启动完成后 ``prune``，异常只记 WARNING。
"""

import logging
import traceback
from dataclasses import dataclass
from datetime import datetime
from time import perf_counter
from typing import TYPE_CHECKING

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _MIGRATION_ADVISORY_LOCK_KEY
from migrations.backup import BackupError, BackupResult, create_backup, ensure_backup_dir, prune_with_settings
from migrations.checksum import checksum_of
from migrations.compensations.base import CompensationNotSupportedError
from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS, Migration
from migrations.schema_migrations import (
    STATUS_APPLIED,
    STATUS_FAILED,
    MigrationRow,
    MigrationState,
    ensure_version_tables,
    load_state,
    record_compensation,
    record_migration,
    utcnow,
    worker_identity,
)
from settings import settings

if TYPE_CHECKING:
    from collections.abc import Sequence

logger = logging.getLogger(__name__)

# 错误信息中堆栈的最大长度（K6）
_ERROR_TAIL_CHARS = 4000
# 阻断文案中展示的失败条数
_BLOCK_DETAIL_LIMIT = 3


class MigrationBlockedError(RuntimeError):
    """启动迁移被门禁阻断（failed 记录 / 未基线既有库 / checksum 冲突）."""


@dataclass(frozen=True, slots=True)
class MigrationSummary:
    """一次启动迁移的结构化摘要（结构化日志用，G2）."""

    applied: int
    pending: int
    failed: int
    executed: tuple[int, ...]
    duration_ms: int

    def as_log_line(self) -> str:
        """格式化为单行结构化摘要（G2 要求日志含 ``迁移状态：...``）."""
        return (
            f"迁移状态：applied={self.applied} pending={self.pending} failed={self.failed} "
            f"executed_now={len(self.executed)} duration_ms={self.duration_ms}"
        )


# ---------------------------------------------------------------------------
# 启动入口
# ---------------------------------------------------------------------------


def run_startup_migrations(engine: Engine) -> MigrationSummary | None:
    """执行启动迁移（新执行器；``MIGRATION_LEGACY_MODE`` 时回退旧路径）.

    Args:
        engine: SQLAlchemy 引擎（仅 PostgreSQL）。

    Returns:
        结构化摘要；legacy 模式返回 None（旧路径无账本）。

    Raises:
        MigrationBlockedError: 门禁阻断（failed 记录 / 既有库未基线 / checksum 漂移）。
        RuntimeError: 非 PostgreSQL 引擎。

    """
    if engine.dialect.name != "postgresql":
        msg = f"启动迁移仅支持 PostgreSQL，当前引擎方言为 {engine.dialect.name!r}，拒绝执行。请检查 DATABASE_URL 配置。"
        raise RuntimeError(msg)

    _validate_settings()

    if settings.migration_legacy_mode:
        logger.warning("MIGRATION_LEGACY_MODE 已启用，跳过版本化执行器，回退旧硬编码迁移路径")
        from migrations import _run_all_migrations

        _run_all_migrations(engine)
        return None

    started = perf_counter()
    ensure_backup_dir()

    # 独立连接持有 session-level advisory lock（跨 worker 串行化，与旧实现一致）
    with engine.connect() as lock_conn:
        lock_conn.execute(text("SELECT pg_advisory_lock(:k)"), {"k": _MIGRATION_ADVISORY_LOCK_KEY})
        try:
            logger.info("已获取迁移 advisory lock，开始执行启动迁移（版本化执行器）")
            summary = _run_locked(engine)
        finally:
            lock_conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": _MIGRATION_ADVISORY_LOCK_KEY})
            logger.info("已释放迁移 advisory lock")

    prune_with_settings()
    total_ms = int((perf_counter() - started) * 1000)
    final = MigrationSummary(
        applied=summary.applied,
        pending=summary.pending,
        failed=summary.failed,
        executed=summary.executed,
        duration_ms=total_ms,
    )
    logger.info(final.as_log_line())
    return final


def _run_locked(engine: Engine) -> MigrationSummary:
    """持锁后的执行主体（建表 → 状态 → 校验 → 门禁 → 执行 → prune）.

    Args:
        engine: SQLAlchemy 引擎。

    Returns:
        结构化摘要（duration_ms 为占位，由调用方覆盖）。

    """
    ensure_version_tables(engine)
    state = load_state(engine)
    _verify_checksums(state)
    _guard_state(engine, state)

    pending = [migration for migration in MIGRATIONS if migration.version not in state.applied]
    logger.info(
        "迁移状态：applied=%d pending=%d failed=%d",
        len(state.applied),
        len(pending),
        len(state.failed),
    )

    executed: list[int] = []
    for migration in pending:
        _apply_one(engine, migration)
        executed.append(migration.version)

    state_after = load_state(engine)
    return MigrationSummary(
        applied=len(state_after.applied),
        pending=len([m for m in MIGRATIONS if m.version not in state_after.applied]),
        failed=len(state_after.failed),
        executed=tuple(executed),
        duration_ms=0,
    )


def _validate_settings() -> None:
    """启动期配置校验（K11：``MIGRATION_BACKUP_MODE=off`` 仅 DEBUG 允许）.

    ``Settings`` 已在生产拒绝该组合，这里再兜一次（防通过环境变量后置修改）。

    Raises:
        MigrationBlockedError: 生产环境关闭备份。

    """
    if settings.migration_backup_mode == "off" and not settings.debug:
        msg = "MIGRATION_BACKUP_MODE=off 仅允许 DEBUG=true。生产环境必须开启备份：MIGRATION_BACKUP_MODE=on。"
        raise MigrationBlockedError(msg)


# ---------------------------------------------------------------------------
# 校验和（K4 / K5）
# ---------------------------------------------------------------------------


def _verify_checksums(state: MigrationState) -> None:
    """校验已 applied 迁移的源码 checksum（K4/K5）.

    Args:
        state: 版本账本快照。

    Raises:
        MigrationBlockedError: 存在 checksum 漂移。

    """
    mismatches = compute_checksum_mismatches(state)
    if not mismatches:
        return
    lines = [
        "[FATAL] 迁移源码校验和不匹配（已应用的迁移被修改）。这会让不同环境的行为产生分歧。",
        "",
    ]
    for version, name, expected, actual in mismatches:
        lines.append(f"  version={version} name={name}")
        lines.append(f"    expected={expected}")
        lines.append(f"    actual  ={actual}")
    lines.extend(
        [
            "",
            "下一步（择一）：",
            "  1) 若是纯重构（无行为变化）：",
            "       docker compose exec backend .venv/bin/python -m migrations.manage rebaseline <version>"
            ' --reason "重构无行为变化"',
            "  2) 若行为确有变化：把变更写成**新的追加迁移**（version 从 NEXT_VERSION 起），",
            "     并从本次改动中回退对旧函数逻辑的修改。",
            "  3) 查看全量状态：",
            "       docker compose exec backend .venv/bin/python -m migrations.manage status",
        ],
    )
    raise MigrationBlockedError("\n".join(lines))


def compute_checksum_mismatches(state: MigrationState) -> list[tuple[int, str, str, str]]:
    """计算已应用迁移的 checksum 漂移列表.

    Args:
        state: 版本账本快照。

    Returns:
        ``[(version, name, expected, actual), ...]``，按 version 升序。

    """
    mismatches: list[tuple[int, str, str, str]] = []
    for version in sorted(state.applied):
        row = state.applied[version]
        migration = MIGRATION_BY_VERSION.get(version)
        if migration is None:
            # 账本里有、注册表里没有：说明迁移被删除（禁止行为，同样阻断）
            mismatches.append((version, row.name, row.checksum, "<注册表中不存在该版本>"))
            continue
        actual = checksum_of(migration.fn)
        if actual != row.checksum:
            mismatches.append((version, row.name, row.checksum, actual))
    return mismatches


# ---------------------------------------------------------------------------
# 门禁（K7 / K6）
# ---------------------------------------------------------------------------


def _guard_state(engine: Engine, state: MigrationState) -> None:
    """启动门禁：失败记录阻断 + 既有库未基线阻断（K6/K7）.

    Args:
        engine: SQLAlchemy 引擎。
        state: 版本账本快照。

    Raises:
        MigrationBlockedError: 存在 failed 记录，或既有库未 baseline。

    """
    if state.failed:
        raise MigrationBlockedError(_failed_block_message(state))

    if not state.is_empty:
        return

    from migrations.schema_migrations import legacy_dataset_present

    if not legacy_dataset_present(engine):
        # 全新库：自动全量执行 82 项并逐条登记
        logger.info("检测到全新数据库（users/projects/leads 全空），将执行全部 %d 项迁移", len(MIGRATIONS))
        return

    if settings.migration_auto_baseline and settings.debug:
        logger.warning(
            "检测到既有库且版本表为空：MIGRATION_AUTO_BASELINE=true（DEBUG 模式），自动 baseline %d 项",
            len(MIGRATIONS),
        )
        baseline(engine, confirm=True, dry_run=False, auto=True)
        return

    if settings.migration_auto_baseline and not settings.debug:
        logger.warning("MIGRATION_AUTO_BASELINE=true 但 DEBUG=false，已忽略（生产禁止自动基线）")

    raise MigrationBlockedError(_baseline_block_message())


def _failed_block_message(state: MigrationState) -> str:
    """构造 failed 记录的阻断文案（含可直接复制的修复命令，K6）.

    Args:
        state: 版本账本快照。

    Returns:
        多行文案。

    """
    rows: Sequence[MigrationRow] = sorted(state.failed.values(), key=lambda row: row.version)
    lines = [f"[FATAL] 迁移状态异常：存在 {len(rows)} 条 failed 记录"]
    for row in rows[:_BLOCK_DETAIL_LIMIT]:
        first_line = (row.error or "").strip().splitlines()
        head = first_line[0] if first_line else "（无错误信息）"
        lines.append(
            f"  v{row.version:03d}_{row.name}  时间：{row.started_at:%Y-%m-%dT%H:%M:%S%z}  "
            f"耗时：{row.duration_ms or 0}ms",
        )
        lines.append(f"    错误：{head[:300]}")
        lines.append(f"    备份：{row.backup_path or '（本次无备份）'}")
    lines.extend(
        [
            "下一步（择一）：",
            "  1) 修复后重试：",
            f"       docker compose exec backend .venv/bin/python -m migrations.manage retry {rows[0].version}"
            ' --reason "修复后重试"',
            "  2) 回滚该迁移：",
            f"       docker compose exec backend .venv/bin/python -m migrations.manage compensate {rows[0].version}"
            " --dry-run",
            "  3) 查看全量状态：",
            "       docker compose exec backend .venv/bin/python -m migrations.manage status",
        ],
    )
    return "\n".join(lines)


def _baseline_block_message() -> str:
    """构造「既有库未基线」的阻断文案（K7 / §7.1）.

    Returns:
        多行文案。

    """
    return (
        "[FATAL] 检测到既有数据库（users/projects/leads 非空）但迁移版本表为空。\n"
        "  这说明本库在版本化执行器上线前就已存在数据，直接执行全部迁移会重复改写历史数据。\n"
        "  必须先做一次基线登记（幂等重跑全部迁移并逐条记录）：\n"
        "\n"
        "  步骤（维护窗口 30–60 分钟，先做全库备份）：\n"
        "    # 1) 预演（不写库、不备份）\n"
        "    docker compose exec backend .venv/bin/python -m migrations.manage baseline --dry-run\n"
        "    # 2) 实跑（自动 full 备份 + 逐条登记）\n"
        "    docker compose exec backend .venv/bin/python -m migrations.manage baseline --confirm\n"
        "    # 3) 核对\n"
        "    docker compose exec backend .venv/bin/python -m migrations.manage status\n"
        "\n"
        "  详见 docs/Base/migrations-runbook.md §4「既有库基线」。"
    )


# ---------------------------------------------------------------------------
# 单条迁移执行
# ---------------------------------------------------------------------------


def _apply_one(engine: Engine, migration: Migration) -> None:
    """执行单条迁移：备份 → 执行 → 落库；任一步失败写 failed 并抛出（K6/K11）.

    Args:
        engine: SQLAlchemy 引擎。
        migration: 注册表登记项。

    Raises:
        Exception: 迁移函数或备份抛出的原始异常（保留堆栈，便于定位）。

    """
    started: datetime = utcnow()
    t0 = perf_counter()
    backup: BackupResult | None = None
    checksum = checksum_of(migration.fn)
    try:
        backup = _maybe_backup(engine, migration)
        migration.fn(engine)
    except Exception as exc:
        duration_ms = int((perf_counter() - t0) * 1000)
        error_text = f"{type(exc).__name__}: {exc}\n{traceback.format_exc()[-_ERROR_TAIL_CHARS:]}"
        if isinstance(exc, _BackupAbortedError):
            error_text = f"backup_failed: {exc.__cause__ or exc}"
        record_migration(
            engine,
            version=migration.version,
            name=migration.name,
            checksum=checksum,
            kind=migration.kind,
            risk=migration.risk,
            status=STATUS_FAILED,
            started_at=started,
            duration_ms=duration_ms,
            backup_path=backup.path if backup else None,
            backup_sha256=backup.sha256 if backup else None,
            backup_scope=backup.scope if backup else None,
            backup_client=backup.client_version if backup else None,
            error=error_text,
            notes=None,
        )
        logger.exception("迁移 v%d %s 失败（%dms）", migration.version, migration.name, duration_ms)
        raise

    duration_ms = int((perf_counter() - t0) * 1000)
    record_migration(
        engine,
        version=migration.version,
        name=migration.name,
        checksum=checksum,
        kind=migration.kind,
        risk=migration.risk,
        status=STATUS_APPLIED,
        started_at=started,
        duration_ms=duration_ms,
        backup_path=backup.path if backup else None,
        backup_sha256=backup.sha256 if backup else None,
        backup_scope=backup.scope if backup else None,
        backup_client=backup.client_version if backup else None,
        error=None,
        notes=None,
    )
    logger.info(
        "迁移 v%03d %s 完成（%dms，backup=%s）",
        migration.version,
        migration.name,
        duration_ms,
        backup.path if backup else "none",
    )


class _BackupAbortedError(RuntimeError):
    """备份失败导致迁移中止（K11，``error`` 前缀 ``backup_failed``）."""


def _maybe_backup(engine: Engine, migration: Migration) -> BackupResult | None:
    """按登记元数据执行备份；``backup=none`` 或全局 off 时跳过.

    Args:
        engine: SQLAlchemy 引擎。
        migration: 注册表登记项。

    Returns:
        备份结果；跳过时为 None。

    Raises:
        _BackupAbortedError: 备份失败（调用方据此写 ``backup_failed`` 并中止）。

    """
    if migration.backup == "none":
        return None
    if settings.migration_backup_mode == "off":
        logger.warning(
            "MIGRATION_BACKUP_MODE=off，跳过 v%d %s 的 %s 备份（仅 DEBUG 允许）",
            migration.version,
            migration.name,
            migration.backup,
        )
        return None
    try:
        return create_backup(
            engine,
            version=migration.version,
            name=migration.name,
            scope=migration.backup,  # type: ignore[arg-type]
            tables=migration.backup_tables,
        )
    except BackupError as exc:
        raise _BackupAbortedError(str(exc)) from exc


# ---------------------------------------------------------------------------
# baseline（§7）
# ---------------------------------------------------------------------------


def baseline(
    engine: Engine,
    *,
    confirm: bool,
    dry_run: bool,
    auto: bool = False,
) -> list[int]:
    """既有库基线登记：full 备份 → 逐条执行（幂等）→ 逐条写 applied（§7.2）.

    Args:
        engine: SQLAlchemy 引擎。
        confirm: 必须为 True（否则调用方应返回退出码 2）。
        dry_run: 只打印计划，不写库、不备份。
        auto: 由 ``MIGRATION_AUTO_BASELINE`` 触发（DEBUG 自动基线）。

    Returns:
        本次登记的版本号列表（dry-run 时为空）。

    Raises:
        MigrationBlockedError: 未确认 / 前置检查失败 / 迁移失败。

    """
    if not confirm:
        msg = "baseline 必须显式确认：请加 --confirm（默认拒绝，防止误操作）"
        raise MigrationBlockedError(msg)

    ensure_version_tables(engine)
    state = load_state(engine)
    if state.failed:
        msg = f"存在 {len(state.failed)} 条 failed 记录，请先处理（manage retry / compensate）再 baseline"
        raise MigrationBlockedError(msg)

    risky = [m for m in MIGRATIONS if m.risk in ("C", "D")]
    if dry_run:
        plan = [m.version for m in MIGRATIONS if m.version not in state.applied]
        logger.info(
            "baseline --dry-run：将执行 %d 项（其中 C/D 级 %d 项：%s），需要一次 full 备份；不写库不备份",
            len(plan),
            len(risky),
            ", ".join(f"v{m.version}_{m.name}" for m in risky) or "无",
        )
        return []

    _baseline_preflight(engine)
    started = utcnow()
    t0 = perf_counter()

    # 一次 full 备份覆盖整套 baseline（逐条备份在既有库上代价过高）
    backup_note = "无（MIGRATION_BACKUP_MODE=off，仅 DEBUG 允许）"
    if settings.migration_backup_mode == "off":
        logger.warning("MIGRATION_BACKUP_MODE=off：baseline 未做全库备份（仅 DEBUG 允许）")
    else:
        backup = create_backup(engine, version=0, name="baseline", scope="full")
        backup_note = backup.path
        logger.info("baseline 全库备份完成：%s（sha256=%s）", backup.path, backup.sha256[:12])

    executed: list[int] = []
    for migration in MIGRATIONS:
        if migration.version in state.applied:
            continue
        _apply_one(engine, migration)
        executed.append(migration.version)

    duration_ms = int((perf_counter() - t0) * 1000)
    record_compensation(
        engine,
        version=max(executed) if executed else 0,
        action="baseline",
        operator=worker_identity(),
        dry_run=False,
        reason="auto" if auto else "manual",
        started_at=started,
        duration_ms=duration_ms,
        result="success",
        affected_rows=len(executed),
        notes=f"baseline 登记 {len(executed)} 项；全库备份 {backup_note}",
    )
    logger.info("baseline 完成：登记 %d 项，耗时 %dms", len(executed), duration_ms)
    return executed


def _baseline_preflight(engine: Engine) -> None:  # noqa: ARG001 - 保留签名以便后续加入库级检查
    """Baseline 前置检查（Fail Loud，§7.3）.

    Args:
        engine: SQLAlchemy 引擎（当前仅做磁盘/pg_dump 检查，保留以便扩展库级检查）。

    Raises:
        MigrationBlockedError: 磁盘余量不足。

    """
    from migrations.backup import BackupError, disk_free_mb, resolve_pg_dump

    try:
        resolve_pg_dump()
    except BackupError as exc:
        raise MigrationBlockedError(str(exc)) from exc

    free_mb = disk_free_mb()
    if free_mb < settings.migration_backup_min_free_mb:
        msg = (
            f"baseline 前置检查失败：磁盘剩余 {free_mb}MB < 下限 {settings.migration_backup_min_free_mb}MB。"
            "请清理磁盘后重试。"
        )
        raise MigrationBlockedError(msg)


# ---------------------------------------------------------------------------
# retry（K6）
# ---------------------------------------------------------------------------


def retry(engine: Engine, version: int, *, reason: str | None) -> None:
    """仅重跑指定 failed 版本（幂等），成功后 UPDATE 为 applied（K6）.

    Args:
        engine: SQLAlchemy 引擎。
        version: 迁移版本号。
        reason: 审计原因。

    Raises:
        MigrationBlockedError: 版本未登记 / 不存在 failed 记录。

    """
    migration = MIGRATION_BY_VERSION.get(version)
    if migration is None:
        msg = f"v{version} 未在注册表中登记"
        raise MigrationBlockedError(msg)

    ensure_version_tables(engine)
    state = load_state(engine)
    if version not in state.failed:
        msg = (
            f"v{version} 没有 failed 记录（当前 applied={version in state.applied}）。"
            "retry 只用于恢复 failed 迁移；如需重跑已 applied 迁移请先补偿。"
        )
        raise MigrationBlockedError(msg)

    started = utcnow()
    t0 = perf_counter()
    try:
        _apply_one(engine, migration)
    except Exception as exc:
        duration_ms = int((perf_counter() - t0) * 1000)
        record_compensation(
            engine,
            version=version,
            action="retry",
            operator=worker_identity(),
            dry_run=False,
            reason=reason,
            started_at=started,
            duration_ms=duration_ms,
            result="failed",
            affected_rows=None,
            notes=f"{type(exc).__name__}: {exc}",
        )
        raise
    duration_ms = int((perf_counter() - t0) * 1000)
    record_compensation(
        engine,
        version=version,
        action="retry",
        operator=worker_identity(),
        dry_run=False,
        reason=reason,
        started_at=started,
        duration_ms=duration_ms,
        result="success",
        affected_rows=None,
        notes=f"v{version} {migration.name} 重试成功",
    )
    logger.info("迁移 v%d %s 重试成功（%dms）", version, migration.name, duration_ms)


# ---------------------------------------------------------------------------
# rebaseline（K5）
# ---------------------------------------------------------------------------


def rebaseline(engine: Engine, version: int, *, reason: str) -> None:
    """把当前源码 checksum 写回账本（只允许无行为变化的重构，K5）.

    Args:
        engine: SQLAlchemy 引擎。
        version: 迁移版本号。
        reason: 必填审计原因。

    Raises:
        MigrationBlockedError: 版本未登记 / 缺少原因 / 该版本未 applied。

    """
    if not reason.strip():
        msg = "rebaseline 必须提供 --reason（审计要求）"
        raise MigrationBlockedError(msg)
    migration = MIGRATION_BY_VERSION.get(version)
    if migration is None:
        msg = f"v{version} 未在注册表中登记"
        raise MigrationBlockedError(msg)

    ensure_version_tables(engine)
    state = load_state(engine)
    if version not in state.applied:
        msg = f"v{version} 尚未 applied，无需 rebaseline"
        raise MigrationBlockedError(msg)

    from migrations.schema_migrations import update_checksum

    expected = state.applied[version].checksum
    actual = checksum_of(migration.fn)
    started = utcnow()
    update_checksum(engine, version=version, checksum=actual, note=f"rebaseline: {reason}")
    record_compensation(
        engine,
        version=version,
        action="rebaseline",
        operator=worker_identity(),
        dry_run=False,
        reason=reason,
        started_at=started,
        duration_ms=0,
        result="success",
        affected_rows=None,
        notes=f"checksum {expected[:12]} → {actual[:12]}",
    )
    logger.info("迁移 v%d %s checksum 已重基线：%s → %s", version, migration.name, expected[:12], actual[:12])


# ---------------------------------------------------------------------------
# compensate（§9.4）
# ---------------------------------------------------------------------------


@dataclass(frozen=True, slots=True)
class CompensationOutcome:
    """补偿执行结果（CLI 据此决定退出码）."""

    result: str
    affected_rows: int
    notes: str | None
    exit_code: int


def compensate(
    engine: Engine,
    version: int,
    *,
    dry_run: bool,
    yes: bool,
    force: bool,
    reason: str | None,
    operator: str,
) -> CompensationOutcome:
    """执行补偿（单事务；dry-run 只读；闸门见 §9.4）.

    Args:
        engine: SQLAlchemy 引擎。
        version: 迁移版本号。
        dry_run: 只统计不执行 DML。
        yes: 生产双确认的第一部分。
        force: 跳过行数上限与空表守卫。
        reason: 审计原因。
        operator: 操作者标识。

    Returns:
        补偿结果（含退出码）。

    Raises:
        CompensationNotSupportedError: 该版本无补偿脚本。
        MigrationBlockedError: 闸门拒绝（生产双确认 / 未 --yes）。

    """
    from migrations.compensations.base import CompensationContext, CompensationTooLargeError
    from migrations.compensations.guards import CompensationGuardError, check_row_budget
    from migrations.compensations.registry import has_compensation, run_compensation

    migration = MIGRATION_BY_VERSION.get(version)
    if migration is None:
        msg = f"v{version} 未在注册表中登记"
        raise MigrationBlockedError(msg)
    if not has_compensation(version):
        msg = f"v{version} {migration.name}（风险 {migration.risk}）不可自动补偿，请使用 restore-hint"
        raise CompensationNotSupportedError(msg)

    gate_exit = _compensation_gate(version=version, dry_run=dry_run, yes=yes, reason=reason)
    if gate_exit is not None:
        return gate_exit

    ctx = CompensationContext(
        version=version,
        dry_run=dry_run,
        max_rows=settings.migration_compensation_max_rows,
        reason=reason,
        operator=operator,
        force=force,
    )
    started = utcnow()
    t0 = perf_counter()
    try:
        with engine.begin() as conn:
            result = run_compensation(conn, version, ctx)
            if not dry_run:
                check_row_budget(result.affected_rows, ctx.max_rows, force=force)
    except (CompensationGuardError, CompensationTooLargeError) as exc:
        # 守卫/行数预算拒绝 → 事务已回滚，审计记 aborted（§9.1 / §9.4）
        duration_ms = int((perf_counter() - t0) * 1000)
        record_compensation(
            engine,
            version=version,
            action="compensate",
            operator=operator,
            dry_run=dry_run,
            reason=reason,
            started_at=started,
            duration_ms=duration_ms,
            result="aborted",
            affected_rows=None,
            notes=str(exc),
        )
        raise
    except Exception as exc:
        duration_ms = int((perf_counter() - t0) * 1000)
        record_compensation(
            engine,
            version=version,
            action="compensate",
            operator=operator,
            dry_run=dry_run,
            reason=reason,
            started_at=started,
            duration_ms=duration_ms,
            result="failed",
            affected_rows=None,
            notes=f"{type(exc).__name__}: {exc}",
        )
        raise

    duration_ms = int((perf_counter() - t0) * 1000)
    record_compensation(
        engine,
        version=version,
        action="compensate",
        operator=operator,
        dry_run=dry_run,
        reason=reason,
        started_at=started,
        duration_ms=duration_ms,
        result="dry_run" if dry_run else "success",
        affected_rows=result.affected_rows,
        notes=result.notes,
    )
    return CompensationOutcome(
        result="dry_run" if dry_run else "success",
        affected_rows=result.affected_rows,
        notes=result.notes,
        exit_code=0,
    )


def _compensation_gate(
    *,
    version: int,
    dry_run: bool,
    yes: bool,
    reason: str | None,  # noqa: ARG001 - 闸门不使用原因，但保留以对齐 CLI 参数契约
) -> CompensationOutcome | None:
    """补偿安全闸门（§9.4）：生产双确认 + 无 ``--yes`` 强制 dry-run.

    Args:
        version: 迁移版本号。
        dry_run: 是否演练。
        yes: 是否显式确认。
        reason: 审计原因。

    Returns:
        被闸门拦下时返回结果（退出码 2）；放行返回 None。

    Raises:
        MigrationBlockedError: 生产环境缺少双确认口令。

    """
    if not dry_run and not yes:
        return CompensationOutcome(
            result="aborted",
            affected_rows=0,
            notes="未提供 --yes：默认只做 dry-run 提示。确认后加 --yes 实跑（生产还需 MIGRATION_PRODUCTION_CONFIRM）",
            exit_code=2,
        )
    if not dry_run and not settings.debug:
        expected = settings.migration_env_name
        if settings.migration_production_confirm != expected:
            msg = (
                "生产环境（DEBUG=false）执行补偿需要双确认：\n"
                f"  --yes 且 MIGRATION_PRODUCTION_CONFIRM={expected}（当前值"
                f"={'空' if not settings.migration_production_confirm else '不匹配'}）\n"
                f"  示例：MIGRATION_PRODUCTION_CONFIRM={expected} "
                f'python -m migrations.manage compensate {version} --yes --reason "..."'
            )
            raise MigrationBlockedError(msg)
    return None
