"""v100：存量已合并小区「物业类型并集」补正（修复 v99 与运行时口径漂移）.

**缺陷**：v99 ``backfill_merged_community_profiles`` 的 ``property_types`` 只做
「主档为空 → 整列取子档」，而运行时 ``merge_community_profile`` 是「主档物业类型 +
子档物业类型 去重并集（主档在前，SPEC D4）」。于是历史已合并小区的主档只要本就
有至少一个类型，子档独有的类型在迁移后**永久缺失**（实测：主档 ``{住宅-公寓}`` +
子档 ``{住宅-新里}`` → v99 命中 0 行，主档仍是 ``{住宅-公寓}``）。这不只影响回填，
也是「历史小区与今后新合并小区」两种数据形态的分叉。

**为什么是追加迁移，而不是改 v99 的 ``_BACKFILL_SQL``**：v99 已在各环境 applied。
改 ``_BACKFILL_SQL`` 这种模块常量不会触发 checksum 校验（checksum 只覆盖迁移函数
源码），但**已执行过 v99 的环境不会重跑**，存量数据依旧是错的；改函数源码则直接
触发 ``MigrationBlockedError`` 阻断启动。仓库既有先例（v93 缺陷 → v94 追加加固）与
``docs/Base/migrations-runbook.md`` §0.1「需要改行为 → 新增追加迁移」均要求追加。

**为什么不用建议的 ``p.property_types || array(select unnest(c.property_types)
except select unnest(p.property_types))``**：``UPDATE ... FROM communities c`` 在同一
主档有多个子档时只匹配**任意一行**子档（PostgreSQL 未定义），实测主档
``{住宅-公寓}`` + 子档 ``{住宅-新里}`` / ``{住宅-别墅,住宅-公寓}`` 只得到
``{住宅-公寓,住宅-新里}``——``住宅-别墅`` 永远丢失；``EXCEPT`` 既不去重也不保序。
本迁移改为「主档与**全部**子档展开成带确定顺序的集合，再按主档在前、子档按
``created_at, id`` 依次追加去重聚合」，与运行时纯函数 ``_clean_types`` + ``_dedupe``
同口径；同时按运行时口径 ``btrim`` 裁剪首尾空白、丢弃空白元素（现网实测 72 行
``property_types`` 含重复元素，裁剪后与之同形）。

**幂等**：只更新「并集结果与现値不同」的行（``IS DISTINCT FROM``），第二次执行
命中 0 行；子档行一个字节都不改（AC-5 的前提）。

**与运行时的两点差异**（均已在 E2E 中钉住）：

1. 主档与子档**全空**时不写回 ``{}``，保留原值（``NULL`` 与空数组都表示「无类型」，
   不制造无意义写入）；
2. 子档先后顺序用 ``created_at, id``（迁移拿不到当初的 ``merge_ids`` 顺序）。运行时
   按 ``merge_ids`` 顺序，故**子档间的新增类型先后**可能与合并当时不同；集合内容
   一致（类型不增不减），且顺序确定可复现。

**可逆**：数据类改写，``reversible=False`` + ``backup="table"``（``communities``
单表）。改写前把受影响主档的画像快照写进审计日志，需要时可按快照人工回退。
"""

import logging
import re
from typing import Any

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 画像列清单的**冻结副本**（迁移不得依赖会随业务演进的服务层清单，否则旧库重跑
# 或全新库首跑会随将来的字段增删而变）。与运行时
# ``services.market.community_profile_merge.PROFILE_FIELDS`` 的一致性由
# ``tests/e2e/test_migration_community_profile_union.py`` 断言，两处都改才生效。
_UNION_PROFILE_FIELDS: tuple[str, ...] = (
    "district",
    "business_circle",
    "ring",
    "property_types",
    "era_from",
    "era_to",
    "developer",
    "property_mgmt",
    "address",
    "lng",
    "lat",
    "city_id",
)

# 列名会拼进 SELECT 列表，只允许裸标识符：将来若有人把清单改成需要转义的字符串，
# 这里直接 Fail Loud，而不是生成一条语法错误的 SQL 到线上才暴露。
_IDENTIFIER_PATTERN = re.compile(r"^[a-z][a-z0-9_]*$")

# 快照 SQL 模板：{columns} 为画像列清单，{scope} 为「要处理哪些主档」的判定片段
_SNAPSHOT_TEMPLATE = """
SELECT p.id, p.name, {columns}
  FROM communities p
 WHERE {scope}
"""

_SCOPE_WITH_ARCHIVED_CHILDREN = """EXISTS (
        SELECT 1 FROM communities c
         WHERE c.merged_into_id = p.id
           AND c.is_active = false
           AND c.id <> p.id
       )"""

_SCOPE_BY_IDS = "p.id = ANY(:ids)"

