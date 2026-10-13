"""楼盘字典迁移（SRS §8 / R1，v1.9）.

幂等执行：
1. 建 4 张新表 bd_buildings / bd_rooms / bd_pending_entries / bd_pending_references
   （含 partial unique ``uq_pending_open`` WHERE status='pending'）
2. communities 补 11 列（lng/lat/ring/property_types text[]/era_from/era_to/
   developer/property_mgmt/address/source/merged_into_id）+ 2 个筛选/合并索引
3. projects / leads / l4_marketing_projects 各补 building_id/room_id/dict_status 三列
4. property_current.community_id 放宽为可空（BREAKING，DB 约束放宽）+ 补
   community_name 冗余列 + 三列字典关联

所有列操作经 ``_column_exists`` 幂等检查；表创建经 ``create_all(checkfirst=True)``。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists, _pg_quote_literal

logger = logging.getLogger(__name__)

# communities 补列清单：(列名, PG 类型, 注释)
_COMMUNITY_COLUMNS: list[tuple[str, str, str]] = [
    ("lng", "DOUBLE PRECISION", "经度(BD-09，原样落库)"),
    ("lat", "DOUBLE PRECISION", "纬度(BD-09，原样落库)"),
    ("ring", "VARCHAR(50)", "环线(内环内/中环内/外环内/外环外，可空)"),
    ("property_types", "TEXT[]", "物业类型列表"),
    ("era_from", "INTEGER", "建成年代起"),
    ("era_to", "INTEGER", "建成年代止"),
    ("developer", "VARCHAR(200)", "开发商"),
    ("property_mgmt", "VARCHAR(200)", "物业公司"),
    ("address", "VARCHAR(300)", "小区地址(可空)"),
    ("source", "VARCHAR(20)", "数据来源(admin/review)，import 值域废止"),
    ("merged_into_id", "VARCHAR(36)", "被并入的主小区ID(可空逻辑自指)"),
]

# 业务表补列清单：(表名, 列名, PG 类型, 注释)
_DICT_LINK_COLUMNS: list[tuple[str, str, str, str]] = [
    ("projects", "building_id", "BIGINT", "字典楼栋ID(bd_buildings，可空)"),
    ("projects", "room_id", "BIGINT", "字典户室ID(bd_rooms，可空)"),
    ("projects", "dict_status", "VARCHAR(20)", "字典关联状态: linked/manual/pending/rejected"),
    ("leads", "building_id", "BIGINT", "字典楼栋ID(bd_buildings，选填可空)"),
    ("leads", "room_id", "BIGINT", "字典户室ID(bd_rooms，选填可空)"),
    ("leads", "dict_status", "VARCHAR(20)", "字典关联状态: linked/manual/pending/rejected"),
    ("l4_marketing_projects", "building_id", "BIGINT", "字典楼栋ID(bd_buildings，选填可空)"),
    ("l4_marketing_projects", "room_id", "BIGINT", "字典户室ID(bd_rooms，选填可空)"),
    ("l4_marketing_projects", "dict_status", "VARCHAR(20)", "字典关联状态: linked/manual/pending/rejected"),
]


def _add_column(engine: Engine, table: str, column: str, ddl_type: str, comment: str) -> None:
    """幂等为表补列（带 COMMENT ON 注释，注释失败不阻塞）.

    注意：PG DDL（COMMENT ON）不支持绑定参数，注释字面量经 _pg_quote_literal 转义。
    """
    if _column_exists(engine, table, column):
        return
    logger.info("迁移：为 %s 表添加 %s 列", table, column)
    # 表名/列名/类型均来自硬编码元组，无注入风险；DDL 不支持绑定参数，注释经转义拼接
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {ddl_type}"))
        conn.execute(text(f"COMMENT ON COLUMN {table}.{column} IS {_pg_quote_literal(comment)}"))


def _create_bd_tables(engine: Engine) -> None:
    """幂等创建楼盘字典 4 张表与导入任务表（含 partial unique）."""
    from models import Base
    from models.property.bd_import_task import BdImportTask
    from models.property.building_dict import (
        BdBuilding,
        BdPendingEntry,
        BdPendingReference,
        BdRoom,
    )

    tables = [
        BdBuilding.__table__,
        BdRoom.__table__,
        BdPendingEntry.__table__,
        BdPendingReference.__table__,
        BdImportTask.__table__,
    ]

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=tables, checkfirst=True)

    # 补建索引（处理表已存在但索引缺失的部署）
    for table in tables:
        for idx in table.indexes:
            if _index_exists(engine, idx.name):
                continue
            logger.info("迁移：补建楼盘字典索引 %s", idx.name)
            idx.create(engine, checkfirst=True)

    # partial unique uq_pending_open（FR-19/BR-26 同名并发唯一）
    # 模型层用 COALESCE(parent_id, 0) 表达式（PG 唯一索引将 NULL 视为 distinct，
    # community 条目 parent_id 为 NULL 需归一），此处幂等重建
    if not _index_exists(engine, "uq_pending_open"):
        logger.info("迁移：创建 uq_pending_open 部分唯一索引")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_open "
                    "ON bd_pending_entries (kind, COALESCE(parent_id, 0), normalized_name) "
                    "WHERE status = 'pending'"
                ),
            )
    else:
        # 存量索引为旧版 (kind, parent_id, normalized_name)（NULL 不拦截）时重建为 COALESCE 版
        with engine.connect() as conn:
            idxdef = conn.execute(
                text("SELECT pg_get_indexdef(indexrelid) FROM pg_index WHERE indexrelid = 'uq_pending_open'::regclass"),
            ).scalar()
        if idxdef and "COALESCE" not in idxdef.upper():
            logger.info("迁移：重建 uq_pending_open 为 COALESCE(parent_id,0) 版本（NULL 不拦截修复）")
            with engine.begin() as conn:
                conn.execute(text("DROP INDEX IF EXISTS uq_pending_open"))
                conn.execute(
                    text(
                        "CREATE UNIQUE INDEX uq_pending_open "
                        "ON bd_pending_entries (kind, COALESCE(parent_id, 0), normalized_name) "
                        "WHERE status = 'pending'"
                    ),
                )


def _extend_communities(engine: Engine) -> None:
    """幂等扩展 communities 画像列与索引."""
    for column, ddl_type, comment in _COMMUNITY_COLUMNS:
        _add_column(engine, "communities", column, ddl_type, comment)

    # 合并信息区块查询索引（被并入主档的小区清单）
    if not _index_exists(engine, "idx_community_merged_into"):
        logger.info("迁移：创建 idx_community_merged_into 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_merged_into ON communities (merged_into_id)"))
    # 总览筛选索引（区+环线）
    if not _index_exists(engine, "idx_community_dict_filter"):
        logger.info("迁移：创建 idx_community_dict_filter 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_community_dict_filter ON communities (district, ring)"))


def _extend_business_tables(engine: Engine) -> None:
    """幂等为 projects/leads/l4_marketing_projects 补字典关联三列."""
    for table, column, ddl_type, comment in _DICT_LINK_COLUMNS:
        _add_column(engine, table, column, ddl_type, comment)


def _relax_property_current(engine: Engine) -> None:
    """放宽 property_current.community_id 可空（BREAKING）+ 补冗余列.

    - community_id：机器链路 pending 期间置空；存量 NOT NULL 约束需 DROP NOT NULL
    - community_name：小区名原文冗余列
    - building_id/room_id/dict_status：字典关联三列
    """
    # BREAKING：community_id 放宽可空 —— ALTER 本身为幂等（PG 重复执行无害），但先检查减少日志噪音
    with engine.connect() as conn:
        nullable = conn.execute(
            text(
                "SELECT is_nullable FROM information_schema.columns "
                "WHERE table_name = 'property_current' AND column_name = 'community_id' LIMIT 1"
            ),
        ).scalar()
    if nullable == "NO":
        logger.info("迁移：放宽 property_current.community_id 为可空（BREAKING）")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE property_current ALTER COLUMN community_id DROP NOT NULL"))

    _add_column(engine, "property_current", "community_name", "VARCHAR(200)", "小区名原文冗余(pending 期间必存)")
    _add_column(engine, "property_current", "building_id", "BIGINT", "字典楼栋ID(机器链路空置，可人工绑定)")
    _add_column(engine, "property_current", "room_id", "BIGINT", "字典户室ID(机器链路空置，可人工绑定)")
    _add_column(
        engine, "property_current", "dict_status", "VARCHAR(20)", "字典关联状态: linked/manual/pending/rejected"
    )

    # 房源列表「未审核」标签查询索引（dict_status 筛选）
    if not _index_exists(engine, "idx_property_dict_status"):
        logger.info("迁移：创建 idx_property_dict_status 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_property_dict_status ON property_current (dict_status)"))


def run_building_dictionary_migrations(engine: Engine) -> None:
    """楼盘字典迁移入口（幂等）.

    执行顺序：建新表 → communities 扩展 → 业务表补列 → property_current 放宽。
    """
    _create_bd_tables(engine)
    _extend_communities(engine)
    _extend_business_tables(engine)
    _relax_property_current(engine)
