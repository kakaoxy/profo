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


def create_marketing_project_subscription_table(engine: Engine) -> None:
    """幂等创建房源级订阅表（P2-1「只盯这一套」）.

    l4_marketing_project_subscriptions：一人一房源一行（uq(user_id, marketing_project_id)），
    accept 上报额度 +1，该房源推送成功 -1；与频道级账本相互独立。
    """
    from models import Base
    from models.marketing import L4MarketingProjectSubscription

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(
        bind=engine,
        tables=[L4MarketingProjectSubscription.__table__],
        checkfirst=True,
    )
    # 表已存在（旧库）时 create_all 不会补列：单独幂等补加 last_subscribed_at
    add_last_subscribed_at_to_project_subscriptions(engine)


def add_last_subscribed_at_to_project_subscriptions(engine: Engine) -> None:
    """l4_marketing_project_subscriptions 幂等补加 last_subscribed_at 列.

    P2-1 首版建表遗漏该列（Service 读写但 Model 未声明，读取抛 AttributeError）。
    存量行保持 NULL：未上报过 accept 的行本就无授权时间，无脏数据风险。
    """
    if _column_exists(engine, "l4_marketing_project_subscriptions", "last_subscribed_at"):
        return

    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE l4_marketing_project_subscriptions "
                "ADD COLUMN last_subscribed_at TIMESTAMP WITH TIME ZONE NULL"
            ),
        )
    logger.info("l4_marketing_project_subscriptions.last_subscribed_at 列已创建")


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


def add_price_change_id_to_notify_logs(engine: Engine) -> None:
    """l4_marketing_notify_logs 补加 price_change_id / sub_source 两列（幂等）.

    - price_change_id INT NULL：关联本次推送对应的调价记录（new_listing 类型恒 NULL，
      逻辑外键不建物理 FK），P1-2 调价历史时间线按其分组统计分次送达数
    - sub_source VARCHAR(20) NULL：订阅来源（channel/project），为房源级订阅（P2-1）预留，
      P2-1 落地前推送留痕写 NULL

    存量行保持 NULL：旧留痕不参与按调价记录分组聚合，无脏数据风险。
    """
    price_change_id_missing = not _column_exists(engine, "l4_marketing_notify_logs", "price_change_id")
    sub_source_missing = not _column_exists(engine, "l4_marketing_notify_logs", "sub_source")
    if not price_change_id_missing and not sub_source_missing:
        return

    with engine.begin() as conn:
        if price_change_id_missing:
            conn.execute(
                text("ALTER TABLE l4_marketing_notify_logs ADD COLUMN price_change_id INTEGER NULL"),
            )
            conn.execute(
                text(
                    "COMMENT ON COLUMN l4_marketing_notify_logs.price_change_id IS "
                    "'关联调价记录ID(逻辑外键l4_marketing_price_changes，new_listing类型恒NULL)'"
                ),
            )
            logger.info("l4_marketing_notify_logs.price_change_id 列已创建")
        if sub_source_missing:
            conn.execute(
                text("ALTER TABLE l4_marketing_notify_logs ADD COLUMN sub_source VARCHAR(20) NULL"),
            )
            conn.execute(
                text(
                    "COMMENT ON COLUMN l4_marketing_notify_logs.sub_source IS "
                    "'订阅来源: channel(频道级)/project(房源级)'"
                ),
            )
            logger.info("l4_marketing_notify_logs.sub_source 列已创建")
