"""放宽 communities.address 列宽 300→500（幂等 schema 迁移）.

背景：楼盘字典批量导入（SRS FR-08）中，个别小区的地址字段为多地址拼接串
（实测最长 388 字符，如「东体小区」），超过原 varchar(300) 导致装载失败
（StringDataRightTruncation）。放宽到 varchar(500) 留余量。

幂等性：ALTER COLUMN TYPE 对 PG 重复执行无害；已为 500 时结果不变。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 目标列宽：批量导入多地址拼接串实测最长 388，放宽到 500 留余量
_ADDRESS_MAX_LEN = 500


def widen_community_address_column(engine: Engine) -> None:
    """放宽 communities.address 到 varchar(500)."""
    with engine.begin() as conn:
        current = conn.execute(
            text(
                "SELECT character_maximum_length FROM information_schema.columns "
                "WHERE table_name = 'communities' AND column_name = 'address'"
            )
        ).scalar()
        if current is not None and int(current) >= _ADDRESS_MAX_LEN:
            return
        conn.execute(text(f"ALTER TABLE communities ALTER COLUMN address TYPE VARCHAR({_ADDRESS_MAX_LEN})"))
        logger.info("迁移：communities.address 列宽 %s → 500", current)
