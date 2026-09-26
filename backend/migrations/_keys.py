"""钥匙管理模块 5 张表迁移.

幂等创建 project_keys / project_normal_keys / key_shares / key_share_views /
key_audit_logs 表与索引：通过 ``Base.metadata.create_all`` + ``checkfirst=True``
实现 ``CREATE TABLE IF NOT EXISTS`` 语义；表已存在但索引缺失的部署用
``_index_exists`` 幂等补建（PostgreSQL）。
另含 key_audit_logs 的 ``detail->>'share_id'`` 表达式索引（分享级日志反查，PG 专属）。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from ._helpers import _index_exists

logger = logging.getLogger(__name__)

# key_audit_logs.detail 的 share_id 表达式索引名
_KEY_AUDIT_SHARE_ID_INDEX = "idx_key_audit_detail_share_id"


def create_key_tables(engine: Engine) -> None:
    """幂等创建钥匙管理 5 张表与索引."""
    from models import Base
    from models.key import KeyAuditLog, KeyShare, KeyShareView, ProjectKey, ProjectNormalKey

    tables = [
        ProjectKey.__table__,
        ProjectNormalKey.__table__,
        KeyShare.__table__,
        KeyShareView.__table__,
        KeyAuditLog.__table__,
    ]

    # checkfirst=True 保证幂等：表已存在时跳过创建
    Base.metadata.create_all(bind=engine, tables=tables, checkfirst=True)

    # 补建索引（处理表已存在但索引缺失的部署）
    for table in tables:
        for idx in table.indexes:
            if _index_exists(engine, idx.name):
                continue
            logger.info("迁移：补建钥匙管理索引 %s", idx.name)
            idx.create(engine, checkfirst=True)


def add_key_audit_share_id_index(engine: Engine) -> None:
    """为 key_audit_logs 建 ``detail->>'share_id'`` 表达式索引（幂等，仅 PostgreSQL）.

    分享详情时间线（KeyShareService.get_share_detail）与房源日志合并分享级事件
    （KeyService.get_logs）均以 ``detail ->> 'share_id'`` 作为过滤条件；该条件无法命中
    project_id/action 等普通列索引，缺少表达式索引时每次都全表扫描 key_audit_logs
    （经纪人每次查看明文都会写一行 agent_view，表持续增长）。
    """
    if _index_exists(engine, _KEY_AUDIT_SHARE_ID_INDEX):
        return
    logger.info("迁移：创建钥匙审计日志 share_id 表达式索引 %s", _KEY_AUDIT_SHARE_ID_INDEX)
    with engine.begin() as conn:
        conn.execute(
            text(f"CREATE INDEX IF NOT EXISTS {_KEY_AUDIT_SHARE_ID_INDEX} ON key_audit_logs ((detail ->> 'share_id'))")
        )
