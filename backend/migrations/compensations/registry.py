"""补偿注册表与解析入口（总纲 §9.2 / K13）。

优先级（``resolve_compensation``）：
1. **实脚本**：``COMPENSATIONS[version]``（3 个 B 级：v4 / v50 / v78）；
2. **A 级通用 DROP**：``generic_drop.DROP_SPECS``（44 项，带空表守卫）；
3. 其余（C 级 / D 级 / 未提供脚本的 B 级）→ 抛 ``CompensationNotSupportedError``，
   CLI 转而输出 ``restore-hint``（备份路径 + pg_restore 命令 + 验证 SQL）。

**为何 B 级只做 3 个实脚本**（spec §9.2）：3 个都满足「反向条件可精确判定 +
影响面可控」，可作为框架的可验证样板；其余 B 级先上线 dry-run/restore-hint，
实跑版本按 §12 迭代追加（``restore-hint`` 已兜底）。
"""

import importlib

from migrations.compensations import generic_drop
from migrations.compensations.base import (
    CompensateFn,
    CompensationContext,
    CompensationNotSupportedError,
    CompensationResult,
)

# 实脚本登记：version → "<模块名>"（模块须暴露 compensate(conn, ctx)）
SCRIPT_MODULES: dict[int, str] = {
    4: "migrations.compensations.0004_populate_phone_hash",
    50: "migrations.compensations.0050_backfill_lead_unit_price",
    78: "migrations.compensations.0078_backfill_bd_room_floor",
}


def _load_scripts() -> dict[int, CompensateFn]:
    """按需导入实脚本模块并取出 ``compensate``（模块名以数字开头，只能 importlib）.

    Returns:
        version → 补偿函数。

    """
    loaded: dict[int, CompensateFn] = {}
    for version, module_name in SCRIPT_MODULES.items():
        module = importlib.import_module(module_name)
        loaded[version] = module.compensate
    return loaded


COMPENSATIONS: dict[int, CompensateFn] = _load_scripts()
"""version → 补偿函数（仅含实脚本；A 级通用 DROP 走 ``resolve_compensation``）."""


def has_compensation(version: int) -> bool:
    """该版本是否存在可执行补偿（实脚本或 A 级 DROP）.

    Args:
        version: 迁移版本号。

    Returns:
        可补偿返回 True。

    """
    return version in COMPENSATIONS or version in generic_drop.DROP_SPECS


def resolve_compensation(version: int) -> CompensateFn:
    """解析该版本的补偿函数（实脚本优先，其次 A 级通用 DROP）.

    Args:
        version: 迁移版本号。

    Returns:
        补偿函数。

    Raises:
        CompensationNotSupportedError: 无实脚本且不在 DROP_SPECS。

    """
    if version in COMPENSATIONS:
        return COMPENSATIONS[version]
    if version in generic_drop.DROP_SPECS:
        return generic_drop.compensate
    msg = f"v{version} 无补偿脚本（不可逆或未提供脚本），请使用 manage restore-hint {version}"
    raise CompensationNotSupportedError(msg)


def run_compensation(conn: object, version: int, ctx: CompensationContext) -> CompensationResult:
    """执行补偿函数（薄封装，便于单测替换）.

    Args:
        conn: 执行器开启的事务连接。
        version: 迁移版本号。
        ctx: 补偿上下文。

    Returns:
        补偿结果。

    """
    return resolve_compensation(version)(conn, ctx)  # type: ignore[arg-type]
