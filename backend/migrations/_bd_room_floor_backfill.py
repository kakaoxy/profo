"""回填 bd_rooms.floor 存量未分层户室（幂等数据迁移）.

背景：楼层不是地址的组成部分，一律由户室号解析（批量导入亦无楼层字段）。
历史上 parse_room_floor 仅支持 4 位标准号（``0401``→4），3 位纯数字户室号
（``202`` = 2 层 02 户的低层惯例）被归为「楼层待定」（floor=NULL）。
解析规则扩展后（utils.building_dict.parse_room_floor 支持 3 位号），存量落库的
NULL 需一次性修正，使 202 与批量补录的 0201-0204 归入同一楼层分组。

幂等性：仅更新 floor IS NULL 且 room_no 可被新规则解析（4 位前两位 >0 / 3 位
首位 >0）的行；回填后不再命中 WHERE 条件，可重复执行。不可解析的户室号
（``0233-1``、``1-2楼``、``001`` 等）保持 NULL（未分层）不动。
"""

import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 与 utils.building_dict.parse_room_floor 同口径的 SQL 解析：
# 4 位 → 前两位楼层；3 位 → 首位楼层；楼层位为 0 视为不可解析
_BACKFILL_SQL = text(
    "UPDATE bd_rooms SET floor = CASE "
    "WHEN room_no ~ '^\\d{4}$' AND substring(room_no from 1 for 2)::int > 0 "
    "THEN substring(room_no from 1 for 2)::int "
    "WHEN room_no ~ '^\\d{3}$' AND substring(room_no from 1 for 1)::int > 0 "
    "THEN substring(room_no from 1 for 1)::int END "
    "WHERE floor IS NULL "
    "AND ((room_no ~ '^\\d{4}$' AND substring(room_no from 1 for 2)::int > 0) "
    "OR (room_no ~ '^\\d{3}$' AND substring(room_no from 1 for 1)::int > 0))"
)


def backfill_bd_room_floor(engine: Engine) -> None:
    """按新解析规则回填 bd_rooms.floor 为 NULL 的可解析户室.

    Args:
        engine: SQLAlchemy 引擎

    """
    with engine.begin() as conn:
        result = conn.execute(_BACKFILL_SQL)
        affected = result.rowcount or 0
    if affected:
        logger.info("迁移：回填 bd_rooms.floor（3 位户室号楼层解析），影响 %d 行", affected)
