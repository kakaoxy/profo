"""版本账本表的建表与读写（迭代一 T1.1）。

本模块**不是迁移**：``schema_migrations`` / ``migration_compensations`` 由
``ensure_version_tables()`` 在执行器建表阶段创建，否则「版本表自己的版本」形成
自举悖论（总纲 C2 唯一豁免，理由见 ``docs/Base/migrations-runbook.md`` §0）。

写入语义（总纲 §4.1 / K6）：
- 每次迁移只写**一行**，先成功后失败不预写；
- ``status='failed'`` 的行**保留**，``retry`` 成功后 UPDATE 同一行为 ``applied`` 并清空 ``error``；
- 落库使用**独立连接**（迁移函数内部可能已多次 commit，外层事务模型不成立，K3）；
- ``_record`` 内部自带 try/except：落库失败只记日志，不掩盖真实迁移异常。
"""

import logging
import os
import socket
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Literal

from sqlalchemy import text
from sqlalchemy.engine import Engine

from models import Base
from models.system.schema_migration import MigrationCompensation, SchemaMigration
from settings import settings

logger = logging.getLogger(__name__)

STATUS_APPLIED = "applied"
STATUS_FAILED = "failed"

# 兜底提示：`_record` 落库失败时也不抛（否则掩盖迁移本身的异常）
_RECORD_FALLBACK_HINT = "迁移记录写入失败（不影响迁移结果判定，但审计链缺失）"


def ensure_version_tables(engine: Engine) -> None:
    """幂等创建版本账本与补偿审计两张表（``CREATE TABLE IF NOT EXISTS`` 语义）.

    Args:
        engine: SQLAlchemy 引擎（仅 PostgreSQL）。

    """
    Base.metadata.create_all(
        bind=engine,
        tables=[SchemaMigration.__table__, MigrationCompensation.__table__],
        checkfirst=True,
    )
    # 既有部署的补列（CREATE TABLE IF NOT EXISTS 不会给已存在的表加列）。
    # 该表由执行器自管（不走 migrations 注册表，见模块 docstring），因此补列也放在这里。
    _ensure_column(
        engine,
        table="schema_migrations",
        column="backup_client",
        ddl_type="VARCHAR(20)",
        comment="产出该备份的 pg_dump 版本（恢复必须用同大版本客户端）",
    )


def _ensure_column(engine: Engine, *, table: str, column: str, ddl_type: str, comment: str) -> None:
    """幂等为账本表补列（``ADD COLUMN IF NOT EXISTS``）.

    Args:
        engine: SQLAlchemy 引擎。
        table: 表名（模块内常量）。
        column: 列名（模块内常量）。
        ddl_type: PG 类型。
        comment: 列注释。

    """
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} {ddl_type}"))
        escaped = comment.replace("'", "''")
        conn.execute(text(f"COMMENT ON COLUMN {table}.{column} IS '{escaped}'"))


def worker_identity() -> str:
    """当前执行者标识 ``hostname:pid``（多 worker 追溯到具体进程）."""
    return f"{socket.gethostname()}:{os.getpid()}"


def operator_identity() -> str:
    """审计 operator：优先 ``MIGRATION_OPERATOR``，否则 ``os_user@hostname:pid``."""
    if settings.migration_operator:
        return settings.migration_operator
    try:
        user = os.getlogin()
    except OSError:
        user = os.environ.get("USER") or os.environ.get("LOGNAME") or "unknown"
    return f"{user}@{socket.gethostname()}:{os.getpid()}"


def utcnow() -> datetime:
    """当前 UTC 时间（与 ``BaseModel`` 的 default 口径一致，便于测试打桩）."""
    return datetime.now(timezone.utc)


@dataclass(frozen=True, slots=True)
class MigrationState:
    """版本账本的内存快照（执行器据此判定 pending / failed / checksum）."""

    applied: dict[int, "MigrationRow"]
    failed: dict[int, "MigrationRow"]

    @property
    def applied_versions(self) -> set[int]:
        """已成功应用的版本号集合."""
        return set(self.applied)

    @property
    def failed_versions(self) -> set[int]:
        """失败未恢复的版本号集合."""
        return set(self.failed)

    @property
    def is_empty(self) -> bool:
        """版本表是否为空（全新库或未基线的既有库）."""
        return not self.applied and not self.failed


