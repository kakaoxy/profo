"""回填 leads.total_price 为 expected_price（幂等数据迁移）.

背景：C 端 /public/leads 提交「心理预期价」 historically 仅写入 expected_price，
未写入 total_price，导致 admin 总价列对历史线索显示为空。本迁移把
`total_price IS NULL AND expected_price IS NOT NULL` 的线索回填
`total_price = expected_price`，使历史线索总价列正确展示业主报价。

幂等性：仅更新 total_price 为 NULL 的行，回填后不再命中 WHERE 条件，可重复执行。
不回填 lead_price_history：历史线索的初始报价时间/创建人语义难以准确还原，
避免伪造审计数据；总价列显示仅需 leads.total_price 有值即可。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def backfill_lead_total_price_from_expected(engine: Engine) -> None:
    """幂等回填 leads.total_price = expected_price（仅 total_price 为 NULL 的行）.

    Args:
        engine: SQLAlchemy 引擎

    """
    with engine.begin() as conn:
        result = conn.execute(
            text(
                "UPDATE leads SET total_price = expected_price WHERE total_price IS NULL AND expected_price IS NOT NULL"
            )
        )
        affected = result.rowcount or 0
    if affected:
        logger.info("迁移：回填 leads.total_price = expected_price，影响 %d 行", affected)
