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


def create_merchant_broker_tables(engine: Engine) -> None:
    """v107：幂等创建经纪人/绑定历史/门店邀请二维码三表与索引."""
    from models import Base, MerchantBroker, MerchantBrokerBinding, MerchantStoreQRCode

    Base.metadata.create_all(
        bind=engine,
        tables=[
            MerchantBroker.__table__,
            MerchantBrokerBinding.__table__,
            MerchantStoreQRCode.__table__,
        ],
        checkfirst=True,
    )
    _ensure_indexes(
        engine,
        (
            (
                "uq_merchant_brokers_phone_hash",
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_brokers_phone_hash ON merchant_brokers (phone_hash)",
            ),
            (
                "idx_merchant_brokers_user",
                "CREATE INDEX IF NOT EXISTS idx_merchant_brokers_user ON merchant_brokers (user_id)",
            ),
            (
                "idx_merchant_brokers_store",
                "CREATE INDEX IF NOT EXISTS idx_merchant_brokers_store ON merchant_brokers (store_id)",
            ),
            (
                "idx_merchant_brokers_inviter",
                "CREATE INDEX IF NOT EXISTS idx_merchant_brokers_inviter ON merchant_brokers (inviter_employee_id)",
            ),
            (
                "idx_merchant_brokers_status",
                "CREATE INDEX IF NOT EXISTS idx_merchant_brokers_status ON merchant_brokers (bind_status)",
            ),
            (
                "idx_merchant_bindings_broker_time",
                "CREATE INDEX IF NOT EXISTS idx_merchant_bindings_broker_time "
                "ON merchant_broker_bindings (broker_id, applied_at)",
            ),
            (
                "idx_merchant_bindings_store",
                "CREATE INDEX IF NOT EXISTS idx_merchant_bindings_store ON merchant_broker_bindings (store_id)",
            ),
            (
                "idx_merchant_bindings_status",
                "CREATE INDEX IF NOT EXISTS idx_merchant_bindings_status ON merchant_broker_bindings (status)",
            ),
            (
                "uq_merchant_store_qrcodes_code",
                "CREATE UNIQUE INDEX IF NOT EXISTS uq_merchant_store_qrcodes_code ON merchant_store_qrcodes (code)",
            ),
            (
                "idx_merchant_store_qrcodes_store",
                "CREATE INDEX IF NOT EXISTS idx_merchant_store_qrcodes_store ON merchant_store_qrcodes (store_id)",
            ),
            (
                "idx_merchant_store_qrcodes_expires",
                "CREATE INDEX IF NOT EXISTS idx_merchant_store_qrcodes_expires ON merchant_store_qrcodes (expires_at)",
            ),
        ),
    )


def alter_merchant_store_coordinates_nullable(engine: Engine) -> None:
    """v110：门店经纬度允许为空（存量/导入门店可缺坐标，V08 Q37）."""
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE merchant_stores ALTER COLUMN lng DROP NOT NULL"))
        conn.execute(text("ALTER TABLE merchant_stores ALTER COLUMN lat DROP NOT NULL"))


def add_lead_merchant_attribution_columns(engine: Engine) -> None:
    """v109：leads 补门店/经纪人/员工归因快照四列与索引（幂等）."""
    columns = (
        ("store_id", "VARCHAR(36)"),
        ("broker_id", "VARCHAR(36)"),
        ("store_owner_employee_id", "VARCHAR(36)"),
        ("broker_inviter_employee_id", "VARCHAR(36)"),
    )
    for column, ddl_type in columns:
        if not _column_exists(engine, "leads", column):
            logger.info("迁移 v109：leads 补列 %s", column)
            with engine.begin() as conn:
                conn.execute(text(f"ALTER TABLE leads ADD COLUMN {column} {ddl_type}"))
    _ensure_indexes(
        engine,
        (
            (
                "idx_leads_store",
                "CREATE INDEX IF NOT EXISTS idx_leads_store ON leads (store_id)",
            ),
            (
                "idx_leads_broker",
                "CREATE INDEX IF NOT EXISTS idx_leads_broker ON leads (broker_id)",
            ),
        ),
    )


# 以下两个函数的长字符串拼接必须保持原样：改动会改变迁移 checksum（K4/K5）
# fmt: off
def create_merchant_agreement_tables(engine: Engine) -> None:
    """v108：幂等创建协议模板与协议表及索引."""
    from models import Base, MerchantAgreement, MerchantAgreementTemplate

    Base.metadata.create_all(
        bind=engine,
        tables=[MerchantAgreementTemplate.__table__, MerchantAgreement.__table__],
        checkfirst=True,
    )
    _ensure_indexes(
        engine,
        (
            (
                "idx_merchant_agreement_templates_type",
                "CREATE INDEX IF NOT EXISTS idx_merchant_agreement_templates_type "
                "ON merchant_agreement_templates (cooperation_type, status)",
            ),
            (
                "idx_merchant_agreements_store_status",
                "CREATE INDEX IF NOT EXISTS idx_merchant_agreements_store_status "
                "ON merchant_agreements (store_id, status)",
            ),
            (
                "idx_merchant_agreements_company_status",
                "CREATE INDEX IF NOT EXISTS idx_merchant_agreements_company_status "
                "ON merchant_agreements (company_id, status)",
            ),
            (
                "idx_merchant_agreements_expire",
                "CREATE INDEX IF NOT EXISTS idx_merchant_agreements_expire "
                "ON merchant_agreements (expire_at, status)",
            ),
            (
                "idx_merchant_agreements_review",
                "CREATE INDEX IF NOT EXISTS idx_merchant_agreements_review "
                "ON merchant_agreements (review_status)",
            ),
            (
                "idx_merchant_agreements_parent",
                "CREATE INDEX IF NOT EXISTS idx_merchant_agreements_parent "
                "ON merchant_agreements (parent_agreement_id)",
            ),
        ),
    )


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


# fmt: on


def add_merchant_visit_location_failure_type(engine: Engine) -> None:
    """v111：merchant_visits 补 location_failure_type 列（定位失败类型，幂等）.

    AC-V03-007：定位授权被拒绝不得降级提交，只有弱网/超时允许降级并标注；
    该列落库失败类型，供后台与审计区分「拒绝授权」与「弱网/超时」。
    """
    if not _column_exists(engine, "merchant_visits", "location_failure_type"):
        logger.info("迁移 v111：为 merchant_visits 补 location_failure_type 列")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE merchant_visits ADD COLUMN location_failure_type VARCHAR(20)",
                ),
            )
