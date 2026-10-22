"""批量回填 leads.unit_price / leads.total_price / finance_records 三类历史 NULL 数据.

M1–M3 修复（2026-10-22 审查）：原 backfill_lead_unit_price / backfill_lead_total_price_from_expected /
close_orphan_finance_records / backfill_finance_record_operator 四个历史迁移为整表单条 UPDATE，
在大表上长时间持锁、拉长启动窗口。本迁移以「按主键游标分批」的方式补齐同样的回填语义：

- leads.unit_price = ROUND(total_price / area, 2)（仅 unit_price IS NULL 且 total_price/area 有效）
- leads.total_price = expected_price（仅 total_price IS NULL 且 expected_price IS NOT NULL）
- finance_records 软删收敛：所属项目已删的活跃流水一并软删
- finance_records.operator_id 回填：从 operation_logs 精确追溯（action=create, resource_type=project_finance）

幂等性：各分批循环仅命中 NULL / 软删目标行，回填完成后重复执行命中 0 行。
分批：每批 _MIGRATION_BATCH_SIZE 行，批间独立事务，避免长事务持锁。
历史迁移不改动（M1–M3 验收口径：禁止修改已注册迁移）；本迁移对已由历史迁移
回填过的库命中 0 行，仅对漏网行为兜底。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _MIGRATION_BATCH_SIZE

logger = logging.getLogger(__name__)


def _batched_update(engine: Engine, update_sql: str) -> int:
    """按 id 游标反复执行 LIMIT :batch 的 UPDATE，返回总影响行数.

    Args:
        engine: SQLAlchemy 引擎
        update_sql: 必须含 ``:batch`` 绑定参数、子查询内 ``ORDER BY id LIMIT :batch`` 的 UPDATE

    """
    total = 0
    while True:
        with engine.begin() as conn:
            result = conn.execute(text(update_sql), {"batch": _MIGRATION_BATCH_SIZE})
            affected = result.rowcount or 0
        total += affected
        if affected < _MIGRATION_BATCH_SIZE:
            break
    return total


def batched_backfill_leads_and_finance(engine: Engine) -> None:
    """分批回填 leads 单价/总价、收敛 finance_records 孤儿流水与记账人（幂等）.

    Args:
        engine: SQLAlchemy 引擎

    """
    # 1. leads.unit_price
    n = _batched_update(
        engine,
        "UPDATE leads SET unit_price = ROUND(total_price / area, 2) "
        "WHERE id IN ("
        "  SELECT id FROM leads"
        "  WHERE unit_price IS NULL AND total_price IS NOT NULL"
        "  AND area IS NOT NULL AND area > 0"
        "  ORDER BY id LIMIT :batch"
        ")",
    )
    if n:
        logger.info("迁移：分批回填 leads.unit_price，影响 %d 行", n)

    # 2. leads.total_price = expected_price
    n = _batched_update(
        engine,
        "UPDATE leads SET total_price = expected_price "
        "WHERE id IN ("
        "  SELECT id FROM leads"
        "  WHERE total_price IS NULL AND expected_price IS NOT NULL"
        "  ORDER BY id LIMIT :batch"
        ")",
    )
    if n:
        logger.info("迁移：分批回填 leads.total_price = expected_price，影响 %d 行", n)

    # 3. finance_records：所属项目已删的活跃流水软删收敛
    n = _batched_update(
        engine,
        "UPDATE finance_records fr SET is_deleted = TRUE, updated_at = NOW() "
        "WHERE fr.id IN ("
        "  SELECT fr2.id FROM finance_records fr2 "
        "  JOIN projects p ON fr2.project_id = p.id "
        "  WHERE p.is_deleted = TRUE AND fr2.is_deleted = FALSE "
        "  ORDER BY fr2.id LIMIT :batch"
        ")",
    )
    if n:
        logger.info("迁移：分批收敛 %d 条所属项目已删除的孤儿流水（软删）", n)

    # 4. finance_records.operator_id 回填（仅可精确追溯部分）
    n = _batched_update(
        engine,
        "UPDATE finance_records fr "
        "SET operator_id = ol.user_id, updated_at = NOW() "
        "FROM ("
        "  SELECT DISTINCT ON (resource_id) resource_id, user_id "
        "  FROM operation_logs "
        "  WHERE resource_type = 'project_finance' "
        "    AND action = 'create' "
        "    AND user_id IS NOT NULL "
        "  ORDER BY resource_id, created_at ASC"
        ") ol "
        "WHERE fr.id::text = ol.resource_id "
        "  AND fr.operator_id IS NULL "
        "  AND fr.id IN ("
        "    SELECT fr2.id FROM finance_records fr2 "
        "    WHERE fr2.operator_id IS NULL "
        "    ORDER BY fr2.id LIMIT :batch"
        "  )",
    )
    if n:
        logger.info("迁移：分批回填 %d 条流水的记账人（来源 operation_logs）", n)
