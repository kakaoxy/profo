"""房源上新/调价订阅通知迁移.

幂等创建「房源频道订阅」3 张表 + l4_marketing_projects.published_at 加列：
- l4_marketing_subscriptions：订阅额度账本（一人一行，accept 上报 +1，推送成功 -1）
- l4_marketing_notify_logs：订阅消息发送留痕（admin 统计 + 排障数据源）
- l4_marketing_price_changes：房源调价历史（C 端徽标 + admin 时间线数据源）
- published_at：首次发布时间（上新判定的唯一事实源，存量已发布行回填 NULL 保持
  不触发历史推送——仅迁移后的新发布行为计「上新」）

表创建通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）
实现 ``CREATE TABLE IF NOT EXISTS`` 语义；加列用 ``_column_exists`` 守卫保证幂等。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists

logger = logging.getLogger(__name__)


def create_marketing_subscription_tables(engine: Engine) -> None:
    """幂等创建订阅通知 3 张表."""
    from models import Base
    from models.marketing import (
        L4MarketingNotifyLog,
        L4MarketingPriceChange,
        L4MarketingSubscription,
    )

    tables = [
        L4MarketingSubscription.__table__,
        L4MarketingNotifyLog.__table__,
        L4MarketingPriceChange.__table__,
    ]

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=tables, checkfirst=True)


def add_published_at_to_l4_marketing_projects(engine: Engine) -> None:
    """l4_marketing_projects 补加 published_at 列（首次发布时间）.

    存量行回填 NULL：历史已发布房源不补发「上新」（迁移前无从得知真实首发时间），
    published_at 保持 NULL 时按「已上新过」处理，仅迁移后的新发布行为计上新。
    """
    if _column_exists(engine, "l4_marketing_projects", "published_at"):
        return

    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE l4_marketing_projects ADD COLUMN published_at TIMESTAMPTZ NULL"),
        )
        conn.execute(
            text(
                "COMMENT ON COLUMN l4_marketing_projects.published_at IS '首次发布时间(仅首次发布写入，用于上新判定)'"
            ),
        )
    logger.info("l4_marketing_projects.published_at 列已创建")
