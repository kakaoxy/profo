"""v4 ``populate_phone_hash`` 的 B 级补偿脚本（总纲 §9.2 MVP 之一）.

**正向语义**（``migrations/_user_security.py::populate_phone_hash``）：
对 ``phone IS NOT NULL AND phone_hash IS NULL`` 的用户回填 ``phone_hash = hash_phone(phone)``。

**反向语义**：``UPDATE users SET phone_hash = NULL``——恢复到「只有密文手机号、
无 hash 索引值」的迁移前状态。这会同时移除 ``phone_hash`` 唯一索引的取值，但
**不删除索引本身**（索引由 v2 建立，属 v2 的回滚范围）。

⚠️ 副作用（必须让操作者知道）：``phone_hash`` 是登录/去重查询的加速键，清空后
这些查询退化为对 ``phone`` 解密比对，属于**性能降级**而非数据丢失。因此脚本
在 dry-run 里会报告受影响行数，并要求 CLI 闸门（行数上限 / 生产双确认）。
"""

from sqlalchemy import text
from sqlalchemy.engine import Connection

from migrations.compensations.base import CompensationContext, CompensationResult


def compensate(conn: Connection, ctx: CompensationContext) -> CompensationResult:
    """补偿 v4：清空 ``users.phone_hash``（dry-run 只统计）.

    Args:
        conn: 执行器开启的事务连接（禁止自行 commit）。
        ctx: 补偿上下文。

    Returns:
        影响行数 + 说明。

    """
    pending = int(conn.execute(text("SELECT count(*) FROM users WHERE phone_hash IS NOT NULL")).scalar() or 0)
    if ctx.dry_run:
        return CompensationResult(
            affected_rows=pending,
            notes=f"将清空 users.phone_hash（{pending} 行）；索引 idx_users_phone_hash 保留（属 v2 回滚范围）",
        )
    result = conn.execute(text("UPDATE users SET phone_hash = NULL WHERE phone_hash IS NOT NULL"))
    rows = int(result.rowcount or 0)
    return CompensationResult(
        affected_rows=rows,
        notes="users.phone_hash 已清空；手机号密文与索引保留（数据不丢失，仅查询性能降级）",
    )
