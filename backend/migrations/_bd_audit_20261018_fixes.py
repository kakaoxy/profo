"""楼盘字典 2026-10-17 性能与安全专项审查报告（第二批）的迁移修复（幂等）.

对应 `docs/Done/2026-10-17-楼盘字典-性能与安全专项审查报告.md`：

- **P1**：``bd_buildings.room_count`` 对账改写。原实现（``_bd_audit_20261017_fixes.
  _reconcile_room_count``）是「53 万楼栋逐行相关子查询」（``loops=530894``），
  每次后端启动固定多花约 1.2~1.5 秒且成本随楼栋数线性恶化。此处改为一次
  ``bd_rooms`` 聚合（``GROUP BY building_id``）+ 聚合结果 JOIN，实测同库
  1211ms → 580ms；并补「无户室楼栋」的零值对账（原实现用
  ``COALESCE(actual.cnt,0)`` 但子查询对无户室楼栋返回 0，语义正确，新写法用
  聚合 JOIN 时必须显式补这一支，否则无户室楼栋的漂移值会漏对账）。
  旧实现同步下线（见 ``_bd_audit_20261017_fixes.run_bd_audit_20261017_fixes``）。

- **H2**：修复「待审小区下新建的楼栋」存量悬挂行。父级小区转正后原实现不回填
  子级楼栋的 ``community_id``/``community_scope``，导致这类楼栋条目 create 时命中
  「楼栋 pending 缺少归属小区」守卫永久 400。代码侧已在
  ``building_review_service._rewire_child_buildings`` 补齐；此处一次性修正存量：
  父级 pending 小区已 ``created``/``merged`` 且 ``resolved_target_id`` 指向存在的小区
  → 回填子级楼栋的归属小区。

- **H3**：清理「无回填对象」的 open 引用存量。``run_pending_backfill`` 已补兜底分支
  （条目不存在 / 已终态但无 ``resolved_target_id`` → 置 ``resolved``），存量脏引用
  （实测 25 条，``biz_id`` 指向已不存在的项目）同样置 ``resolved``，避免永久占用
  ``uq_bd_pending_ref_biz`` 唯一约束槽位。
  ⚠️ **``status='pending'`` 的条目不算无回填对象**：它们的引用要等审核通过/驳回后
  由 resolve 链路回填，迁移若提前关闭会让在途审核静默丢失单据关联（不可逆数据
  损坏），故 WHERE 显式排除 ``pending``。

- **L3**：坐标值域清洗。``communities.lng/lat`` 与 ``bd_buildings.lng/lat`` 中
  BD-09 越界值（经度 ∉ [73,136]、纬度 ∉ [3,54]）与 ``(0,0)`` 占位置空——
  后者会被前端当作「有坐标」展示（SRS 称约 97% 楼栋带坐标，实为无效占位）。

所有步骤均带存在性/幂等条件，可重复执行（回填后不再命中 WHERE）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)

# BD-09 值域（中国境内）：与 schemas/building_dict.py 的 lng/lat 校验同口径
_LNG_MIN, _LNG_MAX = 73.0, 136.0
_LAT_MIN, _LAT_MAX = 3.0, 54.0

# 坐标清洗条件：越界值 或 (0,0) 占位（任一坐标为 0 且另一坐标也为 0 视为占位）
_COORD_INVALID_SQL = (
    "((lng IS NOT NULL AND (lng < :lng_min OR lng > :lng_max)) "
    " OR (lat IS NOT NULL AND (lat < :lat_min OR lat > :lat_max)) "
    " OR (lng = 0 AND lat = 0))"
)


def reconcile_room_count(engine: Engine) -> None:
    """P1：一次性对账 bd_buildings.room_count（聚合 JOIN 版，幂等）.

    两个分支由 ``vals``（每楼栋一行的正确值域）同时覆盖：
    1. 有户室楼栋：``room_count`` 与 ``count(*)`` 不一致 → 以实表行数为准；
    2. 无户室楼栋：``LEFT JOIN`` 无匹配 → ``COALESCE(..., 0)`` 归零。
       第 2 点必需：纯聚合 JOIN（``FROM (SELECT building_id, count(*) GROUP BY
       building_id)``）对无户室楼栋没有产出行会漏对账，旧实现靠「逐行相关子查询
       返回 0」天然覆盖，新写法必须显式补（``vals`` 内 LEFT JOIN 保留全部楼栋行）。

    注意：不能按审查报告字面建议写成 ``FROM bd_buildings b LEFT JOIN agg`` ——
    PostgreSQL 禁止 UPDATE 目标别名在 FROM 中重复出现（``table name "b"
    specified more than once``），故以派生表 ``vals`` 承载 LEFT JOIN 补零逻辑。
    实测（530,909 楼栋 / 7,340,962 户室）：与旧冗余自连接版耗时相当（~0.66s），
    收益为消除 ``b.id = k.id`` 语义误导性自连接，对账口径不变。

    ``WHERE b.room_count IS DISTINCT FROM ...`` 保证无漂移时零写入。
    """
    with engine.begin() as conn:
        fixed = conn.execute(
            text(
                """
                WITH agg AS MATERIALIZED (
                    SELECT building_id, count(*) AS cnt
                      FROM bd_rooms
                     GROUP BY building_id
                ),
                vals AS MATERIALIZED (
                    SELECT k.id AS building_id, COALESCE(a.cnt, 0) AS cnt
                      FROM bd_buildings k
                      LEFT JOIN agg a ON a.building_id = k.id
                )
                UPDATE bd_buildings b
                   SET room_count = v.cnt
                  FROM vals v
                 WHERE b.id = v.building_id
                   AND b.room_count IS DISTINCT FROM v.cnt
                """
            )
        ).rowcount
    if fixed:
        logger.info("迁移：对账修正 %d 个楼栋的 room_count（P1 聚合 JOIN 版）", fixed)


def backfill_pending_building_community(engine: Engine) -> None:
    """H2：回填「待审小区 → 待审楼栋」存量悬挂行的归属小区（幂等）.

    仅处理父级 pending 小区已是终态（created/merged）且 ``resolved_target_id``
    指向真实存在小区的楼栋条目；回填后 ``community_id`` 非空，不再命中 WHERE。
    """
    with engine.begin() as conn:
        filled = conn.execute(
            text(
                """
                UPDATE bd_pending_entries c
                   SET community_id = p.resolved_target_id,
                       community_scope = p.resolved_target_id,
                       updated_at = now()
                  FROM bd_pending_entries p
                 WHERE c.kind = 'building'
                   AND c.status = 'pending'
                   AND c.community_id IS NULL
                   AND c.parent_is_pending = true
                   AND c.parent_id = p.id
                   AND p.kind = 'community'
                   AND p.status IN ('created', 'merged')
                   AND p.resolved_target_id IS NOT NULL
                   AND EXISTS (SELECT 1 FROM communities cm WHERE cm.id = p.resolved_target_id)
                """
            )
        ).rowcount
    if filled:
        logger.info("迁移：回填 %d 条待审楼栋的归属小区（H2 审核链断链存量）", filled)


def close_orphan_pending_references(engine: Engine) -> None:
    """H3：关闭「无回填对象」的 open 引用存量（幂等）.

    判定与 ``building_review_backfill.run_pending_backfill`` 的兜底分支一致：
    条目不存在，或条目已终态（created/merged/rejected）但 ``resolved_target_id`` 为空——
    这类引用永远等不到回填目标，必须置 ``resolved`` 否则批次永不收敛。

    ⚠️ ``status='pending'`` 的条目**不关闭**：审核通过/驳回时会由 resolve 链路回填，
    迁移提前关闭会让在途审核静默丢失单据关联（不可逆数据损坏）。
    """
    with engine.begin() as conn:
        closed = conn.execute(
            text(
                """
                UPDATE bd_pending_references r
                   SET status = 'resolved'
                 WHERE r.status = 'open'
                   AND NOT EXISTS (
                       SELECT 1 FROM bd_pending_entries e
                        WHERE e.id = r.pending_id
                          AND (e.resolved_target_id IS NOT NULL OR e.status = 'pending')
                   )
                """
            )
        ).rowcount
    if closed:
        logger.info("迁移：关闭 %d 条无回填对象的 open 引用（H3 引用账本滞留存量）", closed)


def _null_invalid_coords(engine: Engine, table: str) -> int:
    """把指定表的越界 / (0,0) 坐标置空（L3）.

    Args:
        engine: SQLAlchemy 引擎
        table: 表名（硬编码调用方传入，不接受外部输入）

    Returns:
        受影响行数

    """
    if not _column_exists(engine, table, "lng") or not _column_exists(engine, table, "lat"):
        return 0
    with engine.begin() as conn:
        affected = conn.execute(
            text(f"UPDATE {table} SET lng = NULL, lat = NULL WHERE {_COORD_INVALID_SQL}"),
            {"lng_min": _LNG_MIN, "lng_max": _LNG_MAX, "lat_min": _LAT_MIN, "lat_max": _LAT_MAX},
        ).rowcount
    if affected:
        logger.info("迁移：%s 置空 %d 条无效坐标（L3 越界 / (0,0) 占位）", table, affected)
    return affected


def null_invalid_coordinates(engine: Engine) -> None:
    """L3：清洗 communities / bd_buildings 的无效坐标（幂等：置空后不再命中）."""
    _null_invalid_coords(engine, "communities")
    _null_invalid_coords(engine, "bd_buildings")


def run_bd_audit_20261018_fixes(engine: Engine) -> None:
    """性能与安全专项审查（第二批）修复迁移入口（幂等）."""
    if engine.dialect.name != "postgresql":
        return
    reconcile_room_count(engine)
    backfill_pending_building_community(engine)
    close_orphan_pending_references(engine)
    null_invalid_coordinates(engine)
