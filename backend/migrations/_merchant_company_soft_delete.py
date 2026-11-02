"""公司软删除迁移（REQ-IT7-02）.

给 ``merchant_companies`` 补 ``deleted_at`` / ``deleted_by`` 与删除态索引，
使公司支持软删除（列表查询按 ``deleted_at IS NULL`` 过滤）。
"""

from sqlalchemy import Engine, inspect, text


def add_merchant_company_soft_delete_columns(engine: Engine) -> None:
    """幂等：补 deleted_at/deleted_by 列与 idx_merchant_companies_deleted 索引."""
    inspector = inspect(engine)
    if "merchant_companies" not in inspector.get_table_names():
        return
    columns = {column["name"] for column in inspector.get_columns("merchant_companies")}
    with engine.begin() as connection:
        if "deleted_at" not in columns:
            connection.execute(text("ALTER TABLE merchant_companies ADD COLUMN deleted_at TIMESTAMPTZ"))
        if "deleted_by" not in columns:
            connection.execute(text("ALTER TABLE merchant_companies ADD COLUMN deleted_by VARCHAR(36)"))
        indexes = {index["name"] for index in inspect(engine).get_indexes("merchant_companies")}
        if "idx_merchant_companies_deleted" not in indexes:
            connection.execute(text("CREATE INDEX idx_merchant_companies_deleted ON merchant_companies (deleted_at)"))
