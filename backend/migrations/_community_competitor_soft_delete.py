"""v101：竞品边去重改为软删（保留 ``origin`` 痕迹，解除合并可回迁）.

**缺陷**：``_migrate_competitors`` 合并时按「改指后的 (owner, competitor)」去重，
对重复边直接 ``DELETE``。被删的子档边**没有任何痕迹**（既无 ``origin`` 也无软删标记），
解除合并时按 ``origin`` 回迁自然找不到它 —— 子档的竞品关系就此永久丢失。

实测（真实 ``merge_communities`` / ``unmerge_community``）：主档 ``G→I`` + 子档
``H→I`` 合并后只剩主档那条；解除合并后子档的边数仍是 0，与合并前（1 条）不一致。

**修复**：给 ``community_competitors`` 加 ``is_deleted``，重复边改为
「记 ``origin_community_id`` + 置 ``is_deleted=true``」保留；解除合并时复活回子档。

**为什么必须同时换索引**：原 ``uq_community_competitor`` 是
``UNIQUE (community_id, competitor_community_id)``（普通唯一约束），软删行仍占着
那一对键。若不换索引，**解除合并复活时会撞唯一约束**，修复等于无效。故本迁移把它
重建为部分唯一索引 ``WHERE is_deleted = false``（与 ``uq_community_image_url``
同一模式，见 ``migrations/_community_images.py``）。

**幂等**：``_column_exists`` 判列、``_index_exists`` 判索引；约束删除用
``DROP CONSTRAINT IF EXISTS``。重复执行无副作用。

**可逆**：``ALTER TABLE ... ADD COLUMN`` + 索引重建，schema 类改动，risk A。
新增列可空/有默认值，对既有行无数据改写（存量行 ``is_deleted=false``）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists

logger = logging.getLogger(__name__)

_TABLE = "community_competitors"

# 原普通唯一约束名（v1.9 建表时创建）。重建为部分唯一索引后会被删除。
_LEGACY_UNIQUE_CONSTRAINT = "uq_community_competitor"

# 部分唯一索引名：与模型 ``CommunityCompetitor.__table_args__`` 完全一致
_PARTIAL_UNIQUE_INDEX = "uq_community_competitor"


def _constraint_exists(engine: Engine, table: str, name: str) -> bool:
    """检查某个约束是否存在于指定表（PostgreSQL）."""
    with engine.connect() as conn:
        return bool(
            conn.execute(
                text("SELECT 1 FROM pg_constraint  WHERE conrelid = (:t)::regclass AND conname = :n LIMIT 1"),
                {"t": table, "n": name},
            ).first(),
        )


def _index_is_partial_unique(engine: Engine, index_name: str) -> bool:
    """判断同名索引是否已是「带 WHERE 的唯一索引」（即部分唯一索引）.

    仅按名字判定不够：``uq_community_competitor`` 在旧库是**约束**（其底层索引无
    ``WHERE``），在新库应当是**部分唯一索引**。必须看 ``pg_indexes.indexdef`` 里
    有没有 ``WHERE``。

    Args:
        engine: 数据库引擎
        index_name: 索引名

    Returns:
        True 表示已是带 WHERE 子句的唯一索引

    """
    with engine.connect() as conn:
        indexdef = conn.execute(
            text("SELECT indexdef FROM pg_indexes WHERE tablename = :t AND indexname = :i"),
            {"t": _TABLE, "i": index_name},
        ).scalar()
    if not indexdef:
        return False
    return "UNIQUE INDEX" in indexdef and "WHERE" in indexdef


def add_competitor_soft_delete(engine: Engine) -> None:
    """v101：竞品边补 ``is_deleted``，唯一约束重建为部分唯一索引（幂等）.

    Args:
        engine: 数据库引擎

    """
    # 1. 补 is_deleted 列（存量行默认 false）
    if not _column_exists(engine, _TABLE, "is_deleted"):
        logger.info("迁移 v101：%s 补 is_deleted 列（合并去重软删）", _TABLE)
        with engine.begin() as conn:
            conn.execute(
                text(f"ALTER TABLE {_TABLE} ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT false")
            )
            conn.execute(
                text(f"COMMENT ON COLUMN {_TABLE}.is_deleted IS '逻辑删除标记(合并去重保留可逆痕迹，查询须过滤)'")
            )

    # 2. 重建唯一性：普通唯一约束 → 部分唯一索引（WHERE is_deleted = false）
    #    顺序：先 DROP 约束（连带其底层索引），再建部分唯一索引。
    #    不能只靠 CREATE UNIQUE INDEX IF NOT EXISTS：同名索引已存在时它什么也不做，
    #    WHERE 子句不会生效（与 rebuild_contract_no_index 踩过的坑同源）。
    if _constraint_exists(engine, _TABLE, _LEGACY_UNIQUE_CONSTRAINT):
        logger.info("迁移 v101：删除普通唯一约束 %s（将重建为部分唯一索引）", _LEGACY_UNIQUE_CONSTRAINT)
        with engine.begin() as conn:
            conn.execute(text(f"ALTER TABLE {_TABLE} DROP CONSTRAINT IF EXISTS {_LEGACY_UNIQUE_CONSTRAINT}"))

    if not _index_is_partial_unique(engine, _PARTIAL_UNIQUE_INDEX):
        # 同名索引可能是旧约束遗留的非部分索引 → 必须显式清掉才能重建
        if _index_exists(engine, _PARTIAL_UNIQUE_INDEX):
            logger.info("迁移 v101：删除非部分同名索引 %s 以重建", _PARTIAL_UNIQUE_INDEX)
            with engine.begin() as conn:
                conn.execute(text(f"DROP INDEX IF EXISTS {_PARTIAL_UNIQUE_INDEX}"))
        logger.info("迁移 v101：创建部分唯一索引 %s（WHERE is_deleted = false）", _PARTIAL_UNIQUE_INDEX)
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {_PARTIAL_UNIQUE_INDEX} "
                    f"ON {_TABLE} (community_id, competitor_community_id) WHERE is_deleted = false"
                )
            )

    # 3. 查询索引：按小区查未删除竞品边（与模型 __table_args__ 一致）
    if not _index_exists(engine, "idx_community_competitor_owner_active"):
        logger.info("迁移 v101：创建索引 idx_community_competitor_owner_active")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_community_competitor_owner_active "
                    f"ON {_TABLE} (community_id, is_deleted)"
                )
            )

    logger.info("迁移 v101：竞品边软删列与部分唯一索引已就位")
