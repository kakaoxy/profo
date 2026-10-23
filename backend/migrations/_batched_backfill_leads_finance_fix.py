"""v90 回填缺陷修复（追加迁移 v93，2026-10-23 审查）。

**为什么不改 v90**：v90 已 applied，改其函数体会让 checksum 漂移、启动被
``runner._verify_checksums`` 阻断（v17 本轮就是这么炸的，见同批次修复）。
故按 ``registry.py`` 的「新增迁移只能追加」口径，用一个新版本承载修复。

**v90 的两个缺陷**（均已实测复现）：

1. 步骤顺序颠倒 → ``leads.unit_price`` 永久留空：
   v90 先跑「unit_price = ROUND(total_price / area, 2)」（要求 total_price 非空），
   再跑「total_price = expected_price」。于是「total_price 为 NULL、expected_price
   有值、area 有值」的行：步骤 1 时 total_price 还是 NULL 而跳过，步骤 2 才补上
   total_price——unit_price 再无人回填。
   实测：area=100、expected_price=2000000 的行，v90 跑完 total_price=2000000.00
   但 unit_price 仍为 NULL（本应 20000.00）。

2. operator_id 回填队头阻塞：
   v90 的候选窗口是「operator_id IS NULL ORDER BY id LIMIT 500」，若窗口内没有任何
   ``operation_logs`` 命中，UPDATE 影响 0 行 → ``_batched_update`` 立即 break。
   而 operation_logs 只覆盖部分历史流水（回填本就是「仅可精确追溯部分」），
   所以首批 500 行全无命中是常态——后面本可精确回填的流水永远不会被处理。
   实测：500 行无日志 + 1 行有日志（id 排最后）→ 跑完该行 operator_id 仍为 NULL。

**本迁移的修复**：步骤 1/2 互换（先补 total_price 再算 unit_price），并让两条
回填都用「keyset 游标 + 目标集合驱动」的循环——候选由**待回填目标**决定，
只要还有目标就继续推进游标，不再因为某一批没命中而提前终止。

幂等：每条 UPDATE 都带「目标列为 NULL」条件，重复执行命中 0 行。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _MIGRATION_BATCH_SIZE

logger = logging.getLogger(__name__)


def _cursor_batch_update(
    engine: Engine,
    *,
    table: str,
    where_sql: str,
    update_sql: str,
    label: str,
) -> int:
    """按 id 游标推进的批量回填（目标驱动，不会因某批 0 命中而提前终止）.

    **为什么不用「单条 SQL + ``(:after_id IS NULL OR id > :after_id)``」**（2026-10-23 修正）：
    该写法在 PostgreSQL 上直接报 ``AmbiguousParameter: could not determine data type
    of parameter $1``——``$1 IS NULL`` 里参数没有任何类型上下文，PG 无法推断其类型，
    于是整条语句在**首次执行**就抛错（纯 psql 用 ``PREPARE p AS ... $1 IS NULL ...``
    同样报错，与本项目/驱动无关）。因此**必须**拆成两条 SQL：

    - 首批：不带游标条件，参数只有 ``:batch``，无歧义；
    - 后续批：``id > :after_id`` 有明确比较上下文，PG 可直接从 ``id`` 推断参数类型，
      **无需任何 CAST**。

    这样既避免了 ``CAST(:after_id AS ...)`` 这种为绕过歧义而加的写法（顺带让
    varchar / uuid 两种 id 列共用同一实现，不必分别为每种类型选 CAST 目标类型），
    又保证每批只扫 ``id`` 之后的行。

    Args:
        engine: SQLAlchemy 引擎。
        table: 目标表名（常量，非用户输入）。
        where_sql: 回填目标的过滤条件（如 ``total_price IS NULL AND ...``），
            会被拼进 ``WHERE`` 子句；**不得包含**绑定参数。
        update_sql: 回填 UPDATE，须含 ``:id`` 绑定参数。
        label: 日志标签。

    Returns:
        总影响行数。

    """
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


def backfill_lead_and_operator_reachability(engine: Engine) -> None:
    """修复 v90 的两处回填缺口（幂等，可重复执行）.

    Args:
        engine: SQLAlchemy 引擎。

    """
    # ── 1. 先补 total_price（v90 的步骤 2 提前），让下一步的 unit_price 有输入 ──
    _cursor_batch_update(
        engine,
        table="leads",
        where_sql="total_price IS NULL AND expected_price IS NOT NULL",
        update_sql="UPDATE leads SET total_price = expected_price WHERE id = :id AND total_price IS NULL",
        label="leads.total_price=expected_price",
    )

    # ── 2. 再算 unit_price（此时 total_price 已补齐，v90 漏掉的行能被覆盖） ──
    _cursor_batch_update(
        engine,
        table="leads",
        where_sql="unit_price IS NULL AND total_price IS NOT NULL AND area IS NOT NULL AND area > 0",
        update_sql="UPDATE leads SET unit_price = ROUND(total_price / area, 2) WHERE id = :id AND unit_price IS NULL",
        label="leads.unit_price",
    )

    # ── 3. operator_id：目标集合驱动（候选=仍有 NULL 的流水），不再因单批 0 命中而终止 ──
    # 只回填「operation_logs 里有精确来源」的流水；EXISTS 让无来源的行自然跳过（保持 NULL）。
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
