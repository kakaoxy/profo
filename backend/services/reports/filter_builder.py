"""报表查询筛选构建器.

将 FastAPI Query 参数解析为 ReportsFilter Pydantic 模型，
并应用为 SQLAlchemy Select 查询条件.

参考 backend/services/market/filters.py 的 apply_filters 实现模式，
新增 data_source / sold_date 时间窗口 / is_active 软删除过滤.
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import Select, or_

from models import Community, PropertyCurrent, PropertyStatus
from schemas.reports import ReportsFilter
from utils.formatters import escape_like
from utils.param_parser import parse_comma_separated_list

# range_option -> 时间窗口天数映射
_RANGE_DAYS: dict[str, int] = {
    "4w": 28,
    "8w": 56,
    "6m": 180,
    "12m": 365,
    "24m": 730,
}

# 默认时间窗口（range 非法时回退）
_DEFAULT_RANGE_DAYS = 28

# 4室+ 哨兵值（与前端 types.ts 对齐）
_ROOMS_PLUS_SENTINEL = "4plus"

# 4室+ 起始阈值
_ROOMS_PLUS_THRESHOLD = 4


def build_reports_filter(
    range: str = "4w",  # noqa: A002
    sources: str | None = None,
    business_circles: str | None = None,
    community_name: str | None = None,
    status: str | None = None,
    rooms: str | None = None,
    floor_levels: str | None = None,
) -> ReportsFilter:
    """从 FastAPI Query 参数解析为 ReportsFilter Pydantic 模型.

    Args:
        range: 时间范围选项（4w/8w/6m/12m/24m）
        sources: 逗号分隔的数据来源（如 "链家,贝壳"）
        business_circles: 逗号分隔的商圈名称列表（多关键词模糊匹配）
        community_name: 小区名称模糊搜索
        status: 房源状态（在售/成交）
        rooms: 逗号分隔的户型（如 "1,2,4plus"）
        floor_levels: 逗号分隔的楼层级别（如 "低,中,高"）

    Returns:
        ReportsFilter: 解析后的 Pydantic 模型

    """
    return ReportsFilter(
        range=range,
        sources=parse_comma_separated_list(sources) or [],
        business_circles=parse_comma_separated_list(business_circles) or [],
        community_name=community_name or None,
        status=status or None,
        rooms=parse_comma_separated_list(rooms) or [],
        floor_levels=parse_comma_separated_list(floor_levels) or [],
    )


def apply_reports_filter(
    query: Select,
    filter: ReportsFilter,  # noqa: A002
    *,
    include_time_window: bool = True,
    auto_join_community: bool = True,
) -> Select:
    """将 ReportsFilter 应用到 SQLAlchemy 查询.

    当 business_circles / community_name 过滤启用且 auto_join_community=True 时，
    自动追加 `JOIN Community ON PropertyCurrent.community_id == Community.id`，
    避免无 JOIN 的查询因 `Community.*` 条件触发笛卡尔积.

    新增条件：
    - PropertyCurrent.is_active == True（默认软删除过滤）
    - data_source IN sources（来源多选）
    - Community.business_circles 多关键词 LIKE OR 模糊匹配
    - Community.name LIKE community_name 模糊匹配
    - Community.is_active == True（当过滤 Community 字段时附加）
    - status == PropertyStatus（状态过滤）
    - rooms IN (...) OR rooms >= 4（户型多选 + 4室+ 合并）
    - floor_level IN floor_levels（楼层多选）
    - sold_date ∈ [rangeStart, now]（时间窗口，仅 status 为成交或未指定时应用）

    Args:
        query: SQLAlchemy Select 查询对象
        filter: ReportsFilter Pydantic 模型
        include_time_window: 是否附加 sold_date 时间窗口过滤；
            False 用于"在售"统计（不限制时间）
        auto_join_community: 是否在需要时自动 JOIN Community；
            True 适用于未显式 JOIN Community 的查询（KPI/Trend/Distribution 等）；
            False 适用于已显式 JOIN Community 的查询（business_district_rows /
            community_rows / comparison_* 等），避免重复 JOIN 报错

    Returns:
        Select: 应用筛选后的查询对象

    """
    # 软删除过滤：PropertyCurrent.is_active
    query = query.where(PropertyCurrent.is_active.is_(True))

    # 数据来源多选过滤
    if filter.sources:
        query = query.where(PropertyCurrent.data_source.in_(filter.sources))

    # 商圈多关键词模糊匹配（OR LIKE）
    # 当 auto_join_community=True 时自动 JOIN Community，避免笛卡尔积
    # 使用 join_from 显式指定左表 (PropertyCurrent), 避免在 select() 无显式
    # select_from 时 SQLAlchemy 无法推断 JOIN 左侧 (InvalidRequestError)
    needs_community_join = auto_join_community and bool(filter.business_circles or filter.community_name)
    if needs_community_join:
        query = query.join_from(PropertyCurrent, Community, PropertyCurrent.community_id == Community.id)

    # 商圈多关键词模糊匹配（OR LIKE）
    if filter.business_circles:
        business_circle_conditions = [
            Community.business_circle.like(f"%{escape_like(bc)}%", escape="\\") for bc in filter.business_circles if bc
        ]
        if business_circle_conditions:
            query = query.where(
                or_(*business_circle_conditions),
                Community.is_active.is_(True),
            )

    # 小区名称模糊匹配
    if filter.community_name:
        query = query.where(
            Community.name.like(f"%{escape_like(filter.community_name)}%", escape="\\"),
            Community.is_active.is_(True),
        )

    # 状态过滤（报表只处理"在售"与"成交"，"过期"不在范围内）
    if filter.status == "在售":
        query = query.where(PropertyCurrent.status == PropertyStatus.FOR_SALE)
    elif filter.status == "成交":
        query = query.where(PropertyCurrent.status == PropertyStatus.SOLD)

    # 户型过滤：解析 "1,2,4plus" -> rooms IN (1,2) OR rooms >= 4
    if filter.rooms:
        exact_rooms: list[int] = []
        include_plus = False
        for room in filter.rooms:
            if room == _ROOMS_PLUS_SENTINEL:
                include_plus = True
                continue
            try:
                exact_rooms.append(int(room))
            except ValueError:
                # 非法值静默跳过（与现有 apply_filters 行为一致）
                continue

        room_conditions: list[Any] = []
        if exact_rooms:
            room_conditions.append(PropertyCurrent.rooms.in_(exact_rooms))
        if include_plus:
            room_conditions.append(PropertyCurrent.rooms >= _ROOMS_PLUS_THRESHOLD)
        if room_conditions:
            query = query.where(or_(*room_conditions))

    # 楼层级别多选过滤
    if filter.floor_levels:
        query = query.where(PropertyCurrent.floor_level.in_(filter.floor_levels))

    # 时间窗口过滤（基于 sold_date）：
    # 仅当 include_time_window=True 且 status 为成交或未指定时应用；
    # "在售"统计应传 include_time_window=False 以跳过 sold_date 限制
    if include_time_window and filter.status in (None, "成交"):
        range_start, range_end = get_range_bounds(filter.range)
        query = query.where(
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= range_end,
        )

    return query


def get_range_bounds(
    range_option: str,
    reference_date: datetime | None = None,
) -> tuple[datetime, datetime]:
    """返回 (rangeStart, end) 元组.

    Args:
        range_option: 时间范围选项（4w/8w/6m/12m/24m）
        reference_date: 时间窗口终止基准；None 时用 now(UTC)。
            传入数据最新 sold_date 可避免数据更新延迟时显示无数据的最新周期
            （如数据最新到6月，现在7月，"近4周"应基于6月而非7月计算）

    Returns:
        tuple[datetime, datetime]: (rangeStart, end)，均为 UTC 时区

    """
    days = _RANGE_DAYS.get(range_option, _DEFAULT_RANGE_DAYS)
    end = reference_date if reference_date is not None else datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start, end


def get_granularity(range_option: str) -> Literal["week", "month"]:
    """返回趋势粒度.

    4w/8w 返回 'week'（date_trunc('week', sold_date)），
    6m/12m/24m 返回 'month'（date_trunc('month', sold_date)）.

    Args:
        range_option: 时间范围选项

    Returns:
        Literal["week", "month"]: 趋势粒度

    """
    if range_option in ("4w", "8w"):
        return "week"
    return "month"


__all__ = [
    "apply_reports_filter",
    "build_reports_filter",
    "get_granularity",
    "get_range_bounds",
]
