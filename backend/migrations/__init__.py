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
- add_finance_record_receipt_urls_column: 为 finance_records 表添加 receipt_urls JSON 列并从旧 receipt_url 回填
  （多票据支持）
- add_cashflow_category_enum_values: 同步 PostgreSQL cashflowcategory enum 与 Python 枚举（幂等）
- migrate_record_date_to_timestamptz: 将 finance_records.record_date 列类型从 timestamp
  迁移为 timestamptz（时区一致性修复，幂等）
- migrate_project_date_columns_to_date: 将 projects 表 commission_start_date/commission_end_date/
  finance_settled_date 列从 VARCHAR(10) 迁移为 date（日期类型合规修复，幂等）
- migrate_user_datetime_columns_to_timestamptz: 将 users/refresh_tokens/api_keys 表的 5 个
  DateTime 列迁移为 timestamptz（时区一致性修复，幂等）
- migrate_all_datetime_columns_to_timestamptz: 遍历所有模型 DateTime 列，将 PG 中仍为
  timestamp without time zone 的列统一迁移为 timestamptz（通用时区修复，幂等）
- migrate_encrypted_columns_to_text: 将 EncryptedString 列从 character varying 迁移为 text
  （Fernet 密文远超声明长度，PG 严格强制 VARCHAR 长度会报错，幂等）
- create_wechat_oauth_tables: 幂等创建微信 OAuth state/temp_code 表并清理过期记录

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
    """检查某列是否已存在（跨方言）."""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _index_exists(engine: Engine, index_name: str) -> bool:
    """检查某索引是否已存在."""
    if engine.dialect.name == "postgresql":
        with engine.connect() as conn:
            return bool(
                conn.execute(
                    text("SELECT 1 FROM pg_indexes WHERE indexname = :index LIMIT 1"),
                    {"index": index_name},
                ).first(),
            )
    inspector = inspect(engine)
    for table in inspector.get_table_names():
        if any(idx["name"] == index_name for idx in inspector.get_indexes(table)):
            return True
    return False


def add_token_version_column(engine: Engine) -> None:
    """为 users 表添加 token_version INTEGER NOT NULL DEFAULT 1.

    SQLite 支持 ALTER TABLE ADD COLUMN，幂等。
    """
    if _column_exists(engine, "users", "token_version"):
        return
    logger.info("迁移：为 users 表添加 token_version 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 1"))


def add_phone_hash_column(engine: Engine) -> None:
    """为 users 表添加 phone_hash 列及唯一索引（H-006）。.

    Fernet 加密随机 IV 导致 phone 列无法维持唯一性，新增 phone_hash 列承载唯一约束。
    """
    if not _column_exists(engine, "users", "phone_hash"):
        logger.info("迁移：为 users 表添加 phone_hash 列")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN phone_hash VARCHAR(64)"))

    if not _index_exists(engine, "idx_users_phone_hash"):
        logger.info("迁移：创建 phone_hash 唯一索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_hash ON users(phone_hash)"))


def encrypt_existing_phones(engine: Engine) -> None:
    """将 users 表中明文手机号加密为 Fernet 密文。.

    判定规则：Fernet 密文以 'gAAAAA' 开头；不以该前缀开头视为明文并加密。
    幂等：已是密文则跳过。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    """
    updated = 0
    last_id = ""  # users.id 为 varchar(uuid)，游标分页用空串起步
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size",
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
                except Exception:
                    logger.exception("加密用户手机号失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：加密了 %d 条明文手机号", updated)


