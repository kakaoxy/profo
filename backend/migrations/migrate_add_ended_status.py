"""同步 PostgreSQL projectstatus enum 类型与 Python ProjectStatus 枚举（新增 ENDED 值）."""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from migrations._helpers import _pg_quote_literal

logger = logging.getLogger(__name__)

# project_status_logs 表中使用 SQLEnum(ProjectStatus, create_constraint=True) 的列
_STATUS_LOG_CHECK_COLUMNS = ("old_status", "new_status")


def migrate_add_ended_status(engine: Engine) -> None:
    """同步 PostgreSQL projectstatus enum 与 Python ProjectStatus 枚举.

    ProjectStatus 枚举新增 ENDED = "ended"（已下架）。projects.status 与
    project_status_logs.old_status/new_status 均使用 SQLEnum(ProjectStatus)，
    PostgreSQL 上创建原生 enum 类型 ``projectstatus``。Python 枚举新增值后
    PG enum 不会自动同步，需 ALTER TYPE ... ADD VALUE。

    project_status_logs 显式启用 create_constraint=True，建表时生成
    CHECK (col IN (...)) 约束。若建表早于 ENDED 加入，约束定义缺失 "ended"，
    写入 "ended" 会违反约束——此处检测并重建。

    幂等：pg_enum 检查 + IF NOT EXISTS + 约束定义检查。
    """
    if engine.dialect.name != "postgresql":
        return

    from models.common import ProjectStatus

    # 1. 同步原生 enum 类型 projectstatus（遍历全部值，避免遗漏）
    with engine.connect() as conn:
        type_exists = conn.execute(
            text("SELECT 1 FROM pg_type WHERE typname = 'projectstatus'"),
        ).scalar()
    if not type_exists:
        logger.info("迁移：projectstatus enum type 不存在，跳过同步（将由 create_all 创建）")
        return

    added = 0
    for member in ProjectStatus:
        val = member.value
        with engine.begin() as conn:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = 'projectstatus' AND e.enumlabel = :label",
                ),
                {"label": val},
            ).scalar()
            if not exists:
                # PG 12+ 支持事务内 ALTER TYPE ADD VALUE；DDL 不支持绑定参数，需转义
                conn.execute(
                    text(f"ALTER TYPE projectstatus ADD VALUE IF NOT EXISTS {_pg_quote_literal(val)}"),
                )
                added += 1

    if added:
        logger.info("迁移：同步 projectstatus enum（共 %d 个值）", added)

    # 2. 重建 project_status_logs 中缺失 "ended" 的 stale CHECK 约束
    _rebuild_stale_status_check_constraints(engine, ProjectStatus)


def _rebuild_stale_status_check_constraints(engine: Engine, project_status_cls: type) -> None:
    """检测并重建 project_status_logs 中缺失 'ended' 的 CHECK 约束.

    project_status_logs.old_status/new_status 使用 create_constraint=True，
    SQLAlchemy 建表时生成 CHECK (col IN ('signing', ..., 'deleted')) 约束。
    若建表时 ProjectStatus 尚无 ENDED，约束定义缺失 'ended'，写入 'ended'
    会违反约束。此处删除并重建为完整值列表。

    幂等：仅当约束存在、引用 ProjectStatus 值、且定义中缺失 'ended' 时重建。
    """
    inspector = inspect(engine)
    if "project_status_logs" not in inspector.get_table_names():
        return

    all_values = [m.value for m in project_status_cls]
    quoted_values = ", ".join(_pg_quote_literal(v) for v in all_values)

    # 查询 project_status_logs 所有 CHECK 约束（名称 + 定义）
    with engine.connect() as conn:
        rows = conn.execute(
            text(
                "SELECT conname, pg_get_constraintdef(oid) AS defn "
                "FROM pg_constraint "
                "WHERE conrelid = 'project_status_logs'::regclass AND contype = 'c'",
            ),
        ).fetchall()

    # 筛选引用 ProjectStatus 值（含 'signing'）但缺失 'ended' 的约束
    prefix = "project_status_logs_"
    suffix = "_check"
    stale: list[tuple[str, str]] = []  # (conname, column)
    for row in rows:
        conname = row.conname
        defn = row.defn
        if "signing" not in defn or "ended" in defn:
            continue
        # 约束名格式：project_status_logs_{column}_check → 提取列名
        if conname.startswith(prefix) and conname.endswith(suffix):
            column = conname[len(prefix) : -len(suffix)]
            if column in _STATUS_LOG_CHECK_COLUMNS:
                stale.append((conname, column))

    if not stale:
        return

    with engine.begin() as conn:
        for conname, column in stale:
            conn.execute(text(f"ALTER TABLE project_status_logs DROP CONSTRAINT {conname}"))
            conn.execute(
                text(
                    f"ALTER TABLE project_status_logs ADD CONSTRAINT {conname} CHECK ({column} IN ({quoted_values}))",
                ),
            )

    logger.info("迁移：重建 project_status_logs 表 %d 个 stale CHECK 约束", len(stale))
