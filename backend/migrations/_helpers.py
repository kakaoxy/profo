"""迁移通用辅助函数与常量.

集中存放被多个迁移子模块共享的低层工具：
- _pg_quote_literal：PostgreSQL DDL 字符串字面量转义
- _column_exists / _index_exists：幂等性检查
- 批量迁移批次大小、Fernet 密文前缀、advisory lock key 等常量
"""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

_FERNET_CIPHER_PREFIX = "gAAAAA"
_MIGRATION_BATCH_SIZE = 500

# 多 worker 部署下迁移串行化用的 advisory lock key（固定 bigint，任意取值）
# 不同应用应取不同值避免冲突；此处仅 Profo 使用
_MIGRATION_ADVISORY_LOCK_KEY = 20260722130001


def _pg_quote_literal(value: str) -> str:
    """转义 PostgreSQL 字符串字面量（P2-16 防御性转义）.

    将单引号加倍为 ''，并包裹外层单引号。用于 ``ALTER TYPE ... ADD VALUE``
    等 DDL 语句中拼接 enum 值（DDL 不支持绑定参数）。
    虽然当前 enum 值均为可信的 Python 枚举（不含单引号），但仍做防御性转义，
    避免后续新增 enum 值时遗漏。
    """
    escaped = value.replace("'", "''")
    return f"'{escaped}'"


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    """检查某列是否已存在."""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _column_default(engine: Engine, table: str, column: str) -> str | None:
    """查询某列的 DDL 默认值表达式.

    Returns:
        默认值表达式（如 ``false``）；列不存在或无默认值时返回 None。
        用于识别「列存在但缺 DEFAULT」的陈旧中间态（幂等迁移盲区）。

    """
    with engine.connect() as conn:
        row = conn.execute(
            text(
                "SELECT column_default FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column LIMIT 1"
            ),
            {"table": table, "column": column},
        ).first()
    return str(row[0]) if row and row[0] is not None else None


def _index_exists(engine: Engine, index_name: str) -> bool:
    """检查某索引是否已存在."""
    with engine.connect() as conn:
        return bool(
            conn.execute(
                text("SELECT 1 FROM pg_indexes WHERE indexname = :index LIMIT 1"),
                {"index": index_name},
            ).first(),
        )
