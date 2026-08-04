"""列类型迁移.

包含 timestamp → timestamptz、VARCHAR → date、VARCHAR → text 等列类型合规性修复。
均为幂等执行，通过 information_schema 判断当前类型决定是否跳过。
"""

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)


def migrate_record_date_to_timestamptz(engine: Engine) -> None:
    """将 finance_records.record_date 列从 timestamp 迁移为 timestamptz.

    合规性修复：record_date 原为 DateTime(无 tz)，与 BaseModel 的 created_at/updated_at
    不一致，会触发时区 stripping（违反 AGENTS.md §3 时间列统一 timezone=True）。

    - PostgreSQL: ALTER COLUMN ... TYPE timestamptz USING record_date AT TIME ZONE 'UTC'
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


def widen_url_columns_to_text(engine: Engine) -> None:
    """将 URL 列从 VARCHAR(500) 迁移为 text（M5 安全加固）.

    修复：OSS/CDN URL 含 query string、长 CDN 路径时可能超过 500 字符，
    PG 严格强制 VARCHAR 长度会触发 "value too long for type character varying(500)"。
    模型层已改为 Text，此迁移同步已存在的 PG 表列类型为 text。

    涉及列：
    - property_media.url
    - renovation_photos.url
    - project_renovations.soft_detail_attachment
    - property_import_tasks.failed_file_url

    - PostgreSQL: ALTER COLUMN ... TYPE text（VARCHAR → text 隐式可转换，无需 USING）
    - 幂等：通过 information_schema.columns 判断 data_type，已是 text 则跳过
    - 表名/列名为硬编码字符串，未用 f-string 拼接变量（规范11）
    """
    inspector = inspect(engine)
    if engine.dialect.name != "postgresql":
        return

    # 每列对应一段硬编码 ALTER SQL（避免 f-string 拼接表名/列名）
    alter_statements = {
        ("property_media", "url"): "ALTER TABLE property_media ALTER COLUMN url TYPE text",
        ("renovation_photos", "url"): "ALTER TABLE renovation_photos ALTER COLUMN url TYPE text",
        ("project_renovations", "soft_detail_attachment"): (
            "ALTER TABLE project_renovations ALTER COLUMN soft_detail_attachment TYPE text"
        ),
        ("property_import_tasks", "failed_file_url"): (
            "ALTER TABLE property_import_tasks ALTER COLUMN failed_file_url TYPE text"
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


def migrate_uuid_columns_to_native_uuid(engine: Engine) -> None:
    """将所有模型 Uuid 列在 PostgreSQL 中统一迁移为原生 uuid 类型.

    合规性修复：BaseModel.id 及 project_id 逻辑外键列原为 String(36)（PG varchar），
    模型层已改为 SQLAlchemy ``Uuid``（``Mapped[uuid.UUID]``）。此迁移同步已存在的
    PG 表列类型为原生 uuid，获得 DB 层格式强制（拒绝非 UUID 字符串）与存储优化。

    覆盖：projects.id、users.id 等所有 BaseModel 派生表主键，以及 project_contracts/
    project_documents/... 等表的 project_id 列。不继承 BaseModel 的表（community/lead/
    import_task 等显式 String(36) 主键）因模型仍为 String 不受影响。

    - PostgreSQL: ``ALTER COLUMN ... TYPE uuid USING <col>::uuid``（既有值均为
      ``str(uuid.uuid4())`` 生成的标准 UUID4 字符串，``::uuid`` 转换安全）
    - 幂等：通过 ``information_schema.columns.data_type`` 判断，已是 ``uuid`` 则跳过
    - 非 PG 后端（开发/测试 SQLite 等）直接跳过（SQLite 无独立 uuid 类型）
    - 表名/列名来自可信模型元数据；DDL 不支持绑定参数故字符串拼接
    """
    if engine.dialect.name != "postgresql":
        return

    from sqlalchemy import Uuid  # noqa: PLC0415

    from models import Base  # noqa: PLC0415

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    migrated = 0
    for table_name, table in Base.metadata.tables.items():
        if table_name not in existing_tables:
            continue
        for column in table.columns:
            if not isinstance(column.type, Uuid):
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
            if row[0] == "uuid":
                continue
            logger.info("迁移：%s.%s → uuid（当前类型 %s）", table_name, column.name, row[0])
            # 表名/列名来自可信模型元数据；DDL 不支持绑定参数
            alter_sql = (
                "ALTER TABLE " + table_name + " "
                "ALTER COLUMN " + column.name + " TYPE uuid "
                "USING " + column.name + "::uuid"
            )
            with engine.begin() as conn:
                conn.execute(text(alter_sql))
            migrated += 1

    if migrated:
        logger.info("迁移：共 %d 个列转为 uuid", migrated)
