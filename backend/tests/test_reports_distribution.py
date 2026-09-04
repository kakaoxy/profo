"""户型/楼层分布聚合函数单元测试.

覆盖 services.reports.aggregations 中两个新函数:
- get_rooms_distribution: 按 rooms 分组 (>=4 合并为 "4室+")
- get_floor_distribution: 按 floor_level 分组

测试策略:
- 复用 conftest_reports.reports_sample_data fixture (3 商圈 × 3 小区 × (5 成交 + 2 在售))
- 直接调用聚合函数 (不经 HTTP 端点, 端点测试由 test_reports_market.py 覆盖)
- 验证桶排序 / 合并逻辑 / community_id 过滤 / 空数据
- 不验证精确数值 (避免脆弱断言), 仅验证结构与语义

样本数据 (与 conftest_reports.reports_sample_data 对齐):
- 每小区 5 条成交: rooms=1,2,3,4,1 (j%4+1); floor_level=低/中/高/低/中 (j%3)
- 9 小区共 45 条成交
- rooms 分布: 1室=18, 2室=9, 3室=9, 4室+=9
- floor 分布: 低=18, 中=18, 高=9
"""

# ruff: noqa: F811
# 本文件通过参数名注入 pytest fixtures (reports_sample_data / _clear_reports_cache)。
# 参数名与导入名同名会触发 ruff F811 误报，故文件级抑制。

from typing import Any

from sqlalchemy.orm import Session

from schemas.reports.common import ReportsFilter
from services.reports.aggregations import (
    get_floor_distribution,
    get_rooms_distribution,
)
from tests.conftest_reports import (  # noqa: F401
    _clear_reports_cache,
    reports_sample_data,
)

# 样本数据常量 (与 conftest_reports.reports_sample_data 对齐)
_TOTAL_SOLD = 45  # 3 商圈 × 3 小区 × 5 成交
_PER_COMMUNITY_SOLD = 5
_EXPECTED_ROOMS_LABELS = ["1室", "2室", "3室", "4室+"]
_EXPECTED_FLOOR_LABELS = ["低楼层", "中楼层", "高楼层"]


# ─── 户型分布 ────────────────────────────────────────────────────────────────


