"""财务相关迁移.

包含跟投管理表、资金账本（finance_records）列变更、科目管理表、enum 同步、
项目结算列等迁移。均为幂等执行。
"""

import json
import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from migrations._helpers import (
    _MIGRATION_BATCH_SIZE,
    _column_exists,
    _index_exists,
    _pg_quote_literal,
)
from migrations._seeds_subjects import _INITIAL_SUBJECTS

logger = logging.getLogger(__name__)


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
    """为 finance_records 表添加 counterparty/receipt_url 列（资金账本，幂等）.

    - counterparty: 交易方（VARCHAR(100)）
    - receipt_url: 票据图片URL（VARCHAR(500)）
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


def create_finance_subjects_table(engine: Engine) -> None:
    """幂等创建科目管理表 finance_subjects 并初始化系统预置科目.

    1. 幂等创建表（CREATE TABLE IF NOT EXISTS 语义，checkfirst=True）
    2. 幂等创建索引 idx_subject_stage（按 stage 查询）
    3. 幂等初始化系统预置科目（INSERT ... ON CONFLICT (name) DO NOTHING）

    替代原 CashFlowCategory 硬编码枚举，支持用户自定义科目 CRUD。
    system=True 的记录为系统预置，is_deleted=False。

    种子数据见 _INITIAL_SUBJECTS（37 条 S01-S37，按 name 幂等插入）。
    """
    from models import Base  # noqa: PLC0415
    from models.project import FinanceSubject  # noqa: PLC0415

    # 1. 幂等创建表
    inspector = inspect(engine)
    if FinanceSubject.__table__.name not in inspector.get_table_names():
        logger.info("迁移：创建科目管理表 %s", FinanceSubject.__table__.name)
        Base.metadata.create_all(bind=engine, tables=[FinanceSubject.__table__], checkfirst=True)

    # 2. 幂等创建索引（表已存在但索引缺失时补建）
    if not _index_exists(engine, "idx_subject_stage"):
        logger.info("迁移：创建 idx_subject_stage 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_subject_stage ON finance_subjects (stage)"))

    # 3. 幂等初始化系统预置科目（按 name 去重）
    if not _INITIAL_SUBJECTS:
        return

    inserted = 0
    with engine.begin() as conn:
        for subj in _INITIAL_SUBJECTS:
            result = conn.execute(
                text(
                    "INSERT INTO finance_subjects "
                    "(id, name, level, pnl, modes, stage, note, system, is_deleted, created_at, updated_at) "
                    "VALUES (:id, :name, :level, :pnl, CAST(:modes AS JSONB), :stage, :note, "
                    "TRUE, FALSE, NOW(), NOW()) "
                    "ON CONFLICT (name) DO NOTHING"
                ),
                {
                    "id": subj["id"],
                    "name": subj["name"],
                    "level": subj["level"],
                    "pnl": subj["pnl"],
                    "modes": json.dumps(subj["modes"], ensure_ascii=False),
                    "stage": subj["stage"],
                    "note": subj.get("note"),
                },
            )
            inserted += result.rowcount
    if inserted:
        logger.info("迁移：初始化 %d 条系统预置科目", inserted)


def migrate_finance_subjects_modes_to_jsonb(engine: Engine) -> None:
    """将 finance_subjects.modes 列从 JSON 迁移为 JSONB 并创建 GIN 索引（P2-11，幂等）.

    - PostgreSQL: ALTER COLUMN modes TYPE jsonb USING modes::jsonb，
      再 CREATE INDEX idx_subject_modes_gin USING GIN (modes jsonb_path_ops)。
      jsonb_path_ops 索引体积更小、@> 查询更快，不支持其他 jsonb 运算符
      （本项目 modes 仅使用 @> 包含查询，符合该索引策略）。
    - 幂等：通过 information_schema 判断 data_type，已是 jsonb 则跳过 ALTER；
      索引通过 _index_exists 检查跳过 CREATE。
    - SQLite 测试后端不支持 JSONB/GIN jsonb_path_ops，直接跳过。
    """
    if engine.dialect.name != "postgresql":
        return

    inspector = inspect(engine)
    if "finance_subjects" not in inspector.get_table_names():
        return

    # 1. JSON → JSONB（已是 jsonb 则跳过 ALTER）
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'finance_subjects' AND column_name = 'modes'",
            ),
        ).first()
    if row is None:
        return
    if row[0] == "json":
        logger.info("迁移：finance_subjects.modes → jsonb（当前类型 %s）", row[0])
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE finance_subjects ALTER COLUMN modes TYPE jsonb USING modes::jsonb",
                ),
            )

    # 2. 创建 GIN 索引（jsonb_path_ops：仅支持 @>，体积更小、查询更快）
    if not _index_exists(engine, "idx_subject_modes_gin"):
        logger.info("迁移：创建 idx_subject_modes_gin 索引 (modes jsonb_path_ops)")
        with engine.begin() as conn:
            conn.execute(
                text(
                    "CREATE INDEX idx_subject_modes_gin ON finance_subjects USING GIN (modes jsonb_path_ops)",
                ),
            )


def add_finance_record_subject_columns(engine: Engine) -> None:
    """为 finance_records 表添加科目/收支/收付款方 5 列并回填历史数据（资金账本，幂等）.

    新增列：
    - subject_id: 科目ID（VARCHAR(36)，逻辑外键→finance_subjects.id）
    - outflow: 流出金额（NUMERIC(15,2) NOT NULL DEFAULT 0）
    - inflow: 流入金额（NUMERIC(15,2) NOT NULL DEFAULT 0）
    - payer: 付款方（VARCHAR(100)）
    - payee: 收款方（VARCHAR(100)）

    历史数据回填（仅处理对应字段为 NULL/0 的行，幂等）：
    - outflow/inflow 按 type 拆分 amount（expense→outflow, income→inflow）
    - payer 从 counterparty 回填（payee 留空，仅处理 payer IS NULL 的行）
    - subject_id 通过 category::text JOIN finance_subjects.name 匹配
      （category 是 PostgreSQL enum，需 CAST 为 text 才能与 name VARCHAR 比较）

    索引：idx_finance_subject_id ON finance_records(subject_id)

    幂等：通过 _column_exists 检查跳过 ALTER；回填仅处理 NULL/0 行；索引 IF NOT EXISTS。
    使用硬编码 DDL 字符串避免 f-string 拼接列名（AGENTS.md §11）。
    """
    # 1. 幂等添加列（列名+类型硬编码元组，DDL 不支持绑定参数）
    for column_name, column_type_sql in (
        ("subject_id", "VARCHAR(36)"),
        ("outflow", "NUMERIC(15,2) NOT NULL DEFAULT 0"),
        ("inflow", "NUMERIC(15,2) NOT NULL DEFAULT 0"),
        ("payer", "VARCHAR(100)"),
        ("payee", "VARCHAR(100)"),
    ):
        if _column_exists(engine, "finance_records", column_name):
            continue
        logger.info("迁移：为 finance_records 表添加 %s 列", column_name)
        ddl = "ALTER TABLE finance_records ADD COLUMN " + column_name + " " + column_type_sql
        with engine.begin() as conn:
            conn.execute(text(ddl))

    # 2. 历史数据回填（幂等：仅处理未填充行）
    with engine.begin() as conn:
        # 2.1 outflow/inflow 按 type 拆分 amount（仅处理同时为 0 且 amount>0 的行）
        conn.execute(
            text(
                "UPDATE finance_records "
                "SET outflow = CASE WHEN type='expense' THEN amount ELSE 0 END, "
                "    inflow = CASE WHEN type='income' THEN amount ELSE 0 END "
                "WHERE outflow=0 AND inflow=0 AND amount>0"
            )
        )
        # 2.2 payer 从 counterparty 回填（payee 留空，仅处理 payer IS NULL 的行）
        conn.execute(
            text("UPDATE finance_records SET payer = counterparty WHERE payer IS NULL AND counterparty IS NOT NULL")
        )
        # 2.3 subject_id 通过 category::text JOIN finance_subjects.name 匹配回填
        #     category 是 PostgreSQL enum，需 CAST 为 text 才能与 name(VARCHAR) 比较
        conn.execute(
            text(
                "UPDATE finance_records fr SET subject_id = fs.id "
                "FROM finance_subjects fs "
                "WHERE fr.subject_id IS NULL "
                "  AND fs.name = fr.category::text "
                "  AND fs.is_deleted = false"
            )
        )

    # 3. 幂等创建索引 idx_finance_subject_id ON finance_records(subject_id)
    if not _index_exists(engine, "idx_finance_subject_id"):
        logger.info("迁移：创建 idx_finance_subject_id 索引")
        with engine.begin() as conn:
            conn.execute(text("CREATE INDEX IF NOT EXISTS idx_finance_subject_id ON finance_records (subject_id)"))


def add_finance_record_receipt_urls_column(engine: Engine) -> None:
    """为 finance_records 表添加 receipt_urls JSON 列并从旧 receipt_url 回填.

    - 新增 receipt_urls JSON 列（多票据支持）
    - 旧 receipt_url（VARCHAR）单值回填为单元素数组 [url]
    - 旧列保留但模型层不再映射（向后兼容）
    - 幂等：通过 _column_exists 检查跳过 ALTER；回填仅处理 receipt_urls IS NULL 的行
    - 使用 SQLAlchemy Core update() 确保 PostgreSQL 正确序列化 JSON
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

    SQLEnum 创建原生 enum 类型 `cashflowcategory`。
    Python 枚举新增值后，PostgreSQL enum 类型不会自动同步，需 ALTER TYPE ... ADD VALUE
    （PG 9.3+ 支持 IF NOT EXISTS）。

    本迁移直接遍历 Python CashFlowCategory 枚举的所有值并同步到 PostgreSQL，
    避免硬编码列表遗漏（曾遗漏 "保证金回收" 等值导致记账 500 错误）。

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
                # PostgreSQL DDL 不支持绑定参数；enum 值经 _pg_quote_literal 防御性转义
                conn.execute(text(f"ALTER TYPE cashflowcategory ADD VALUE IF NOT EXISTS {_pg_quote_literal(val)}"))
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
            conn.execute(
                text(
                    "ALTER TABLE projects "
                    "ADD COLUMN finance_settlement_status settlementstatus "
                    "NOT NULL DEFAULT 'unsettled'",
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
                    # PostgreSQL DDL 不支持绑定参数；enum 值经 _pg_quote_literal 防御性转义
                    conn.execute(text(f"ALTER TYPE financeactiontype ADD VALUE IF NOT EXISTS {_pg_quote_literal(val)}"))
                    added += 1
        if added:
            logger.info("迁移：同步 financeactiontype enum（共 %d 个值）", added)
