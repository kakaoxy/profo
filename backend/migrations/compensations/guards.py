"""补偿安全守卫（通用，跨补偿脚本复用）.

守卫的存在理由（总纲 §15.1 失败模式表「补偿脚本算错行数 → 二次伤害」）：
DROP 类回滚会**丢数据**，所以必须先证明目标对象里没有业务数据。
"""

from collections.abc import Iterable

from sqlalchemy import text
from sqlalchemy.engine import Connection

from migrations.compensations.base import CompensationTooLargeError


class CompensationGuardError(RuntimeError):
    """守卫拒绝执行（表非空 / 列存在依赖）。"""


def table_exists(conn: Connection, table: str) -> bool:
    """判断表是否存在（``to_regclass``，无异常）.

    Args:
        conn: 事务连接。
        table: 表名（常量）。

    Returns:
        存在返回 True。

    """
    return bool(
        conn.execute(text("SELECT to_regclass(:name) IS NOT NULL"), {"name": f"public.{table}"}).scalar(),
    )


def count_rows(conn: Connection, table: str) -> int:
    """统计表行数（表不存在返回 0）.

    Args:
        conn: 事务连接。
        table: 表名（常量）。

    Returns:
        行数。

    """
    if not table_exists(conn, table):
        return 0
    return int(conn.execute(text(f"SELECT count(*) FROM {table}")).scalar() or 0)


def assert_tables_empty(conn: Connection, tables: Iterable[str], *, force: bool) -> None:
    """守卫：待 DROP 的表必须为空（``force`` 可跳过，由 CLI 闸门控制）.

    Args:
        conn: 事务连接。
        tables: 待检查表名。
        force: 是否跳过守卫。

    Raises:
        CompensationGuardError: 表非空且未 ``force``。

    """
    if force:
        return
    offenders = [(table, count_rows(conn, table)) for table in tables]
    dirty = [(table, rows) for table, rows in offenders if rows > 0]
    if dirty:
        detail = ", ".join(f"{table}({rows} 行)" for table, rows in dirty)
        msg = (
            f"补偿拒绝执行：以下表已有业务数据（{detail}），DROP 会丢失数据。"
            "请改用 restore-hint 恢复备份，或确认可丢弃后加 --force。"
        )
        raise CompensationGuardError(msg)


def check_row_budget(rows: int, max_rows: int, *, force: bool) -> None:
    """守卫：影响行数不得超过 ``MIGRATION_COMPENSATION_MAX_ROWS``（K13）.

    Args:
        rows: 预计影响行数。
        max_rows: 上限。
        force: 是否跳过。

    Raises:
        CompensationTooLargeError: 超限且未 ``force``。

    """
    if force or rows <= max_rows:
        return
    msg = f"补偿影响行数 {rows} 超过上限 {max_rows}。确认无误后加 --force 重试。"
    raise CompensationTooLargeError(msg)
