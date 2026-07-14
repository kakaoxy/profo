"""为 finance_records 表添加 counterparty_type 列."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine


def add_counterparty_type_to_finance_records(engine: Engine) -> None:
    """幂等添加 counterparty_type 列到 finance_records 表."""
    inspector = inspect(engine)
    if "finance_records" not in inspector.get_table_names():
        return
    if any(col["name"] == "counterparty_type" for col in inspector.get_columns("finance_records")):
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE finance_records ADD COLUMN counterparty_type VARCHAR(20)"))
