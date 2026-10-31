"""商户管理模块业务表迁移（V02/V03）.

- v104：merchant_companies / merchant_stores / merchant_store_status_logs
- v105：merchant_visits
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists

logger = logging.getLogger(__name__)

_CORE_INDEXES: tuple[tuple[str, str], ...] = (
    (
        "idx_merchant_companies_name",
        "CREATE INDEX IF NOT EXISTS idx_merchant_companies_name ON merchant_companies (company_name)",
    ),
    (
        "idx_merchant_companies_status",
        "CREATE INDEX IF NOT EXISTS idx_merchant_companies_status ON merchant_companies (status)",
    ),
    (
        "idx_merchant_stores_company",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_company ON merchant_stores (company_id)",
    ),
    (
        "idx_merchant_stores_owner",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_owner ON merchant_stores (owner_employee_id)",
    ),
    (
        "idx_merchant_stores_phone_hash",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_phone_hash ON merchant_stores (contact_phone_hash)",
    ),
    (
        "idx_merchant_stores_cooperation",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_cooperation ON merchant_stores (cooperation_status)",
    ),
    (
        "idx_merchant_stores_status_review",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_status_review ON merchant_stores (status, review_status)",
    ),
    (
        "idx_merchant_stores_last_visit",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_last_visit ON merchant_stores (last_visit_at)",
    ),
    (
        "idx_merchant_stores_deleted",
        "CREATE INDEX IF NOT EXISTS idx_merchant_stores_deleted ON merchant_stores (is_deleted)",
    ),
    (
        "idx_merchant_store_status_logs_store",
        "CREATE INDEX IF NOT EXISTS idx_merchant_store_status_logs_store "
        "ON merchant_store_status_logs (store_id, created_at)",
    ),
)

_VISIT_INDEXES: tuple[tuple[str, str], ...] = (
    (
        "idx_merchant_visits_store_time",
        "CREATE INDEX IF NOT EXISTS idx_merchant_visits_store_time ON merchant_visits (store_id, visited_at)",
    ),
    (
        "idx_merchant_visits_employee_time",
        "CREATE INDEX IF NOT EXISTS idx_merchant_visits_employee_time ON merchant_visits (employee_id, visited_at)",
    ),
    (
        "idx_merchant_visits_deleted",
        "CREATE INDEX IF NOT EXISTS idx_merchant_visits_deleted ON merchant_visits (is_deleted)",
    ),
)


def _ensure_indexes(engine: Engine, indexes: tuple[tuple[str, str], ...]) -> None:
    """幂等创建索引."""
    for index_name, ddl in indexes:
        if not _index_exists(engine, index_name):
            logger.info("迁移：创建 %s 索引", index_name)
            with engine.begin() as conn:
                conn.execute(text(ddl))


def create_merchant_core_tables(engine: Engine) -> None:
    """v104：幂等创建公司、门店、门店状态日志表与索引."""
    from models import Base, MerchantCompany, MerchantStore, MerchantStoreStatusLog

    Base.metadata.create_all(
        bind=engine,
        tables=[
            MerchantCompany.__table__,
            MerchantStore.__table__,
            MerchantStoreStatusLog.__table__,
        ],
        checkfirst=True,
    )
    _ensure_indexes(engine, _CORE_INDEXES)


def create_merchant_visit_tables(engine: Engine) -> None:
    """v105：幂等创建拜访记录表与索引."""
    from models import Base, MerchantVisit

    Base.metadata.create_all(bind=engine, tables=[MerchantVisit.__table__], checkfirst=True)
    _ensure_indexes(engine, _VISIT_INDEXES)


def add_merchant_store_phone_hash_column(engine: Engine) -> None:
    """v106：为存量 merchant_stores 补 contact_phone_hash 列与索引（幂等）."""
    if not _column_exists(engine, "merchant_stores", "contact_phone_hash"):
        logger.info("迁移 v106：为 merchant_stores 补 contact_phone_hash 列")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE merchant_stores ADD COLUMN contact_phone_hash VARCHAR(64)",
                ),
            )
    _ensure_indexes(
        engine,
        (
            (
                "idx_merchant_stores_phone_hash",
                "CREATE INDEX IF NOT EXISTS idx_merchant_stores_phone_hash "
                "ON merchant_stores (contact_phone_hash)",
            ),
        ),
    )
