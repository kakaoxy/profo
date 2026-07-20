"""价格分布分段算法.

基于 PostgreSQL PERCENTILE_CONT 计算 P10/P25/P50/P75/P90 分位数，
动态生成价格区间桶；样本量 < 30 时回退到固定分段.

参考 spec §8.3 / §16.4.
"""

import math
from datetime import datetime
from typing import Any

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from models import PropertyCurrent
from schemas.reports.common import ReportsFilter
from schemas.reports.market import PriceBucket
from services.reports.filter_builder import apply_reports_filter, get_range_bounds

# 固定兜底分段：(lower, upper, label)
# lower=None 表示首段（< upper），upper=None 表示末段（>= lower）
FALLBACK_PRICE_BUCKETS: list[tuple[int | None, int | None, str]] = [
    (None, 150, "<150万"),
    (150, 200, "150-200万"),
    (200, 250, "200-250万"),
    (250, 300, "250-300万"),
    (300, 350, "300-350万"),
    (350, None, "350万+"),
]

# 动态分段触发阈值：样本量 >= 此值才使用 PERCENTILE_CONT
_MIN_SAMPLE_FOR_PERCENTILE = 30

# 切点取整单位（万）：切点向上取整到此值的整数倍
_ROUND_UNIT = 10

# 相邻切点最小间距（万）：低于此值合并
_MIN_SPACING = 10

# 最少段数（含首末段）
_MIN_SEGMENTS = 4

# 最多段数（含首末段）
_MAX_SEGMENTS = 8

# 单位换算：万 -> 元
_WAN_TO_YUAN = 10000

# 户型合并阈值：>= 4 室合并为 "4室+"
_ROOMS_PLUS_THRESHOLD = 4

# 分位数键名（与 SQL label 对齐）
_PERCENTILE_KEYS: tuple[str, ...] = ("p10", "p25", "p50", "p75", "p90")


