"""v50 ``backfill_lead_unit_price`` 的 B 级补偿脚本（总纲 §9.2 MVP 之一）.

**正向语义**（``migrations/backfill_lead_unit_price.py``）：
``unit_price = ROUND(total_price / area, 2)``，条件 ``unit_price IS NULL AND
total_price IS NOT NULL AND area IS NOT NULL AND area > 0``。

**反向语义的精确边界**：迁移只填了「原本为 NULL」的行，所以严格的反向操作是
「把这些行改回 NULL」。但迁移后业务会继续写入新的 ``unit_price``，因此单纯
``SET unit_price = NULL`` 会误伤迁移后新增的业务数据。

本脚本采用**可核验的近似反向**：只清空「值恰好等于 ROUND(total_price/area,2)」的
行——即「看起来确实由本迁移算出、且业务未改写」的行。若某行业务已手工改过单价，
其值不等于公式结果，脚本**不会**动它（宁可少清，不可误清）。
dry-run 会同时报告「公式匹配行数」与「不匹配的已填行数」，供操作者判断。
"""

from sqlalchemy import text
from sqlalchemy.engine import Connection

from migrations.compensations.base import CompensationContext, CompensationResult

# 公式匹配条件（与正向迁移同口径：ROUND(numeric, int) 四舍五入）
_MATCH = (
    "unit_price IS NOT NULL AND total_price IS NOT NULL AND area IS NOT NULL AND area > 0 "
    "AND unit_price = ROUND(total_price / area, 2)"
)


def compensate(conn: Connection, ctx: CompensationContext) -> CompensationResult:
    """补偿 v50：清空「公式可复现」的 leads.unit_price（dry-run 只统计）.

    Args:
        conn: 执行器开启的事务连接（禁止自行 commit）。
        ctx: 补偿上下文。

    Returns:
        影响行数 + 说明。

    """
    matched = int(conn.execute(text(f"SELECT count(*) FROM leads WHERE {_MATCH}")).scalar() or 0)
    others = int(
        conn.execute(
            text(
                "SELECT count(*) FROM leads WHERE unit_price IS NOT NULL "
                "AND NOT (total_price IS NOT NULL AND area IS NOT NULL AND area > 0 "
                "AND unit_price = ROUND(total_price / area, 2))",
            ),
        ).scalar()
        or 0,
    )
    if ctx.dry_run:
        return CompensationResult(
            affected_rows=matched,
            notes=f"将清空 {matched} 行公式匹配单价；{others} 行已填但非公式值（业务改写），保持不变",
        )
    result = conn.execute(text(f"UPDATE leads SET unit_price = NULL WHERE {_MATCH}"))
    rows = int(result.rowcount or 0)
    return CompensationResult(
        affected_rows=rows,
        notes=f"已清空 {rows} 行公式匹配单价；跳过 {others} 行业务改写值（保守反向，可能需要 restore 全量回退）",
    )
