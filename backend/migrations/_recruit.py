"""区域伙伴招募计划迁移.

幂等创建招募计划 4 张表与索引：
- ``recruit_campaigns`` / ``recruit_leads`` / ``recruit_visits`` / ``recruit_share_events``

通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）实现
``CREATE TABLE IF NOT EXISTS`` 语义，索引由模型 ``__table_args__`` 声明后随建表自动创建。
"""

import logging

from sqlalchemy import inspect
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def create_recruit_tables(engine: Engine) -> None:
    """幂等创建招募计划 4 张表与索引."""
    from models import Base
    from models.recruit import (
        RecruitCampaign,
        RecruitLead,
        RecruitShareEvent,
        RecruitVisit,
    )

    tables = [
        RecruitCampaign.__table__,
        RecruitLead.__table__,
        RecruitVisit.__table__,
        RecruitShareEvent.__table__,
    ]

    inspector = inspect(engine)
    existing = set(inspector.get_table_names())
    missing = [t for t in tables if t.name not in existing]

    if not missing:
        return

    logger.info("迁移：创建招募计划表 %s", [t.name for t in missing])
    Base.metadata.create_all(bind=engine, tables=missing, checkfirst=True)
