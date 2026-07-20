"""商圈分析报表聚合查询服务.

实现 7 个聚合函数, 所有聚合在数据库层完成 (SQL 优先):
- KPI 4 卡片 (sold_count / avg_price_wan / avg_unit_price / on_sale_count)
- 成交趋势 (overall / rooms / floor / price 维度)
- 价格分布 (PERCENTILE_CONT 动态分段)
- 商圈列表 (按 communities.business_circle 聚合)
- 小区明细列表 (近 12 月成交)
- 小区成交分析详情 (组合 KPI/Trend/PriceDist/RoomsDist/FloorDist + main_layout)
- 多商圈对比 (2-5 个商圈)

设计要点:
- SQL 优先: 聚合在数据库层完成 (func.count / func.avg / func.mode / date_trunc / FILTER)
- 同步 SQLAlchemy Session (def 而非 async def)
- @cached_report() 装饰 5 分钟内存缓存
- 内部 _impl 函数支持可选 community_id 过滤 (供 get_community_detail 复用, 避免重复实现)

参考 spec §6-§17 / frontend mock-analytics.ts.
"""

from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

from sqlalchemy import Select, case, func, select
from sqlalchemy.orm import Session
from sqlalchemy.sql.elements import ColumnElement

from models import Community, PropertyCurrent, PropertyStatus
from schemas.reports.common import KpiCard, QoqDirection, ReportsFilter
from schemas.reports.communities import CommunityRow
from schemas.reports.market import (
    BusinessDistrictRow,
    ComparisonData,
    ComparisonFloorStructure,
    ComparisonRoomStructure,
    ComparisonSummaryRow,
    ComparisonTrendPoint,
    DistributionBucket,
    KpiData,
    TrendDataPoint,
)
from services.reports.bucketing import (
    FALLBACK_PRICE_BUCKETS,
    compute_price_buckets,
)
from services.reports.cache import cached_report
from services.reports.filter_builder import (
    apply_reports_filter,
    get_granularity,
    get_range_bounds,
)

# 单位换算: 万 -> 元
_WAN_TO_YUAN = 10000

# 户型阈值: >= 此值合并为 "4室+"
_ROOMS_PLUS_THRESHOLD = 4

# 户型常量: r1 / r2 / r3 / r4plus 对应的 rooms 值
_ROOM_1 = 1
_ROOM_2 = 2
_ROOM_3 = 3

# 上期环比样本下限: 上期样本 < 此值或上期值为 0 → qoq=null
_MIN_PREV_SAMPLE = 3

# 商圈"未分类"标签 (business_circle 为 NULL/空串时归入)
_UNCATEGORIZED = "未分类"

# 小区列表默认时间窗口 (近 12 月成交)
_COMMUNITY_LIST_DAYS = 365

# 商圈去化周期: 近 3 月成交套数 (用于 absorption_months = on_sale_count / (近3月成交/3))
_ABSORPTION_RECENT_DAYS = 90

# 趋势 dim_breakdown 价格维度使用兜底分段 (与 mock 行为一致, 周期内动态分段成本过高)
_PRICE_TREND_DIM = "price"
_PRICE_TREND_ROOMS_DIM = "rooms"
_PRICE_TREND_FLOOR_DIM = "floor"

# 月份进位阈值：12 月需进位到下一年 1 月
_MONTH_DECEMBER = 12

# 商圈列表排序字段白名单
_BUSINESS_DISTRICT_SORT_FIELDS = {
    "sold_count",
    "avg_price_wan",
    "avg_unit_price",
    "on_sale_count",
    "absorption_months",
    "price_qoq",
    "volume_qoq",
}

# 对比 summary 7 行指标名 (与前端 types.ts 对齐)
_COMPARISON_METRICS: tuple[str, ...] = (
    "成交套数",
    "均价(万)",
    "单价(元/㎡)",
    "在售房源",
    "去化周期(月)",
    "价环比(%)",
    "量环比(%)",
)

# 楼层级别 → ComparisonFloorStructure 字段映射
_FLOOR_LEVEL_MAP: dict[str, str] = {
    "低楼层": "low",
    "中楼层": "mid",
    "高楼层": "high",
}

# 楼层分布排序键: 低楼层 → 中楼层 → 高楼层, 其余取值置末
_FLOOR_LOW_SORT = 1
_FLOOR_MID_SORT = 2
_FLOOR_HIGH_SORT = 3
_FLOOR_OTHER_SORT = 4


# ─── 通用 helper ───────────────────────────────────────────────────────────


def _qoq_ratio(current: float | None, previous: float | None) -> float | None:
    """计算环比百分比 = (current - previous) / previous * 100.

    Args:
        current: 本期值
        previous: 上期值

    Returns:
        float | None: 环比百分比; previous 为 None 或 0 时返回 None

    """
    if current is None or previous is None or previous == 0:
        return None
    return (float(current) - float(previous)) / float(previous) * 100.0


def _qoq_direction(qoq: float | None) -> QoqDirection:
    """由 qoq 值推导方向.

    - None → UNKNOWN
    - > 0 → UP
    - < 0 → DOWN
    - == 0 → FLAT

    """
    if qoq is None:
        return QoqDirection.UNKNOWN
    if qoq > 0:
        return QoqDirection.UP
    if qoq < 0:
        return QoqDirection.DOWN
    return QoqDirection.FLAT


def _build_kpi_card(value: float | None, qoq: float | None) -> KpiCard:
    """构造 KPI 卡片."""
    return KpiCard(value=value, qoq=qoq, qoq_direction=_qoq_direction(qoq))


def _safe_qoq(
    current: float | None,
    previous: float | None,
    prev_sample: int,
) -> float | None:
    """带样本下限的环比计算.

    上期样本 < _MIN_PREV_SAMPLE 或上期值为 0/None → 返回 None.

    Args:
        current: 本期值
        previous: 上期值
        prev_sample: 上期样本数

    Returns:
        float | None: 环比百分比; 不满足样本要求时为 None

    """
    if prev_sample < _MIN_PREV_SAMPLE:
        return None
    if previous is None or previous == 0 or current is None:
        return None
    return _qoq_ratio(current, previous)


def _unit_price_expr() -> ColumnElement:
    """单价表达式: sold_price_wan * 10000 / build_area (仅 build_area > 0 且 sold_price_wan 非空时计算).

    Returns:
        ColumnElement: SQLAlchemy CASE 表达式; 不满足条件时返回 None

    """
    return case(
        (
            (PropertyCurrent.build_area > 0) & (PropertyCurrent.sold_price_wan.isnot(None)),
            PropertyCurrent.sold_price_wan * _WAN_TO_YUAN / PropertyCurrent.build_area,
        ),
        else_=None,
    )


def _get_previous_bounds(range_start: datetime, now: datetime) -> tuple[datetime, datetime]:
    """返回上期时间窗口 (range_start - window, range_start).

    Args:
        range_start: 本期起始时间
        now: 本期结束时间

    Returns:
        tuple[datetime, datetime]: (prev_start, range_start)

    """
    window = now - range_start
    return range_start - window, range_start


def _normalize_period(p: datetime) -> datetime:
    """规范化周期时间到 tz-aware UTC, 用于字典 key 比较.

    Args:
        p: 原始 datetime (可能 tz-aware 或 naive)

    Returns:
        datetime: tz-aware UTC datetime

    """
    if p.tzinfo is None:
        return p.replace(tzinfo=timezone.utc)
    return p.astimezone(timezone.utc)


