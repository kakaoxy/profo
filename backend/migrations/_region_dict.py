"""区域 / 商圈字典（REQ-IT2-01 / REQ-IT3-01）：幂等建表与归属迁移.

区域与商圈属于**楼盘字典**的一部分（表名 ``region_dicts``），商户门店只是复用候选值：

- v114：幂等创建 ``region_dicts``；
- v115：历史环境曾以 ``merchant_region_dicts`` 建表（迭代 2 初版位于商户域），
  若旧表存在且新表不存在则改名迁移，保留已有字典项。

建表用 ``Base.metadata.create_all(checkfirst=True)``（CREATE TABLE IF NOT EXISTS 语义）。
存量「现有的区域和商圈」不入种子：由 ``RegionDictService.sync_from_business_data``
在首次读取时从 ``communities`` / ``merchant_stores`` 补录（幂等），避免升级脚本里
做全表 DISTINCT 拖慢启动。
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from models.common.base import Base
from models.property.region_dict import RegionDict

logger = logging.getLogger(__name__)

_LEGACY_TABLE = "merchant_region_dicts"
_TABLE = "region_dicts"


def create_region_dict_table(engine: Engine) -> None:
    """幂等创建 ``region_dicts`` 表（含唯一约束与索引）."""
    Base.metadata.create_all(bind=engine, tables=[RegionDict.__table__], checkfirst=True)
    logger.info("%s 表已就绪", _TABLE)


def migrate_legacy_merchant_region_dict(engine: Engine) -> None:
    """把历史表 ``merchant_region_dicts`` 的字典项并入 ``region_dicts`` 后删除旧表（幂等）.

    两种情况：
    - 新表不存在（老环境只跑过旧版 v114）：直接 ``ALTER TABLE ... RENAME``；
    - 新表已存在（本次升级先执行了新版 v114 建表）：把旧表数据 ``INSERT ... ON CONFLICT DO NOTHING``
      搬进新表，再删除旧表，避免两表并存导致字典项「消失」。
    """
    inspector = inspect(engine)
    tables = set(inspector.get_table_names())
    if _LEGACY_TABLE not in tables:
        logger.info("%s 不存在，跳过迁移", _LEGACY_TABLE)
        return

    columns = "id, dict_type, district, name, status, sort_order, remark, created_by, created_at, updated_at"
    if _TABLE not in tables:
        with engine.begin() as conn:
            conn.execute(text(f'ALTER TABLE "{_LEGACY_TABLE}" RENAME TO "{_TABLE}"'))
        with engine.begin() as conn:
            for old, new in (
                ("uq_merchant_region_dicts_type_name", "uq_region_dicts_type_name"),
                ("idx_merchant_region_dicts_type_status", "idx_region_dicts_type_status"),
                ("idx_merchant_region_dicts_district", "idx_region_dicts_district"),
            ):
                conn.execute(text(f'ALTER INDEX IF EXISTS "{old}" RENAME TO "{new}"'))
        logger.info("%s → %s 改名完成", _LEGACY_TABLE, _TABLE)
        return

    with engine.begin() as conn:
        moved = conn.execute(
            text(
                f'INSERT INTO "{_TABLE}" ({columns}) '
                f'SELECT {columns} FROM "{_LEGACY_TABLE}" '
                "ON CONFLICT (dict_type, name) DO NOTHING"
            )
        ).rowcount
        conn.execute(text(f'DROP TABLE "{_LEGACY_TABLE}"'))
    logger.info("历史字典表数据合并完成：%s 行，旧表已删除", moved)
