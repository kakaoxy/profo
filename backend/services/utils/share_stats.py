"""「我的分享统计」共享聚合.

估价/房源/房源单/招募四链路的 ``get_my_share_stats`` 同构：share_count 按
分享事件 employee、pv/uv 按访问埋点 referrer（uv 为 distinct 去重键）、
lead_count 按线索/预约归属字段；差异仅在模型与列名（招募的时间列为
shared_at/entered_at、UV 去重键为 openid_hash，预约归属为 referrer_user_id），
由调用方以列参数注入，聚合逻辑单点维护避免口径漂移。

每条链路以单条 SELECT + 8 个标量子查询返回全部指标（1 次数据库往返），
「我的客户」四链路聚合由约 32 条顺序查询降至 4 条。
"""

from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import InstrumentedAttribute, Session

from utils.time_windows import today_window

_SHARE_STATS_KEYS = (
    "share_count",
    "pv",
    "uv",
    "lead_count",
    "today_share_count",
    "today_pv",
    "today_uv",
    "today_lead_count",
)


def aggregate_my_share_stats(
    db: Session,
    *,
    user_id: str,
    share_employee_col: InstrumentedAttribute[Any],
    share_time_col: InstrumentedAttribute[Any],
    visit_referrer_col: InstrumentedAttribute[Any],
    visit_uv_col: InstrumentedAttribute[Any],
    visit_time_col: InstrumentedAttribute[Any],
    lead_referrer_col: InstrumentedAttribute[Any],
    lead_time_col: InstrumentedAttribute[Any],
) -> dict[str, int]:
    """聚合单链路「我的分享统计」8 项指标（单次数据库往返）.

    口径：share_count 按 ``share_employee_col``、pv/uv 按 ``visit_referrer_col``
    （uv 为 distinct ``visit_uv_col``）、lead_count 按 ``lead_referrer_col``；
    今日窗口为 Asia/Shanghai 自然日、左闭右开
    （见 ``utils.time_windows.today_window``）。

    Args:
        db: 同步数据库会话
        user_id: 当前员工 ID
        share_employee_col: 分享事件员工列
        share_time_col: 分享事件时间列（招募为 shared_at，其余为 created_at）
        visit_referrer_col: 访问埋点归属员工列
        visit_uv_col: UV 去重键列（招募为 openid_hash，其余为匿名 visitor_id）
        visit_time_col: 访问埋点时间列（招募为 entered_at，其余为 created_at）
        lead_referrer_col: 线索/预约归属列（referrer_id / referrer_user_id /
            referrer_employee_id）
        lead_time_col: 线索/预约时间列

    Returns:
        与 ``PublicShareStatsResponse``/``RecruitMyShareStatsResponse`` 字段
        一致的 8 项指标字典。

    """
    t_start, t_end = today_window()

    def _count_subquery(conditions: list[Any], *, distinct_col: InstrumentedAttribute[Any] | None = None) -> Any:
        """构造标量子查询：按条件 count（可选按列 distinct 去重）."""
        agg = func.count(func.distinct(distinct_col)) if distinct_col is not None else func.count()
        return select(agg).where(*conditions).scalar_subquery()

    row = db.execute(
        select(
            _count_subquery([share_employee_col == user_id]),
            _count_subquery([visit_referrer_col == user_id]),
            _count_subquery([visit_referrer_col == user_id], distinct_col=visit_uv_col),
            _count_subquery([lead_referrer_col == user_id]),
            _count_subquery([share_employee_col == user_id, share_time_col >= t_start, share_time_col < t_end]),
            _count_subquery([visit_referrer_col == user_id, visit_time_col >= t_start, visit_time_col < t_end]),
            _count_subquery(
                [visit_referrer_col == user_id, visit_time_col >= t_start, visit_time_col < t_end],
                distinct_col=visit_uv_col,
            ),
            _count_subquery([lead_referrer_col == user_id, lead_time_col >= t_start, lead_time_col < t_end]),
        )
    ).one()

    return {key: int(value or 0) for key, value in zip(_SHARE_STATS_KEYS, row, strict=True)}
