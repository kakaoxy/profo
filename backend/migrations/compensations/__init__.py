"""迁移补偿框架（总纲 §9 / K12 / K13）。

目录结构：
- ``base.py``：协议与数据类型（``CompensationContext`` / ``CompensationResult``）
- ``guards.py``：安全守卫（空表检查 / 行数预算）
- ``generic_drop.py``：A 级通用 DROP 补偿（声明式，44 项）
- ``registry.py``：版本 → 补偿函数解析（实脚本优先）
- ``00xx_<name>.py``：B 级实脚本（v4 / v50 / v78），文件名与 ``registry.Migration.name`` 对齐
"""

from migrations.compensations.base import (
    CompensationContext,
    CompensationNotSupportedError,
    CompensationResult,
    CompensationTooLargeError,
)

__all__ = [
    "CompensationContext",
    "CompensationNotSupportedError",
    "CompensationResult",
    "CompensationTooLargeError",
]
