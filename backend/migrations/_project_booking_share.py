"""房源预约与分享归因迁移.

幂等创建「房源预约与分享归因闭环」5 张表：
- 房源侧：``project_bookings``（预约）/ ``project_visits`` / ``project_share_events``（埋点）
- 评估侧：``valuation_visits`` / ``valuation_share_events``（埋点）

通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）实现
``CREATE TABLE IF NOT EXISTS`` 语义，索引与唯一约束由模型 ``__table_args__`` 声明后
随建表自动创建。
"""

import logging

from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def create_project_booking_and_share_tables(engine: Engine) -> None:
    """幂等创建房源预约与分享归因 5 张表."""
    from models import Base
    from models.lead import ValuationShareEvent, ValuationVisit
    from models.marketing import ProjectBooking, ProjectShareEvent, ProjectVisit

    tables = [
        ProjectBooking.__table__,
        ProjectVisit.__table__,
        ProjectShareEvent.__table__,
        ValuationVisit.__table__,
        ValuationShareEvent.__table__,
    ]

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=tables, checkfirst=True)