# 物业类型并集：主档在前，子档按 created_at/id 升序依次追加，去重保序。
# 子档顺序必须确定（否则同一主档两次执行的顺序可能不同，审计无法复现）。
_UNION_SQL = """
WITH archived_children AS (
    SELECT c.merged_into_id AS primary_id,
           c.property_types,
           row_number() OVER (PARTITION BY c.merged_into_id ORDER BY c.created_at, c.id) AS child_rank
      FROM communities c
     WHERE c.merged_into_id IS NOT NULL
       AND c.merged_into_id <> c.id
       AND c.is_active = false
),
child_types AS (
    SELECT a.primary_id,
           btrim(e.t) AS type_name,
           a.child_rank,
           e.ord
      FROM archived_children a
      CROSS JOIN LATERAL unnest(COALESCE(a.property_types, '{}'::text[])) WITH ORDINALITY AS e(t, ord)
     WHERE btrim(e.t) <> ''
),
primary_types AS (
    SELECT p.id AS primary_id,
           btrim(e.t) AS type_name,
           0 AS child_rank,
           e.ord
      FROM communities p
      CROSS JOIN LATERAL unnest(COALESCE(p.property_types, '{}'::text[])) WITH ORDINALITY AS e(t, ord)
     WHERE EXISTS (SELECT 1 FROM archived_children a WHERE a.primary_id = p.id)
       AND btrim(e.t) <> ''
),
first_seen AS (
    SELECT DISTINCT ON (all_types.primary_id, all_types.type_name)
           all_types.primary_id,
           all_types.type_name,
           all_types.child_rank,
           all_types.ord
      FROM (
            SELECT primary_id, type_name, child_rank, ord FROM primary_types
            UNION ALL
            SELECT primary_id, type_name, child_rank, ord FROM child_types
           ) AS all_types
     ORDER BY all_types.primary_id, all_types.type_name, all_types.child_rank, all_types.ord
),
unioned AS (
    SELECT f.primary_id,
           array_agg(f.type_name ORDER BY f.child_rank, f.ord) AS merged_types
      FROM first_seen f
     GROUP BY f.primary_id
)
UPDATE communities p
   SET property_types = u.merged_types,
       updated_at = now()
  FROM unioned u
 WHERE p.id = u.primary_id
   AND u.merged_types IS DISTINCT FROM p.property_types
"""


def _snapshot_sql(scope: str) -> str:
    """拼装快照 SQL（列名来自模块常量，值全部走绑定参数）.

    Args:
        scope: ``WHERE`` 子句的判定片段

    Returns:
        快照 SQL 文本

    Raises:
        ValueError: 画像字段名不是裸标识符（拒绝把未校验字符串拼进 SQL）

    """
    for name in _UNION_PROFILE_FIELDS:
        if not _IDENTIFIER_PATTERN.fullmatch(name):
            msg = f"v100 画像字段 {name!r} 不是合法裸标识符，拒绝拼接 SQL"
            raise ValueError(msg)
    columns = ", ".join(f"p.{name}" for name in _UNION_PROFILE_FIELDS)
    return _SNAPSHOT_TEMPLATE.format(columns=columns, scope=scope)


def _as_snapshot(rows: list[Any]) -> dict[str, dict[str, Any]]:
    """把查询结果转成 ``{主档 id: {"name": 小区名, "profile": {字段: 值}}}``.

    ``name`` 是 SQL 里**显式选取的列**、字典里**显式取用**，不参与画像字段清单的
    遍历——画像字段清单里没有 ``name``（它是 D2「保留主档」的独立字段）。若把两者
    混写成「用字段名当键去取行列」，一旦某个字段不在结果集里就会抛
    ``KeyError: Could not locate column in row for column '...'``。

    Args:
        rows: ``.mappings().all()`` 的查询结果

    Returns:
        以主档 ID 为键的快照字典

    """
    return {
        str(row["id"]): {
            "name": row["name"],
            "profile": {name: row[name] for name in _UNION_PROFILE_FIELDS},
        }
        for row in rows
    }


def backfill_merged_community_property_types(engine: Engine) -> None:
    """v100：把存量已合并子档的物业类型并进主档（并集去重保序，幂等）.

    Args:
        engine: 数据库引擎

    """
    from services.system.operation_log import operation_log_service

    before_sql = _snapshot_sql(_SCOPE_WITH_ARCHIVED_CHILDREN)
    after_sql = _snapshot_sql(_SCOPE_BY_IDS)

    with engine.begin() as conn:
        rows = conn.execute(text(before_sql)).mappings().all()
        if not rows:
            logger.info("迁移 v100：无「已合并子档 + 存活主档」组合，跳过物业类型并集补正")
            return

        before = _as_snapshot(rows)

        result = conn.execute(text(_UNION_SQL))
        affected = result.rowcount or 0

        after_rows = conn.execute(text(after_sql), {"ids": list(before)}).mappings().all()
        after = _as_snapshot(after_rows)

    # 逐主档对比「并集前后的物业类型」，只记真正变化的，避免审计里塞满未变的行
    changed: list[dict[str, Any]] = []
    for community_id, snapshot in before.items():
        before_types = snapshot["profile"]["property_types"]
        after_types = after.get(community_id, {}).get("profile", {}).get("property_types")
        if after_types == before_types:
            continue
        changed.append(
            {
                "id": community_id,
                "name": snapshot["name"],
                "before": before_types,
                "after": after_types,
            }
        )
        logger.info(
            "迁移 v100：主档「%s」物业类型并集补正 %s → %s",
            snapshot["name"],
            before_types,
            after_types,
        )

    # 审计留痕：Session **绑定到本次迁移使用的 engine**。
    # 不能用 ``db.SessionLocal``——那是进程级全局会话（指向 ``DATABASE_URL``），
    # 与调用方传入的 engine 可能是**不同的库**（测试库 / ``manage --database-url``）。
    # 实测：以测试库 engine 调用本函数时，全局 SessionLocal 仍指向 dev 库，审计被
    # 写进了用户没操作的那个库。审计必须落在「改动发生的那一侧」。
    try:
        from sqlalchemy.orm import Session

        with Session(engine) as session:
            operation_log_service.log_action(
                session,
                user_id=None,
                action="community_merge_property_types_union",
                resource_type="community",
                resource_id=None,
                before={"profiles": before},
                after={"affected_rows": affected, "property_types_union": changed},
            )
    except Exception:  # 审计失败不得阻断迁移
        logger.exception("迁移 v100：物业类型并集补正审计写入失败（迁移已生效，仅缺审计）")

    logger.info(
        "迁移 v100：物业类型并集补正完成（受影响主档 %d 个，其中并集发生变化 %d 个）",
        affected,
        len(changed),
    )
