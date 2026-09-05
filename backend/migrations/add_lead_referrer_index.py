"""为 leads 表补建分享归属员工查询索引（幂等）.

估价/房源单链路「我的分享统计」（``aggregate_my_share_stats``）的
``lead_count``/``today_lead_count`` 子查询按 ``Lead.referrer_id`` 过滤
（**``Lead.referrer_id`` 无索引**），leads 为核心大表，无索引会全表扫描。
``create_all`` 仅随建表创建索引，已部署环境需显式补建；
模型 ``Lead.__table_args__`` 已同步声明该索引以保持新库一致性。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

_INDEX_NAME = "idx_lead_referrer"


def add_lead_referrer_index(engine: Engine) -> None:
    """幂等补建 ``leads(referrer_id)`` 单列索引.

    Args:
        engine: SQLAlchemy Engine 实例

    """
    if engine.dialect.name != "postgresql":
        return
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _helpers 导入之前导入本模块
    from migrations._helpers import _index_exists

    if _index_exists(engine, _INDEX_NAME):
        return
    logger.info("迁移：补建 leads(referrer_id) 索引（分享统计 lead_count 聚合）")
    with engine.begin() as conn:
        conn.execute(text("CREATE INDEX idx_lead_referrer ON leads (referrer_id)"))
