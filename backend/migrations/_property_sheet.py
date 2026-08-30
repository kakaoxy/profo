"""房源单（多房源分享）迁移.

幂等创建房源单 4 张表与索引：
- ``property_share_sheets`` / ``property_share_sheet_items``
- ``property_sheet_visits`` / ``property_sheet_share_events``

通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）实现
``CREATE TABLE IF NOT EXISTS`` 语义，索引由模型 ``__table_args__`` 声明后随建表自动创建；
表已存在的部署（索引缺失场景）由 ``_ensure_property_sheet_indexes`` 用 ``_index_exists``
幂等补建。
"""

import logging

from sqlalchemy.engine import Engine

from ._helpers import _index_exists

logger = logging.getLogger(__name__)


def create_property_sheet_tables(engine: Engine) -> None:
    """幂等创建房源单 4 张表与索引."""
    from models import Base
    from models.marketing.property_sheet import (
        PropertyShareSheet,
        PropertyShareSheetItem,
        PropertySheetShareEvent,
        PropertySheetVisit,
    )

    tables = [
        PropertyShareSheet.__table__,
        PropertyShareSheetItem.__table__,
        PropertySheetVisit.__table__,
        PropertySheetShareEvent.__table__,
    ]

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=tables, checkfirst=True)

    # 补建索引（处理表已存在但索引缺失的部署）
    _ensure_property_sheet_indexes(engine, tables)


def _ensure_property_sheet_indexes(engine: Engine, tables: list) -> None:
    """幂等补建房源单各表索引.

    ``create_all`` 仅在表不存在时随建表创建索引；表已存在的部署（如本地调试库）
    需显式补建。索引定义直接复用模型 ``__table_args__`` 声明，避免双份维护。
    """
    # _index_exists 依赖 pg_indexes，仅 PostgreSQL 需要显式补建（SQLite 测试库随建表创建）
    if engine.dialect.name != "postgresql":
        return

    for table in tables:
        for idx in table.indexes:
            if _index_exists(engine, idx.name):
                continue
            logger.info("迁移：补建房源单索引 %s", idx.name)
            idx.create(engine, checkfirst=True)