def compute_price_buckets(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> list[PriceBucket]:
    """使用 PostgreSQL PERCENTILE_CONT 计算 P10/P25/P50/P75/P90 分位数.

    - 切点向上取整到 10 万的整数倍
    - 首段下沿 = 0，末段上沿 = None（开放区间）
    - 分位数差异 < 10 万时合并相邻段
    - 最少 4 段、最多 8 段
    - 返回每个 bucket 的 count / avg_area / avg_unit_price

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        community_id: 可选小区ID精确过滤（UUID 字符串）；None 时不过滤
        reference_date: 时间窗口终止基准；None 时由调用方在 _impl 层计算
            MAX(sold_date) 并透传，避免价格分布与 KPI/Trend 时间窗口错位

    Returns:
        list[PriceBucket]: 价格分段列表；样本量 < 30 时返回固定分段

    """
    # 1. 一次查询获取样本量与 5 个分位数
    base_query = select(
        func.count().label("total"),
        func.percentile_cont(0.1).within_group(PropertyCurrent.sold_price_wan.asc()).label("p10"),
        func.percentile_cont(0.25).within_group(PropertyCurrent.sold_price_wan.asc()).label("p25"),
        func.percentile_cont(0.5).within_group(PropertyCurrent.sold_price_wan.asc()).label("p50"),
        func.percentile_cont(0.75).within_group(PropertyCurrent.sold_price_wan.asc()).label("p75"),
        func.percentile_cont(0.9).within_group(PropertyCurrent.sold_price_wan.asc()).label("p90"),
    ).where(PropertyCurrent.sold_price_wan.isnot(None))
    base_query = apply_reports_filter(base_query, filter, include_time_window=False)
    # 手动追加 sold_date 时间窗口（基于 reference_date，与 KPI/Trend 对齐）
    range_start, range_end = get_range_bounds(filter.range, reference_date)
    base_query = base_query.where(
        PropertyCurrent.sold_date >= range_start,
        PropertyCurrent.sold_date <= range_end,
    )
    if community_id is not None:
        base_query = base_query.where(PropertyCurrent.community_id == community_id)

    row = db.execute(base_query).one()
    total = int(row.total or 0)

    # 2. 样本量 < 30：用 SQL 查询固定分段统计
    if total < _MIN_SAMPLE_FOR_PERCENTILE:
        return _query_buckets_by_bounds(db, filter, FALLBACK_PRICE_BUCKETS, community_id, reference_date)

    # 3. 构建动态切点
    percentiles: dict[str, float | None] = {}
    for key in _PERCENTILE_KEYS:
        value = getattr(row, key)
        percentiles[key] = float(value) if value is not None else None

    bounds = _build_bucket_bounds(percentiles)

    # 4. 切点不足或无法构建：回退兜底分段
    if bounds is None:
        return _query_buckets_by_bounds(db, filter, FALLBACK_PRICE_BUCKETS, community_id, reference_date)

    # 5. 查询动态分段统计
    return _query_buckets_by_bounds(db, filter, bounds, community_id, reference_date)


def _build_bucket_bounds(
    percentiles: dict[str, float | None],
) -> list[tuple[int | None, int | None, str]] | None:
    """从分位数构建 bucket 边界列表.

    Args:
        percentiles: 分位数字典，键为 p10/p25/p50/p75/p90

    Returns:
        list of (lower, upper, label) 元组；无法构建足够段数时返回 None

    """
    # 提取并取整切点（向上取整到 10 万的整数倍）
    raw_cutpoints: list[int] = []
    for key in _PERCENTILE_KEYS:
        p = percentiles.get(key)
        if p is None:
            continue
        rounded = math.ceil(p / _ROUND_UNIT) * _ROUND_UNIT
        if rounded > 0:
            raw_cutpoints.append(rounded)

    if not raw_cutpoints:
        return None

    # 去重（保持顺序）
    unique_cutpoints: list[int] = []
    seen: set[int] = set()
    for cp in raw_cutpoints:
        if cp not in seen:
            seen.add(cp)
            unique_cutpoints.append(cp)

    # 合并相邻差异 < 10 万的切点，保证至少 3 个切点（4 段）
    min_cutpoints = _MIN_SEGMENTS - 1
    i = 0
    while i < len(unique_cutpoints) - 1:
        if len(unique_cutpoints) <= min_cutpoints:
            break
        if unique_cutpoints[i + 1] - unique_cutpoints[i] < _MIN_SPACING:
            unique_cutpoints.pop(i + 1)
        else:
            i += 1

    # 仍不足 3 个切点：无法构建 4 段
    if len(unique_cutpoints) < min_cutpoints:
        return None

    # 限制最多 8 段（理论上不会触发，初始最多 6 段）
    if len(unique_cutpoints) + 1 > _MAX_SEGMENTS:
        unique_cutpoints = unique_cutpoints[: _MAX_SEGMENTS - 1]

    # 构建边界列表
    bounds: list[tuple[int | None, int | None, str]] = []
    prev_lower: int | None = None
    for idx, cp in enumerate(unique_cutpoints):
        lower = 0 if idx == 0 else prev_lower
        upper = cp
        label = f"<{upper}万" if idx == 0 else f"{lower}-{upper}万"
        bounds.append((lower, upper, label))
        prev_lower = cp

    # 末段（开放区间）
    bounds.append((prev_lower, None, f"{prev_lower}万+"))

    return bounds


def _query_buckets_by_bounds(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    bounds: list[tuple[int | None, int | None, str]],
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> list[PriceBucket]:
    """根据边界列表用 SQL 查询每个段的 count/avg_area/avg_unit_price.

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        bounds: (lower, upper, label) 元组列表
        community_id: 可选小区ID精确过滤（UUID 字符串）；None 时不过滤
        reference_date: 时间窗口终止基准；None 时由调用方在 _impl 层计算
            MAX(sold_date) 并透传，避免价格分布与 KPI/Trend 时间窗口错位

    Returns:
        list[PriceBucket]: 价格分段列表

    """
    if not bounds:
        return []

    # 构建 CASE WHEN 分组表达式
    whens: list[tuple[Any, int]] = []
    for idx, (lower, upper, _) in enumerate(bounds):
        if lower is None:
            condition = PropertyCurrent.sold_price_wan < upper
        elif upper is None:
            condition = PropertyCurrent.sold_price_wan >= lower
        else:
            condition = (PropertyCurrent.sold_price_wan >= lower) & (PropertyCurrent.sold_price_wan < upper)
        whens.append((condition, idx))

    bucket_idx_expr = case(*whens, else_=None)

    # build_area > 0 时计算 avg_area / avg_unit_price，避免脏数据
    area_expr = case(
        (PropertyCurrent.build_area > 0, PropertyCurrent.build_area),
        else_=None,
    )
    unit_price_expr = case(
        (
            PropertyCurrent.build_area > 0,
            PropertyCurrent.sold_price_wan * _WAN_TO_YUAN / PropertyCurrent.build_area,
        ),
        else_=None,
    )

    query = (
        select(
            bucket_idx_expr.label("bucket_idx"),
            func.count().label("count"),
            func.avg(area_expr).label("avg_area"),
            func.avg(unit_price_expr).label("avg_unit_price"),
        )
        .where(PropertyCurrent.sold_price_wan.isnot(None))
        .group_by(bucket_idx_expr)
    )
    query = apply_reports_filter(query, filter, include_time_window=False)
    # 手动追加 sold_date 时间窗口（基于 reference_date，与 KPI/Trend 对齐）
    range_start, range_end = get_range_bounds(filter.range, reference_date)
    query = query.where(
        PropertyCurrent.sold_date >= range_start,
        PropertyCurrent.sold_date <= range_end,
    )
    if community_id is not None:
        query = query.where(PropertyCurrent.community_id == community_id)

    result_map: dict[int, dict[str, int | float | None]] = {}
    for result_row in db.execute(query).all():
        if result_row.bucket_idx is None:
            continue
        result_map[int(result_row.bucket_idx)] = {
            "count": int(result_row.count or 0),
            "avg_area": float(result_row.avg_area) if result_row.avg_area is not None else None,
            "avg_unit_price": (float(result_row.avg_unit_price) if result_row.avg_unit_price is not None else None),
        }

    buckets: list[PriceBucket] = []
    for idx, (lower, upper, label) in enumerate(bounds):
        stats = result_map.get(idx, {"count": 0, "avg_area": None, "avg_unit_price": None})
        buckets.append(
            PriceBucket(
                label=label,
                lower=lower if lower is not None else 0,
                upper=upper,
                count=int(stats["count"]),
                avg_area=stats["avg_area"],
                avg_unit_price=stats["avg_unit_price"],
            )
        )

    return buckets


def build_fallback_buckets(sold_records: list) -> list[PriceBucket]:
    """样本量 < 30 时使用固定分段.

    固定分段：<150 / 150-200 / 200-250 / 250-300 / 300-350 / 350+（万）

    Args:
        sold_records: 成交记录列表（dict 或 ORM 对象，含 sold_price_wan / build_area 字段）

    Returns:
        list[PriceBucket]: 固定分段列表

    """
    # 初始化每个 bucket 的统计累加器
    bucket_stats: list[dict[str, Any]] = [
        {
            "count": 0,
            "area_sum": 0.0,
            "area_count": 0,
            "unit_price_sum": 0.0,
            "unit_price_count": 0,
        }
        for _ in FALLBACK_PRICE_BUCKETS
    ]

    for record in sold_records:
        price = _get_field(record, "sold_price_wan")
        if price is None:
            continue
        try:
            price_value = float(price)
        except (ValueError, TypeError):
            continue

        bucket_idx = _find_fallback_bucket(price_value)
        if bucket_idx is None:
            continue

        stats = bucket_stats[bucket_idx]
        stats["count"] += 1

        area = _get_field(record, "build_area")
        if area is not None:
            try:
                area_value = float(area)
            except (ValueError, TypeError):
                continue
            if area_value > 0:
                stats["area_sum"] += area_value
                stats["area_count"] += 1
                stats["unit_price_sum"] += price_value * _WAN_TO_YUAN / area_value
                stats["unit_price_count"] += 1

    # 构建结果
    buckets: list[PriceBucket] = []
    for idx, (lower, upper, label) in enumerate(FALLBACK_PRICE_BUCKETS):
        stats = bucket_stats[idx]
        avg_area = stats["area_sum"] / stats["area_count"] if stats["area_count"] > 0 else None
        avg_unit_price = stats["unit_price_sum"] / stats["unit_price_count"] if stats["unit_price_count"] > 0 else None
        buckets.append(
            PriceBucket(
                label=label,
                lower=lower if lower is not None else 0,
                upper=upper,
                count=stats["count"],
                avg_area=avg_area,
                avg_unit_price=avg_unit_price,
            )
        )

    return buckets


def _find_fallback_bucket(price: float) -> int | None:
    """找到价格所属的兜底 bucket 索引.

    Args:
        price: 成交价（万）

    Returns:
        int | None: bucket 索引；无法匹配时返回 None

    """
    for idx, (lower, upper, _) in enumerate(FALLBACK_PRICE_BUCKETS):
        if lower is None:
            if price < upper:
                return idx
        elif upper is None:
            if price >= lower:
                return idx
        elif lower <= price < upper:
            return idx
    return None


def compute_rooms_breakdown(
    sold_records: list,
) -> dict[str, dict[str, int | float | None]]:
    """按户型分组，>=4 室合并为 "4室+".

    Args:
        sold_records: 成交记录列表（dict 或 ORM 对象，含 rooms / sold_price_wan / build_area 字段）

    Returns:
        dict[str, dict]: {"1室": {"volume": int, "avg_unit_price": float | None}, ...}

    """
    groups: dict[str, dict[str, Any]] = {}
    for record in sold_records:
        rooms = _get_field(record, "rooms")
        if rooms is None:
            continue
        try:
            rooms_value = int(rooms)
        except (ValueError, TypeError):
            continue

        key = f"{rooms_value}室" if rooms_value < _ROOMS_PLUS_THRESHOLD else "4室+"
        group = groups.setdefault(key, {"volume": 0, "unit_price_sum": 0.0, "unit_price_count": 0})
        group["volume"] += 1

        unit_price = _compute_unit_price(record)
        if unit_price is not None:
            group["unit_price_sum"] += unit_price
            group["unit_price_count"] += 1

    return _finalize_breakdown(groups)


def compute_floor_breakdown(
    sold_records: list,
) -> dict[str, dict[str, int | float | None]]:
    """按楼层分组，键为实际 floor_level 取值.

    Args:
        sold_records: 成交记录列表（dict 或 ORM 对象，含 floor_level / sold_price_wan / build_area 字段）

    Returns:
        dict[str, dict]: {"低楼层": {"volume": int, "avg_unit_price": float | None}, ...}

    """
    groups: dict[str, dict[str, Any]] = {}
    for record in sold_records:
        floor_level = _get_field(record, "floor_level")
        if not floor_level:
            continue
        key = str(floor_level)
        group = groups.setdefault(key, {"volume": 0, "unit_price_sum": 0.0, "unit_price_count": 0})
        group["volume"] += 1

        unit_price = _compute_unit_price(record)
        if unit_price is not None:
            group["unit_price_sum"] += unit_price
            group["unit_price_count"] += 1

    return _finalize_breakdown(groups)


def _compute_unit_price(record: Any) -> float | None:  # noqa: ANN401
    """计算单条记录的 unit_price = sold_price_wan * 10000 / build_area.

    Args:
        record: dict 或 ORM 对象

    Returns:
        float | None: 单价；缺字段或 build_area <= 0 时返回 None

    """
    price = _get_field(record, "sold_price_wan")
    area = _get_field(record, "build_area")
    if price is None or area is None:
        return None
    try:
        price_value = float(price)
        area_value = float(area)
    except (ValueError, TypeError):
        return None
    if area_value <= 0:
        return None
    return price_value * _WAN_TO_YUAN / area_value


def _get_field(record: Any, field: str) -> Any:  # noqa: ANN401
    """从 dict 或 ORM 对象获取字段值.

    Args:
        record: dict 或 ORM 对象
        field: 字段名

    Returns:
        Any: 字段值；不存在时返回 None

    """
    if isinstance(record, dict):
        return record.get(field)
    return getattr(record, field, None)


def _finalize_breakdown(
    groups: dict[str, dict[str, Any]],
) -> dict[str, dict[str, int | float | None]]:
    """将累加器转换为最终结构 {volume, avg_unit_price}.

    Args:
        groups: 累加器字典

    Returns:
        dict[str, dict]: 最终结构

    """
    result: dict[str, dict[str, int | float | None]] = {}
    for key, stats in groups.items():
        avg_unit_price = stats["unit_price_sum"] / stats["unit_price_count"] if stats["unit_price_count"] > 0 else None
        result[key] = {
            "volume": stats["volume"],
            "avg_unit_price": avg_unit_price,
        }
    return result


__all__ = [
    "FALLBACK_PRICE_BUCKETS",
    "build_fallback_buckets",
    "compute_floor_breakdown",
    "compute_price_buckets",
    "compute_rooms_breakdown",
]