def _generate_periods(
    range_start: datetime,
    now: datetime,
    granularity: Literal["week", "month"],
) -> list[datetime]:
    """生成 range_start 到 now 之间所有周期起始时间.

    - week: 对齐到周一 (与 PostgreSQL date_trunc('week', ...) 一致)
    - month: 对齐到月初

    Args:
        range_start: 时间窗口起始
        now: 时间窗口结束
        granularity: 粒度 ('week' / 'month')

    Returns:
        list[datetime]: 周期起始时间列表 (tz-aware UTC)

    """
    periods: list[datetime] = []
    if granularity == "week":
        # 对齐到周一 (weekday()=0 表示周一)
        days_since_monday = range_start.weekday()
        aligned = range_start - timedelta(days=days_since_monday)
        aligned = aligned.replace(hour=0, minute=0, second=0, microsecond=0)
        current = _normalize_period(aligned)
        end = _normalize_period(now)
        while current <= end:
            periods.append(current)
            current = current + timedelta(weeks=1)
    else:  # month
        aligned = range_start.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        current = _normalize_period(aligned)
        end = _normalize_period(now)
        while current <= end:
            periods.append(current)
            # 下一月：12 月需进位到下一年 1 月
            if current.month == _MONTH_DECEMBER:
                next_month = current.replace(year=current.year + 1, month=1)
            else:
                next_month = current.replace(month=current.month + 1)
            current = next_month
    return periods


def _apply_optional_community(query: Select, community_id: str | None) -> Select:
    """可选地添加 community_id 精确过滤.

    Args:
        query: SQLAlchemy Select
        community_id: 小区 ID (UUID 字符串); None 时不过滤

    Returns:
        Select: 应用过滤后的查询

    """
    if community_id is not None:
        return query.where(PropertyCurrent.community_id == community_id)
    return query


def _base_filter_no_status(filter: ReportsFilter) -> ReportsFilter:  # noqa: A002
    """克隆 filter 并清除 status, 供 KPI/Trend 等多状态聚合使用.

    KPI 4 卡片各自统计 sold_count(成交)/on_sale_count(在售), 不受用户 filter.status 影响.
    """
    return filter.model_copy(update={"status": None})


def _base_filter_for_comparison(filter: ReportsFilter) -> ReportsFilter:  # noqa: A002
    """克隆 filter 并清除 business_circles, 供多商圈对比使用.

    对比接口在 SQL 内通过 `Community.business_circle IN (...)` 限定多个商圈,
    不应再叠加 filter.business_circles 多关键词过滤.
    """
    return filter.model_copy(update={"business_circles": [], "status": None})


def _get_data_reference_date(
    db: Session,
    base_filter: ReportsFilter,
    community_id: str | None = None,
) -> datetime:
    """查询数据中最新的 sold_date 作为时间窗口基准.

    应用除时间窗口外的所有过滤条件 (business_circles/community_name 等),
    确保基准日期与当前查询范围一致. 无数据时回退到 now(UTC).

    Args:
        db: SQLAlchemy 同步 Session
        base_filter: 已处理的过滤参数 (通常为 _base_filter_no_status /
            _base_filter_for_comparison 的结果)
        community_id: 可选小区ID精确过滤 (供 community detail 复用)

    Returns:
        datetime: 数据最新 sold_date (tz-aware UTC); 无数据时回退到 now(UTC)

    """
    query = select(func.max(PropertyCurrent.sold_date)).where(
        PropertyCurrent.status == PropertyStatus.SOLD,
        PropertyCurrent.sold_date.isnot(None),
    )
    query = apply_reports_filter(query, base_filter, include_time_window=False)
    query = _apply_optional_community(query, community_id)
    last_sold = db.execute(query).scalar()
    if last_sold is not None:
        if last_sold.tzinfo is None:
            return last_sold.replace(tzinfo=timezone.utc)
        return last_sold.astimezone(timezone.utc)
    return datetime.now(timezone.utc)


# ─── KPI 聚合 ──────────────────────────────────────────────────────────────


