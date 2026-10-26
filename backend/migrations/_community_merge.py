"""小区合并可逆标记列迁移（v98，SPEC community-merge-union §7.1）.

**为什么需要**：合并要把「子档的户型图 / 待审条目 / 竞品边」改指主档，否则这些数据
留在已归档子档上（详情 404、`merged_children` 不吐画像与资产）＝运营视角的「数据丢了」。
改指必须可逆（解除合并要能归位），故沿用 ``bd_buildings.origin_community_id`` 的
既有模式（SPEC D9：不引入通用 ledger 表，禁止两套机制混用）。

**幂等**：三列均走 ``_column_exists`` 判定后 ``ADD COLUMN IF NOT EXISTS``；
三个索引走 ``_index_exists`` 判定。重复执行无副作用。

**DDL 与 ORM 逐列一致**：全新库由 ``create_all`` 建、既有库由本迁移建。
本文件只加可空 ``VARCHAR(36)`` 列 + 普通索引，与三个模型的 ``Mapped[str | None]`` 一致。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists

logger = logging.getLogger(__name__)

# 三元组：表名、列名、索引名、列注释
_ORIGIN_COLUMNS: tuple[tuple[str, str, str, str], ...] = (
    (
        "community_images",
        "origin_community_id",
        "idx_community_image_origin",
        "合并前原归属小区ID(仅合并迁移过的户型图有值，解除合并时据此可逆)",
    ),
    (
        "bd_pending_entries",
        "origin_community_id",
        "idx_bd_pending_origin",
        "合并前原归属小区ID(仅合并迁移过的待审条目有值，解除合并时据此可逆)",
    ),
    (
        "community_competitors",
        "origin_community_id",
        "idx_community_competitor_origin",
        "合并前原 owner 小区ID(仅合并迁移过的竞品边有值，解除合并时据此可逆)",
    ),
)


def add_community_merge_origin_columns(engine: Engine) -> None:
    """v98：三张关联表补 ``origin_community_id`` 列与索引（幂等）.

    Args:
        engine: 数据库引擎

    """
    for table, column, index_name, comment in _ORIGIN_COLUMNS:
        if not _column_exists(engine, table, column):
            logger.info("迁移 v98：%s 补 %s 列（合并可逆标记）", table, column)
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {column} VARCHAR(36)"))
                conn.execute(text(f"COMMENT ON COLUMN {table}.{column} IS '{comment}'"))

        if not _index_exists(engine, index_name):
            logger.info("迁移 v98：创建索引 %s", index_name)
            with engine.begin() as conn:
                conn.execute(text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} ({column})"))

    logger.info("迁移 v98：小区合并可逆标记列已就位")


# 画像回填的字段清单（顺序即 SQL 与日志的展示顺序）
_PROFILE_BACKFILL_FIELDS: tuple[str, ...] = (
    "ring",
    "property_types",
    "era_from",
    "era_to",
    "developer",
    "property_mgmt",
    "address",
    "lng",
    "lat",
    "business_circle",
    "district",
    "city_id",
)

# 逐字段「主档为空而子档非空」的判定（COALESCE 只在主档为空时取值）
_BACKFILL_SQL = """
UPDATE communities p
   SET ring            = COALESCE(p.ring, c.ring),
       property_types  = CASE WHEN COALESCE(array_length(p.property_types, 1), 0) = 0
                              THEN c.property_types ELSE p.property_types END,
       era_from        = COALESCE(p.era_from, c.era_from),
       era_to          = COALESCE(p.era_to, c.era_to),
       developer       = COALESCE(NULLIF(p.developer, ''), c.developer),
       property_mgmt   = COALESCE(NULLIF(p.property_mgmt, ''), c.property_mgmt),
       address         = COALESCE(NULLIF(p.address, ''), c.address),
       lng             = COALESCE(p.lng, c.lng),
       lat             = COALESCE(p.lat, c.lat),
       business_circle = COALESCE(NULLIF(p.business_circle, ''), c.business_circle),
       district        = COALESCE(NULLIF(p.district, ''), c.district),
       city_id         = COALESCE(p.city_id, c.city_id),
       updated_at      = now()
  FROM communities c
 WHERE c.merged_into_id = p.id
   AND c.is_active = false
   AND c.id <> p.id
   AND (
        (p.ring IS NULL AND c.ring IS NOT NULL)
     OR (COALESCE(array_length(p.property_types, 1), 0) = 0
         AND COALESCE(array_length(c.property_types, 1), 0) > 0)
     OR (p.era_from IS NULL AND c.era_from IS NOT NULL)
     OR (p.era_to IS NULL AND c.era_to IS NOT NULL)
     OR (COALESCE(p.developer, '') = '' AND COALESCE(c.developer, '') <> '')
     OR (COALESCE(p.property_mgmt, '') = '' AND COALESCE(c.property_mgmt, '') <> '')
     OR (COALESCE(p.address, '') = '' AND COALESCE(c.address, '') <> '')
     OR (p.lng IS NULL AND c.lng IS NOT NULL)
     OR (p.lat IS NULL AND c.lat IS NOT NULL)
     OR (COALESCE(p.business_circle, '') = '' AND COALESCE(c.business_circle, '') <> '')
     OR (COALESCE(p.district, '') = '' AND COALESCE(c.district, '') <> '')
     OR (p.city_id IS NULL AND c.city_id IS NOT NULL)
   )
