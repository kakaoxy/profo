"""v93 游标实现的加固迁移（v94，2026-10-23 审查）。

**为什么是新增迁移，而不是改 v93**：v93 已 applied（生产账本 checksum
``3dd6f52e…``）。修改已应用的迁移会让 ``runner._verify_checksums`` 阻断启动，
表现为 ``deploy-local.sh`` 报「backend 健康状态为 unhealthy」（120s 超时）——
本项目已因同类操作真实踩坑两次。故两处加固都放进**新的追加迁移**，
v93 的源码保持与生产账本完全一致。

**本迁移修的两点**（都不是 v93 的运行时缺陷，而是实现层加固）：

1. 去 CAST：v93 用「单条 SQL + ``CAST(:after_id AS text)``」绕过参数类型歧义。
   之所以要 CAST，是因为 ``:after_id IS NULL`` 里的参数没有任何类型上下文，
   PostgreSQL 无法推断（纯 psql 的 ``PREPARE p AS ... $1 IS NULL ...`` 同样报
   ``could not determine data type of parameter $1``）。但 CAST 需要按列类型
   分别选目标类型（leads.id 是 varchar、finance_records.id 是 uuid），易错且啰嗦。
   本迁移改为「**首批不带游标条件 / 后续批 ``id > :after_id`` 裸参数**」两条 SQL：
   首批只有 ``:batch``（无歧义），后续批有明确比较上下文（PG 可自行推断类型），
   从而**彻底不需要 CAST**，且两种 id 类型共用同一实现。

2. 表名白名单：表名是 SQL **标识符**，不能用 ``_pg_quote_literal``（那是字符串
   字面量转义，会生成 ``FROM 'leads'`` 直接语法错误），项目也没有 quote_ident
   类工具。故把允许拼接的表名收敛为 ``_ALLOWED_TABLES`` 常量集合，误传即
   ``ValueError``（Fail Loud），而不是等到执行期才暴露 SQL 语法错误。

幂等：与 v93 相同——每条 UPDATE 都带「目标列为 NULL」条件，重复执行命中 0 行；
且 v93 已把能补的行补完，本迁移在存量库上通常直接命中 0 行。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _MIGRATION_BATCH_SIZE

logger = logging.getLogger(__name__)

# 允许被拼接进 SQL 的表名白名单（本迁移只回填这两张表）。
# 表名是 SQL 标识符，不能走 ``_pg_quote_literal``（字符串字面量转义，
# 会生成 ``FROM 'leads'`` → 语法错误）；项目亦无 quote_ident 类工具。
# 故用白名单把「可能的取值」收敛为常量集合，误传即 Fail Loud。
_ALLOWED_TABLES: frozenset[str] = frozenset({"leads", "finance_records"})


def _cursor_batch_update(
    engine: Engine,
    *,
    table: str,
    where_sql: str,
    update_sql: str,
    label: str,
) -> int:
    """按 id 游标推进的批量回填（目标驱动，不会因某批 0 命中而提前终止）.

    **为什么不用「单条 SQL + ``(:after_id IS NULL OR id > :after_id)``」**：该写法在
    PostgreSQL 上直接报 ``AmbiguousParameter: could not determine data type of
    parameter $1``——``$1 IS NULL`` 里参数没有任何类型上下文，PG 无法推断其类型，
    于是整条语句在**首次执行**就抛错（纯 psql 的 ``PREPARE ... $1 IS NULL`` 同样报错，
    与本项目/驱动无关）。因此**必须**拆成两条 SQL：

    - 首批：不带游标条件，参数只有 ``:batch``，无歧义；
    - 后续批：``id > :after_id`` 有明确比较上下文，PG 可直接从 ``id`` 推断参数类型，
      **无需任何 CAST**。

    Args:
        engine: SQLAlchemy 引擎。
        table: 目标表名，**必须是 ``_ALLOWED_TABLES`` 中的一项**（白名单，非用户输入）。
        where_sql: 回填目标的过滤条件（如 ``total_price IS NULL AND ...``），
            会被拼进 ``WHERE`` 子句；**不得包含**绑定参数。
        update_sql: 回填 UPDATE，须含 ``:id`` 绑定参数。
        label: 日志标签。

    Returns:
        总影响行数。

    Raises:
        ValueError: ``table`` 不在白名单内（Fail Loud，避免拼出语法错误的 SQL）。

    """
    if table not in _ALLOWED_TABLES:
        msg = f"表名 {table!r} 不在允许列表 {sorted(_ALLOWED_TABLES)} 中（禁止拼接未知标识符）"
        raise ValueError(msg)

    base = f"FROM {table} WHERE {where_sql}"
    first_sql = f"SELECT id {base} ORDER BY id LIMIT :batch"
    next_sql = f"SELECT id {base} AND id > :after_id ORDER BY id LIMIT :batch"
    total = 0
    after_id: str | None = None
    while True:
        with engine.begin() as conn:
            if after_id is None:
                rows = conn.execute(text(first_sql), {"batch": _MIGRATION_BATCH_SIZE}).all()
            else:
                rows = conn.execute(
                    text(next_sql),
                    {"after_id": after_id, "batch": _MIGRATION_BATCH_SIZE},
                ).all()
        if not rows:
            break
        # 游标推进到本批最后一行：即使本批全部未命中，也保证继续向后扫描
        after_id = rows[-1][0]
        with engine.begin() as conn:
            for row in rows:
                total += conn.execute(text(update_sql), {"id": row[0]}).rowcount or 0
        if len(rows) < _MIGRATION_BATCH_SIZE:
            break
    if total:
        logger.info("迁移：%s 回填 %d 行", label, total)
    else:
        logger.debug("迁移：%s 无需回填", label)
    return total


def backfill_leads_and_operator_hardened(engine: Engine) -> None:
    """以加固后的游标实现重跑同一组回填（幂等）.

    与 v93 的语义完全一致（同样的三组 UPDATE），只是换用「无 CAST + 表名白名单」
    的实现。在 v93 已 applied 的库上，可补的行已被补过，本函数通常直接命中 0 行，
    起到**兜底复核**作用；若期间又产生可回填行（如新导入数据），也会在此被覆盖。

    Args:
        engine: SQLAlchemy 引擎。

    """
    # ── 1. 先补 total_price，让下一步的 unit_price 有输入 ──
    _cursor_batch_update(
        engine,
        table="leads",
        where_sql="total_price IS NULL AND expected_price IS NOT NULL",
        update_sql="UPDATE leads SET total_price = expected_price WHERE id = :id AND total_price IS NULL",
        label="leads.total_price=expected_price",
    )

    # ── 2. 再算 unit_price（此时 total_price 已补齐）──
    _cursor_batch_update(
        engine,
        table="leads",
        where_sql="unit_price IS NULL AND total_price IS NOT NULL AND area IS NOT NULL AND area > 0",
        update_sql="UPDATE leads SET unit_price = ROUND(total_price / area, 2) WHERE id = :id AND unit_price IS NULL",
        label="leads.unit_price",
    )

    # ── 3. operator_id：只回填 operation_logs 里有精确来源的流水 ──
    _cursor_batch_update(
        engine,
        table="finance_records",
        where_sql="operator_id IS NULL",
        update_sql=(
            "UPDATE finance_records fr "
            "SET operator_id = ("
            "  SELECT ol.user_id FROM operation_logs ol "
            "  WHERE ol.resource_type = 'project_finance' AND ol.action = 'create' "
            "    AND ol.user_id IS NOT NULL AND ol.resource_id = fr.id::text "
            "  ORDER BY ol.created_at ASC LIMIT 1"
            ") "
            "WHERE fr.id = :id AND fr.operator_id IS NULL "
            "AND EXISTS ("
            "  SELECT 1 FROM operation_logs ol WHERE ol.resource_type = 'project_finance' "
            "    AND ol.action = 'create' AND ol.user_id IS NOT NULL "
            "    AND ol.resource_id = fr.id::text"
            ")"
        ),
        label="finance_records.operator_id",
    )
