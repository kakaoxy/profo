"""小区户型图库迁移.

幂等创建 ``community_images`` 表 + 索引 + 部分唯一索引（PostgreSQL）。

- 表/索引创建通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）
  实现 ``CREATE TABLE IF NOT EXISTS`` 语义
- 部分唯一索引 ``uq_community_image_url`` 仅约束 ``is_deleted=False`` 的记录，
  允许同小区的已删除记录被重新插入
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _index_exists

logger = logging.getLogger(__name__)


def create_community_images_table(engine: Engine) -> None:
    """幂等创建 ``community_images`` 表与索引.

    1. 通过模型 __table__ 元数据建表（CREATE TABLE IF NOT EXISTS 语义）
    2. 幂等创建部分唯一索引 ``uq_community_image_url``：
       ``UNIQUE (community_id, url) WHERE is_deleted = false``
    """
    from models import Base
    from models.property import CommunityImage

    # checkfirst=True 保证幂等；部分唯一索引 uq_community_image_url 由下方显式补建
    Base.metadata.create_all(bind=engine, tables=[CommunityImage.__table__], checkfirst=True)

    # 部分唯一索引：允许同小区已删除记录被重新插入
    if not _index_exists(engine, "uq_community_image_url"):
        logger.info("迁移：创建 uq_community_image_url 部分唯一索引")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_community_image_url "
                    "ON community_images (community_id, url) "
                    "WHERE is_deleted = false"
                ),
            )