"""

# 回填前快照（审计留痕 + 幂等自检用）
_SNAPSHOT_SQL = """
SELECT p.id, p.name,
       jsonb_build_object(
         'ring', p.ring, 'property_types', p.property_types, 'era_from', p.era_from,
         'era_to', p.era_to, 'developer', p.developer, 'property_mgmt', p.property_mgmt,
         'address', p.address, 'lng', p.lng, 'lat', p.lat,
         'business_circle', p.business_circle, 'district', p.district, 'city_id', p.city_id
       ) AS before
  FROM communities p
 WHERE EXISTS (
        SELECT 1 FROM communities c
         WHERE c.merged_into_id = p.id AND c.is_active = false AND c.id <> p.id
       )
"""

# 无 merged_into_id 的历史归档小区（无关系可判定，仅登记供人工核对）
_LEGACY_ARCHIVED_SQL = """
SELECT id, name FROM communities WHERE is_active = false AND merged_into_id IS NULL ORDER BY name
"""


def backfill_merged_community_profiles(engine: Engine) -> None:
    """v99：把存量归档子档的画像回填到主档（幂等，主档优先）.

    **背景**：合并长期未做画像合集（SPEC `community-merge-union` §1），历史上已合并的
    子档画像滞留在 `is_active=false` 行上，主档全空。本迁移按与运行时同一口径
    （主档非空值不覆盖）一次性补齐。

    **幂等**：`COALESCE(主档, 子档)` 与 `CASE WHEN 主档为空` 均为幂等表达式，
    连跑两次结果一致；第二次的 `WHERE` 全部不成立 → 影响 0 行。

    **可逆**：数据类改写，`reversible=False` + `backup="table"`（`communities` 单表）。
    回填前把受影响主档的画像快照写进审计日志，需要时可按快照人工回退。

    Args:
        engine: 数据库引擎

    """
    from services.system.operation_log import operation_log_service

    with engine.begin() as conn:
        rows = conn.execute(text(_SNAPSHOT_SQL)).mappings().all()
        if not rows:
            logger.info("迁移 v99：无「已合并子档 + 存活主档」组合，跳过画像回填")
            return

        before = {str(row["id"]): {"name": row["name"], "profile": row["before"]} for row in rows}

        result = conn.execute(text(_BACKFILL_SQL))
        affected = result.rowcount or 0

        after_rows = (
            conn.execute(
                text(
                    """
                SELECT id, ring, property_types, era_from, era_to, developer, property_mgmt,
                       address, lng, lat, business_circle, district, city_id
                  FROM communities WHERE id = ANY(:ids)
                """
                ),
                {"ids": list(before)},
            )
            .mappings()
            .all()
        )

        legacy = conn.execute(text(_LEGACY_ARCHIVED_SQL)).mappings().all()

    # 逐字段取名：``name`` 是**循环变量**（取值来自 ``_PROFILE_BACKFILL_FIELDS``，其中
    # 不含字面量 'name'），不是 `row['name']`。两者不可混写——若把这里改成字面量
    # ``row["name"]``，本查询没选该列会直接 `KeyError: Could not locate column in row`。
    # 小区名（用于日志/审计）由 ``_SNAPSHOT_SQL`` 显式选出，并在 ``before`` 里作为
    # 独立键 ``"name"`` 取用（见上方 ``row["name"]``）。
    after = {
        str(row["id"]): {name: row[name] for name in _PROFILE_BACKFILL_FIELDS if name in row} for row in after_rows
    }

    filled_detail: dict[str, list[str]] = {}
    for community_id, snapshot in before.items():
        changed = [
            name
            for name in _PROFILE_BACKFILL_FIELDS
            if after.get(community_id, {}).get(name) != snapshot["profile"].get(name)
        ]
        if changed:
            filled_detail[snapshot["name"]] = changed
            logger.info("迁移 v99：主档「%s」补入画像 %s", snapshot["name"], changed)

    if legacy:
        logger.warning(
            "迁移 v99：存在 %d 个无 merged_into_id 的历史归档小区（无关系可判定，未回填）：%s",
            len(legacy),
            ", ".join(str(row["name"]) for row in legacy[:20]),
        )

    # 审计留痕（独立 Session：迁移上下文不持有 ORM Session）
    try:
        from db import SessionLocal

        with SessionLocal() as session:
            operation_log_service.log_action(
                session,
                user_id=None,
                action="community_merge_profile_backfill",
                resource_type="community",
                resource_id=None,
                before={"profiles": before},
                after={
                    "affected_rows": affected,
                    "filled": filled_detail,
                    "legacy_archived_skipped": [str(row["name"]) for row in legacy],
                },
            )
    except Exception:  # 审计失败不得阻断迁移
        logger.exception("迁移 v99：画像回填审计写入失败（迁移已生效，仅缺审计）")

    logger.info(
        "迁移 v99：画像回填完成（受影响主档 %d 个，实际补入 %d 个；历史归档未处理 %d 个）",
        affected,
        len(filled_detail),
        len(legacy),
    )