def _get_kpi_data_impl(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> KpiData:
    """KPI 实现层, 可选 community_id 过滤 (供 get_community_detail 复用).

    - 本期/上期同等时间窗口对比
    - 上期样本 < 3 或上期值为 0 → qoq=null, qoq_direction="unknown"
    - on_sale_count 无环比 (qoq=null)

    """
    # KPI 不受用户 filter.status 影响 (4 卡片各自统计)
    base_filter = _base_filter_no_status(filter)
    # 时间窗口基准: 数据最新 sold_date (避免显示无数据的最新周期)
    if reference_date is None:
        reference_date = _get_data_reference_date(db, base_filter, community_id)
    range_start, now = get_range_bounds(filter.range, reference_date)
    prev_start, _ = _get_previous_bounds(range_start, now)

    # 本期成交聚合: COUNT(*) / AVG(sold_price_wan) / AVG(sold_price_wan * 10000 / build_area)
    current_query = select(
        func.count().label("sold_count"),
        func.avg(PropertyCurrent.sold_price_wan).label("avg_price_wan"),
        func.avg(_unit_price_expr()).label("avg_unit_price"),
    ).where(
        PropertyCurrent.status == PropertyStatus.SOLD,
        PropertyCurrent.sold_date >= range_start,
        PropertyCurrent.sold_date <= now,
    )
    current_query = apply_reports_filter(current_query, base_filter, include_time_window=False)
    current_query = _apply_optional_community(current_query, community_id)
    current = db.execute(current_query).one()

    # 上期成交聚合 - 用于环比
    prev_query = select(
        func.count().label("sold_count"),
        func.avg(PropertyCurrent.sold_price_wan).label("avg_price_wan"),
        func.avg(_unit_price_expr()).label("avg_unit_price"),
    ).where(
        PropertyCurrent.status == PropertyStatus.SOLD,
        PropertyCurrent.sold_date >= prev_start,
        PropertyCurrent.sold_date < range_start,
    )
    prev_query = apply_reports_filter(prev_query, base_filter, include_time_window=False)
    prev_query = _apply_optional_community(prev_query, community_id)
    prev = db.execute(prev_query).one()

    # 在售统计 - 无时间窗口
    on_sale_query = select(
        func.count().label("on_sale_count"),
    ).where(
        PropertyCurrent.status == PropertyStatus.FOR_SALE,
    )
    on_sale_query = apply_reports_filter(on_sale_query, base_filter, include_time_window=False)
    on_sale_query = _apply_optional_community(on_sale_query, community_id)
    on_sale = db.execute(on_sale_query).one()

    # 提取并转换类型
    current_sold_count = int(current.sold_count or 0)
    prev_sold_count = int(prev.sold_count or 0)
    current_avg_price = float(current.avg_price_wan) if current.avg_price_wan is not None else None
    prev_avg_price = float(prev.avg_price_wan) if prev.avg_price_wan is not None else None
    current_avg_unit = float(current.avg_unit_price) if current.avg_unit_price is not None else None
    prev_avg_unit = float(prev.avg_unit_price) if prev.avg_unit_price is not None else None
    on_sale_count = int(on_sale.on_sale_count or 0)

    # 环比: 上期样本 < 3 或上期值为 0/None → null
    sold_qoq = _safe_qoq(float(current_sold_count), float(prev_sold_count), prev_sold_count)
    price_qoq = _safe_qoq(current_avg_price, prev_avg_price, prev_sold_count)
    unit_qoq = _safe_qoq(current_avg_unit, prev_avg_unit, prev_sold_count)

    return KpiData(
        sold_count=_build_kpi_card(current_sold_count, sold_qoq),
        avg_price_wan=_build_kpi_card(current_avg_price, price_qoq),
        avg_unit_price=_build_kpi_card(current_avg_unit, unit_qoq),
        on_sale_count=_build_kpi_card(on_sale_count, None),  # 在售为快照, 无历史环比
    )


@cached_report()
def get_kpi_data(db: Session, filter: ReportsFilter) -> KpiData:  # noqa: A002
    """KPI 4 卡片聚合: sold_count / avg_price_wan / avg_unit_price / on_sale_count.

    - 本期/上期同等时间窗口对比
    - 上期样本 < 3 或上期值为 0 → qoq=null, qoq_direction="unknown"
    - qoq_direction: up/down/flat(=0)/unknown(null)
    - on_sale_count 无环比 (qoq=null)

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数

    Returns:
        KpiData: 4 张 KPI 卡片数据

    """
    return _get_kpi_data_impl(db, filter, community_id=None)


# ─── 成交趋势 ──────────────────────────────────────────────────────────────


def _compute_trend_dim_breakdown(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    trend_dim: str,
    range_start: datetime,
    now: datetime,
    granularity: Literal["week", "month"],
    community_id: str | None = None,
) -> dict[datetime, dict[str, dict[str, int | float | None]]]:
    """计算趋势维度下钻 (rooms/floor/price).

    Args:
        db: SQLAlchemy Session
        filter: 报表筛选参数 (已清除 status)
        trend_dim: 维度 ('rooms' / 'floor' / 'price')
        range_start: 时间窗口起始
        now: 时间窗口结束
        granularity: 粒度 ('week' / 'month')
        community_id: 可选小区过滤

    Returns:
        dict[period, dict[dim_key, {volume, avg_unit_price}]]

    """
    period_expr = func.date_trunc(granularity, PropertyCurrent.sold_date).label("period")
    base_filter = _base_filter_no_status(filter)
    result: dict[datetime, dict[str, dict[str, int | float | None]]] = defaultdict(dict)

    if trend_dim == _PRICE_TREND_ROOMS_DIM:
        # 按户型分组: rooms >= 4 合并为 "4室+"
        query = (
            select(
                period_expr,
                PropertyCurrent.rooms.label("dim_value"),
                func.count().label("volume"),
                func.avg(_unit_price_expr()).label("avg_unit_price"),
            )
            .where(
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= range_start,
                PropertyCurrent.sold_date <= now,
                PropertyCurrent.sold_date.isnot(None),
                PropertyCurrent.rooms.isnot(None),
            )
            .group_by(period_expr, PropertyCurrent.rooms)
        )
        query = apply_reports_filter(query, base_filter, include_time_window=False)
        query = _apply_optional_community(query, community_id)
        for row in db.execute(query).all():
            rooms_val = int(row.dim_value)
            key = f"{rooms_val}室" if rooms_val < _ROOMS_PLUS_THRESHOLD else "4室+"
            result[_normalize_period(row.period)][key] = {
                "volume": int(row.volume or 0),
                "avg_unit_price": float(row.avg_unit_price) if row.avg_unit_price is not None else None,
            }
        return result

    if trend_dim == _PRICE_TREND_FLOOR_DIM:
        # 按楼层分组: 键为 floor_level 实际取值
        query = (
            select(
                period_expr,
                PropertyCurrent.floor_level.label("dim_value"),
                func.count().label("volume"),
                func.avg(_unit_price_expr()).label("avg_unit_price"),
            )
            .where(
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= range_start,
                PropertyCurrent.sold_date <= now,
                PropertyCurrent.sold_date.isnot(None),
                PropertyCurrent.floor_level.isnot(None),
            )
            .group_by(period_expr, PropertyCurrent.floor_level)
        )
        query = apply_reports_filter(query, base_filter, include_time_window=False)
        query = _apply_optional_community(query, community_id)
        for row in db.execute(query).all():
            result[_normalize_period(row.period)][str(row.dim_value)] = {
                "volume": int(row.volume or 0),
                "avg_unit_price": float(row.avg_unit_price) if row.avg_unit_price is not None else None,
            }
        return result

    if trend_dim == _PRICE_TREND_DIM:
        # 按价格段分组 (使用 FALLBACK_PRICE_BUCKETS 边界, 与 mock 一致)
        whens: list[tuple[Any, int]] = []
        for idx, (lower, upper, _) in enumerate(FALLBACK_PRICE_BUCKETS):
            if lower is None:
                condition = PropertyCurrent.sold_price_wan < upper
            elif upper is None:
                condition = PropertyCurrent.sold_price_wan >= lower
            else:
                condition = (PropertyCurrent.sold_price_wan >= lower) & (PropertyCurrent.sold_price_wan < upper)
            whens.append((condition, idx))
        bucket_expr = case(*whens, else_=None)

        query = (
            select(
                period_expr,
                bucket_expr.label("bucket_idx"),
                func.count().label("volume"),
                func.avg(_unit_price_expr()).label("avg_unit_price"),
            )
            .where(
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= range_start,
                PropertyCurrent.sold_date <= now,
                PropertyCurrent.sold_date.isnot(None),
                PropertyCurrent.sold_price_wan.isnot(None),
            )
            .group_by(period_expr, bucket_expr)
        )
        query = apply_reports_filter(query, base_filter, include_time_window=False)
        query = _apply_optional_community(query, community_id)
        for row in db.execute(query).all():
            if row.bucket_idx is None:
                continue
            label = FALLBACK_PRICE_BUCKETS[int(row.bucket_idx)][2]
            result[_normalize_period(row.period)][label] = {
                "volume": int(row.volume or 0),
                "avg_unit_price": float(row.avg_unit_price) if row.avg_unit_price is not None else None,
            }
        return result

    return result


def _get_trend_data_impl(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    trend_dim: str = "overall",
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> list[TrendDataPoint]:
    """趋势实现层, 可选 community_id 过滤 (供 get_community_detail 复用)."""
    granularity = get_granularity(filter.range)
    base_filter = _base_filter_no_status(filter)
    # 时间窗口基准: 数据最新 sold_date (避免显示无数据的最新周期)
    if reference_date is None:
        reference_date = _get_data_reference_date(db, base_filter, community_id)
    range_start, now = get_range_bounds(filter.range, reference_date)

    period_expr = func.date_trunc(granularity, PropertyCurrent.sold_date).label("period")

    # 1. 主聚合: 每周期 volume / avg_price_wan / avg_unit_price
    agg_query = (
        select(
            period_expr,
            func.count().label("volume"),
            func.avg(PropertyCurrent.sold_price_wan).label("avg_price_wan"),
            func.avg(_unit_price_expr()).label("avg_unit_price"),
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            PropertyCurrent.sold_date.isnot(None),
        )
        .group_by(period_expr)
        .order_by(period_expr)
    )
    agg_query = apply_reports_filter(agg_query, base_filter, include_time_window=False)
    agg_query = _apply_optional_community(agg_query, community_id)

    agg_rows: dict[datetime, Any] = {_normalize_period(row.period): row for row in db.execute(agg_query).all()}

    # 2. 生成所有周期 (空周期补 0)
    # 终止时间取数据中最新周期, 避免显示无数据的最新月/周
    # (如数据更新到6月时不再显示7月 volume=0 的误导性数据点)
    if agg_rows:
        last_data_period = max(agg_rows.keys())
        periods = _generate_periods(range_start, last_data_period, granularity)
    else:
        periods = []

    # 3. 计算 dim_breakdown (若需要)
    dim_data: dict[datetime, dict[str, dict[str, int | float | None]]] = {}
    if trend_dim != "overall":
        dim_data = _compute_trend_dim_breakdown(db, base_filter, trend_dim, range_start, now, granularity, community_id)

    # 4. 构造 TrendDataPoint 列表, 计算 volume_qoq / price_qoq
    points: list[TrendDataPoint] = []
    prev_volume: int | None = None
    prev_avg_price: float | None = None
    prev_period_existed = False

    for period in periods:
        agg = agg_rows.get(period)
        if agg is not None:
            volume = int(agg.volume or 0)
            avg_price = float(agg.avg_price_wan) if agg.avg_price_wan is not None else None
            avg_unit = float(agg.avg_unit_price) if agg.avg_unit_price is not None else None
        else:
            volume = 0
            avg_price = None
            avg_unit = None

        # 与上一期对比 (首期或上期样本不足 → null)
        volume_qoq: float | None = None
        price_qoq: float | None = None
        if prev_period_existed and prev_volume is not None:
            volume_qoq = _safe_qoq(float(volume), float(prev_volume), prev_volume)
            if avg_price is not None and prev_avg_price is not None:
                price_qoq = _safe_qoq(avg_price, prev_avg_price, prev_volume)

        points.append(
            TrendDataPoint(
                period=period.strftime("%Y-%m-%d"),
                volume=volume,
                avg_price_wan=avg_price,
                avg_unit_price=avg_unit,
                volume_qoq=volume_qoq,
                price_qoq=price_qoq,
                dim_breakdown=dim_data.get(period) if trend_dim != "overall" else None,
            )
        )

        # 更新 prev (无论本期是否有数据, 都更新 prev 为当前期)
        prev_volume = volume
        prev_avg_price = avg_price
        prev_period_existed = True

    return points


@cached_report()
def get_trend_data(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    trend_dim: str = "overall",
) -> list[TrendDataPoint]:
    """成交趋势.

    - date_trunc('week'/'month', sold_date) 分组 (SQL 优先)
    - 空周期补 0 (volume=0, avg_price_wan=null)
    - volume_qoq / price_qoq 与上一期对比, 首期或上期样本不足为 null
    - dim_breakdown: overall → None; rooms/floor/price 调用 bucketing 模块

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        trend_dim: 趋势维度 ('overall'/'rooms'/'floor'/'price')

    Returns:
        list[TrendDataPoint]: 趋势数据点列表

    """
    return _get_trend_data_impl(db, filter, trend_dim, community_id=None)


# ─── 价格分布 ──────────────────────────────────────────────────────────────


def _get_price_distribution_impl(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> dict:
    """价格分布实现层, 可选 community_id 过滤.

    调用 bucketing.compute_price_buckets (样本量 >= 30 时 PERCENTILE_CONT 动态分段,
    < 30 时使用兜底固定分段). community_id 直接透传给 compute_price_buckets,
    在 SQL 层追加精确过滤, 避免重复查询.

    reference_date 由调用方 (如 get_community_detail) 透传时可避免重复 MAX(sold_date)
    查询; 为 None 时本函数自行基于 _base_filter_no_status(filter) 计算.
    """
    base_filter = _base_filter_no_status(filter)
    if reference_date is None:
        reference_date = _get_data_reference_date(db, base_filter, community_id)
    buckets = compute_price_buckets(db, filter, community_id, reference_date=reference_date)
    total = sum(b.count for b in buckets)
    return {"buckets": buckets, "total": total}


@cached_report()
def get_price_distribution(db: Session, filter: ReportsFilter) -> dict:  # noqa: A002
    """价格分布. 调用 bucketing.compute_price_buckets 或 build_fallback_buckets.

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数

    Returns:
        dict: {buckets: list[PriceBucket], total: int}

    """
    return _get_price_distribution_impl(db, filter, community_id=None)


# ─── 户型分布 ──────────────────────────────────────────────────────────────


def _build_area_expr() -> ColumnElement:
    """面积表达式: 仅 build_area > 0 时返回原值, 否则 None (过滤脏数据)."""
    return case(
        (PropertyCurrent.build_area > 0, PropertyCurrent.build_area),
        else_=None,
    )


def _get_rooms_distribution_impl(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> dict:
    """户型分布实现层, 可选 community_id 过滤 (供 get_community_detail 复用).

    - 按 PropertyCurrent.rooms 分组, rooms >= 4 合并为 "4室+"
    - 桶按 rooms 升序: 1室 → 2室 → 3室 → 4室+
    - 仅统计成交记录 (status=SOLD), 时间窗口使用 reference_date 与 KPI/Trend 对齐
    - rooms 为 NULL 的记录过滤掉
    - 每 bucket 含 count / avg_area / avg_unit_price
    """
    base_filter = _base_filter_no_status(filter)
    if reference_date is None:
        reference_date = _get_data_reference_date(db, base_filter, community_id)
    range_start, now = get_range_bounds(filter.range, reference_date)

    # 桶标签: rooms < 4 → "N室", rooms >= 4 → "4室+"
    label_expr = case(
        (
            PropertyCurrent.rooms < _ROOMS_PLUS_THRESHOLD,
            func.concat(PropertyCurrent.rooms, "室"),
        ),
        else_="4室+",
    )
    # 排序键: rooms >= 4 合并为 _ROOMS_PLUS_THRESHOLD, 保证 4室+ 排在末尾
    sort_key_expr = case(
        (PropertyCurrent.rooms >= _ROOMS_PLUS_THRESHOLD, _ROOMS_PLUS_THRESHOLD),
        else_=PropertyCurrent.rooms,
    )

    query = (
        select(
            label_expr.label("label"),
            func.min(sort_key_expr).label("sort_key"),
            func.count().label("count"),
            func.avg(_build_area_expr()).label("avg_area"),
            func.avg(_unit_price_expr()).label("avg_unit_price"),
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date.isnot(None),
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            PropertyCurrent.rooms.isnot(None),
        )
        .group_by(label_expr)
        .order_by(func.min(sort_key_expr).asc())
    )
    query = apply_reports_filter(query, base_filter, include_time_window=False)
    query = _apply_optional_community(query, community_id)

    buckets: list[DistributionBucket] = [
        DistributionBucket(
            label=row.label,
            count=int(row.count or 0),
            avg_area=float(row.avg_area) if row.avg_area is not None else None,
            avg_unit_price=(float(row.avg_unit_price) if row.avg_unit_price is not None else None),
        )
        for row in db.execute(query).all()
    ]
    total = sum(b.count for b in buckets)
    return {"buckets": buckets, "total": total}


@cached_report()
def get_rooms_distribution(db: Session, filter: ReportsFilter, community_id: str | None = None) -> dict:  # noqa: A002
    """户型分布. 按 rooms 分组, >=4 室合并为 "4室+".

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        community_id: 可选小区ID精确过滤 (UUID 字符串); None 时不过滤

    Returns:
        dict: {buckets: list[DistributionBucket], total: int}

    """
    return _get_rooms_distribution_impl(db, filter, community_id=community_id)


# ─── 楼层分布 ──────────────────────────────────────────────────────────────


def _get_floor_distribution_impl(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    community_id: str | None = None,
    reference_date: datetime | None = None,
) -> dict:
    """楼层分布实现层, 可选 community_id 过滤 (供 get_community_detail 复用).

    - 按 PropertyCurrent.floor_level 分组 (低楼层 / 中楼层 / 高楼层)
    - 桶按 floor_level 升序: 低楼层 → 中楼层 → 高楼层 (其余取值置末)
    - 仅统计成交记录 (status=SOLD), 时间窗口使用 reference_date 与 KPI/Trend 对齐
    - floor_level 为 NULL 或空串的记录过滤掉
    - 每 bucket 含 count / avg_area / avg_unit_price
    """
    base_filter = _base_filter_no_status(filter)
    if reference_date is None:
        reference_date = _get_data_reference_date(db, base_filter, community_id)
    range_start, now = get_range_bounds(filter.range, reference_date)

    # 排序键: 低楼层=1, 中楼层=2, 高楼层=3, 其余=4 (置末)
    sort_key_expr = case(
        (PropertyCurrent.floor_level == "低楼层", _FLOOR_LOW_SORT),
        (PropertyCurrent.floor_level == "中楼层", _FLOOR_MID_SORT),
        (PropertyCurrent.floor_level == "高楼层", _FLOOR_HIGH_SORT),
        else_=_FLOOR_OTHER_SORT,
    )

    query = (
        select(
            PropertyCurrent.floor_level.label("label"),
            func.min(sort_key_expr).label("sort_key"),
            func.count().label("count"),
            func.avg(_build_area_expr()).label("avg_area"),
            func.avg(_unit_price_expr()).label("avg_unit_price"),
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date.isnot(None),
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            PropertyCurrent.floor_level.isnot(None),
            PropertyCurrent.floor_level != "",
        )
        .group_by(PropertyCurrent.floor_level)
        .order_by(func.min(sort_key_expr).asc())
    )
    query = apply_reports_filter(query, base_filter, include_time_window=False)
    query = _apply_optional_community(query, community_id)

    buckets: list[DistributionBucket] = [
        DistributionBucket(
            label=row.label,
            count=int(row.count or 0),
            avg_area=float(row.avg_area) if row.avg_area is not None else None,
            avg_unit_price=(float(row.avg_unit_price) if row.avg_unit_price is not None else None),
        )
        for row in db.execute(query).all()
    ]
    total = sum(b.count for b in buckets)
    return {"buckets": buckets, "total": total}


@cached_report()
def get_floor_distribution(db: Session, filter: ReportsFilter, community_id: str | None = None) -> dict:  # noqa: A002
    """楼层分布. 按 floor_level 分组.

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        community_id: 可选小区ID精确过滤 (UUID 字符串); None 时不过滤

    Returns:
        dict: {buckets: list[DistributionBucket], total: int}

    """
    return _get_floor_distribution_impl(db, filter, community_id=community_id)


# ─── 商圈列表 ──────────────────────────────────────────────────────────────


def _build_bc_expr() -> ColumnElement:
    """构建商圈表达式: NULL/空串 → '未分类'."""
    return func.coalesce(
        func.nullif(Community.business_circle, ""),
        _UNCATEGORIZED,
    ).label("bc")


@cached_report()
def get_business_district_rows(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    sort_by: str = "sold_count",
    sort_order: str = "desc",
    page: int = 1,
    page_size: int = 20,
) -> dict:
    """商圈列表. 按 communities.business_circle 聚合.

    - district 取众数 (PostgreSQL MODE() WITHIN GROUP)
    - absorption_months = on_sale_count / (近3月成交套数 / 3), 分母为 0 → null
    - 支持 7 个排序字段: sold_count / avg_price_wan / avg_unit_price / on_sale_count /
      absorption_months / price_qoq / volume_qoq
    - business_circle 为 NULL/空串时归入 "未分类" (始终在排序末尾)
    - 分页

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数
        sort_by: 排序字段
        sort_order: 排序方向 ('asc' / 'desc')
        page: 页码 (从 1 开始)
        page_size: 每页数量

    Returns:
        dict: {items: list[BusinessDistrictRow], total: int}

    """
    # 商圈列表 4 卡片独立统计, 不受 filter.status 影响
    base_filter = _base_filter_no_status(filter)
    # 时间窗口基准: 数据最新 sold_date (避免显示无数据的最新周期)
    reference_date = _get_data_reference_date(db, base_filter)
    range_start, now = get_range_bounds(filter.range, reference_date)
    prev_start, _ = _get_previous_bounds(range_start, now)
    three_months_ago = now - timedelta(days=_ABSORPTION_RECENT_DAYS)

    bc_expr = _build_bc_expr()
    district_mode = func.mode().within_group(Community.district.asc())

    # 主聚合: 一次取出所有需要的指标 (FILTER 子句按状态/时间窗口分别计数)
    query = (
        select(
            bc_expr,
            district_mode.label("district"),
            # 本期成交
            func.count()
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= range_start)
                & (PropertyCurrent.sold_date <= now),
            )
            .label("sold_count"),
            func.avg(PropertyCurrent.sold_price_wan)
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= range_start)
                & (PropertyCurrent.sold_date <= now)
                & (PropertyCurrent.sold_price_wan.isnot(None)),
            )
            .label("avg_price_wan"),
            func.avg(_unit_price_expr())
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= range_start)
                & (PropertyCurrent.sold_date <= now),
            )
            .label("avg_unit_price"),
            # 在售 - 无时间窗口
            func.count().filter(PropertyCurrent.status == PropertyStatus.FOR_SALE).label("on_sale_count"),
            # 近 3 月成交 - 用于去化周期
            func.count()
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= three_months_ago)
                & (PropertyCurrent.sold_date <= now),
            )
            .label("recent_3m_sold"),
            # 上期成交 (用于 qoq)
            func.count()
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= prev_start)
                & (PropertyCurrent.sold_date < range_start),
            )
            .label("prev_sold_count"),
            func.avg(PropertyCurrent.sold_price_wan)
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= prev_start)
                & (PropertyCurrent.sold_date < range_start)
                & (PropertyCurrent.sold_price_wan.isnot(None)),
            )
            .label("prev_avg_price_wan"),
        )
        .select_from(PropertyCurrent)
        .join(
            Community,
            PropertyCurrent.community_id == Community.id,
        )
        .where(
            Community.is_active.is_(True),
        )
        .group_by(bc_expr)
    )

    # 已显式 JOIN Community, 关闭 auto_join_community 避免重复 JOIN
    query = apply_reports_filter(query, base_filter, include_time_window=False, auto_join_community=False)

    rows = db.execute(query).all()

    # 构造 BusinessDistrictRow
    items: list[BusinessDistrictRow] = []
    for row in rows:
        bc = row.bc
        sold_count = int(row.sold_count or 0)
        prev_sold_count = int(row.prev_sold_count or 0)
        avg_price = float(row.avg_price_wan) if row.avg_price_wan is not None else None
        prev_avg_price = float(row.prev_avg_price_wan) if row.prev_avg_price_wan is not None else None
        avg_unit = float(row.avg_unit_price) if row.avg_unit_price is not None else None
        on_sale_count = int(row.on_sale_count or 0)
        recent_3m = int(row.recent_3m_sold or 0)

        # 去化周期 = on_sale_count / (近3月成交 / 3), 分母为 0 → None
        absorption_months: float | None = None
        if recent_3m > 0:
            absorption_months = float(on_sale_count) / (recent_3m / 3.0)

        # 环比
        price_qoq = _safe_qoq(avg_price, prev_avg_price, prev_sold_count)
        volume_qoq = _safe_qoq(float(sold_count), float(prev_sold_count), prev_sold_count)

        items.append(
            BusinessDistrictRow(
                business_circle=bc,
                district=row.district,
                sold_count=sold_count,
                avg_price_wan=avg_price,
                avg_unit_price=avg_unit,
                on_sale_count=on_sale_count,
                absorption_months=absorption_months,
                price_qoq=price_qoq,
                volume_qoq=volume_qoq,
            )
        )

    # 排序: "未分类"始终最后, 其余按 sort_by/sort_order 排序 (None 始终在末尾)
    valid_sort = sort_by in _BUSINESS_DISTRICT_SORT_FIELDS
    effective_sort_by = sort_by if valid_sort else "sold_count"
    reverse = sort_order == "desc"

    uncategorized = [r for r in items if r.business_circle == _UNCATEGORIZED]
    categorized = [r for r in items if r.business_circle != _UNCATEGORIZED]

    with_value: list[BusinessDistrictRow] = []
    without_value: list[BusinessDistrictRow] = []
    for r in categorized:
        val = getattr(r, effective_sort_by, None)
        if val is None:
            without_value.append(r)
        else:
            with_value.append(r)
    with_value.sort(key=lambda r: float(getattr(r, effective_sort_by)), reverse=reverse)
    sorted_items = with_value + without_value + uncategorized

    # 分页
    total = len(sorted_items)
    start = (page - 1) * page_size
    page_items = sorted_items[start : start + page_size]

    return {"items": page_items, "total": total}


