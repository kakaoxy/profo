"""重建 project_sales.project_id 唯一约束为部分唯一索引（幂等 schema 迁移）.

问题根因（2026-10-22 审查修复验证发现）：
- project_sales_project_id_key 原为普通唯一约束（UNIQUE(project_id)），不区分 is_deleted
- 项目软删除时同步软删 sale 记录（delete_project 级联），但被软删的行仍占用 project_id
- 后续「获取或创建 sale」逻辑（update_roles / state.update_status）在软删行存在时
  正确地选择新建行，触发 UniqueViolation → 409「数据重复，违反唯一性约束」

修复内容：
1. 清理历史孤儿软删 sale（同 project_id 存在活跃行的软删行置为真删，释放 project_id；
   与「同事务软删保留可追溯」原则冲突时优先保活跃链路可用，此处仅删除
   "已有活跃行接管"的冗余软删行）
2. 将唯一约束重建为部分唯一索引（WHERE is_deleted = false），
   仅对未删除记录强制唯一，允许软删行让位给新行

幂等性：
- 清理：仅删除「同 project_id 已有活跃行」的软删行，重复执行第二次命中 0 行
- 约束重建：检测 indexdef 是否已含 WHERE 子句，已重建则跳过
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_CONSTRAINT_NAME = "project_sales_project_id_key"
_PARTIAL_INDEX_NAME = "uq_sale_project_active"


def rebuild_project_sale_unique_index(engine: Engine) -> None:
    """将 project_sales 的 project_id 唯一约束重建为部分唯一索引（幂等）.

    Args:
        engine: SQLAlchemy 引擎

    """
    inspector = inspect(engine)
    if "project_sales" not in inspector.get_table_names():
        return
    if engine.dialect.name != "postgresql":
        return

    # 1. 清理冗余软删行：同 project_id 已有活跃行时，软删行无保留价值（真删释放约束）。
    #    注意不得加「仅保留一条软删行」类限制：存在多条冗余软删行时，
    #    互斥条件会导致每条都因看到兄弟行而全部跳过，清理永不收敛。
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "DELETE FROM project_sales ps "
                "WHERE ps.is_deleted = true "
                "AND EXISTS ("
                "  SELECT 1 FROM project_sales ps2 "
                "  WHERE ps2.project_id = ps.project_id AND ps2.is_deleted = false"
                ") "
            ),
        )
        if result.rowcount:
            logger.info("迁移：清理 %d 条被活跃行接管的软删 sale 记录", result.rowcount)

    # 2. 重建唯一约束为部分唯一索引
    with engine.connect() as conn:
        constraint_exists = conn.execute(
            text(
                "SELECT 1 FROM pg_constraint con "
                "JOIN pg_class cls ON cls.oid = con.conrelid "
                "WHERE con.conname = :name AND cls.relname = 'project_sales' LIMIT 1"
            ),
            {"name": _CONSTRAINT_NAME},
        ).first()
        partial_exists = conn.execute(
            text("SELECT 1 FROM pg_indexes WHERE indexname = :name AND indexdef LIKE '%WHERE%' LIMIT 1"),
            {"name": _PARTIAL_INDEX_NAME},
        ).first()

    if partial_exists:
        return
    if not constraint_exists:
        # 约束不存在且部分索引也不存在：仅补建部分唯一索引
        logger.info("迁移：project_sales 补建部分唯一索引 %s", _PARTIAL_INDEX_NAME)
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {_PARTIAL_INDEX_NAME} "
                    "ON project_sales (project_id) WHERE is_deleted = false"
                ),
            )
        return

    logger.info("迁移：重建 project_sales 唯一约束为部分唯一索引 %s", _PARTIAL_INDEX_NAME)
    with engine.begin() as conn:
        conn.execute(
            text(f"ALTER TABLE project_sales DROP CONSTRAINT IF EXISTS {_CONSTRAINT_NAME}"),
        )
        conn.execute(
            text(
                f"CREATE UNIQUE INDEX IF NOT EXISTS {_PARTIAL_INDEX_NAME} "
                "ON project_sales (project_id) WHERE is_deleted = false"
            ),
        )
