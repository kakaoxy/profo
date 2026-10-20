"""v78 ``backfill_bd_room_floor`` 的 B 级补偿脚本（总纲 §9.2 MVP 之一）.

**正向语义**（``migrations/_bd_room_floor_backfill.py``）：把 ``floor IS NULL`` 且
户室号可被新规则解析（4 位前两位 >0 / 3 位首位 >0）的 ``bd_rooms.floor`` 回填为楼层数。

**反向语义**：``SET floor = NULL``，条件与正向 WHERE 完全一致——即只有「旧规则解析
不出、新规则能解析」的户室号会被清空。这是**可精确判定**的集合（不依赖时间或
业务写入），因此比 v50 更接近严格反向。

⚠️ 边界：若回填后业务又对同一行做过楼层修正（人工改层），旧规则仍无法解析该
户室号（room_no 未变），本脚本会把它一并清回 NULL。dry-run 的行数可用于
与正向迁移日志的「影响 N 行」比对，若不一致说明期间有人工改动，应改用 restore。
"""

from sqlalchemy import text
from sqlalchemy.engine import Connection

from migrations.compensations.base import CompensationContext, CompensationResult

# 与正向迁移 _BACKFILL_SQL 的 WHERE 完全同口径（不可解析的户室号天然不在集合内）
_PARSABLE = (
    "floor IS NOT NULL AND ("
    "(room_no ~ '^\\d{4}$' AND substring(room_no from 1 for 2)::int > 0) "
    "OR (room_no ~ '^\\d{3}$' AND substring(room_no from 1 for 1)::int > 0)"
    ")"
)


def compensate(conn: Connection, ctx: CompensationContext) -> CompensationResult:
    """补偿 v78：清空「3 位/4 位可解析户室号」的 bd_rooms.floor（dry-run 只统计）.

    Args:
        conn: 执行器开启的事务连接（禁止自行 commit）。
        ctx: 补偿上下文。

    Returns:
        影响行数 + 说明。

    """
    pending = int(conn.execute(text(f"SELECT count(*) FROM bd_rooms WHERE {_PARSABLE}")).scalar() or 0)
    if ctx.dry_run:
        return CompensationResult(
            affected_rows=pending,
            notes=(
                f"将清空 {pending} 行 bd_rooms.floor；请与正向迁移日志「影响 N 行」比对，"
                "不一致说明期间有人工改层，应改用 restore"
            ),
        )
    result = conn.execute(text(f"UPDATE bd_rooms SET floor = NULL WHERE {_PARSABLE}"))
    rows = int(result.rowcount or 0)
    return CompensationResult(
        affected_rows=rows,
        notes=f"已清空 {rows} 行 bd_rooms.floor（3 位/4 位可解析户室号恢复为未分层）",
    )
