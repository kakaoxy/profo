"""区域伙伴招募计划迁移.

幂等创建招募计划 4 张表与索引 + ``recruit_qr_scenes`` 表：
- ``recruit_campaigns`` / ``recruit_leads`` / ``recruit_visits`` / ``recruit_share_events``
- ``recruit_qr_scenes``（小程序码短码映射表）

通过 SQLAlchemy Core API（``Base.metadata.create_all`` + ``checkfirst=True``）实现
``CREATE TABLE IF NOT EXISTS`` 语义，索引由模型 ``__table_args__`` 声明后随建表自动创建。

另：``recruit_leads.phone_hash`` 必须为唯一索引以在 DB 层强制「重复留资永不覆盖」
归因语义（并发留资去重）。``create_all`` 仅在表不存在时生效，已建表部署需显式重建索引；
``recruit_qr_scenes`` 的短码/复用唯一索引同理，已建表部署需显式补建。
"""

import logging

from sqlalchemy import Index, text
from sqlalchemy.engine import Engine

from ._helpers import _index_exists

logger = logging.getLogger(__name__)


def create_recruit_tables(engine: Engine) -> None:
    """幂等创建招募计划 4 张表与索引 + recruit_qr_scenes 表."""
    from models import Base
    from models.recruit import (
        RecruitCampaign,
        RecruitLead,
        RecruitQRScene,
        RecruitShareEvent,
        RecruitVisit,
    )

    tables = [
        RecruitCampaign.__table__,
        RecruitLead.__table__,
        RecruitVisit.__table__,
        RecruitShareEvent.__table__,
        RecruitQRScene.__table__,
    ]

    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(engine)
    existing = set(inspector.get_table_names())
    missing = [t for t in tables if t.name not in existing]

    if missing:
        logger.info("迁移：创建招募计划表 %s", [t.name for t in missing])
        Base.metadata.create_all(bind=engine, tables=missing, checkfirst=True)

    # 确保 phone_hash 唯一索引（处理修复前已建表但索引为非唯一的部署）
    _ensure_phone_hash_unique(engine)
    # 补建 qr_scenes 唯一索引（处理表已存在但索引缺失的部署）
    _ensure_qr_scene_indexes(engine)


def _get_table_names(engine: Engine) -> list[str]:
    """获取当前数据库所有表名."""
    from sqlalchemy import inspect as sa_inspect

    inspector = sa_inspect(engine)
    return inspector.get_table_names()


def _ensure_qr_scene_indexes(engine: Engine) -> None:
    """幂等补建 ``recruit_qr_scenes`` 唯一索引.

    ``create_all`` 仅在表不存在时随建表创建索引；表已存在的部署（如本地调试库）
    需显式补建。使用 SQLAlchemy ``Index.create(checkfirst=True)`` 实现幂等。
    """
    from models.recruit import RecruitQRScene

    # _index_exists 依赖 pg_indexes，仅 PostgreSQL 需要显式补建（SQLite 测试库随建表创建）
    if engine.dialect.name != "postgresql":
        return
    if "recruit_qr_scenes" not in _get_table_names(engine):
        return

    table = RecruitQRScene.__table__
    indexes = [
        Index("idx_recruit_qr_code", table.c.code, unique=True),
        Index("idx_recruit_qr_campaign_employee", table.c.campaign_id, table.c.employee_id, unique=True),
    ]
    for idx in indexes:
        if _index_exists(engine, idx.name):
            continue
        logger.info("迁移：补建 recruit_qr_scenes 索引 %s", idx.name)
        idx.create(engine, checkfirst=True)


def _ensure_phone_hash_unique(engine: Engine) -> None:
    """将 idx_recruit_lead_phone_hash 重建为唯一索引（幂等）.

    首次部署时 create_all 已按模型声明创建唯一索引；此步骤处理表已存在但索引为
    旧版非唯一索引的情况。若已存在重复 phone_hash 数据，保留最早留资记录（归因语义：
    首次留资归属生效），删除后续重复行后再建唯一索引。
    """
    if engine.dialect.name != "postgresql":
        return
    if "recruit_leads" not in _get_table_names(engine):
        return

    if _index_exists(engine, "idx_recruit_lead_phone_hash"):
        # 检查是否已是唯一索引
        with engine.connect() as conn:
            row = conn.execute(
                text("SELECT indexdef FROM pg_indexes WHERE indexname = 'idx_recruit_lead_phone_hash'"),
            ).first()

        if row is not None and "UNIQUE" in row[0]:
            return  # 已是唯一索引，无需处理

    # 清理重复 phone_hash 行（保留 created_at 最早的记录，归因语义：首次留资生效），
    # 避免建唯一索引时因重复值失败；id 作为 created_at 相同时的稳定 tiebreaker
    with engine.begin() as conn:
        dup_count = conn.execute(
            text(
                "DELETE FROM recruit_leads a USING recruit_leads b "
                "WHERE a.phone_hash = b.phone_hash "
                "AND (a.created_at, a.id) > (b.created_at, b.id)"
            ),
        ).rowcount
        if dup_count:
            logger.warning("迁移：清理 %d 条重复 phone_hash 留资记录", dup_count)

    logger.info("迁移：重建 idx_recruit_lead_phone_hash 为唯一索引")
    with engine.begin() as conn:
        conn.execute(text("DROP INDEX IF EXISTS idx_recruit_lead_phone_hash"))
        conn.execute(
            text("CREATE UNIQUE INDEX idx_recruit_lead_phone_hash ON recruit_leads (phone_hash)"),
        )
