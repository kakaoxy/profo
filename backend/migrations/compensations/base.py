"""补偿框架协议（总纲 K12 / K13）。

补偿函数签名固定为 ``compensate(conn: Connection, ctx: CompensationContext) -> CompensationResult``：
- **执行器统一开启单事务**（``engine.begin()``），失败整体回滚；
- 补偿函数**禁止**自行 ``commit()``（单测通过「抛错后表内容不变」强制）；
- ``dry_run=True`` 时**只允许 SELECT count(*)**，不得执行任何 DML（单测强制）。
"""

from collections.abc import Callable
from dataclasses import dataclass

from sqlalchemy.engine import Connection


@dataclass(frozen=True, slots=True)
class CompensationContext:
    """一次补偿的执行上下文（由 CLI / 执行器填充）.

    ⚠️ ``force`` 是对 spec §9.1 字段集的**加法扩展**（不改变既有字段语义）：
    §9.4 的 ``--force`` 闸门必须能穿透到 A 级通用补偿的「空表守卫」，
    否则守卫永远拿不到操作者的显式确认。已在 spec §9.1 同步登记。
    """

    version: int
    dry_run: bool
    max_rows: int
    reason: str | None
    operator: str
    force: bool = False


@dataclass(frozen=True, slots=True)
class CompensationResult:
    """补偿执行结果."""

    affected_rows: int
    notes: str | None = None


class CompensationTooLargeError(RuntimeError):
    """影响行数超过 ``MIGRATION_COMPENSATION_MAX_ROWS`` 且未加 ``--force``."""


class CompensationNotSupportedError(RuntimeError):
    """该版本无可用补偿（不可逆 / 未提供脚本）——CLI 转而输出 ``restore-hint``."""


CompensateFn = Callable[[Connection, CompensationContext], CompensationResult]
