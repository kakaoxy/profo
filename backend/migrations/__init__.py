"""启动时数据迁移.

项目未使用 Alembic，对于新增列与已存数据的格式变更，通过本模块在应用启动时
（init_db 之后）幂等执行。所有迁移必须可重复执行且不破坏已有数据。

迁移清单：
- add_token_version_column: 为 users 表添加 token_version 列（H-002）
- add_phone_hash_column: 为 users 表添加 phone_hash 列与唯一索引（H-006）
- encrypt_existing_phones: 将已存的明文手机号加密为 Fernet 密文（H-006）
- populate_phone_hash: 为已存用户回填 phone_hash（H-006）
- add_stage_completed_dates_column: 为 l4_marketing_projects 表添加 stage_completed_dates 列
- add_thumbnail_url_to_photos: 为 renovation_photos 与 property_media 表添加 thumbnail_url 列
- add_renovation_extra_amount_columns: 为 project_renovations 表添加定制柜/窗户/电器金额列
- run_fix_image_urls: 将数据库中的绝对图片 URL 转为相对路径（图片处理链路加固）
- create_investment_tables: 幂等创建跟投管理 4 张表（investments/investors/return_adjustments/investment_logs）
- rename_return_adjustment_columns: 将 return_adjustments 表回报率字段重命名为分配比例字段（清空旧数据）
- add_finance_record_counterparty_columns: 为 finance_records 表添加 counterparty/receipt_url 列（资金账本）
- create_finance_record_logs_table: 幂等创建资金账本操作日志表（finance_record_logs）
- add_finance_record_receipt_urls_column: 为 finance_records 表添加 receipt_urls JSON 列并从旧 receipt_url 回填（多票据支持）
- add_cashflow_category_enum_values: 同步 PostgreSQL cashflowcategory enum 与 Python CashFlowCategory 枚举（遍历所有值，幂等）

"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from migrations.fix_image_urls import run_fix_image_urls
from utils.crypto import decrypt, encrypt, hash_phone

logger = logging.getLogger(__name__)

_FERNET_CIPHER_PREFIX = "gAAAAA"
_MIGRATION_BATCH_SIZE = 500


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    """检查某列是否已存在（SQLite）。"""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _index_exists(engine: Engine, index_name: str) -> bool:
    """检查某索引是否已存在。"""
    inspector = inspect(engine)
    for table in inspector.get_table_names():
        if any(idx["name"] == index_name for idx in inspector.get_indexes(table)):
            return True
    return False


def add_token_version_column(engine: Engine) -> None:
    """为 users 表添加 token_version INTEGER NOT NULL DEFAULT 1。

    SQLite 支持 ALTER TABLE ADD COLUMN，幂等。
    """
    if _column_exists(engine, "users", "token_version"):
        return
    logger.info("迁移：为 users 表添加 token_version 列")
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1")
        )


def add_phone_hash_column(engine: Engine) -> None:
    """为 users 表添加 phone_hash 列及唯一索引（H-006）。

    Fernet 加密随机 IV 导致 phone 列无法维持唯一性，新增 phone_hash 列承载唯一约束。
    """
    if not _column_exists(engine, "users", "phone_hash"):
        logger.info("迁移：为 users 表添加 phone_hash 列")
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE users ADD COLUMN phone_hash VARCHAR(64)")
            )

    if not _index_exists(engine, "idx_users_phone_hash"):
        logger.info("迁移：创建 phone_hash 唯一索引")
        with engine.begin() as conn:
            conn.execute(
                text("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash)")
            )


def encrypt_existing_phones(engine: Engine) -> None:
    """将 users 表中明文手机号加密为 Fernet 密文。

    判定规则：Fernet 密文以 'gAAAAA' 开头；不以该前缀开头视为明文并加密。
    幂等：已是密文则跳过。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    """
    updated = 0
    last_id = ""  # users.id 为 varchar(uuid)，游标分页用空串起步（PostgreSQL 下 varchar > int 无操作符）
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size"
                ),
                {"last_id": last_id, "batch_size": _MIGRATION_BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            for row in rows:
                user_id, phone = row[0], row[1]
                if not phone:
                    # 空值统一清洗为 NULL
                    conn.execute(
                        text("UPDATE users SET phone = NULL WHERE id = :id"),
                        {"id": user_id},
                    )
                    continue
                if phone.startswith(_FERNET_CIPHER_PREFIX):
                    continue
                try:
                    ciphertext = encrypt(phone)
                    conn.execute(
                        text("UPDATE users SET phone = :phone WHERE id = :id"),
                        {"phone": ciphertext, "id": user_id},
                    )
                    updated += 1
                except Exception:  # noqa: BLE001
                    logger.exception("加密用户手机号失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：加密了 %d 条明文手机号", updated)


def populate_phone_hash(engine: Engine) -> None:
    """为已存用户回填 phone_hash（基于解密后的明文手机号）。

    必须在 encrypt_existing_phones 之后执行。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    """
    updated = 0
    last_id = ""  # users.id 为 varchar(uuid)，游标分页用空串起步（PostgreSQL 下 varchar > int 无操作符）
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND phone_hash IS NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size"
                ),
                {"last_id": last_id, "batch_size": _MIGRATION_BATCH_SIZE},
            ).fetchall()
            if not rows:
                break

            for row in rows:
                user_id, phone = row[0], row[1]
                if not phone:
                    continue
                try:
                    plaintext = phone if not phone.startswith(_FERNET_CIPHER_PREFIX) else decrypt(phone)
                    phone_hash_value = hash_phone(plaintext)
                    conn.execute(
                        text("UPDATE users SET phone_hash = :h WHERE id = :id"),
                        {"h": phone_hash_value, "id": user_id},
                    )
                    updated += 1
                except Exception:  # noqa: BLE001
                    logger.exception("回填 phone_hash 失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：回填了 %d 条 phone_hash", updated)


def add_stage_completed_dates_column(engine: Engine) -> None:
    """为 l4_marketing_projects 表添加 stage_completed_dates 列。

    存储各改造阶段完成日期，JSON 格式 {stage: "YYYY-MM-DD"}。
    SQLite 支持 ALTER TABLE ADD COLUMN，幂等。
    """
    if _column_exists(engine, "l4_marketing_projects", "stage_completed_dates"):
        return
    logger.info("迁移：为 l4_marketing_projects 表添加 stage_completed_dates 列")
    with engine.begin() as conn:
        conn.execute(
            text("ALTER TABLE l4_marketing_projects ADD COLUMN stage_completed_dates JSON")
        )


def add_thumbnail_url_to_photos(engine: Engine) -> None:
    """为 renovation_photos 与 property_media 表添加 thumbnail_url 列。

    存储压缩后缩略图 URL，供列表展示加速使用。
    SQLite 支持 ALTER TABLE ADD COLUMN，幂等：通过 _column_exists 检查跳过已存在列。
    """
    for table in ("renovation_photos", "property_media"):
        if _column_exists(engine, table, "thumbnail_url"):
            continue
        logger.info("迁移：为 %s 表添加 thumbnail_url 列", table)
        with engine.begin() as conn:
            conn.execute(
                text(f"ALTER TABLE {table} ADD COLUMN thumbnail_url TEXT")
            )


def add_renovation_extra_amount_columns(engine: Engine) -> None:
    """为 project_renovations 表添加定制柜/窗户/墙面处理金额列。

    - custom_cabinet_amount / window_amount: 直接 ADD COLUMN（幂等）
    - wall_treatment_amount: 优先 RENAME COLUMN appliance_amount TO wall_treatment_amount
      （兼容已部署旧字段的存量数据）；若 appliance_amount 不存在则 ADD COLUMN。
    - SQLite 3.25+ 与 PostgreSQL 均支持 ALTER TABLE RENAME COLUMN。
    - 幂等：通过 _column_exists 检查跳过已存在列。
    """
    # 1) custom_cabinet_amount / window_amount：直接加列
    for column, ddl_type in (
        ("custom_cabinet_amount", "NUMERIC(15, 2)"),
        ("window_amount", "NUMERIC(15, 2)"),
    ):
        if _column_exists(engine, "project_renovations", column):
            continue
        logger.info("迁移：为 project_renovations 表添加 %s 列", column)
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"ALTER TABLE project_renovations ADD COLUMN {column} {ddl_type}"
                )
            )

    # 2) wall_treatment_amount：优先重命名 appliance_amount，否则加列
    if _column_exists(engine, "project_renovations", "wall_treatment_amount"):
        return
    if _column_exists(engine, "project_renovations", "appliance_amount"):
        logger.info("迁移：重命名 project_renovations.appliance_amount → wall_treatment_amount")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE project_renovations "
                    "RENAME COLUMN appliance_amount TO wall_treatment_amount"
                )
            )
        return
    logger.info("迁移：为 project_renovations 表添加 wall_treatment_amount 列")
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE project_renovations "
                "ADD COLUMN wall_treatment_amount NUMERIC(15, 2)"
            )
        )


def create_investment_tables(engine: Engine) -> None:
    """幂等创建跟投管理 4 张表与索引.

    使用 SQLAlchemy Core API（Table + MetaData）通过模型 __table__ 元数据创建，
    checkfirst=True 确保表/索引已存在时跳过，避免破坏已有数据。
    新建表（非加列），CREATE TABLE IF NOT EXISTS 语义。
    """
    from models import Base  # noqa: PLC0415
    from models.investment import (  # noqa: PLC0415
        Investment,
        InvestmentLog,
        Investor,
        ReturnAdjustment,
    )

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    target_tables = [
        Investment.__table__,
        Investor.__table__,
        ReturnAdjustment.__table__,
        InvestmentLog.__table__,
    ]
    missing_tables = [t for t in target_tables if t.name not in existing_tables]

    if not missing_tables:
        return

    table_names = [t.name for t in missing_tables]
    logger.info("迁移：创建跟投管理表 %s", table_names)
    Base.metadata.create_all(bind=engine, tables=missing_tables, checkfirst=True)


def rename_return_adjustment_columns(engine: Engine) -> None:
    """将 return_adjustments 表的回报率字段重命名为分配比例字段。

    语义变更：default_return_ratio → default_distribution_ratio，
    adjusted_return_ratio → adjusted_distribution_ratio。
    旧数据语义不兼容（旧为回报率%，新为分配比例%），迁移时清空旧记录。
    幂等：新列已存在则跳过。
    """
    if _column_exists(engine, "return_adjustments", "adjusted_distribution_ratio"):
        return
    if not _column_exists(engine, "return_adjustments", "default_return_ratio"):
        return
    logger.info("迁移：重命名 return_adjustments 表字段（回报率 → 分配比例）")
    with engine.begin() as conn:
        logger.info("迁移：清空 return_adjustments 旧数据（语义不兼容：回报率% → 分配比例%）")
        conn.execute(text("DELETE FROM return_adjustments"))
        conn.execute(
            text("ALTER TABLE return_adjustments RENAME COLUMN default_return_ratio TO default_distribution_ratio")
        )
        conn.execute(
            text("ALTER TABLE return_adjustments RENAME COLUMN adjusted_return_ratio TO adjusted_distribution_ratio")
        )


def add_finance_record_counterparty_columns(engine: Engine) -> None:
    """为 finance_records 表添加 counterparty/receipt_url 列（资金账本）.

    - counterparty: 交易方（VARCHAR(100)）
    - receipt_url: 票据图片URL（VARCHAR(500)）
    - SQLite 3.25+ 与 PostgreSQL 均支持 ALTER TABLE ADD COLUMN。
    - 幂等：通过 _column_exists 检查跳过已存在列。
    """
    for column, ddl_type in (
        ("counterparty", "VARCHAR(100)"),
        ("receipt_url", "VARCHAR(500)"),
    ):
        if _column_exists(engine, "finance_records", column):
            continue
        logger.info("迁移：为 finance_records 表添加 %s 列", column)
        with engine.begin() as conn:
            conn.execute(
                text(
                    f"ALTER TABLE finance_records ADD COLUMN {column} {ddl_type}"
                )
            )


def create_finance_record_logs_table(engine: Engine) -> None:
    """幂等创建资金账本操作日志表 finance_record_logs.

    使用 SQLAlchemy Core API 通过模型 __table__ 元数据创建，
    checkfirst=True 确保表/索引已存在时跳过，避免破坏已有数据。
    新建表（非加列），CREATE TABLE IF NOT EXISTS 语义。
    """
    from models import Base  # noqa: PLC0415
    from models.project import FinanceRecordLog  # noqa: PLC0415

    inspector = inspect(engine)
    if FinanceRecordLog.__table__.name in inspector.get_table_names():
        return

    logger.info("迁移：创建资金账本操作日志表 %s", FinanceRecordLog.__table__.name)
    Base.metadata.create_all(bind=engine, tables=[FinanceRecordLog.__table__], checkfirst=True)


def add_finance_record_receipt_urls_column(engine: Engine) -> None:
    """为 finance_records 表添加 receipt_urls JSON 列并从旧 receipt_url 回填.

    - 新增 receipt_urls JSON 列（多票据支持）
    - 旧 receipt_url（VARCHAR）单值回填为单元素数组 [url]
    - 旧列保留但模型层不再映射（向后兼容）
    - 幂等：通过 _column_exists 检查跳过 ALTER；回填仅处理 receipt_urls IS NULL 的行
    - 使用 SQLAlchemy Core update() 确保 PostgreSQL/SQLite 均正确序列化 JSON
    """
    from sqlalchemy import JSON, Column, MetaData, String, Table, select, update  # noqa: PLC0415

    if not _column_exists(engine, "finance_records", "receipt_urls"):
        logger.info("迁移：为 finance_records 表添加 receipt_urls JSON 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE finance_records ADD COLUMN receipt_urls JSON"))

    # 旧 receipt_url 列不存在（全新安装）→ 无需回填
    if not _column_exists(engine, "finance_records", "receipt_url"):
        return

    # 用 Core API 构造 update，让 SQLAlchemy 按列类型(JSON)正确绑定参数
    metadata = MetaData()
    finance_records_tbl = Table(
        "finance_records",
        metadata,
        Column("id", String(36), primary_key=True),
        Column("receipt_url", String(500)),
        Column("receipt_urls", JSON),
    )

    updated = 0
    last_id = ""
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                select(
                    finance_records_tbl.c.id,
                    finance_records_tbl.c.receipt_url,
                )
                .where(
                    finance_records_tbl.c.receipt_url.is_not(None),
                    finance_records_tbl.c.receipt_urls.is_(None),
                    finance_records_tbl.c.id > last_id,
                )
                .order_by(finance_records_tbl.c.id)
                .limit(_MIGRATION_BATCH_SIZE)
            ).fetchall()
            if not rows:
                break

            for row in rows:
                rec_id, url = row[0], row[1]
                conn.execute(
                    update(finance_records_tbl)
                    .where(finance_records_tbl.c.id == rec_id)
                    .values(receipt_urls=[url]),
                )
                updated += 1
            last_id = rows[-1][0]

    if updated:
        logger.info("迁移：回填 %d 条 receipt_urls 数据", updated)


def add_cashflow_category_enum_values(engine: Engine) -> None:
    """同步 PostgreSQL cashflowcategory enum 类型与 Python CashFlowCategory 枚举.

    生产环境使用 PostgreSQL，SQLEnum 创建原生 enum 类型 `cashflowcategory`。
    Python 枚举新增值后，PostgreSQL enum 类型不会自动同步，需 ALTER TYPE ... ADD VALUE
    （PG 9.3+ 支持 IF NOT EXISTS）。

    本迁移直接遍历 Python CashFlowCategory 枚举的所有值并同步到 PostgreSQL，
    避免硬编码列表遗漏（曾遗漏 "保证金回收" 等值导致记账 500 错误）。

    - SQLite 跳过（测试库随枚举类更新自动重建 CHECK 约束）
    - 幂等：IF NOT EXISTS 保证重复执行不报错
    """
    if engine.dialect.name != "postgresql":
        return

    from models.common import CashFlowCategory  # noqa: PLC0415

    added = 0
    for member in CashFlowCategory:
        val = member.value
        # PG 12+ 支持事务内 ALTER TYPE ADD VALUE；IF NOT EXISTS 保证幂等
        with engine.begin() as conn:
            conn.execute(
                text(f"ALTER TYPE cashflowcategory ADD VALUE IF NOT EXISTS '{val}'")
            )
        added += 1

    if added:
        logger.info("迁移：同步 cashflowcategory enum（共 %d 个值）", added)


def run_startup_migrations(engine: Engine) -> None:
    """执行所有启动时迁移（幂等）。"""
    try:
        add_token_version_column(engine)
        add_phone_hash_column(engine)
        encrypt_existing_phones(engine)
        populate_phone_hash(engine)
        add_stage_completed_dates_column(engine)
        add_thumbnail_url_to_photos(engine)
        add_renovation_extra_amount_columns(engine)
        run_fix_image_urls(engine)
        create_investment_tables(engine)
        rename_return_adjustment_columns(engine)
        add_finance_record_counterparty_columns(engine)
        create_finance_record_logs_table(engine)
        add_finance_record_receipt_urls_column(engine)
        add_cashflow_category_enum_values(engine)
    except Exception:  # noqa: BLE001
        logger.exception("启动迁移失败")
        raise
