"""通知中心建表迁移（v95 / v96，迭代二 SPEC §4.1/§4.2）.

**幂等**：三张通知表 + ``user_preferences`` 全部走 ``Base.metadata.create_all``
（``checkfirst=True`` = ``CREATE TABLE IF NOT EXISTS`` 语义），索引随表定义一并创建；
单独补建索引的中间态由 ``_index_exists`` 兜底（与 ``_biz_dicts.py`` 同构）。

**DDL 与 ORM 逐列一致**：全新库由 ``create_all`` 建、既有库由本迁移建，两者必须一致。
⚠️ 项目既有的 ``tests/test_migration_model_parity.py`` **只覆盖版本账本两表**
（``_TABLES = (SchemaMigration, MigrationCompensation)``），对本次新表**无校验**；
配套自建测试见 ``tests/test_notification_schema_parity.py``。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _index_exists
from models import Base
from models.notification import Notification, NotificationDeliveryLog, NotificationRecipient
from models.user.preference import UserPreference

logger = logging.getLogger(__name__)

# v95 建的通知表（顺序无关，create_all 会按依赖处理）
_NOTIFICATION_MODELS = (Notification, NotificationRecipient, NotificationDeliveryLog)

# 建表后需兜底补建的索引（表已存在但索引缺失的中间态）
_REQUIRED_INDEXES: tuple[tuple[str, str], ...] = (
    ("notifications", "idx_notifications_created_at"),
    ("notifications", "idx_notifications_category_created"),
    ("notification_recipients", "idx_notification_recipients_user_unread"),
    ("notification_recipients", "idx_notification_recipients_user_created"),
    ("notification_delivery_logs", "idx_notification_delivery_logs_notification"),
    ("notification_delivery_logs", "idx_notification_delivery_logs_created"),
)


def create_notification_tables(engine: Engine) -> None:
    """v95：创建 notifications / notification_recipients / notification_delivery_logs（幂等）.

    除建表外还修正「早期开发版本遗留的列类型」：``notification_id`` 早期误用
    ``VARCHAR(36)``，与 ``notifications.id``（UUID）无法 JOIN。本迁移把残留的
    varchar 列改为 uuid（表为空或值均为合法 UUID 时幂等安全）。

    Args:
        engine: 数据库引擎。

    """
    Base.metadata.create_all(bind=engine, tables=[m.__table__ for m in _NOTIFICATION_MODELS], checkfirst=True)
    _fix_notification_id_column_types(engine)
    _ensure_notification_indexes(engine)
    logger.info("迁移 v95：通知三表已就位")


def _fix_notification_id_column_types(engine: Engine) -> None:
    """把遗留的 varchar notification_id 列修正为 uuid（幂等）.

    背景：早期版本 ``notification_recipients.notification_id`` /
    ``notification_delivery_logs.notification_id`` 定义为 ``VARCHAR(36)``，
    而 ``notifications.id`` 是 UUID，Join 时 PostgreSQL 报
    ``operator does not exist: character varying = uuid``。
    ``create_all(checkfirst=True)`` 对已存在的表**不会**修改列类型，故在此显式修正。

    Args:
        engine: 数据库引擎。

    """
    # 表名来自本模块常量元组（非用户输入），拼接 SQL 安全
    targets = ("notification_recipients", "notification_delivery_logs")
    with engine.begin() as conn:
        for table in targets:
            current = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_schema = 'public' AND table_name = :t AND column_name = 'notification_id'"
                ),
                {"t": table},
            ).scalar()
            if current is None or current == "uuid":
                continue
            # 仅当全部值都能安全转 uuid 时才转换；否则留待人工处理并大声告警
            bad = conn.execute(
                text(
                    f"SELECT count(*) FROM {table} "
                    "WHERE notification_id IS NOT NULL "
                    "AND notification_id !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-"
                    "[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'"
                )
            ).scalar()
            if bad:
                logger.error(
                    "迁移 v95：%s.notification_id 有 %d 行非法 UUID，跳过类型修正（需人工处理后重跑）",
                    table,
                    bad,
                )
                continue
            conn.execute(
                text(f"ALTER TABLE {table} ALTER COLUMN notification_id TYPE uuid USING notification_id::uuid")
            )
            logger.info("迁移 v95：已将 %s.notification_id 由 %s 修正为 uuid", table, current)


def _ensure_notification_indexes(engine: Engine) -> None:
    """v95 补充步骤：兜底补建缺失索引（幂等，供表早已存在但索引缺失的环境）."""
    missing = [(table, index) for table, index in _REQUIRED_INDEXES if not _index_exists(engine, index)]
    if not missing:
        return
    # 只重建缺失索引：create_all(checkfirst=True) 对已存在的表不会补索引，
    # 因此按 ORM 定义逐表重建缺失的那几个索引（Index.create 幂等性由 _index_exists 保证）
    table_models = {
        "notifications": Notification,
        "notification_recipients": NotificationRecipient,
        "notification_delivery_logs": NotificationDeliveryLog,
    }
    created = 0
    for table_name, index_name in missing:
        table = table_models[table_name].__table__
        index = next((idx for idx in table.indexes if idx.name == index_name), None)
        if index is None:
            logger.warning("迁移 v95：ORM 中未定义索引 %s，跳过", index_name)
            continue
        index.create(bind=engine, checkfirst=True)
        created += 1
    if created:
        logger.info("迁移 v95：补建 %d 个缺失索引", created)


def create_user_preferences_table(engine: Engine) -> None:
    """v96：创建 user_preferences 表（幂等）.

    Args:
        engine: 数据库引擎。

    """
    Base.metadata.create_all(bind=engine, tables=[UserPreference.__table__], checkfirst=True)
    logger.info("迁移 v96：user_preferences 表已就位")


__all__ = [
    "create_notification_tables",
    "create_user_preferences_table",
]