# ─── 小区明细列表 ──────────────────────────────────────────────────────────


@cached_report()
def get_community_rows(
    db: Session,
    filter: ReportsFilter,  # noqa: A002
    min_sold_count: int = 3,
) -> dict:
    """小区明细列表. 基于 filter.range + reference_date 动态时间窗口.

    - main_layout 取成交占比最高的 rooms+halls 组合 (如 '3室2厅', 用 PostgreSQL MODE())
    - main_floor 取成交占比最高的 floor_level
    - 过滤 sold_count < min_sold_count 的小区
    - status 强制为 '成交' (小区列表天然只关心成交, 即使 filter.status='在售' 也只统计成交)
    - sources/rooms/floor_levels/business_circles/community_name 由 apply_reports_filter 应用

    Args:
        db: SQLAlchemy 同步 Session
        filter: 报表筛选参数 (range/sources/business_circles/rooms/floor_levels 等)
        min_sold_count: 最低成交套数阈值, 默认 3

    Returns:
        dict: {items: list[CommunityRow], total: int}

    """
    # 小区列表天然只关心成交, 清除 status 以避免 apply_reports_filter 误加 FOR_SALE 过滤
    base_filter = _base_filter_no_status(filter)
    # 时间窗口基准: 数据最新 sold_date (避免显示无数据的最新周期)
    reference_date = _get_data_reference_date(db, base_filter)
    range_start, now = get_range_bounds(filter.range, reference_date)
    prev_start, _ = _get_previous_bounds(range_start, now)

    # 主力户型表达式: rooms || '室' || halls || '厅'
    layout_expr = func.concat(PropertyCurrent.rooms, "室", PropertyCurrent.halls, "厅")
    main_layout_expr = func.mode().within_group(layout_expr.asc())
    main_floor_expr = func.mode().within_group(PropertyCurrent.floor_level.asc())

    # 主查询: 时间窗口内成交按 community_id 聚合
    query = (
        select(
            PropertyCurrent.community_id.label("community_id"),
            Community.name.label("community_name"),
            Community.business_circle.label("business_circle"),
            Community.district.label("district"),
            func.count().label("sold_count"),
            func.avg(PropertyCurrent.sold_price_wan).label("avg_price_wan"),
            func.avg(_unit_price_expr()).label("avg_unit_price"),
            func.avg(PropertyCurrent.build_area).label("avg_area"),
            main_layout_expr.label("main_layout"),
            main_floor_expr.label("main_floor"),
        )
        .select_from(PropertyCurrent)
        .join(
            Community,
            PropertyCurrent.community_id == Community.id,
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            Community.is_active.is_(True),
        )
        .group_by(
            PropertyCurrent.community_id,
            Community.name,
            Community.business_circle,
            Community.district,
        )
    )
    # 应用 sources/rooms/floor_levels/business_circles/community_name 等过滤
    # (status 已强制为 SOLD, 通过 base_filter 清除避免重复; 时间窗口已手动追加)
    # 已显式 JOIN Community, 关闭 auto_join_community 避免重复 JOIN
    query = apply_reports_filter(query, base_filter, include_time_window=False, auto_join_community=False)

    rows = db.execute(query).all()

    # 上期均价查询 - 仅查询主查询涉及的小区，避免全表聚合
    community_ids = [row.community_id for row in rows]
    if community_ids:
        # prev_query 不 join Community, 清除 business_circles/community_name 避免依赖 Community join
        # (community_id.in_() 已通过主查询的 community_ids 间接应用 business_circles 过滤)
        prev_filter = base_filter.model_copy(update={"business_circles": [], "community_name": None})
        prev_query = (
            select(
                PropertyCurrent.community_id.label("community_id"),
                func.avg(PropertyCurrent.sold_price_wan).label("prev_avg_price_wan"),
                func.count().label("prev_sold_count"),
            )
            .where(
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= prev_start,
                PropertyCurrent.sold_date < range_start,
                PropertyCurrent.community_id.in_(community_ids),
            )
            .group_by(PropertyCurrent.community_id)
        )
        # 应用 sources/rooms/floor_levels 过滤 (与主查询保持一致, 确保 qoq 同口径)
        prev_query = apply_reports_filter(prev_query, prev_filter, include_time_window=False)
        prev_rows = {row.community_id: row for row in db.execute(prev_query).all()}
    else:
        prev_rows = {}

    items: list[CommunityRow] = []
    for row in rows:
        sold_count = int(row.sold_count or 0)
        if sold_count < min_sold_count:
            continue

        avg_price = float(row.avg_price_wan) if row.avg_price_wan is not None else None
        prev = prev_rows.get(row.community_id)
        prev_avg_price = float(prev.prev_avg_price_wan) if prev and prev.prev_avg_price_wan is not None else None
        prev_sold_count = int(prev.prev_sold_count) if prev else 0

        price_qoq = _safe_qoq(avg_price, prev_avg_price, prev_sold_count)

        items.append(
            CommunityRow(
                community_id=row.community_id,
                community_name=row.community_name,
                business_circle=row.business_circle or "",
                district=row.district,
                sold_count=sold_count,
                avg_price_wan=avg_price,
                avg_unit_price=(float(row.avg_unit_price) if row.avg_unit_price is not None else None),
                main_layout=row.main_layout,
                main_floor=row.main_floor,
                avg_area=float(row.avg_area) if row.avg_area is not None else None,
                price_qoq=price_qoq,
            )
        )

    return {"items": items, "total": len(items)}


