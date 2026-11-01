"""商户协议取消审核（REQ-IT5-03）.

变更内容（幂等）：
- 新增 ``sign_code``（商户签署分享码）与 ``void_reason``（作废原因）；
- 删除 ``review_status`` / ``reviewed_at`` / ``reviewed_by`` / ``review_remark`` 与审核索引；
- 存量 ``not_initiated`` 记录统一置为 ``pending_sign``：审核环节取消后不再存在“未发起”可签入口。

只做结构级变更，不写种子数据；历史审核记录已随列删除，必要时以 ``schema_migrations``
账本 + 备份恢复（见 registry 中 ``backup`` 字段）。
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from migrations._helpers import _column_exists, _index_exists

_TABLE = "merchant_agreements"


def _add_column(engine: Engine, column: str, ddl: str) -> None:
    if _column_exists(engine, _TABLE, column):
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {_TABLE} ADD COLUMN {column} {ddl}"))


def _drop_column(engine: Engine, column: str) -> None:
    if not _column_exists(engine, _TABLE, column):
        return
    with engine.begin() as conn:
        conn.execute(text(f"ALTER TABLE {_TABLE} DROP COLUMN {column}"))


def drop_agreement_review_fields(engine: Engine) -> None:
    """删除协议审核字段与索引，补签署分享码/作废原因（幂等）."""
    if _TABLE not in inspect(engine).get_table_names():
        return

    _add_column(engine, "sign_code", "VARCHAR(36)")
    _add_column(engine, "void_reason", "VARCHAR(500)")

    if _index_exists(engine, "idx_merchant_agreements_review"):
        with engine.begin() as conn:
            conn.execute(text("DROP INDEX idx_merchant_agreements_review"))

    for column in ("review_status", "reviewed_at", "reviewed_by", "review_remark"):
        _drop_column(engine, column)

    if not _index_exists(engine, "idx_merchant_agreements_sign_code"):
        with engine.begin() as conn:
            conn.execute(
                text("CREATE INDEX idx_merchant_agreements_sign_code ON merchant_agreements (sign_code)"),
            )

    # 审核环节取消：历史“未发起”记录直接进入待签署，避免商户永远看不到可签协议
    if _column_exists(engine, _TABLE, "status"):
        with engine.begin() as conn:
            conn.execute(
                text(
                    "UPDATE merchant_agreements SET sign_code = md5(random()::text || id) "
                    "WHERE sign_code IS NULL AND status IN ('pending_sign', 'not_initiated')",
                ),
            )
            conn.execute(
                text(
                    "UPDATE merchant_agreements SET status = 'pending_sign' WHERE status = 'not_initiated'",
                ),
            )


__all__ = ["drop_agreement_review_fields"]
