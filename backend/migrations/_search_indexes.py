"""模糊搜索 pg_trgm GIN 索引迁移（O1：前导通配符 LIKE 全表扫描）.

背景：各列表搜索使用 ``func.lower(col).like('%kw%')``（前导通配符 + 函数包装），
PostgreSQL btree 索引无法命中，数据量增长后退化为顺序扫描。trigram GIN 表达式
索引 ``GIN (lower(col) gin_trgm_ops)`` 可加速该模式；不带 lower 的
``col LIKE '%kw%'``（报表小区筛选等既有查询）由 ``GIN (col gin_trgm_ops)`` 加速。

- pg_trgm 在 PG 13+ 为 trusted extension（本项目 PG16 官方镜像自带 contrib），
  数据库 owner 即可安装；
- 多列 GIN 支持任意列子集条件（含同一索引跨列 OR），按表合并建索引控制数量；
- 索引表达式必须与查询侧 ``func.lower(col)`` 生成的 SQL 逐字一致才能命中；
- roles.name 搜索（系统角色表，行数个位数）数据量可控，不建索引；
- 幂等：``_index_exists`` 检查 + ``CREATE INDEX IF NOT EXISTS`` 双保险；
  非 PostgreSQL 后端（临时 SQLite 测试）直接跳过。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _index_exists

logger = logging.getLogger(__name__)

# (索引名, 表名, 索引表达式元组)——均为模块内硬编码常量，无外部输入拼接
_TRGM_SEARCH_INDEXES: list[tuple[str, str, tuple[str, ...]]] = [
    # 线索列表搜索：search(小区名)/district/layout/floor（services/leads/internal/query.py）
    (
        "idx_leads_trgm_search",
        "leads",
        ("lower(community_name)", "lower(district)", "lower(layout)", "lower(floor_info)"),
    ),
    # 楼盘字典联想：q 匹配小区名/商圈，带 lower（services/market/property_service.py）；
    # 同索引覆盖按名称精确 like（community_service，lower(name) 无通配符，trgm 同样加速）
    (
        "idx_communities_name_lower_trgm",
        "communities",
        ("lower(name)", "lower(business_circle)"),
    ),
    # 小区名称筛选：报表 filter_builder / market filters / 小区列表，不带 lower
    ("idx_communities_name_trgm", "communities", ("name",)),
    # 商圈筛选：C端 L4 搜索按商圈 like（services/marketing/public.py，join communities，不带 lower）
    ("idx_communities_business_circle_trgm", "communities", ("business_circle",)),
    # L4 公共搜索：小区名 like（services/marketing/public.py _apply_keyword_floor_filters，
    # 不带 lower 的普通三元组；带 lower 的查询走姓名/商圈列）
    (
        "idx_l4_marketing_projects_community_name_trgm",
        "l4_marketing_projects",
        ("community_name",),
    ),
    # 跟投记录搜索：项目编码/项目名（services/investment/records.py）
    (
        "idx_investments_trgm_search",
        "investments",
        ("lower(project_code)", "lower(project_name)"),
    ),
    # 项目搜索：小区名/地址（资金账本 ledger、项目列表、跟投跨表关联）
    (
        "idx_projects_trgm_search",
        "projects",
        ("lower(community_name)", "lower(address)"),
    ),
    # 合同号搜索（资金账本 ledger、项目列表）
    ("idx_project_contracts_trgm_search", "project_contracts", ("lower(contract_no)",)),
    # 用户搜索：昵称/用户名（services/system/user/core.py）
    ("idx_users_trgm_search", "users", ("lower(nickname)", "lower(username)")),
]


def add_trgm_search_indexes(engine: Engine) -> None:
    """为模糊搜索列创建 pg_trgm GIN 索引（O1，幂等）.

    - 先安装 pg_trgm 扩展（IF NOT EXISTS 幂等）；
    - 逐个经 ``_index_exists`` 检查后创建，多列 GIN 覆盖同表多个搜索列；
    - 非 PostgreSQL 后端跳过。
    """
    if engine.dialect.name != "postgresql":
        return

    with engine.begin() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS pg_trgm"))

    for index_name, table, expressions in _TRGM_SEARCH_INDEXES:
        if _index_exists(engine, index_name):
            continue
        columns = ", ".join(f"{expr} gin_trgm_ops" for expr in expressions)
        logger.info("迁移：创建 %s 索引 USING GIN (%s)", index_name, columns)
        with engine.begin() as conn:
            conn.execute(
                text(f"CREATE INDEX IF NOT EXISTS {index_name} ON {table} USING GIN ({columns})"),
            )