@dataclass(frozen=True, slots=True)
class MigrationRow:
    """``schema_migrations`` 一行的只读投影（避免 ORM 会话生命周期耦合）."""

    version: int
    name: str
    checksum: str
    status: str
    started_at: datetime
    applied_at: datetime | None
    duration_ms: int | None
    worker: str | None
    backup_path: str | None
    backup_sha256: str | None
    backup_scope: str | None
    backup_client: str | None
    error: str | None
    kind: str
    risk: str


def load_state(engine: Engine) -> MigrationState:
    """读取版本账本全量快照.

    Args:
        engine: SQLAlchemy 引擎。

    Returns:
        ``applied`` / ``failed`` 两个字典（同版本不会同时存在两行，主键唯一）。

    """
    with engine.connect() as conn:
        result = conn.execute(text("SELECT * FROM schema_migrations ORDER BY version"))
        rows = [dict(row) for row in result.mappings().all()]
    applied: dict[int, MigrationRow] = {}
    failed: dict[int, MigrationRow] = {}
    for mapping in rows:
        item = MigrationRow(
            version=int(mapping["version"]),
            name=str(mapping["name"]),
            checksum=str(mapping["checksum"]),
            status=str(mapping["status"]),
            started_at=mapping["started_at"],
            applied_at=mapping.get("applied_at"),
            duration_ms=mapping.get("duration_ms"),
            worker=mapping.get("worker"),
            backup_path=mapping.get("backup_path"),
            backup_sha256=mapping.get("backup_sha256"),
            backup_scope=mapping.get("backup_scope"),
            backup_client=mapping.get("backup_client"),
            error=mapping.get("error"),
            kind=str(mapping["kind"]),
            risk=str(mapping["risk"]),
        )
        (applied if item.status == STATUS_APPLIED else failed)[item.version] = item
    return MigrationState(applied=applied, failed=failed)


def record_migration(
    engine: Engine,
    *,
    version: int,
    name: str,
    checksum: str,
    kind: str,
    risk: str,
    status: Literal["applied", "failed"],
    started_at: datetime,
    duration_ms: int,
    backup_path: str | None,
    backup_sha256: str | None,
    backup_scope: str | None,
    error: str | None,
    notes: str | None = None,
    backup_client: str | None = None,
) -> None:
    """写入/更新一条迁移记录（独立连接、独立事务，K3）.

    ``failed`` 行保留；``retry`` 成功时以同一 version 覆盖为 ``applied`` 并清空 ``error``。

    Args:
        engine: SQLAlchemy 引擎。
        version: 迁移版本号。
        name: 迁移唯一名。
        checksum: 当前源码 checksum。
        kind: schema / data / seed。
        risk: A / B / C / D。
        status: ``applied`` 或 ``failed``。
        started_at: 开始时间（UTC）。
        duration_ms: 耗时毫秒。
        backup_path: 备份文件路径（scope=none 时为 None）。
        backup_sha256: 备份文件摘要。
        backup_scope: none / table / full。
        backup_client: 产出备份的 pg_dump 版本（恢复端必须同大版本）。
        error: 失败堆栈（成功时为 None）。
        notes: 备注。

    """
    try:
        applied_at = utcnow() if status == STATUS_APPLIED else None
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO schema_migrations ("
                    "version, name, checksum, kind, risk, status, started_at, applied_at, duration_ms, "
                    "app_version, worker, backup_path, backup_sha256, backup_scope, backup_client, "
                    "error, notes"
                    ") VALUES ("
                    ":version, :name, :checksum, :kind, :risk, :status, :started_at, :applied_at, :duration_ms, "
                    ":app_version, :worker, :backup_path, :backup_sha256, :backup_scope, :backup_client, "
                    ":error, :notes"
                    ") ON CONFLICT (version) DO UPDATE SET "
                    "name = EXCLUDED.name, checksum = EXCLUDED.checksum, kind = EXCLUDED.kind, "
                    "risk = EXCLUDED.risk, status = EXCLUDED.status, started_at = EXCLUDED.started_at, "
                    "applied_at = EXCLUDED.applied_at, duration_ms = EXCLUDED.duration_ms, "
                    "app_version = EXCLUDED.app_version, worker = EXCLUDED.worker, "
                    "backup_path = EXCLUDED.backup_path, backup_sha256 = EXCLUDED.backup_sha256, "
                    "backup_scope = EXCLUDED.backup_scope, backup_client = EXCLUDED.backup_client, "
                    "error = EXCLUDED.error, notes = EXCLUDED.notes"
                ),
                {
                    "version": version,
                    "name": name,
                    "checksum": checksum,
                    "kind": kind,
                    "risk": risk,
                    "status": status,
                    "started_at": started_at,
                    "applied_at": applied_at,
                    "duration_ms": duration_ms,
                    "app_version": settings.app_version,
                    "worker": worker_identity(),
                    "backup_path": backup_path,
                    "backup_sha256": backup_sha256,
                    "backup_scope": backup_scope,
                    "backup_client": backup_client,
                    "error": error,
                    "notes": notes,
                },
            )
    except Exception:
        # 落库失败绝不能掩盖真实迁移异常（K6 / §6.2 约束 2）
        logger.exception("%s：version=%d name=%s status=%s", _RECORD_FALLBACK_HINT, version, name, status)


