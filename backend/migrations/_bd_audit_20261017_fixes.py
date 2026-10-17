"""楼盘字典 2026-10-17 审查缺陷的 schema 与数据修复迁移（幂等）.

对应 `docs/Done/2026-10-17-楼盘字典本周迭代-全维度代码审查报告.md`：

- **H1**：``bd_pending_entries`` 补 ``community_scope`` 列并重建 ``uq_pending_open``。
  旧索引 ``(kind, COALESCE(parent_id,0), normalized_name)`` 让 A/B 两小区的同名
  楼栋（parent_id 都是 0）互相复用 → 跨小区脏关联。
- **H2**：``bd_pending_entries`` 补 ``parent_is_pending`` 列，区分 parent_id 指向
  实表 id 还是 pending 条目 id；存量「待审楼栋下的户室」按 ``parent_kind='building'``
  且 parent_id 命中 pending 条目修正为 ``parent_is_pending=true``；父级楼栋已转正的
  直接改写为实表楼栋 id。
- **H3**：``bd_buildings`` 补 ``origin_community_id``（合并迁移可逆标记）+ 索引。
- **H4**：一次性对账 ``bd_buildings.room_count`` 为真实 ``count(*)``（审核 create
  的 ``+1`` 偏差不可自愈，需对账兜底）。
- **L2**：``bd_import_tasks`` / ``import_tasks`` 的 ``created_at`` 为 naive 落库产生
  8 小时偏差，按 ``started_at`` 反推校正（仅修正明显异常行）。
- **M3**：``communities.district`` 去/加「区」后缀归一（存量「浦东/静安」与
  「浦东区/静安区」并存，前端按值筛选会静默漏数）。

所有步骤均带存在性检查，可重复执行。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists

logger = logging.getLogger(__name__)

# 上海 16 区标准名（带「区」后缀）——与 services.property.dict_parser.SHANGHAI_DISTRICTS 同口径
_SHANGHAI_DISTRICTS = (
    "黄浦区",
    "徐汇区",
    "长宁区",
    "静安区",
    "普陀区",
    "虹口区",
    "杨浦区",
    "闵行区",
    "宝山区",
    "嘉定区",
    "浦东新区",
    "金山区",
    "松江区",
    "青浦区",
    "奉贤区",
    "崇明区",
)

# 历史简称/别名 → 标准名（闸北 2015 年并入静安，存量数据仍保留该值）
# 「浦东区」是另一条导入链路（market/importer.py）落库的旧值域，与官方标准名
# 「浦东新区」并存（生产库 1421 条 vs 92 条）：同属浦东新区却拆成两个筛选值，
# 这里一并归一，否则区域下拉会同时出现「浦东区」与「浦东新区」。
_DISTRICT_ALIASES = {
    "浦东": "浦东新区",
    "浦东区": "浦东新区",
    "闸北": "闸北区",
}


def _add_pending_entry_columns(engine: Engine) -> None:
    """H1/H2：bd_pending_entries 补 community_scope / parent_is_pending 列.

    注意：列存在性检查必须在 DDL 事务**外**完成 —— 事务内 ALTER 持 ACCESS EXCLUSIVE
    锁时，inspect() 另开连接查 pg_attribute 需 AccessShareLock，会自死锁。
    """
    missing: list[tuple[str, str, str]] = []
    if not _column_exists(engine, "bd_pending_entries", "community_scope"):
        missing.append(
            (
                "community_scope",
                "ALTER TABLE bd_pending_entries ADD COLUMN community_scope VARCHAR(36)",
                "COMMENT ON COLUMN bd_pending_entries.community_scope IS "
                "'唯一性判定用归属小区(合并/改名不影响；community 条目与父级待审时为 NULL)'",
            )
        )
    if not _column_exists(engine, "bd_pending_entries", "parent_is_pending"):
        missing.append(
            (
                "parent_is_pending",
                "ALTER TABLE bd_pending_entries ADD COLUMN parent_is_pending BOOLEAN NOT NULL DEFAULT false",
                "COMMENT ON COLUMN bd_pending_entries.parent_is_pending IS "
                "'父级是否为审核池待审条目(parent_id 语义区分：false=实表 id，true=pending 条目 id)'",
            )
        )
    if not missing:
        return
    with engine.begin() as conn:
        for column, alter_sql, comment_sql in missing:
            logger.info("迁移：bd_pending_entries 补 %s 列（H1/H2）", column)
            conn.execute(text(alter_sql))
            conn.execute(text(comment_sql))


def _backfill_pending_scope_and_parent(engine: Engine) -> None:
    """H1/H2 存量回填：community_scope + parent_is_pending + 已转正父级改指实表 id.

    顺序很重要：先按「parent_id 是否命中 pending 条目」标出 parent_is_pending，
    再把「父级 pending 楼栋已转正」的子级改成实表 id（并清 parent_is_pending），
    最后统一回填 community_scope。
    """
    with engine.begin() as conn:
        # 1. parent_is_pending：parent_kind 非空且 parent_id 命中同库 pending 条目 id
        updated = conn.execute(
            text(
                """
                UPDATE bd_pending_entries c
                   SET parent_is_pending = true
                 WHERE c.parent_is_pending = false
                   AND c.parent_kind IS NOT NULL
                   AND c.parent_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM bd_pending_entries p WHERE p.id = c.parent_id)
                """
            )
        ).rowcount
        if updated:
            logger.info("迁移：修正 %d 条 pending 的 parent_is_pending=true（H2 存量悬挂行）", updated)

        # 2. 父级 pending 楼栋已转正（status=created 且 resolved_target_id 指向实表）→ 改指实表 id
        rewired = conn.execute(
            text(
                """
                UPDATE bd_pending_entries c
                   SET parent_id = p.resolved_target_id::bigint,
                       parent_is_pending = false
                  FROM bd_pending_entries p
                 WHERE c.parent_is_pending = true
                   AND p.id = c.parent_id
                   AND p.kind = 'building'
                   AND p.status = 'created'
                   AND p.resolved_target_id ~ '^[0-9]+$'
                   AND EXISTS (SELECT 1 FROM bd_buildings b WHERE b.id = p.resolved_target_id::bigint)
                """
            )
        ).rowcount
        if rewired:
            logger.info("迁移：%d 条户室 pending 的父级改指已转正楼栋实表 id（H2）", rewired)

        # 3. community_scope 回填：
        #    - community 条目（自身即小区）/ 父级本身待审 → NULL
        #    - 其余取 community_id；为空时按父级楼栋反查小区
        filled = conn.execute(
            text(
                """
                UPDATE bd_pending_entries e
                   SET community_scope = COALESCE(
                       e.community_id,
                       CASE WHEN e.parent_kind = 'building' AND e.parent_is_pending = false
                            THEN (SELECT b.community_id FROM bd_buildings b WHERE b.id = e.parent_id)
                       END
                   )
                 WHERE e.community_scope IS NULL
                   AND e.kind <> 'community'
                   AND e.parent_is_pending = false
                """
            )
        ).rowcount
        if filled:
            logger.info("迁移：回填 %d 条 pending 的 community_scope（H1）", filled)


def _rebuild_pending_open_index(engine: Engine) -> None:
    """H1/H2：重建 uq_pending_open 为四维版本（幂等：indexdef 不含新列则重建）.

    存在性检查/索引定义查询均在 DDL 事务外完成（避免自死锁，同上层注释）。
    """
    desired_fragments = ("community_scope", "parent_is_pending")
    need_rebuild = True
    if _index_exists(engine, "uq_pending_open"):
        with engine.connect() as conn:
            idxdef = conn.execute(
                text("SELECT pg_get_indexdef(indexrelid) FROM pg_index WHERE indexrelid = 'uq_pending_open'::regclass"),
            ).scalar()
        need_rebuild = not (idxdef and all(f in idxdef for f in desired_fragments))
    if not need_rebuild:
        return
    logger.info("迁移：重建 uq_pending_open（加入 community_scope / parent_is_pending 维度）")
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX IF EXISTS uq_pending_open"))
        conn.execute(
            text(
                "CREATE UNIQUE INDEX uq_pending_open "
                "ON bd_pending_entries "
                "(kind, COALESCE(community_scope, ''), parent_is_pending, COALESCE(parent_id, 0), normalized_name) "
                "WHERE status = 'pending'"
            ),
        )


def _extend_buildings_origin(engine: Engine) -> None:
    """H3：bd_buildings 补 origin_community_id 列与索引（合并迁移可逆标记）.

    同 ``_add_pending_entry_columns``：列/索引存在性检查在 DDL 事务外完成，避免自死锁。
    """
    if not _column_exists(engine, "bd_buildings", "origin_community_id"):
        logger.info("迁移：bd_buildings 补 origin_community_id 列（H3 合并可逆）")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE bd_buildings ADD COLUMN origin_community_id VARCHAR(36)"))
            conn.execute(
                text(
                    "COMMENT ON COLUMN bd_buildings.origin_community_id IS "
                    "'合并前原归属小区ID(仅合并迁移过的楼栋有值，解除合并时据此可逆)'"
                )
            )
    if not _index_exists(engine, "idx_bd_building_origin_community"):
        logger.info("迁移：创建 idx_bd_building_origin_community 索引")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX IF NOT EXISTS idx_bd_building_origin_community ON bd_buildings (origin_community_id)"
                )
            )
    if not _index_exists(engine, "idx_bd_pending_scope"):
        logger.info("迁移：创建 idx_bd_pending_scope 索引")
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX IF NOT EXISTS idx_bd_pending_scope ON bd_pending_entries (community_scope)")
            )


def _reconcile_room_count(engine: Engine) -> None:
    """H4：一次性对账 bd_buildings.room_count（幂等：只更新不一致的行）."""
    with engine.begin() as conn:
        fixed = conn.execute(
            text(
                """
                UPDATE bd_buildings b
                   SET room_count = COALESCE(actual.cnt, 0)
                  FROM (
                      SELECT bd.id, (SELECT count(*) FROM bd_rooms r WHERE r.building_id = bd.id) AS cnt
                        FROM bd_buildings bd
                  ) actual
                 WHERE b.id = actual.id
                   AND b.room_count IS DISTINCT FROM COALESCE(actual.cnt, 0)
                """
            )
        ).rowcount
    if fixed:
        logger.info("迁移：对账修正 %d 个楼栋的 room_count（H4 冗余计数漂移）", fixed)


def _fix_import_task_created_at(engine: Engine) -> None:
    """L2：修正 created_at 晚于 started_at 的导入任务（naive datetime 时区偏差）."""
    for table in ("bd_import_tasks", "import_tasks"):
        with engine.begin() as conn:
            try:
                fixed = conn.execute(
                    text(
                        f"UPDATE {table} SET created_at = started_at "  # 表名来自硬编码元组
                        "WHERE started_at IS NOT NULL AND created_at > started_at"
                    )
                ).rowcount
            except Exception:  # pragma: no cover - 表不存在时跳过
                logger.debug("迁移：跳过 %s.created_at 校正（表不存在）", table)
                continue
        if fixed:
            logger.info("迁移：校正 %s 的 %d 条 created_at（L2 时区偏差）", table, fixed)


def _normalize_community_district(engine: Engine) -> None:
    """M3：communities.district 归一（去/补「区」后缀，空串置空）.

    存量「浦东/静安/宝山…」与「浦东区/静安区…」并存，同一行政区被拆成两个值域，
    前端下拉只能命中其中一半；归一后按标准名（带「区」）单一口径筛选。
    「闸北区」保留原值（历史行政区，前端下拉按 distinct 值动态生成）。
    """
    with engine.begin() as conn:
        # 空串 → NULL（'' 会占用一个筛选选项且无法命中）
        conn.execute(text("UPDATE communities SET district = NULL WHERE district = ''"))

        for alias, standard in _DISTRICT_ALIASES.items():
            conn.execute(
                text("UPDATE communities SET district = :standard WHERE district = :alias"),
                {"standard": standard, "alias": alias},
            )

        # 「X区」→ 标准名归并（浦东区 → 浦东新区）；必须排在下面的「X」→「X区」之前，
        # 否则「浦东区」会先去后缀变成「浦东」再被误加回「浦东区」。
        for district in _SHANGHAI_DISTRICTS:
            for wrong in (district, district.removesuffix("区") + "区"):
                if wrong == district:
                    continue
                conn.execute(
                    text("UPDATE communities SET district = :standard WHERE district = :wrong"),
                    {"standard": district, "wrong": wrong},
                )

        # 「X」→「X区」（仅上海 16 区，避免误改朝阳区/海淀区等外地数据）
        for district in _SHANGHAI_DISTRICTS:
            bare = district.removesuffix("区")
            if bare == district:
                continue
            conn.execute(
                text("UPDATE communities SET district = :standard WHERE district = :bare"),
                {"standard": district, "bare": bare},
            )


def run_bd_audit_20261017_fixes(engine: Engine) -> None:
    """审查缺陷修复迁移入口（幂等）."""
    if engine.dialect.name != "postgresql":
        return
    _add_pending_entry_columns(engine)
    _backfill_pending_scope_and_parent(engine)
    _rebuild_pending_open_index(engine)
    _extend_buildings_origin(engine)
    _reconcile_room_count(engine)
    _fix_import_task_created_at(engine)
    _normalize_community_district(engine)
