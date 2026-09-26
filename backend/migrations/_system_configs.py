"""系统配置 KV 表迁移.

幂等创建 ``system_configs`` 表与唯一索引 uq_system_configs_key(key)：

通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）实现
``CREATE TABLE IF NOT EXISTS`` 语义，索引由模型 ``__table_args__`` 声明后随建表自动创建；
表已存在的部署（索引缺失场景）用 ``_index_exists`` 幂等补建。
"""

import logging

from sqlalchemy.engine import Engine

from ._helpers import _index_exists

logger = logging.getLogger(__name__)


def create_system_configs_table(engine: Engine) -> None:
    """幂等创建 system_configs 表与唯一索引."""
    from models import Base
    from models.system import SystemConfig

    table = SystemConfig.__table__

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=[table], checkfirst=True)

    # 补建索引（处理表已存在但索引缺失的部署）
    for idx in table.indexes:
        if _index_exists(engine, idx.name):
            continue
        logger.info("迁移：补建系统配置索引 %s", idx.name)
        idx.create(engine, checkfirst=True)
