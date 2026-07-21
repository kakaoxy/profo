"""价格分布分段算法.

基于 PostgreSQL PERCENTILE_CONT(0.05/0.95) 计算数据范围,
使用等宽候选步长生成 4-8 个等宽内部分段; 样本量 < 30 时回退到固定分段.

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

# 动态分段触发阈值：样本量 >= 此值才使用 P5/P95 等宽分段
_MIN_SAMPLE_FOR_PERCENTILE = 30
# 等宽分段触发阈值别名 - 保留旧名以减小测试改动
_MIN_SAMPLE_FOR_EQUAL_WIDTH = _MIN_SAMPLE_FOR_PERCENTILE

# P5/P95 分位数用于确定数据范围（裁剪两端各 5% 离群点，避免离群点拉伸区间）
_P5_PERCENTILE = 0.05
_P95_PERCENTILE = 0.95

# 等宽候选步长（万），按升序遍历选取使分段数 <= _MAX_INNER_SEGMENTS 的最小值
_EQUAL_WIDTH_CANDIDATES: tuple[int, ...] = (10, 20, 25, 50, 100, 200, 250, 500)

# 内部分段数约束
_MIN_INNER_SEGMENTS = 4
_MAX_INNER_SEGMENTS = 8

# 切点取整单位（万）：下沿向下取整、上沿向上取整到此值的整数倍
_ROUND_UNIT = 10

# 单位换算：万 -> 元
_WAN_TO_YUAN = 10000

# 户型合并阈值：>= 4 室合并为 "4室+"
_ROOMS_PLUS_THRESHOLD = 4


def compute_price_buckets(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> list[PriceBucket]:
    """使用 PostgreSQL PERCENTILE_CONT(0.05/0.95) 计算数据范围, 生成等宽分段.

    - 样本量 >= 30: P5 向下取整到 10 万倍数作为下沿, P95 向上取整到 10 万倍数作为上沿
    - 从候选步长 [10,20,25,50,100,200,250,500] 中选取使分段数 <= 8 的最小值
    - 生成 4-8 个等宽内部分段
    - 若有数据 < 下沿, 追加首部边缘桶 "<{下沿}万"
    - 若有数据 >= 上沿, 追加尾部边缘桶 "{上沿}万+"
    - 样本量 < 30: 回退到固定分段 (FALLBACK_PRICE_BUCKETS)

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        community_id: 可选小区ID精确过滤（UUID 字符串）；None 时不过滤
        reference_date: 时间窗口终止基准；None 时由调用方在 _impl 层计算
            MAX(sold_date) 并透传，避免价格分布与 KPI/Trend 时间窗口错位

    Returns:
        list[PriceBucket]: 价格分段列表；样本量 < 30 时返回固定分段

    """
    # 1. 单次查询: count + P5 + P95 + min + max (用于判断是否需要边缘桶)
    base_query = select(
        func.count().label("total"),
        func.percentile_cont(_P5_PERCENTILE).within_group(PropertyCurrent.sold_price_wan.asc()).label("p5"),
        func.percentile_cont(_P95_PERCENTILE).within_group(PropertyCurrent.sold_price_wan.asc()).label("p95"),
        func.min(PropertyCurrent.sold_price_wan).label("min_price"),
        func.max(PropertyCurrent.sold_price_wan).label("max_price"),
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

    # 2. 样本量 < 30: 回退兜底分段
    if total < _MIN_SAMPLE_FOR_PERCENTILE:
        return _query_buckets_by_bounds(db, filter, FALLBACK_PRICE_BUCKETS, community_id, reference_date)

    # 3. P5/P95 可能为 None (理论上不会, 防御性处理)
    p5 = float(row.p5) if row.p5 is not None else float(row.min_price or 0)
    p95 = float(row.p95) if row.p95 is not None else float(row.max_price or 0)

    # 4. 构建等宽边界
    lower_bound = math.floor(p5 / _ROUND_UNIT) * _ROUND_UNIT
    has_below = row.min_price is not None and float(row.min_price) < lower_bound
    # has_above 判断需要在确定 selected_upper 后再做, 见 _build_equal_width_bounds 内部
    bounds = _build_equal_width_bounds(p5, p95, has_below, row.max_price)

    if bounds is None:
        return _query_buckets_by_bounds(db, filter, FALLBACK_PRICE_BUCKETS, community_id, reference_date)

    # 5. 查询分段统计
    return _query_buckets_by_bounds(db, filter, bounds, community_id, reference_date)


def _build_equal_width_bounds(
    p5: float,
    p95: float,
    has_below: bool,
    max_price: float | None,
) -> list[tuple[int | None, int | None, str]] | None:
    """从 P5/P95 构建等宽分段边界.

    - 下沿: P5 向下取整到 10 万整数倍
    - 上沿: P95 向上取整到 10 万整数倍, 并对齐到 下沿 + N * step
    - 候选步长按 (10, 20, 25, 50, 100, 200, 250, 500) 升序遍历,
      选取使分段数在 [4, 8] 区间的最小值
    - 若所有候选步长分段数都 > 8, 使用最大候选步长并裁剪到 8 段
    - 首部边缘桶: 当 has_below=True 时追加 "<{下沿}万"
    - 尾部边缘桶: 当 max_price >= selected_upper 时追加 "{上沿}万+"

    Args:
        p5: 5% 分位数 (万)
        p95: 95% 分位数 (万)
        has_below: 是否存在数据 < 下沿 (P5 向下取整)
        max_price: 数据中的最大价格 (万); None 时无法判断尾部边缘桶

    Returns:
        list of (lower, upper, label) 元组; 数据范围过小无法分段时返回 None

    """
    lower_bound = math.floor(p5 / _ROUND_UNIT) * _ROUND_UNIT
    raw_upper = math.ceil(p95 / _ROUND_UNIT) * _ROUND_UNIT

    if raw_upper <= lower_bound:
        return None  # 数据范围过小, 无法分段

    selected_step: int | None = None
    n_segments = 0
    selected_upper = raw_upper

    for step in _EQUAL_WIDTH_CANDIDATES:
        n = math.ceil((raw_upper - lower_bound) / step)
        if _MIN_INNER_SEGMENTS <= n <= _MAX_INNER_SEGMENTS:
            selected_step = step
            n_segments = n
            selected_upper = lower_bound + n * step
            break

    if selected_step is None:
        # 无候选步长满足 [4, 8] 区间, 区分两种边界场景:
        # - 数据范围过小 (所有 step 都给 n < 4): 使用最小步长, 接受 n < 4
        # - 数据范围过大 (所有 step 都给 n > 8): 使用最大步长, 裁剪到 8 段
        smallest_step = _EQUAL_WIDTH_CANDIDATES[0]
        n_smallest = math.ceil((raw_upper - lower_bound) / smallest_step)
        if n_smallest < _MIN_INNER_SEGMENTS:
            # 数据范围过小: 使用最小步长, 接受不足 4 段 (优于回退到 500 万宽的荒谬分段)
            selected_step = smallest_step
            n_segments = n_smallest
        else:
            # 数据范围过大: 使用最大候选步长并裁剪到 8 段
            selected_step = _EQUAL_WIDTH_CANDIDATES[-1]
            n_segments = _MAX_INNER_SEGMENTS
        selected_upper = lower_bound + n_segments * selected_step

    # 判断是否存在尾部边缘桶: max_price 不小于 selected_upper
    has_above = max_price is not None and float(max_price) >= selected_upper

    bounds: list[tuple[int | None, int | None, str]] = []

    # 首部边缘桶
    if has_below:
        bounds.append((None, lower_bound, f"<{lower_bound}万"))

    # 内部等宽段
    for i in range(n_segments):
        seg_lower = lower_bound + i * selected_step
        seg_upper = lower_bound + (i + 1) * selected_step
        bounds.append((seg_lower, seg_upper, f"{seg_lower}-{seg_upper}万"))

    # 尾部边缘桶
    if has_above:
        bounds.append((selected_upper, None, f"{selected_upper}万+"))

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
