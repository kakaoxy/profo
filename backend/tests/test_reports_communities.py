"""商圈分析报表 - 小区端点集成测试.

覆盖 2 个端点 (参考 routers/reports/communities.py):
- GET /api/v1/reports/communities/  (business_circles 必填 Query)
- GET /api/v1/reports/communities/{community_id}/analysis

测试策略:
- 使用 conftest_reports.reports_client (admin 受众 token + X-Requested-With)
- 复用 reports_sample_data fixture (3 商圈 × 3 小区 × (5 成交 + 2 在售))
- 小区列表固定时间窗口近 12 月 (365 天), 默认 min_sold_count=3
- 每小区 5 条成交 (>= 3 默认阈值), 通过 min_sold_count=10 验证过滤
- 小区详情由 valid_community_id 依赖校验, 不存在 → 404 CommunityNotFound
"""

# ruff: noqa: F811
# 本文件通过参数名注入 pytest fixtures (reports_client / reports_sample_data)。
# 参数名与导入名同名会触发 ruff F811 误报，故文件级抑制。

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# 注册 conftest_reports 中的 fixtures (非 conftest.py 文件需显式导入供 pytest 发现)
from tests.conftest_reports import (  # noqa: F401
    reports_client,
    reports_sample_data,
)

# 小区端点基础路径
_BASE = "/api/v1/reports/communities"

# 样本数据常量 (与 conftest_reports.reports_sample_data 对齐)
_COMMUNITIES_PER_CIRCLE = 3  # 每商圈 3 小区
_SOLD_PER_COMMUNITY = 5  # 每小区 5 条成交


# ─── 小区明细列表端点 ────────────────────────────────────────────────────────


