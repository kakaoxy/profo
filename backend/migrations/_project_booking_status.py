"""project_bookings 预约状态列迁移.

为 project_bookings 表添加 status 列（幂等），存储统一 5 态值
（new/contacted/high_intent/converted/eliminated）。存量数据由
``NOT NULL DEFAULT 'new'`` 一步回填（PostgreSQL ADD COLUMN 带常量 DEFAULT
为元数据级变更，不重写全表）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)


def add_project_booking_status_column(engine: Engine) -> None:
    """为 project_bookings 表添加 status 列（幂等）.

    - status VARCHAR(20) NOT NULL DEFAULT 'new'：ADD COLUMN 一步完成存量回填
    - 状态筛选与 idx_project_bookings_referrer 配合使用，不单独建索引
    """
    if _column_exists(engine, "project_bookings", "status"):
        return
    logger.info("迁移：为 project_bookings 表添加 status 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_bookings ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'new'"))
