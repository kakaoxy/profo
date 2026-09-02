"""小程序「我的客户」跟进记录表迁移.

幂等创建 ``customer_follow_ups`` 表与索引（module, lead_id）：

通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）实现
``CREATE TABLE IF NOT EXISTS`` 语义，索引由模型 ``__table_args__`` 声明后随建表自动创建；
表已存在的部署（索引缺失场景）用 ``_index_exists`` 幂等补建。
"""

import logging

from sqlalchemy.engine import Engine

from ._helpers import _index_exists

logger = logging.getLogger(__name__)


def create_customer_follow_ups_table(engine: Engine) -> None:
    """幂等创建 customer_follow_ups 表与索引."""
    from models import Base
    from models.growth_center import CustomerFollowUp

    table = CustomerFollowUp.__table__

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=[table], checkfirst=True)

    # 补建索引（处理表已存在但索引缺失的部署）
    # _index_exists 依赖 pg_indexes，仅 PostgreSQL 需要显式补建（SQLite 测试库随建表创建）
    if engine.dialect.name != "postgresql":
        return
    for idx in table.indexes:
        if _index_exists(engine, idx.name):
            continue
        logger.info("迁移：补建客户跟进记录索引 %s", idx.name)
        idx.create(engine, checkfirst=True)
