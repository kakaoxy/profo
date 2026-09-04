"""PostgreSQL 兼容性测试：DateTime 列 timezone 约束.

覆盖 Task 2 修复点：
所有模型的 DateTime 列必须带 timezone=True，避免 PostgreSQL 端
timestamptz 被静默 strip 为 naive datetime 导致时区丢失。

测试方式：遍历 Base.metadata.tables 中所有 DateTime 类型列，
断言 column.type.timezone is True。
"""

from sqlalchemy import DateTime

# 导入 models 包触发所有模型注册到 Base.metadata
from models import Base


def test_all_datetime_columns_have_timezone() -> None:
    """所有 DateTime 列必须带 timezone=True.

    不带 timezone 的列在 PostgreSQL 上会用 timestamp (without zone)，
    导致写入/读取时丢失时区信息（AGENTS.md 硬约束：时间列统一
    DateTime(timezone=True)）。
    """
    violations: list[str] = [
        f"{table_name}.{column.name}"
        for table_name, table in Base.metadata.tables.items()
        for column in table.columns
        if isinstance(column.type, DateTime) and not column.type.timezone
    ]

    assert not violations, f"以下 DateTime 列未设置 timezone=True（违反 AGENTS.md 约束）: {violations}"
