"""回填 leads.unit_price（幂等数据迁移）.

背景：unit_price 历史上从未被自动计算（C 端 /public/leads 不传单价，
旧版 admin 录入也依赖前端计算后提交），导致大量线索 unit_price 为 NULL，
admin 单价列显示为空。本迁移把 `unit_price IS NULL AND total_price IS NOT NULL
AND area IS NOT NULL AND area > 0` 的线索回填
`unit_price = ROUND(total_price / area, 2)`。

幂等性：仅更新 unit_price 为 NULL 的行，回填后不再命中 WHERE 条件，可重复执行。
PG 的 ROUND(numeric, int) 采用四舍五入，与 Python Decimal ROUND_HALF_UP 一致。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def backfill_lead_unit_price(engine: Engine) -> None:
    """幂等回填 leads.unit_price = ROUND(total_price / area, 2).

    Args:
        engine: SQLAlchemy 引擎

    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE leads SET unit_price = ROUND(total_price / area, 2) "
                "WHERE unit_price IS NULL AND total_price IS NOT NULL "
                "AND area IS NOT NULL AND area > 0"
            )
        )
        affected = result.rowcount or 0
    if affected:
        logger.info("迁移：回填 leads.unit_price，影响 %d 行", affected)