def update_checksum(engine: Engine, *, version: int, checksum: str, note: str | None = None) -> None:
    """把 ``schema_migrations.checksum`` 重写为当前源码摘要（``rebaseline`` 专用）.

    Args:
        engine: SQLAlchemy 引擎。
        version: 迁移版本号。
        checksum: 新的 checksum。
        note: 写入 ``notes`` 的说明（保留原 notes 则传 None）。

    """
    with engine.begin() as conn:
        if note is None:
            conn.execute(
                text("UPDATE schema_migrations SET checksum = :checksum WHERE version = :version"),
                {"checksum": checksum, "version": version},
            )
        else:
            conn.execute(
                text("UPDATE schema_migrations SET checksum = :checksum, notes = :note WHERE version = :version"),
                {"checksum": checksum, "note": note, "version": version},
            )


def record_compensation(
    engine: Engine,
    *,
    version: int,
    action: str,
    operator: str,
    dry_run: bool,
    reason: str | None,
    started_at: datetime,
    duration_ms: int,
    result: str,
    affected_rows: int | None,
    notes: str | None = None,
) -> None:
    """写入一条补偿/恢复/重基线/重试/基线审计记录（仅追加）.

    Args:
        engine: SQLAlchemy 引擎。
        version: 迁移版本号（逻辑外键）。
        action: compensate / restore / rebaseline / retry / baseline。
        operator: 操作者。
        dry_run: 是否演练。
        reason: 原因。
        started_at: 开始时间。
        duration_ms: 耗时毫秒。
        result: success / failed / dry_run / aborted。
        affected_rows: 影响行数。
        notes: 备注。

    """
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "INSERT INTO migration_compensations ("
                    "version, action, operator, dry_run, reason, started_at, finished_at, duration_ms, "
                    "result, affected_rows, notes"
                    ") VALUES ("
                    ":version, :action, :operator, :dry_run, :reason, :started_at, :finished_at, :duration_ms, "
                    ":result, :affected_rows, :notes"
                    ")"
                ),
                {
                    "version": version,
                    "action": action,
                    "operator": operator,
                    "dry_run": dry_run,
                    "reason": reason,
                    "started_at": started_at,
                    "finished_at": utcnow(),
                    "duration_ms": duration_ms,
                    "result": result,
                    "affected_rows": affected_rows,
                    "notes": notes,
                },
            )
    except Exception:
        logger.exception("补偿审计写入失败：version=%d action=%s", version, action)


def legacy_dataset_present(engine: Engine) -> bool:
    """判定「既有库」：``users`` / ``projects`` / ``leads`` 任一非空（总纲 K7）.

    ``lifespan`` 先 ``init_db()`` 再迁移，因此「表存在」不能区分新旧库，
    必须看数据。表缺失视为空（兼容极早期环境）。

    Args:
        engine: SQLAlchemy 引擎。

    Returns:
        任一表有数据返回 True。

    """
    with engine.connect() as conn:
        for table in ("users", "projects", "leads"):
            exists = conn.execute(
                text("SELECT to_regclass(:name) IS NOT NULL"),
                {"name": f"public.{table}"},
            ).scalar()
            if not exists:
                continue
            count = conn.execute(text(f"SELECT 1 FROM {table} LIMIT 1")).first()
            if count is not None:
                return True
    return False


def recent_failed_rows(engine: Engine, limit: int = 5) -> list[MigrationRow]:
    """取最近失败的迁移记录（阻断文案用）.

    Args:
        engine: SQLAlchemy 引擎。
        limit: 最多返回条数。

    Returns:
        按 ``started_at`` 倒序的失败行。

    """
    state = load_state(engine)
    rows = sorted(state.failed.values(), key=lambda row: row.started_at, reverse=True)
    return rows[:limit]