# ─── 小区成交分析详情 ──────────────────────────────────────────────────────


@cached_report()
def get_community_detail(
    db: Session,
    community: Community,
    filter: ReportsFilter,  # noqa: A002
    trend_dim: str = "overall",
) -> dict:
    """小区成交分析详情.

    - 参数为 Community ORM 对象 (由依赖项提供, 不再查库)
    - 组合 KPI / 趋势 / 价格分布 + 户型分布 + 楼层分布 + main_layout

    Args:
        db: SQLAlchemy 同步 Session
        community: Community ORM 对象
        filter: 报表筛选参数 (range/sources/rooms/floor_levels 等)
        trend_dim: 趋势维度 ('overall'/'rooms'/'floor'/'price')

    Returns:
        dict: CommunityDetailResponse 校验结构

    """
    # 预计算 reference_date，避免 _impl 函数各自重复查询 MAX(sold_date)
    base_filter = _base_filter_no_status(filter)
    ref_date = _get_data_reference_date(db, base_filter, community.id)

    kpi = _get_kpi_data_impl(db, filter, community_id=community.id, reference_date=ref_date)
    trend = _get_trend_data_impl(db, filter, trend_dim, community_id=community.id, reference_date=ref_date)
    price_distribution = _get_price_distribution_impl(db, filter, community_id=community.id, reference_date=ref_date)
    rooms_distribution = _get_rooms_distribution_impl(db, filter, community_id=community.id, reference_date=ref_date)
    floor_distribution = _get_floor_distribution_impl(db, filter, community_id=community.id, reference_date=ref_date)

    # main_layout: 近 12 月成交中占比最高的 rooms+halls 组合
    now = datetime.now(timezone.utc)
    range_start_12m = now - timedelta(days=_COMMUNITY_LIST_DAYS)
    layout_expr = func.concat(PropertyCurrent.rooms, "室", PropertyCurrent.halls, "厅")
    main_layout_query = select(
        func.mode().within_group(layout_expr.asc()).label("main_layout"),
    ).where(
        PropertyCurrent.status == PropertyStatus.SOLD,
        PropertyCurrent.sold_date >= range_start_12m,
        PropertyCurrent.sold_date <= now,
        PropertyCurrent.is_active.is_(True),
        PropertyCurrent.community_id == community.id,
    )
    main_layout_row = db.execute(main_layout_query).one_or_none()
    main_layout = main_layout_row.main_layout if main_layout_row is not None else None

    return {
        "community": {
            "community_id": community.id,
            "community_name": community.name,
            "business_circle": community.business_circle or "",
            "district": community.district,
        },
        "kpi": kpi,
        "trend": trend,
        "price_distribution": price_distribution,
        "rooms_distribution": rooms_distribution,
        "floor_distribution": floor_distribution,
        "main_layout": main_layout,
    }