def test_get_communities_success(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """business_circles=徐家汇 返回 3 个小区行, 每行 5 条成交 (>=3 默认阈值)."""
    resp = reports_client.get(f"{_BASE}/", params={"business_circles": "徐家汇"})

    assert resp.status_code == 200, f"小区列表请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items: list[dict[str, Any]] = data["items"]
    total: int = data["total"]

    assert total == _COMMUNITIES_PER_CIRCLE
    assert len(items) == _COMMUNITIES_PER_CIRCLE

    # 每行必含字段
    for row in items:
        assert "community_id" in row
        assert "community_name" in row
        assert "business_circle" in row
        assert "sold_count" in row
        assert row["business_circle"] == "徐家汇"
        assert row["sold_count"] == _SOLD_PER_COMMUNITY

    # community_id 应来自样本数据
    sample_ids = {c.id for c in reports_sample_data["communities"] if c.business_circle == "徐家汇"}
    actual_ids = {row["community_id"] for row in items}
    assert actual_ids == sample_ids, f"小区 ID 集合不匹配: {actual_ids} != {sample_ids}"


def test_get_communities_missing_circle(reports_client: TestClient) -> None:
    """缺少必填参数 business_circles 时返回 422 (FastAPI 自动校验)."""
    resp = reports_client.get(f"{_BASE}/")

    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == 422
    assert "business_circles" in body["message"] or "参数" in body["message"]


def test_get_communities_min_sold_filter(reports_client: TestClient) -> None:
    """min_sold_count=10 过滤掉所有小区 (每小区仅 5 条成交 < 10)."""
    resp = reports_client.get(
        f"{_BASE}/",
        params={"business_circles": "徐家汇", "min_sold_count": 10},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 0
    assert data["items"] == []


def test_get_communities_inactive_circle(
    reports_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """非活跃小区 (is_active=False) 不应出现在列表中.

    通过将样本小区置为 inactive 验证软删除过滤.
    """
    from models.property.community import Community
    from services.reports.cache import invalidate_reports_cache

    # 将徐家汇的第 1 个小区置为 inactive
    xujiahui_communities = [c for c in reports_sample_data["communities"] if c.business_circle == "徐家汇"]
    target = xujiahui_communities[0]
    db_session.query(Community).filter(Community.id == target.id).update({"is_active": False})
    db_session.commit()

    # 数据变更后清除报表缓存，避免命中前序测试的缓存结果
    invalidate_reports_cache()

    resp = reports_client.get(f"{_BASE}/", params={"business_circles": "徐家汇"})

    assert resp.status_code == 200
    data = resp.json()
    # 应只剩 2 个活跃小区
    assert data["total"] == _COMMUNITIES_PER_CIRCLE - 1
    actual_ids = {row["community_id"] for row in data["items"]}
    assert target.id not in actual_ids, "非活跃小区不应出现在列表中"


# ─── 小区成交分析详情端点 ────────────────────────────────────────────────────


def test_get_community_detail_success(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """存在的小区 ID 返回完整详情.

    断言响应包含 community/kpi/trend/price_distribution/rooms_distribution/
    floor_distribution/main_layout 全部模块。
    """
    target = reports_sample_data["communities"][0]
    resp = reports_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 200, f"小区详情请求失败: {resp.status_code} {resp.text}"
    data = resp.json()

    # community 基本信息字段
    community_info: dict[str, Any] = data["community"]
    assert community_info["community_id"] == target.id
    assert community_info["community_name"] == target.name
    assert community_info["business_circle"] == target.business_circle

    # kpi 应为 KpiData 结构 (4 张卡片)
    kpi: dict[str, Any] = data["kpi"]
    assert set(kpi.keys()) == {"sold_count", "avg_price_wan", "avg_unit_price", "on_sale_count"}

    # trend 应为列表
    trend: list[dict[str, Any]] = data["trend"]
    assert isinstance(trend, list)
    assert len(trend) >= 1

    # price_distribution 应有 buckets + total
    pd_data: dict[str, Any] = data["price_distribution"]
    assert "buckets" in pd_data
    assert "total" in pd_data
    assert pd_data["total"] >= 0

    # rooms_distribution 应有 buckets + total
    rd_data: dict[str, Any] = data["rooms_distribution"]
    assert "buckets" in rd_data
    assert "total" in rd_data
    assert rd_data["total"] >= 0
    assert isinstance(rd_data["buckets"], list)

    # floor_distribution 应有 buckets + total
    fd_data: dict[str, Any] = data["floor_distribution"]
    assert "buckets" in fd_data
    assert "total" in fd_data
    assert fd_data["total"] >= 0
    assert isinstance(fd_data["buckets"], list)

    # 不应再返回 peers 字段
    assert "peers" not in data, "peers 字段应已移除"


def test_get_community_detail_not_found(reports_client: TestClient) -> None:
    """不存在的小区 ID 返回 404 (CommunityNotFound)."""
    resp = reports_client.get(f"{_BASE}/non-existent-community-id/analysis")

    assert resp.status_code == 404
    body = resp.json()
    assert body["code"] == 404
    assert "小区" in body["message"] or "不存在" in body["message"]


# ─── Bug 2: 小区列表筛选参数透传 ─────────────────────────────────────────────


def test_get_communities_with_sources_filter(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """list_communities?range=12m&sources=链家 正确应用来源过滤.

    样本: 每小区 5 条成交, 其中 j=0,2,4 为链家 (3 条), j=1,3 为贝壳 (2 条).
    过滤 sources=链家 后, 每小区应剩 3 条成交 (>= 默认 min_sold_count=3).
    """
    resp = reports_client.get(
        f"{_BASE}/",
        params={"business_circles": "徐家汇", "range": "12m", "sources": "链家"},
    )

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items: list[dict[str, Any]] = data["items"]

    # 徐家汇 3 个小区, 每个应有 3 条链家成交
    assert len(items) == _COMMUNITIES_PER_CIRCLE
    for row in items:
        assert row["sold_count"] == 3, f"小区 {row['community_id']} sold_count 应为 3, 实际 {row['sold_count']}"


def test_get_communities_with_rooms_filter(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """list_communities?range=12m&rooms=1,2 正确应用户型过滤.

    样本: 每小区 5 条成交, rooms 分布为 1,2,3,4,1 (j=0..4).
    过滤 rooms=1,2 后, 命中 j=0(1室),j=1(2室),j=4(1室) 共 3 条成交.
    """
    resp = reports_client.get(
        f"{_BASE}/",
        params={"business_circles": "徐家汇", "range": "12m", "rooms": "1,2"},
    )

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items = data["items"]

    assert len(items) == _COMMUNITIES_PER_CIRCLE
    for row in items:
        assert row["sold_count"] == 3, f"小区 {row['community_id']} sold_count 应为 3, 实际 {row['sold_count']}"


def test_get_communities_with_compound_filter(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """list_communities?range=12m&sources=链家&rooms=1,2&min_sold_count=1 正确应用复合过滤.

    样本: 链家+rooms=1,2 → j=0(链家,1室),j=4(链家,1室) 共 2 条.
    使用 min_sold_count=1 确保 2 条成交也能出现在列表中.
    """
    resp = reports_client.get(
        f"{_BASE}/",
        params={
            "business_circles": "徐家汇",
            "range": "12m",
            "sources": "链家",
            "rooms": "1,2",
            "min_sold_count": 1,
        },
    )

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items = data["items"]

    assert len(items) == _COMMUNITIES_PER_CIRCLE
    for row in items:
        assert row["sold_count"] == 2, f"小区 {row['community_id']} sold_count 应为 2, 实际 {row['sold_count']}"


def test_get_communities_status_forced_sold(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """list_communities?status=在售 仍只统计成交房源 (status 强制为 '成交').

    小区列表天然只关心成交, 即使 filter.status='在售' 也只统计 SOLD.
    样本: 每小区 5 条成交 (status='在售' 不影响 sold_count).
    """
    resp = reports_client.get(
        f"{_BASE}/",
        params={"business_circles": "徐家汇", "range": "12m", "status": "在售"},
    )

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items = data["items"]

    # status='在售' 应被强制为 '成交', 每小区仍有 5 条成交记录
    assert len(items) == _COMMUNITIES_PER_CIRCLE
    for row in items:
        assert row["sold_count"] == _SOLD_PER_COMMUNITY, (
            f"status='在售' 不应影响 sold_count, 应为 {_SOLD_PER_COMMUNITY}, 实际 {row['sold_count']}"
        )


# ─── Bug 4: 小区详情趋势维度切换 ─────────────────────────────────────────────


def test_get_community_analysis_trend_dim_default(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """默认 trend_dim=overall 返回 dim_breakdown 为 null."""
    target = reports_sample_data["communities"][0]
    resp = reports_client.get(f"{_BASE}/{target.id}/analysis")

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    trend: list[dict[str, Any]] = data["trend"]
    assert len(trend) >= 1, "趋势应有至少 1 个周期"

    for point in trend:
        assert point["dim_breakdown"] is None, (
            f"默认 trend_dim=overall 应返回 dim_breakdown=null, 实际 {point['dim_breakdown']}"
        )


def test_get_community_analysis_trend_dim_rooms(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """trend_dim=rooms 返回 dim_breakdown 非空, 含 1室/2室/3室/4室+ 户型键."""
    target = reports_sample_data["communities"][0]
    resp = reports_client.get(f"{_BASE}/{target.id}/analysis", params={"trend_dim": "rooms"})

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    trend = data["trend"]
    assert len(trend) >= 1

    # 至少一个周期的 dim_breakdown 非空
    has_non_empty = any(point["dim_breakdown"] for point in trend)
    assert has_non_empty, "trend_dim=rooms 应至少有一个周期 dim_breakdown 非空"

    # 收集所有户型键
    all_keys: set[str] = set()
    for point in trend:
        if point["dim_breakdown"]:
            all_keys.update(point["dim_breakdown"].keys())
    expected_keys = {"1室", "2室", "3室", "4室+"}
    assert expected_keys.issubset(all_keys), f"户型键缺失: 期望 {expected_keys} ⊆ 实际 {all_keys}"


def test_get_community_analysis_trend_dim_price(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """trend_dim=price 返回 dim_breakdown 非空, 含兜底价格段标签."""
    target = reports_sample_data["communities"][0]
    resp = reports_client.get(f"{_BASE}/{target.id}/analysis", params={"trend_dim": "price"})

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    trend = data["trend"]
    assert len(trend) >= 1

    has_non_empty = any(point["dim_breakdown"] for point in trend)
    assert has_non_empty, "trend_dim=price 应至少有一个周期 dim_breakdown 非空"

    # 价格段标签应来自 FALLBACK_PRICE_BUCKETS
    expected_bucket_labels = {"<150万", "150-200万", "200-250万", "250-300万", "300-350万", "350万+"}
    all_keys: set[str] = set()
    for point in trend:
        if point["dim_breakdown"]:
            all_keys.update(point["dim_breakdown"].keys())
    assert all_keys.issubset(expected_bucket_labels), f"价格段标签越界: 实际 {all_keys} ⊄ 期望 {expected_bucket_labels}"


# ─── Bug 5: "未分类" 商圈小区列表 (DB business_circle 为 NULL/空串) ─────────────


def test_get_communities_with_uncategorized_circle(
    reports_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """Bug 修复: 小区列表支持 "未分类" 商圈筛选 (DB business_circle 为 NULL/空串).

    场景: 用户在商圈列表点击 "未分类" 行 → 跳转 ``/admin/reports/communities?business_circles=未分类``.
    修复前: SQL ``Community.business_circle LIKE '%未分类%'`` 无法匹配 NULL → 列表为空,
            用户看到的列表与来源商圈行矛盾.
    修复后: "未分类" 反向匹配 NULL/空串 → 返回真实小区数据,
            ``business_circle`` 字段归一化为 "未分类" (与显示层一致).
    """
    import uuid
    from datetime import datetime, timedelta, timezone
    from decimal import Decimal

    from models.common import PropertyStatus
    from models.property.community import Community
    from models.property.property import PropertyCurrent
    from services.reports.cache import invalidate_reports_cache

    # 插入 business_circle=NULL 的小区 + 5 条成交记录
    uncategorized_community = Community(
        id=str(uuid.uuid4()),
        name="小区-未分类-1",
        district="静安区",
        business_circle=None,  # NULL → 归入 "未分类"
        is_active=True,
        total_properties=5,
    )
    db_session.add(uncategorized_community)
    db_session.commit()

    now = datetime.now(timezone.utc)
    floor_levels = ["低楼层", "中楼层", "高楼层"]
    uncategorized_properties = [
        PropertyCurrent(
            data_source="链家",
            source_property_id=f"src-uncat-{j}",
            community_id=uncategorized_community.id,
            status=PropertyStatus.SOLD,
            rooms=(j % 4) + 1,
            halls=2,
            floor_original=f"{j + 1}楼",
            floor_level=floor_level,
            orientation="南北",
            build_area=Decimal(80) + Decimal(j * 10),
            sold_price_wan=Decimal(200 + j * 50),
            sold_date=now - timedelta(days=j * 5),
            is_active=True,
        )
        for j, floor_level in enumerate(floor_levels * 2)
    ]
    db_session.add_all(uncategorized_properties)
    db_session.commit()
    invalidate_reports_cache()

    # 默认 range=4w (28 天), 5 条成交分布在 j*5 天 (0/5/10/15/20), 全部命中窗口
    resp = reports_client.get(
        f"{_BASE}/",
        params={"business_circles": "未分类"},
    )

    assert resp.status_code == 200, f"小区列表请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items: list[dict[str, Any]] = data["items"]

    # 应返回刚插入的 "未分类" 小区
    assert data["total"] >= 1, f"应至少返回 1 个 '未分类' 小区, 实际 {data['total']} (修复前为 0)"

    # 所有返回的行 business_circle 字段应归一化为 "未分类" (非 NULL/空串)
    for row in items:
        assert row["business_circle"] == "未分类", (
            f"小区 {row['community_id']} business_circle 应归一化为 '未分类', 实际 '{row['business_circle']}'"
        )

    # 验证刚插入的小区在结果中
    actual_ids = {row["community_id"] for row in items}
    assert uncategorized_community.id in actual_ids, "刚插入的 '未分类' 小区应出现在列表中"