def populate_phone_hash(engine: Engine) -> None:
    """为已存用户回填 phone_hash（基于解密后的明文手机号）。.

    必须在 encrypt_existing_phones 之后执行。
    使用基于 id 的游标分页，避免大数据量下 fetchall 导致 OOM。
    每批次独立提交，避免单个大事务。

    """
    updated = 0
    last_id = ""  # users.id 为 varchar(uuid)，游标分页用空串起步
    while True:
        with engine.begin() as conn:
            rows = conn.execute(
                text(
                    "SELECT id, phone FROM users "
                    "WHERE phone IS NOT NULL AND phone_hash IS NULL AND id > :last_id "
                    "ORDER BY id LIMIT :batch_size",
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
                except Exception:
                    logger.exception("回填 phone_hash 失败 user_id=%s", user_id)
        last_id = rows[-1][0]

    if updated:
        logger.info("迁移：回填了 %d 条 phone_hash", updated)


def add_stage_completed_dates_column(engine: Engine) -> None:
    """为 l4_marketing_projects 表添加 stage_completed_dates 列。.

    存储各改造阶段完成日期，JSON 格式 {stage: "YYYY-MM-DD"}。
    SQLite 支持 ALTER TABLE ADD COLUMN，幂等。
    """
    if _column_exists(engine, "l4_marketing_projects", "stage_completed_dates"):
        return
    logger.info("迁移：为 l4_marketing_projects 表添加 stage_completed_dates 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE l4_marketing_projects ADD COLUMN stage_completed_dates JSON"))


def add_thumbnail_url_to_photos(engine: Engine) -> None:
    """为 renovation_photos 与 property_media 表添加 thumbnail_url 列。.

    存储压缩后缩略图 URL，供列表展示加速使用。
    SQLite 支持 ALTER TABLE ADD COLUMN，幂等：通过 _column_exists 检查跳过已存在列。
    使用硬编码 DDL 字符串避免 f-string 拼接表名（AGENTS.md §11）。
    """
    from sqlalchemy import text  # noqa: PLC0415

    for table_name in ("renovation_photos", "property_media"):
        if _column_exists(engine, table_name, "thumbnail_url"):
            continue
        logger.info("迁移：为 %s 表添加 thumbnail_url 列", table_name)
        # table_name 来自硬编码元组,无注入风险;DDL 不支持绑定参数
        ddl = "ALTER TABLE " + table_name + " ADD COLUMN thumbnail_url TEXT"
        with engine.begin() as conn:
            conn.execute(text(ddl))


def add_renovation_extra_amount_columns(engine: Engine) -> None:
    """为 project_renovations 表添加定制柜/窗户/墙面处理金额列。.

    - custom_cabinet_amount / window_amount: 直接 ADD COLUMN（幂等）
    - wall_treatment_amount: 优先 RENAME COLUMN appliance_amount TO wall_treatment_amount
      （兼容已部署旧字段的存量数据）；若 appliance_amount 不存在则 ADD COLUMN。
    - SQLite 3.25+ 与 PostgreSQL 均支持 ALTER TABLE RENAME COLUMN。
    - 幂等：通过 _column_exists 检查跳过已存在列。
    - 使用硬编码 DDL 字符串避免 f-string 拼接列名（AGENTS.md §11）。
    """
    from sqlalchemy import text  # noqa: PLC0415

    # 1) custom_cabinet_amount / window_amount：直接加列
    # 列名与类型来自硬编码元组,无注入风险;DDL 不支持绑定参数
    for column_name, column_type_sql in (
        ("custom_cabinet_amount", "NUMERIC(15,2)"),
        ("window_amount", "NUMERIC(15,2)"),
    ):
        if _column_exists(engine, "project_renovations", column_name):
            continue
        logger.info("迁移：为 project_renovations 表添加 %s 列", column_name)
        ddl = "ALTER TABLE project_renovations ADD COLUMN " + column_name + " " + column_type_sql
        with engine.begin() as conn:
            conn.execute(text(ddl))

    # 2) wall_treatment_amount：优先重命名 appliance_amount，否则加列
    if _column_exists(engine, "project_renovations", "wall_treatment_amount"):
        return
    if _column_exists(engine, "project_renovations", "appliance_amount"):
        logger.info("迁移：重命名 project_renovations.appliance_amount → wall_treatment_amount")
        with engine.begin() as conn:
            conn.execute(
                text("ALTER TABLE project_renovations RENAME COLUMN appliance_amount TO wall_treatment_amount"),
            )
        return
    logger.info("迁移：为 project_renovations 表添加 wall_treatment_amount 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_renovations ADD COLUMN wall_treatment_amount NUMERIC(15, 2)"))