# ─── 多商圈对比 ──────────────────────────────────────────────────────────────


@cached_report()
def get_comparison_data(
    db: Session,
    business_circles: list[str],
    filter: ReportsFilter,  # noqa: A002
) -> ComparisonData:
    """多商圈对比. 2-5 个商圈.

    - summary: 7 行 (成交套数 / 均价(万) / 单价(元/㎡) / 在售房源 / 去化周期(月) / 价环比(%) / 量环比(%))
    - volume_trend / price_trend: 每周期一行, 含各商圈值
    - floor_structure: 每商圈一行, 含 low/mid/high 套数 (原始值)
    - room_structure: 每商圈一行, 含 r1/r2/r3/r4plus 套数 (>=4 室合并)
    - 趋势粒度由 range 推导 (4w/8w→周, 6m/12m/24m→月)

    Args:
        db: SQLAlchemy 同步 Session
        business_circles: 商圈名列表 (2-5 个, 由依赖层校验)
        filter: 报表筛选参数

    Returns:
        ComparisonData: 多商圈对比聚合数据

    """
    granularity = get_granularity(filter.range)

    # 多商圈对比清除 business_circle / community_id / status (各指标用 FILTER 独立计算)
    base_filter = _base_filter_for_comparison(filter)
    # 时间窗口基准: 数据最新 sold_date (避免显示无数据的最新周期)
    reference_date = _get_data_reference_date(db, base_filter)
    range_start, now = get_range_bounds(filter.range, reference_date)
    prev_start, _ = _get_previous_bounds(range_start, now)
    three_months_ago = now - timedelta(days=_ABSORPTION_RECENT_DAYS)

    # 1. summary: 一次 SQL 取出每个商圈的所有指标
    summary_query = (
        select(
            Community.business_circle.label("bc"),
            func.count()
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= range_start)
                & (PropertyCurrent.sold_date <= now),
            )
            .label("sold_count"),
            func.avg(PropertyCurrent.sold_price_wan)
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= range_start)
                & (PropertyCurrent.sold_date <= now)
                & (PropertyCurrent.sold_price_wan.isnot(None)),
            )
            .label("avg_price_wan"),
            func.avg(_unit_price_expr())
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= range_start)
                & (PropertyCurrent.sold_date <= now),
            )
            .label("avg_unit_price"),
            func.count().filter(PropertyCurrent.status == PropertyStatus.FOR_SALE).label("on_sale_count"),
            func.count()
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= three_months_ago)
                & (PropertyCurrent.sold_date <= now),
            )
            .label("recent_3m_sold"),
            func.count()
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= prev_start)
                & (PropertyCurrent.sold_date < range_start),
            )
            .label("prev_sold_count"),
            func.avg(PropertyCurrent.sold_price_wan)
            .filter(
                (PropertyCurrent.status == PropertyStatus.SOLD)
                & (PropertyCurrent.sold_date >= prev_start)
                & (PropertyCurrent.sold_date < range_start)
                & (PropertyCurrent.sold_price_wan.isnot(None)),
            )
            .label("prev_avg_price_wan"),
        )
        .select_from(PropertyCurrent)
        .join(
            Community,
            PropertyCurrent.community_id == Community.id,
        )
        .where(
            Community.business_circle.in_(business_circles),
            Community.is_active.is_(True),
        )
        .group_by(Community.business_circle)
    )

    # 已显式 JOIN Community, 关闭 auto_join_community 避免重复 JOIN
    summary_query = apply_reports_filter(
        summary_query, base_filter, include_time_window=False, auto_join_community=False
    )
    summary_rows = {row.bc: row for row in db.execute(summary_query).all()}

    # 计算 7 行 summary
    metric_values: dict[str, list[float | None]] = {m: [] for m in _COMPARISON_METRICS}
    for bc in business_circles:
        row = summary_rows.get(bc)
        if row is None:
            for m in _COMPARISON_METRICS:
                metric_values[m].append(0 if m in ("成交套数", "在售房源") else None)
            continue

        sold_count = int(row.sold_count or 0)
        prev_sold_count = int(row.prev_sold_count or 0)
        avg_price = float(row.avg_price_wan) if row.avg_price_wan is not None else None
        prev_avg_price = float(row.prev_avg_price_wan) if row.prev_avg_price_wan is not None else None
        avg_unit = float(row.avg_unit_price) if row.avg_unit_price is not None else None
        on_sale_count = int(row.on_sale_count or 0)
        recent_3m = int(row.recent_3m_sold or 0)

        # 去化周期
        absorption: float | None = None
        if recent_3m > 0:
            absorption = float(on_sale_count) / (recent_3m / 3.0)

        # 环比
        price_qoq = _safe_qoq(avg_price, prev_avg_price, prev_sold_count)
        volume_qoq = _safe_qoq(float(sold_count), float(prev_sold_count), prev_sold_count)

        metric_values["成交套数"].append(float(sold_count))
        metric_values["均价(万)"].append(avg_price)
        metric_values["单价(元/㎡)"].append(avg_unit)
        metric_values["在售房源"].append(float(on_sale_count))
        metric_values["去化周期(月)"].append(absorption)
        metric_values["价环比(%)"].append(price_qoq)
        metric_values["量环比(%)"].append(volume_qoq)

    summary: list[ComparisonSummaryRow] = [
        ComparisonSummaryRow(metric=m, values=metric_values[m]) for m in _COMPARISON_METRICS
    ]

    # 2. volume_trend / price_trend: 周期 + 商圈透视
    period_expr = func.date_trunc(granularity, PropertyCurrent.sold_date).label("period")
    trend_query = (
        select(
            period_expr,
            Community.business_circle.label("bc"),
            func.count().label("volume"),
            func.avg(PropertyCurrent.sold_price_wan).label("avg_price_wan"),
        )
        .select_from(PropertyCurrent)
        .join(
            Community,
            PropertyCurrent.community_id == Community.id,
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            PropertyCurrent.sold_date.isnot(None),
            Community.business_circle.in_(business_circles),
            Community.is_active.is_(True),
        )
        .group_by(period_expr, Community.business_circle)
        .order_by(period_expr)
    )
    # 已显式 JOIN Community, 关闭 auto_join_community 避免重复 JOIN
    trend_query = apply_reports_filter(trend_query, base_filter, include_time_window=False, auto_join_community=False)

    trend_rows = db.execute(trend_query).all()

    # 生成所有周期 + 透视 (空周期补 None)
    # 终止时间取数据中最新周期, 避免显示无数据的最新月/周
    if trend_rows:
        last_data_period = max(_normalize_period(row.period) for row in trend_rows)
        periods = _generate_periods(range_start, last_data_period, granularity)
    else:
        periods = []
    period_to_index = {p: i for i, p in enumerate(periods)}

    volume_trend_data: list[dict] = [
        {"period": p.strftime("%Y-%m-%d"), **dict.fromkeys(business_circles, None)} for p in periods
    ]
    price_trend_data: list[dict] = [
        {"period": p.strftime("%Y-%m-%d"), **dict.fromkeys(business_circles, None)} for p in periods
    ]
    for row in trend_rows:
        idx = period_to_index.get(_normalize_period(row.period))
        if idx is None:
            continue
        bc = row.bc
        if bc not in business_circles:
            continue
        volume_trend_data[idx][bc] = int(row.volume or 0)
        price_trend_data[idx][bc] = float(row.avg_price_wan) if row.avg_price_wan is not None else None

    volume_trend = [ComparisonTrendPoint(**d) for d in volume_trend_data]
    price_trend = [ComparisonTrendPoint(**d) for d in price_trend_data]

    # 3. floor_structure: 每商圈一行 {business_circle, low, mid, high}
    floor_query = (
        select(
            Community.business_circle.label("bc"),
            PropertyCurrent.floor_level.label("floor_level"),
            func.count().label("count"),
        )
        .select_from(PropertyCurrent)
        .join(
            Community,
            PropertyCurrent.community_id == Community.id,
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            PropertyCurrent.sold_date.isnot(None),
            Community.business_circle.in_(business_circles),
            Community.is_active.is_(True),
        )
        .group_by(Community.business_circle, PropertyCurrent.floor_level)
    )
    # 已显式 JOIN Community, 关闭 auto_join_community 避免重复 JOIN
    floor_query = apply_reports_filter(floor_query, base_filter, include_time_window=False, auto_join_community=False)
    floor_rows = db.execute(floor_query).all()

    floor_data: dict[str, dict[str, int]] = {bc: {"low": 0, "mid": 0, "high": 0} for bc in business_circles}
    for row in floor_rows:
        if row.bc not in floor_data:
            continue
        field = _FLOOR_LEVEL_MAP.get(row.floor_level)
        if field is None:
            continue
        floor_data[row.bc][field] += int(row.count or 0)
    floor_structure: list[ComparisonFloorStructure] = [
        ComparisonFloorStructure(
            business_circle=bc,
            low=floor_data[bc]["low"],
            mid=floor_data[bc]["mid"],
            high=floor_data[bc]["high"],
        )
        for bc in business_circles
    ]

    # 4. room_structure: 每商圈一行 {business_circle, r1, r2, r3, r4plus}
    room_query = (
        select(
            Community.business_circle.label("bc"),
            PropertyCurrent.rooms.label("rooms"),
            func.count().label("count"),
        )
        .select_from(PropertyCurrent)
        .join(
            Community,
            PropertyCurrent.community_id == Community.id,
        )
        .where(
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= range_start,
            PropertyCurrent.sold_date <= now,
            PropertyCurrent.sold_date.isnot(None),
            Community.business_circle.in_(business_circles),
            Community.is_active.is_(True),
        )
        .group_by(Community.business_circle, PropertyCurrent.rooms)
    )
    # 已显式 JOIN Community, 关闭 auto_join_community 避免重复 JOIN
    room_query = apply_reports_filter(room_query, base_filter, include_time_window=False, auto_join_community=False)
    room_rows = db.execute(room_query).all()

    room_data: dict[str, dict[str, int]] = {bc: {"r1": 0, "r2": 0, "r3": 0, "r4plus": 0} for bc in business_circles}
    for row in room_rows:
        if row.bc not in room_data:
            continue
        rooms_val = int(row.rooms) if row.rooms is not None else 0
        count = int(row.count or 0)
        if rooms_val == _ROOM_1:
            room_data[row.bc]["r1"] += count
        elif rooms_val == _ROOM_2:
            room_data[row.bc]["r2"] += count
        elif rooms_val == _ROOM_3:
            room_data[row.bc]["r3"] += count
        elif rooms_val >= _ROOMS_PLUS_THRESHOLD:
            room_data[row.bc]["r4plus"] += count
    room_structure: list[ComparisonRoomStructure] = [
        ComparisonRoomStructure(
            business_circle=bc,
            r1=room_data[bc]["r1"],
            r2=room_data[bc]["r2"],
            r3=room_data[bc]["r3"],
            r4plus=room_data[bc]["r4plus"],
        )
        for bc in business_circles
    ]

    return ComparisonData(
        business_circles=business_circles,
        summary=summary,
        volume_trend=volume_trend,
        price_trend=price_trend,
        floor_structure=floor_structure,
        room_structure=room_structure,
    )


__all__ = [
    "get_business_district_rows",
    "get_community_detail",
    "get_community_rows",
    "get_comparison_data",
    "get_floor_distribution",
    "get_kpi_data",
    "get_price_distribution",
    "get_rooms_distribution",
    "get_trend_data",
]
