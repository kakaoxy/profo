"""为 finance_records 表添加 counterparty_type 列（PostgreSQL 使用 enum 类型）."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def add_counterparty_type_to_finance_records(engine: Engine) -> None:
    """幂等添加 counterparty_type 列到 finance_records 表.

    - PostgreSQL: 使用 enum 类型 `counterpartytype`（与 SQLEnum(CounterpartyType) 默认名一致）。
      若列已存在且为 VARCHAR(20)（旧迁移创建），自动转为 counterpartytype enum。
    - 幂等：列已存在且为所需类型则跳过。
    """
    # 延迟导入避免循环依赖：migrations/__init__.py 在 _column_exists 定义前导入本模块
    from migrations import _column_exists  # noqa: PLC0415

    inspector = inspect(engine)
    if "finance_records" not in inspector.get_table_names():
        return

    if not _column_exists(engine, "finance_records", "counterparty_type"):
        # 列不存在，添加
        # PG: 先创建 enum 类型再添加列
        # 注意：PostgreSQL 不支持 CREATE TYPE IF NOT EXISTS，用 DO 块 + EXCEPTION 实现幂等
        with engine.begin() as conn:
            conn.execute(
                text(
                    "DO $$ BEGIN "
                    "CREATE TYPE counterpartytype AS ENUM ('company', 'individual'); "
                    "EXCEPTION WHEN duplicate_object THEN null; END $$;"
                ),
            )
            conn.execute(text("ALTER TABLE finance_records ADD COLUMN counterparty_type counterpartytype"))
        return

    # 列已存在，检查 PG 类型是否需要转为 enum
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT data_type FROM information_schema.columns "
                "WHERE table_name = 'finance_records' AND column_name = 'counterparty_type'"
            ),
        ).first()
    if not row or row[0] != "character varying":
        return

    # VARCHAR 转 enum
    with engine.begin() as conn:
        conn.execute(
            text(
                "DO $$ BEGIN "
                "CREATE TYPE counterpartytype AS ENUM ('company', 'individual'); "
                "EXCEPTION WHEN duplicate_object THEN null; END $$;"
            ),
        )
        conn.execute(
            text(
                "ALTER TABLE finance_records "
                "ALTER COLUMN counterparty_type TYPE counterpartytype "
                "USING counterparty_type::counterpartytype"
            ),
        )