def test_get_rooms_distribution_sample_size(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """9 小区 × 5 成交 = 45 条; 4 桶 (1室/2室/3室/4室+); total=45."""
    result = get_rooms_distribution(db_session, ReportsFilter(range="4w"))

    buckets = result["buckets"]
    labels = [b.label for b in buckets]
    assert labels == _EXPECTED_ROOMS_LABELS, f"桶标签顺序错误: {labels}"

    total = result["total"]
    assert total == _TOTAL_SOLD, f"total {total} 不等于 {_TOTAL_SOLD}"

    bucket_sum = sum(b.count for b in buckets)
    assert bucket_sum == total, f"桶 count 之和 {bucket_sum} 不等于 total {total}"


def test_get_rooms_distribution_merge_4plus(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """rooms>=4 合并为 "4室+" 桶; 每小区 1 条 rooms=4 → 9 条合计."""
    result = get_rooms_distribution(db_session, ReportsFilter(range="4w"))

    buckets = result["buckets"]
    label_to_count = {b.label: b.count for b in buckets}

    # 样本: 每小区 j=0..4 → rooms=1,2,3,4,1; 9 小区
    # 1室: 9×2=18, 2室: 9×1=9, 3室: 9×1=9, 4室+: 9×1=9
    assert label_to_count["1室"] == 18, f"1室 count 应为 18, 实际 {label_to_count['1室']}"
    assert label_to_count["2室"] == 9, f"2室 count 应为 9, 实际 {label_to_count['2室']}"
    assert label_to_count["3室"] == 9, f"3室 count 应为 9, 实际 {label_to_count['3室']}"
    assert label_to_count["4室+"] == 9, f"4室+ count 应为 9, 实际 {label_to_count['4室+']}"


def test_get_rooms_distribution_community_filter(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """community_id 过滤: 单小区 5 条成交 (1室=2, 2室=1, 3室=1, 4室+=1)."""
    community = reports_sample_data["communities"][0]
    result = get_rooms_distribution(db_session, ReportsFilter(range="4w"), community_id=community.id)

    buckets = result["buckets"]
    total = result["total"]
    assert total == _PER_COMMUNITY_SOLD, f"单小区 total 应为 5, 实际 {total}"

    label_to_count = {b.label: b.count for b in buckets}
    assert label_to_count["1室"] == 2
    assert label_to_count["2室"] == 1
    assert label_to_count["3室"] == 1
    assert label_to_count["4室+"] == 1


def test_get_rooms_distribution_empty(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """筛选条件导致无数据时返回空 buckets, total=0."""
    result = get_rooms_distribution(
        db_session,
        ReportsFilter(range="4w", business_circles=["不存在商圈"]),
    )

    assert result["buckets"] == []
    assert result["total"] == 0


def test_get_rooms_distribution_bucket_fields(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """每个 bucket 含 label / count / avg_area / avg_unit_price 字段."""
    result = get_rooms_distribution(db_session, ReportsFilter(range="4w"))

    for bucket in result["buckets"]:
        assert isinstance(bucket.label, str)
        assert isinstance(bucket.count, int)
        # avg_area / avg_unit_price 可为 None (无有效 build_area), 但字段必须存在
        assert hasattr(bucket, "avg_area")
        assert hasattr(bucket, "avg_unit_price")
        # 样本数据 build_area 均为正 (80+), avg_area 应为正数
        assert bucket.avg_area is not None
        assert bucket.avg_area > 0
        # 样本数据 sold_price_wan 与 build_area 均有效, avg_unit_price 应为正数
        assert bucket.avg_unit_price is not None
        assert bucket.avg_unit_price > 0


# ─── 楼层分布 ────────────────────────────────────────────────────────────────


def test_get_floor_distribution_sample_size(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """9 小区 × 5 成交 = 45 条; 3 桶 (低/中/高), total=45."""
    result = get_floor_distribution(db_session, ReportsFilter(range="4w"))

    buckets = result["buckets"]
    labels = [b.label for b in buckets]
    assert labels == _EXPECTED_FLOOR_LABELS, f"桶标签顺序错误: {labels}"

    total = result["total"]
    assert total == _TOTAL_SOLD, f"total {total} 不等于 {_TOTAL_SOLD}"

    bucket_sum = sum(b.count for b in buckets)
    assert bucket_sum == total, f"桶 count 之和 {bucket_sum} 不等于 total {total}"


def test_get_floor_distribution_counts(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """楼层分布计数: 低=18, 中=18, 高=9 (9 小区 × j%3 循环)."""
    result = get_floor_distribution(db_session, ReportsFilter(range="4w"))

    buckets = result["buckets"]
    label_to_count = {b.label: b.count for b in buckets}

    # 样本: 每小区 j=0..4 → floor_level=低/中/高/低/中; 9 小区
    # 低楼层: 9×2=18, 中楼层: 9×2=18, 高楼层: 9×1=9
    assert label_to_count["低楼层"] == 18, f"低楼层 count 应为 18, 实际 {label_to_count['低楼层']}"
    assert label_to_count["中楼层"] == 18, f"中楼层 count 应为 18, 实际 {label_to_count['中楼层']}"
    assert label_to_count["高楼层"] == 9, f"高楼层 count 应为 9, 实际 {label_to_count['高楼层']}"


def test_get_floor_distribution_null_filtered(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """floor_level 为 NULL 的成交记录应被过滤掉, 不出现在桶中."""
    from datetime import datetime, timedelta, timezone
    from decimal import Decimal

    from models.common import PropertyStatus
    from models.property.community import Community
    from models.property.property import PropertyCurrent
    from services.reports.cache import invalidate_reports_cache

    # 新增一条 floor_level=NULL 的成交记录 (复用样本中的第一个小区)
    community: Community = reports_sample_data["communities"][0]
    now = datetime.now(timezone.utc)
    null_floor_property = PropertyCurrent(
        data_source="链家",
        source_property_id="src-null-floor-test",
        community_id=community.id,
        status=PropertyStatus.SOLD,
        rooms=3,
        halls=2,
        floor_original="未知",
        floor_level=None,  # NULL floor_level
        orientation="南北",
        build_area=Decimal(90),
        sold_price_wan=Decimal(300),
        sold_date=now - timedelta(days=1),
        is_active=True,
    )
    db_session.add(null_floor_property)
    db_session.commit()
    # 数据变更后清空报表缓存
    invalidate_reports_cache()

    # 该小区的楼层分布: 单小区原始 5 条 + 新增 1 条 NULL (被过滤)
    result = get_floor_distribution(db_session, ReportsFilter(range="4w"), community_id=community.id)

    buckets = result["buckets"]
    total = result["total"]
    # NULL floor_level 被过滤, total 仍为 5 (不含新增的 NULL 记录)
    assert total == _PER_COMMUNITY_SOLD, f"NULL floor_level 应被过滤, total 应为 5, 实际 {total}"
    # 仅含 低/中/高 三种标签
    labels = [b.label for b in buckets]
    assert all(label in _EXPECTED_FLOOR_LABELS for label in labels), f"出现非预期标签: {labels}"


def test_get_floor_distribution_empty_floor_string_filtered(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """floor_level 为空串的成交记录应被过滤掉."""
    from datetime import datetime, timedelta, timezone
    from decimal import Decimal

    from models.common import PropertyStatus
    from models.property.community import Community
    from models.property.property import PropertyCurrent
    from services.reports.cache import invalidate_reports_cache

    community: Community = reports_sample_data["communities"][0]
    now = datetime.now(timezone.utc)
    empty_floor_property = PropertyCurrent(
        data_source="链家",
        source_property_id="src-empty-floor-test",
        community_id=community.id,
        status=PropertyStatus.SOLD,
        rooms=3,
        halls=2,
        floor_original="未知",
        floor_level="",  # 空串
        orientation="南北",
        build_area=Decimal(90),
        sold_price_wan=Decimal(300),
        sold_date=now - timedelta(days=1),
        is_active=True,
    )
    db_session.add(empty_floor_property)
    db_session.commit()
    invalidate_reports_cache()

    result = get_floor_distribution(db_session, ReportsFilter(range="4w"), community_id=community.id)

    total = result["total"]
    # 空串 floor_level 被过滤, total 仍为 5
    assert total == _PER_COMMUNITY_SOLD, f"空串 floor_level 应被过滤, total 应为 5, 实际 {total}"


def test_get_floor_distribution_community_filter(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """community_id 过滤: 单小区 5 条成交 (低=2, 中=2, 高=1)."""
    community = reports_sample_data["communities"][0]
    result = get_floor_distribution(db_session, ReportsFilter(range="4w"), community_id=community.id)

    buckets = result["buckets"]
    total = result["total"]
    assert total == _PER_COMMUNITY_SOLD, f"单小区 total 应为 5, 实际 {total}"

    label_to_count = {b.label: b.count for b in buckets}
    assert label_to_count["低楼层"] == 2
    assert label_to_count["中楼层"] == 2
    assert label_to_count["高楼层"] == 1


def test_get_floor_distribution_empty(
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """筛选条件导致无数据时返回空 buckets, total=0."""
    result = get_floor_distribution(
        db_session,
        ReportsFilter(range="4w", business_circles=["不存在商圈"]),
    )

    assert result["buckets"] == []
    assert result["total"] == 0