def add_other_decoration_amount_column(engine: Engine) -> None:
    """为 project_renovations 表添加 other_decoration_amount 列（幂等）."""
    from sqlalchemy import text  # noqa: PLC0415

    if _column_exists(engine, "project_renovations", "other_decoration_amount"):
        return
    logger.info("迁移：为 project_renovations 表添加 other_decoration_amount 列")
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE project_renovations ADD COLUMN other_decoration_amount NUMERIC(15, 2)"))


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
    """将 return_adjustments 表的回报率字段重命名为分配比例字段。.

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
            text("ALTER TABLE return_adjustments RENAME COLUMN default_return_ratio TO default_distribution_ratio"),
        )
        conn.execute(
            text("ALTER TABLE return_adjustments RENAME COLUMN adjusted_return_ratio TO adjusted_distribution_ratio"),
        )


def add_finance_record_counterparty_columns(engine: Engine) -> None:
    """为 finance_records 表添加 counterparty/receipt_url 列（资金账本）.

    - counterparty: 交易方（VARCHAR(100)）
    - receipt_url: 票据图片URL（VARCHAR(500)）
    - SQLite 3.25+ 与 PostgreSQL 均支持 ALTER TABLE ADD COLUMN。
    - 幂等：通过 _column_exists 检查跳过已存在列。
    - 使用硬编码 DDL 字符串避免 f-string 拼接列名（AGENTS.md §11）。
    """
    from sqlalchemy import text  # noqa: PLC0415

    # 列名与类型来自硬编码元组,无注入风险;DDL 不支持绑定参数
    for column_name, column_type_sql in (
        ("counterparty", "VARCHAR(100)"),
        ("receipt_url", "VARCHAR(500)"),
    ):
        if _column_exists(engine, "finance_records", column_name):
            continue
        logger.info("迁移：为 finance_records 表添加 %s 列", column_name)
        ddl = "ALTER TABLE finance_records ADD COLUMN " + column_name + " " + column_type_sql
        with engine.begin() as conn:
            conn.execute(text(ddl))


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
                .limit(_MIGRATION_BATCH_SIZE),
            ).fetchall()
            if not rows:
                break

            for row in rows:
                rec_id, url = row[0], row[1]
                conn.execute(
                    update(finance_records_tbl).where(finance_records_tbl.c.id == rec_id).values(receipt_urls=[url]),
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

    # 先检查 enum type 是否存在（避免 ::regtype CAST 对不存在的类型报错）
    with engine.connect() as conn:
        type_exists = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = 'cashflowcategory'")).scalar()
    if not type_exists:
        logger.info("迁移：cashflowcategory enum type 不存在，跳过同步（将由 create_all 创建）")
        return

    added = 0
    for member in CashFlowCategory:
        val = member.value
        # PG 12+ 支持事务内 ALTER TYPE ADD VALUE；IF NOT EXISTS 保证幂等
        with engine.begin() as conn:
            exists = conn.execute(
                text(
                    "SELECT 1 FROM pg_enum e "
                    "JOIN pg_type t ON e.enumtypid = t.oid "
                    "WHERE t.typname = 'cashflowcategory' AND e.enumlabel = :label",
                ),
                {"label": val},
            ).scalar()
            if not exists:
                # PostgreSQL DDL 不支持绑定参数；枚举值来自可信 Python enum，非用户输入
                conn.execute(text(f"ALTER TYPE cashflowcategory ADD VALUE IF NOT EXISTS '{val}'"))
                added += 1

    if added:
        logger.info("迁移：同步 cashflowcategory enum（共 %d 个值）", added)


def add_project_finance_settlement_columns(engine: Engine) -> None:
    """为 projects 表添加资金账本结算相关列 + 同步 financerecordactiontype enum.

    新增列：
    - finance_settlement_status: 结算状态（复用 settlementstatus enum 类型）
    - finance_settled_date: 结算日期
    - finance_settled_note: 结算说明

    同时同步 PostgreSQL financerecordactiontype enum（新增 settle/unsettle 值）。

    幂等：检查列是否存在，PostgreSQL enum 用 IF NOT EXISTS。
    """
    # 1. 添加 projects 表的 3 个新列
    if not _column_exists(engine, "projects", "finance_settlement_status"):
        with engine.begin() as conn:
            if engine.dialect.name == "postgresql":
                conn.execute(
                    text(
                        "ALTER TABLE projects "
                        "ADD COLUMN finance_settlement_status settlementstatus "
                        "NOT NULL DEFAULT 'unsettled'",
                    ),
                )
            else:
                conn.execute(
                    text(
                        "ALTER TABLE projects ADD COLUMN finance_settlement_status "
                        "VARCHAR NOT NULL DEFAULT 'unsettled'",
                    ),
                )
        logger.info("迁移：projects 表新增 finance_settlement_status 列")

    if not _column_exists(engine, "projects", "finance_settled_date"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN finance_settled_date DATE"))
        logger.info("迁移：projects 表新增 finance_settled_date 列")

    if not _column_exists(engine, "projects", "finance_settled_note"):
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE projects ADD COLUMN finance_settled_note VARCHAR(500)"))
        logger.info("迁移：projects 表新增 finance_settled_note 列")

    # 2. 同步 PostgreSQL financeactiontype enum（新增 settle/unsettle）
    #    SQLEnum(FinanceActionType) 不指定 name，PG type 名为枚举类名小写：financeactiontype
    if engine.dialect.name == "postgresql":
        from models.common import FinanceActionType  # noqa: PLC0415

        # 先检查 enum type 是否存在（避免 ::regtype CAST 对不存在的类型报错）
        with engine.connect() as conn:
            type_exists = conn.execute(text("SELECT 1 FROM pg_type WHERE typname = 'financeactiontype'")).scalar()
        if not type_exists:
            logger.info("迁移：financeactiontype enum type 不存在，跳过同步（将由 create_all 创建）")
            return

        added = 0
        for member in FinanceActionType:
            val = member.value
            with engine.begin() as conn:
                exists = conn.execute(
                    text(
                        "SELECT 1 FROM pg_enum e "
                        "JOIN pg_type t ON e.enumtypid = t.oid "
                        "WHERE t.typname = 'financeactiontype' AND e.enumlabel = :label",
                    ),
                    {"label": val},
                ).scalar()
                if not exists:
                    # PostgreSQL DDL 不支持绑定参数；枚举值来自可信 Python enum，非用户输入
                    conn.execute(text(f"ALTER TYPE financeactiontype ADD VALUE IF NOT EXISTS '{val}'"))
                    added += 1
        if added:
            logger.info("迁移：同步 financeactiontype enum（共 %d 个值）", added)


def migrate_record_date_to_timestamptz(engine: Engine) -> None:
    """将 finance_records.record_date 列从 timestamp 迁移为 timestamptz.

    合规性修复：record_date 原为 DateTime(无 tz)，与 BaseModel 的 created_at/updated_at
    不一致，会触发时区 stripping（违反 AGENTS.md §3 时间列统一 timezone=True）。

    - PostgreSQL: ALTER COLUMN ... TYPE timestamptz USING record_date AT TIME ZONE 'UTC'
    - SQLite: 跳过（SQLite 不区分 timestamp/timestamptz，存储为 TEXT，模型层已声明 timezone=True）
    - 幂等：通过 information_schema.columns 判断 data_type，已是
      'timestamp with time zone' 则跳过
    - 表名/列名为硬编码字符串，未用 f-string 拼接变量（规范11）
    """
    inspector = inspect(engine)
    if "finance_records" not in inspector.get_table_names():
        return
    if engine.dialect.name != "postgresql":
        return

    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'finance_records' AND column_name = 'record_date'",
            ),
        ).first()
    if row is None:
        return
    # PostgreSQL 类型：timestamp with/without time zone
    if row[0] == "timestamp with time zone":
        return

    logger.info("迁移：finance_records.record_date → timestamptz（当前类型 %s）", row[0])
    with engine.begin() as conn:
        conn.execute(
            text(
                "ALTER TABLE finance_records "
                "ALTER COLUMN record_date TYPE timestamptz "
                "USING record_date AT TIME ZONE 'UTC'",
            ),
        )


def migrate_project_date_columns_to_date(engine: Engine) -> None:
    """将 projects 表的 3 个日期列从 VARCHAR(10) 迁移为 date 类型.

    合规性修复：commission_start_date/commission_end_date/finance_settled_date
    原为 String(10) 存日期字符串，违反 AGENTS.md（日期列用 Date）。

    - PostgreSQL: ALTER COLUMN ... TYPE date USING to_date(..., 'YYYY-MM-DD')
    - SQLite: 跳过（SQLite 不强制类型，模型层已声明 Date）
    - 幂等：通过 information_schema.columns 判断 data_type，已是 date 则跳过
    - 表名/列名为硬编码字符串，未用 f-string 拼接变量
    """
    inspector = inspect(engine)
    if "projects" not in inspector.get_table_names():
        return
    if engine.dialect.name != "postgresql":
        return

    # 每列对应一段硬编码 ALTER SQL（避免 f-string 拼接列名）
    alter_statements = {
        "commission_start_date": (
            "ALTER TABLE projects "
            "ALTER COLUMN commission_start_date TYPE date "
            "USING to_date(commission_start_date, 'YYYY-MM-DD')"
        ),
        "commission_end_date": (
            "ALTER TABLE projects "
            "ALTER COLUMN commission_end_date TYPE date "
            "USING to_date(commission_end_date, 'YYYY-MM-DD')"
        ),
        "finance_settled_date": (
            "ALTER TABLE projects "
            "ALTER COLUMN finance_settled_date TYPE date "
            "USING to_date(finance_settled_date, 'YYYY-MM-DD')"
        ),
    }

    for column_name, alter_sql in alter_statements.items():
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns "
                    "WHERE table_name = 'projects' AND column_name = :col",
                ),
                {"col": column_name},
            ).first()
        if row is None:
            continue
        if row[0] == "date":
            continue
        logger.info("迁移：projects.%s → date（当前类型 %s）", column_name, row[0])
        with engine.begin() as conn:
            conn.execute(text(alter_sql))


def migrate_user_datetime_columns_to_timestamptz(engine: Engine) -> None:
    """将 users/refresh_tokens/api_keys 表的 5 个 DateTime 列迁移为 timestamptz.

    合规性修复：这些列原为 DateTime(无 tz)，与 AGENTS.md §3 "时间列统一 timezone=True" 不一致，
    会触发时区 stripping。模型层已改为 DateTime(timezone=True)，此迁移同步已存在的 PG 表列类型。

    涉及列：
    - users.last_login_at
    - refresh_tokens.expires_at
    - api_keys.last_used_at / expires_at / deleted_at

    - PostgreSQL: ALTER COLUMN ... TYPE timestamptz USING ... AT TIME ZONE 'UTC'
    - SQLite: 跳过（SQLite 不区分 timestamp/timestamptz，存储为 TEXT）
    - 幂等：通过 information_schema.columns 判断 data_type，已是
      'timestamp with time zone' 则跳过
    - 表名/列名为硬编码字符串，未用 f-string 拼接变量（规范11）
    """
    inspector = inspect(engine)
    if engine.dialect.name != "postgresql":
        return

    # 每列对应一段硬编码 ALTER SQL（避免 f-string 拼接列名）
    alter_statements = {
        ("users", "last_login_at"): (
            "ALTER TABLE users ALTER COLUMN last_login_at TYPE timestamptz USING last_login_at AT TIME ZONE 'UTC'"
        ),
        ("refresh_tokens", "expires_at"): (
            "ALTER TABLE refresh_tokens ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC'"
        ),
        ("api_keys", "last_used_at"): (
            "ALTER TABLE api_keys ALTER COLUMN last_used_at TYPE timestamptz USING last_used_at AT TIME ZONE 'UTC'"
        ),
        ("api_keys", "expires_at"): (
            "ALTER TABLE api_keys ALTER COLUMN expires_at TYPE timestamptz USING expires_at AT TIME ZONE 'UTC'"
        ),
        ("api_keys", "deleted_at"): (
            "ALTER TABLE api_keys ALTER COLUMN deleted_at TYPE timestamptz USING deleted_at AT TIME ZONE 'UTC'"
        ),
    }

    existing_tables = set(inspector.get_table_names())
    for (table_name, column_name), alter_sql in alter_statements.items():
        if table_name not in existing_tables:
            continue
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns WHERE table_name = :table AND column_name = :col",
                ),
                {"table": table_name, "col": column_name},
            ).first()
        if row is None:
            continue
        # PostgreSQL 类型：timestamp with/without time zone
        if row[0] == "timestamp with time zone":
            continue
        logger.info("迁移：%s.%s → timestamptz（当前类型 %s）", table_name, column_name, row[0])
        with engine.begin() as conn:
            conn.execute(text(alter_sql))


def migrate_encrypted_columns_to_text(engine: Engine) -> None:
    """将 EncryptedString 列从 character varying 迁移为 text.

    修复：EncryptedString 原 impl 为 String(length)，在 PG 上生成 VARCHAR(length)。
    但该列存储 Fernet 密文（base64 编码，约 140+ 字符），远超声明的 length，
    PG 严格强制长度会触发 "value too long for type character varying(N)"。
    impl 已改为 Text，此迁移同步已存在的 PG 表列类型为 text。

    涉及列（EncryptedString 全部使用位置）：
    - users.phone / users.wechat_session_key
    - project_owners.owner_phone / owner_id_card / bank_card_number

    - PostgreSQL: ALTER COLUMN ... TYPE text（VARCHAR → text 隐式可转换，无需 USING）
    - SQLite: 跳过（SQLite 不强制 VARCHAR 长度，TEXT 亲和性）
    - 幂等：通过 information_schema.columns 判断 data_type，已是 text 则跳过
    - 表名/列名为硬编码字符串，未用 f-string 拼接变量（规范11）
    """
    inspector = inspect(engine)
    if engine.dialect.name != "postgresql":
        return

    # 每列对应一段硬编码 ALTER SQL（避免 f-string 拼接表名/列名）
    alter_statements = {
        ("users", "phone"): "ALTER TABLE users ALTER COLUMN phone TYPE text",
        ("users", "wechat_session_key"): "ALTER TABLE users ALTER COLUMN wechat_session_key TYPE text",
        ("project_owners", "owner_phone"): "ALTER TABLE project_owners ALTER COLUMN owner_phone TYPE text",
        ("project_owners", "owner_id_card"): "ALTER TABLE project_owners ALTER COLUMN owner_id_card TYPE text",
        ("project_owners", "bank_card_number"): "ALTER TABLE project_owners ALTER COLUMN bank_card_number TYPE text",
    }

    existing_tables = set(inspector.get_table_names())
    for (table_name, column_name), alter_sql in alter_statements.items():
        if table_name not in existing_tables:
            continue
        with engine.connect() as conn:
            row = conn.execute(
                text(
                    "SELECT data_type FROM information_schema.columns WHERE table_name = :table AND column_name = :col",
                ),
                {"table": table_name, "col": column_name},
            ).first()
        if row is None:
            continue
        # PostgreSQL 类型：text / character varying
        if row[0] == "text":
            continue
        logger.info("迁移：%s.%s → text（当前类型 %s）", table_name, column_name, row[0])
        with engine.begin() as conn:
            conn.execute(text(alter_sql))


def migrate_all_datetime_columns_to_timestamptz(engine: Engine) -> None:
    """将所有模型 DateTime 列在 PostgreSQL 中统一迁移为 timestamptz.

    通用时区一致性修复：遍历 Base.metadata 中所有表的 DateTime 列，若 PG 实际列类型为
    `timestamp without time zone` 则 ALTER 为 timestamptz。覆盖
    migrate_record_date_to_timestamptz / migrate_user_datetime_columns_to_timestamptz
    的功能（二者保留，幂等不冲突：先跑的旧函数发现已是目标类型则跳过）。

    - PostgreSQL: ALTER COLUMN ... TYPE timestamptz USING <col> AT TIME ZONE 'UTC'
    - SQLite: 跳过（不区分 timestamp/timestamptz，存储为 TEXT）
    - 幂等：通过 information_schema.columns 判断 data_type，已是
      'timestamp with time zone' 则跳过
    - 非 timestamp 类型（如 date）由 information_schema.data_type 判断后跳过
    - 表名/列名来自可信模型元数据；DDL 不支持绑定参数故字符串拼接
    """
    if engine.dialect.name != "postgresql":
        return

    from sqlalchemy import DateTime  # noqa: PLC0415

    from models import Base  # noqa: PLC0415

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    migrated = 0
    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing_tables:
            continue
        for column in table.columns:
            if not isinstance(column.type, DateTime):
                continue
            with engine.connect() as conn:
                row = conn.execute(
                    text(
                        "SELECT data_type FROM information_schema.columns "
                        "WHERE table_name = :table AND column_name = :col",
                    ),
                    {"table": table_name, "col": column.name},
                ).first()
            if row is None:
                continue
            # 仅处理 timestamp without time zone；已是 timestamptz / date 等类型则跳过
            if row[0] != "timestamp without time zone":
                continue
            logger.info("迁移：%s.%s → timestamptz（当前类型 %s）", table_name, column.name, row[0])
            # 表名/列名来自可信模型元数据；DDL 不支持绑定参数
            alter_sql = (
                "ALTER TABLE " + table_name + " "
                "ALTER COLUMN " + column.name + " TYPE timestamptz "
                "USING " + column.name + " AT TIME ZONE 'UTC'"
            )
            with engine.begin() as conn:
                conn.execute(text(alter_sql))
            migrated += 1

    if migrated:
        logger.info("迁移：共 %d 个 DateTime 列转为 timestamptz", migrated)


def create_wechat_oauth_tables(engine: Engine) -> None:
    """幂等创建微信 OAuth state/temp_code 表并清理过期记录.

    使用 SQLAlchemy Core API 通过模型 __table__ 元数据创建，
    checkfirst=True 确保表/索引已存在时跳过。
    创建后清理上次运行残留的过期 state/code 记录。
    """
    from models import Base  # noqa: PLC0415
    from models.system import WeChatOAuthState, WeChatTempCode  # noqa: PLC0415

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    target_tables = [WeChatOAuthState.__table__, WeChatTempCode.__table__]
    missing_tables = [t for t in target_tables if t.name not in existing_tables]

    if missing_tables:
        table_names = [t.name for t in missing_tables]
        logger.info("迁移：创建微信 OAuth 表 %s", table_names)
        Base.metadata.create_all(bind=engine, tables=missing_tables, checkfirst=True)

    # 清理上次运行残留的过期记录
    now_sql = "DELETE FROM wechat_oauth_states WHERE expires_at < NOW()"
    if engine.dialect.name == "sqlite":
        now_sql = "DELETE FROM wechat_oauth_states WHERE expires_at < datetime('now')"
    with engine.begin() as conn:
        deleted = conn.execute(text(now_sql)).rowcount
    if deleted:
        logger.info("迁移：清理 %d 条过期微信 OAuth state 记录", deleted)

    now_sql = "DELETE FROM wechat_temp_codes WHERE expires_at < NOW()"
    if engine.dialect.name == "sqlite":
        now_sql = "DELETE FROM wechat_temp_codes WHERE expires_at < datetime('now')"
    with engine.begin() as conn:
        deleted = conn.execute(text(now_sql)).rowcount
    if deleted:
        logger.info("迁移：清理 %d 条过期微信临时码记录", deleted)


def run_startup_migrations(engine: Engine) -> None:
    """执行所有启动时迁移（幂等）."""
    try:
        add_token_version_column(engine)
        add_phone_hash_column(engine)
        encrypt_existing_phones(engine)
        populate_phone_hash(engine)
        add_stage_completed_dates_column(engine)
        add_thumbnail_url_to_photos(engine)
        add_renovation_extra_amount_columns(engine)
        add_other_decoration_amount_column(engine)
        run_fix_image_urls(engine)
        create_investment_tables(engine)
        rename_return_adjustment_columns(engine)
        add_finance_record_counterparty_columns(engine)
        create_finance_record_logs_table(engine)
        add_finance_record_receipt_urls_column(engine)
        add_cashflow_category_enum_values(engine)
        add_project_finance_settlement_columns(engine)
        migrate_record_date_to_timestamptz(engine)
        migrate_project_date_columns_to_date(engine)
        migrate_user_datetime_columns_to_timestamptz(engine)
        migrate_encrypted_columns_to_text(engine)
        migrate_all_datetime_columns_to_timestamptz(engine)
        create_wechat_oauth_tables(engine)
    except Exception:
        logger.exception("启动迁移失败")
        raise
