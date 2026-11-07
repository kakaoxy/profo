"""房源浏览统计索引迁移.

admin 详情页按房源聚合 ProjectVisit 的 PV/UV，需要
``project_visits(marketing_project_id, created_at)`` 复合索引避免全表扫描。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _index_exists

logger = logging.getLogger(__name__)

_INDEX_NAME = "idx_project_visits_project_created"


def add_project_visits_project_index(engine: Engine) -> None:
    """幂等补建房源维度的浏览埋点复合索引."""
    if _index_exists(engine, _INDEX_NAME):
        return
    with engine.begin() as conn:
        conn.execute(
            text(f"CREATE INDEX IF NOT EXISTS {_INDEX_NAME} ON project_visits (marketing_project_id, created_at)")
        )
        logger.info("created index %s on project_visits", _INDEX_NAME)
