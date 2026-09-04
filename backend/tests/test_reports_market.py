"""商圈分析报表 - 市场端点集成测试.

覆盖 6 个端点 (参考 routers/reports/market.py):
- GET /api/v1/reports/market/kpi
- GET /api/v1/reports/market/trend
- GET /api/v1/reports/market/price-distribution
- GET /api/v1/reports/market/business-districts
- GET /api/v1/reports/market/dictionaries
- GET /api/v1/reports/market/compare

测试策略:
- 使用 conftest_reports.reports_client (admin 受众 token + X-Requested-With)
- 复用 reports_sample_data fixture (3 商圈 × 3 小区 × (5 成交 + 2 在售) = 63 条)
- 默认 range=4w (28 天) 命中全部 45 条成交样本 (≥30 触发 PERCENTILE_CONT)
- 验证 HTTP 状态码 + 关键字段语义, 不验证精确数值 (避免脆弱断言)
"""

# ruff: noqa: F811
# 本文件通过参数名注入 pytest fixtures (reports_client / reports_noauth_client /
# reports_sample_data)。参数名与导入名同名会触发 ruff F811 误报，故文件级抑制。

from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

# 注册 conftest_reports 中的 fixtures (非 conftest.py 文件需显式导入供 pytest 发现)
from tests.conftest_reports import (  # noqa: F401
    reports_client,
    reports_no_property_perm_client,
    reports_noauth_client,
    reports_sample_data,
)

# 市场端点基础路径
_BASE = "/api/v1/reports/market"

# 样本数据常量 (与 conftest_reports.reports_sample_data 对齐)
_TOTAL_SOLD = 45  # 3 商圈 × 3 小区 × 5 成交
_TOTAL_ON_SALE = 18  # 3 商圈 × 3 小区 × 2 在售
_NUM_BUSINESS_CIRCLES = 3

# 价格分布动态分段阈值 (与 services/reports/bucketing.py 对齐)
_MIN_SAMPLE_FOR_PERCENTILE = 30


# ─── KPI 端点 ────────────────────────────────────────────────────────────────


def test_get_kpi_success(reports_client: TestClient) -> None:
    """正常返回 4 张 KPI 卡片 (默认 range=4w 命中 45 条成交 + 18 条在售)."""
    resp = reports_client.get(f"{_BASE}/kpi")

    assert resp.status_code == 200, f"KPI 请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert set(data.keys()) == {"sold_count", "avg_price_wan", "avg_unit_price", "on_sale_count"}

    # 验证成交套数为 45 (3 商圈 × 3 小区 × 5)
    assert data["sold_count"]["value"] == _TOTAL_SOLD
    # 验证在售套数为 18 (无时间窗口)
    assert data["on_sale_count"]["value"] == _TOTAL_ON_SALE
    # 均价 / 单价 应为正数
    assert data["avg_price_wan"]["value"] is not None
    assert data["avg_price_wan"]["value"] > 0
    assert data["avg_unit_price"]["value"] is not None
    assert data["avg_unit_price"]["value"] > 0
    # 在售卡片无环比
    assert data["on_sale_count"]["qoq"] is None
    assert data["on_sale_count"]["qoq_direction"] == "unknown"


def test_get_kpi_field_filtering(reports_client: TestClient) -> None:
    """response_model=KpiData 过滤额外字段, 仅返回 4 张卡片定义字段."""
    resp = reports_client.get(f"{_BASE}/kpi")

    assert resp.status_code == 200
    data = resp.json()
    # 每张卡片仅含 value/qoq/qoq_direction 三个字段 (KpiCard 模型约束)
    for card_key in ("sold_count", "avg_price_wan", "avg_unit_price", "on_sale_count"):
        assert set(data[card_key].keys()) == {"value", "qoq", "qoq_direction"}, (
            f"卡片 {card_key} 字段集合不符合 KpiCard 模型"
        )


def test_get_kpi_no_auth(reports_noauth_client: TestClient) -> None:
    """未携带 access_token cookie 访问 KPI 端点返回 401."""
    resp = reports_noauth_client.get(f"{_BASE}/kpi")

    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == 401
    assert "message" in body


def test_get_kpi_no_property_permission(reports_no_property_perm_client: TestClient) -> None:
    """已认证但无 property:read 权限的用户访问 KPI 端点返回 403.

    使用 customer 角色 (默认无 property:read 权限，见 migrations._ROLE_PERMISSIONS_SEED)
    签发 aud=admin token，验证 require_permission 依赖工厂正确拦截。
    """
    resp = reports_no_property_perm_client.get(f"{_BASE}/kpi")

    assert resp.status_code == 403, f"无权限应返回 403，实际 {resp.status_code}: {resp.text}"
    body = resp.json()
    assert body["code"] == 403
    assert "property:read" in body["message"]


def test_get_kpi_empty_window(reports_client: TestClient) -> None:
    """筛选条件导致空时间窗口时, KPI 返回零值而非 500.

    使用 business_circles=不存在商圈 过滤掉所有样本, 验证空结果语义.
    """
    resp = reports_client.get(f"{_BASE}/kpi", params={"business_circles": "不存在商圈"})

    assert resp.status_code == 200, f"空窗口请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["sold_count"]["value"] == 0
    assert data["on_sale_count"]["value"] == 0
    assert data["avg_price_wan"]["value"] is None
    assert data["avg_unit_price"]["value"] is None


def test_get_kpi_district_filter_hit(reports_client: TestClient) -> None:
    """district=徐汇区 精确过滤: 仅命中该区域商圈(徐家汇) 3 小区 × 5 成交 = 15."""
    resp = reports_client.get(f"{_BASE}/kpi", params={"district": "徐汇区"})

    assert resp.status_code == 200, f"KPI 请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["sold_count"]["value"] == _TOTAL_SOLD // _NUM_BUSINESS_CIRCLES
    assert data["on_sale_count"]["value"] == _TOTAL_ON_SALE // _NUM_BUSINESS_CIRCLES
    assert data["avg_price_wan"]["value"] is not None
    assert data["avg_unit_price"]["value"] is not None


def test_get_kpi_district_param_passthrough(reports_client: TestClient) -> None:
    """District Query 参数透传生效: 未传返回全部 45, 传 徐汇区 收窄为 15."""
    resp_all = reports_client.get(f"{_BASE}/kpi")
    assert resp_all.status_code == 200
    assert resp_all.json()["sold_count"]["value"] == _TOTAL_SOLD

    resp_hit = reports_client.get(f"{_BASE}/kpi", params={"district": "徐汇区"})
    assert resp_hit.status_code == 200
    assert resp_hit.json()["sold_count"]["value"] == _TOTAL_SOLD // _NUM_BUSINESS_CIRCLES


def test_get_kpi_district_no_match(reports_client: TestClient) -> None:
    """District 未命中 (不存在区域) 时 KPI 返回零值而非 500."""
    resp = reports_client.get(f"{_BASE}/kpi", params={"district": "不存在区"})

    assert resp.status_code == 200, f"空窗口请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["sold_count"]["value"] == 0
    assert data["on_sale_count"]["value"] == 0
    assert data["avg_price_wan"]["value"] is None
    assert data["avg_unit_price"]["value"] is None


def test_get_kpi_district_with_business_circles(reports_client: TestClient) -> None:
    """District 与 business_circles 组合: 两条件 AND 生效.

    样本: 人民广场 属 黄浦区, 故 district=徐汇区 & business_circles=人民广场 无交集 → 0.
    """
    resp = reports_client.get(
        f"{_BASE}/kpi",
        params={"district": "徐汇区", "business_circles": "人民广场"},
    )

    assert resp.status_code == 200, f"KPI 请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["sold_count"]["value"] == 0
    assert data["on_sale_count"]["value"] == 0


# ─── 趋势端点 ────────────────────────────────────────────────────────────────


def test_get_trend_overall(reports_client: TestClient) -> None:
    """Overall 维度返回周粒度趋势, dim_breakdown 为 null."""
    resp = reports_client.get(f"{_BASE}/trend", params={"trend_dim": "overall"})

    assert resp.status_code == 200, f"趋势请求失败: {resp.status_code} {resp.text}"
    points: list[dict[str, Any]] = resp.json()
    assert isinstance(points, list)
    assert len(points) >= 1, "4w 窗口至少应有 1 个周期"

    # 每个点应有 period/volume/avg_price_wan/avg_unit_price/volume_qoq/price_qoq/dim_breakdown
    for point in points:
        assert "period" in point
        assert "volume" in point
        assert point["dim_breakdown"] is None, "overall 维度 dim_breakdown 应为 null"

    # 总成交量应等于 45 (分布在多个周期)
    total_volume = sum(p["volume"] for p in points)
    assert total_volume == _TOTAL_SOLD, f"周期总成交量 {total_volume} 不等于样本数 {_TOTAL_SOLD}"


def test_get_trend_rooms(reports_client: TestClient) -> None:
    """Rooms 维度 dim_breakdown 含 1室/2室/3室/4室+ 户型键."""
    resp = reports_client.get(f"{_BASE}/trend", params={"trend_dim": "rooms"})

    assert resp.status_code == 200
    points: list[dict[str, Any]] = resp.json()
    assert len(points) >= 1

    # 至少有一个周期的 dim_breakdown 含户型键
    expected_keys = {"1室", "2室", "3室", "4室+"}
    all_keys: set[str] = set()
    for point in points:
        if point["dim_breakdown"] is not None:
            all_keys.update(point["dim_breakdown"].keys())
    assert expected_keys.issubset(all_keys), f"户型键缺失: 期望 {expected_keys} ⊆ 实际 {all_keys}"

    # 验证 dim_breakdown 内部结构 {volume, avg_unit_price}
    for point in points:
        if point["dim_breakdown"]:
            for stats in point["dim_breakdown"].values():
                assert "volume" in stats
                assert "avg_unit_price" in stats


def test_get_trend_floor(reports_client: TestClient) -> None:
    """Floor 维度 dim_breakdown 含 低/中/高楼层 键."""
    resp = reports_client.get(f"{_BASE}/trend", params={"trend_dim": "floor"})

    assert resp.status_code == 200
    points: list[dict[str, Any]] = resp.json()
    assert len(points) >= 1

    expected_keys = {"低楼层", "中楼层", "高楼层"}
    all_keys: set[str] = set()
    for point in points:
        if point["dim_breakdown"] is not None:
            all_keys.update(point["dim_breakdown"].keys())
    assert expected_keys.issubset(all_keys), f"楼层键缺失: 期望 {expected_keys} ⊆ 实际 {all_keys}"


def test_get_trend_price(reports_client: TestClient) -> None:
    """Price 维度 dim_breakdown 含等宽分段标签 (与分布图一致)."""
    resp = reports_client.get(f"{_BASE}/trend", params={"trend_dim": "price"})

    assert resp.status_code == 200
    points: list[dict[str, Any]] = resp.json()
    assert len(points) >= 1

    # 趋势图价格段标签应与分布图一致 (动态等宽分段, 不再使用 FALLBACK_PRICE_BUCKETS)
    # 样本价格区间 [200, 560], P5≈242, P95≈518, step=50万, 6 内部段 + 边缘桶
    all_keys: set[str] = set()
    for point in points:
        if point["dim_breakdown"] is not None:
            all_keys.update(point["dim_breakdown"].keys())
    assert len(all_keys) >= 1, "价格段 dim_breakdown 不应为空"

    # 验证标签格式: 应为 "<{N}万" / "{N}-{M}万" / "{N}万+" 三种之一
    import re

    pattern = re.compile(r"^(<\d+万|\d+-\d+万|\d+万\+)$")
    for key in all_keys:
        assert pattern.match(key), f"价格段标签格式异常: {key}"

    # 验证不再使用 FALLBACK_PRICE_BUCKETS 固定标签
    fallback_labels = {"<150万", "150-200万", "200-250万", "250-300万", "300-350万", "350万+"}
    assert not all_keys.issubset(fallback_labels), f"仍使用兜底标签: {all_keys}"


def test_trend_distribution_label_consistency(reports_client: TestClient) -> None:
    """相同筛选条件下, 趋势图价格段标签集合 == 分布图标签集合."""
    # 1. 获取分布图标签
    resp_dist = reports_client.get(f"{_BASE}/price-distribution")
    assert resp_dist.status_code == 200
    dist_labels = {b["label"] for b in resp_dist.json()["buckets"]}

    # 2. 获取趋势图价格维度标签
    resp_trend = reports_client.get(f"{_BASE}/trend", params={"trend_dim": "price"})
    assert resp_trend.status_code == 200
    trend_labels: set[str] = set()
    for point in resp_trend.json():
        if point["dim_breakdown"] is not None:
            trend_labels.update(point["dim_breakdown"].keys())

    # 3. 两图标签集合应相等
    assert dist_labels == trend_labels, f"趋势图与分布图标签不一致: dist={dist_labels}, trend={trend_labels}"


# ─── 价格分布端点 ────────────────────────────────────────────────────────────


def test_get_price_distribution_success(reports_client: TestClient) -> None:
    """样本量 45 ≥ 30 触发 P5/P95 等宽动态分段, 返回 4-8 内部段 + 0-2 边缘桶."""
    resp = reports_client.get(f"{_BASE}/price-distribution")

    assert resp.status_code == 200, f"价格分布请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    buckets: list[dict[str, Any]] = data["buckets"]
    total: int = data["total"]

    assert total == _TOTAL_SOLD, f"成交样本总数 {total} 不等于 {_TOTAL_SOLD}"
    # 等宽分段: 4-8 内部段 + 0-2 边缘桶 (最多 10 段)
    assert 4 <= len(buckets) <= 10, f"分段桶数 {len(buckets)} 不在 [4, 10] 范围内"

    # 桶内 count 之和 = total
    bucket_sum = sum(b["count"] for b in buckets)
    assert bucket_sum == total, f"桶内 count 之和 {bucket_sum} 不等于 total {total}"

    # 验证内部分段等宽: 排除首部边缘桶 (label 以 "<" 开头) 与尾部边缘桶 (upper 为 None)
    # 内部段: upper 非 None 且 label 不以 "<" 开头, 形如 "200-250万"
    internal_buckets = [b for b in buckets if b["upper"] is not None and not b["label"].startswith("<")]
    assert len(internal_buckets) >= 4, f"内部段数 {len(internal_buckets)} < 4"

    # 各内部段宽度相等
    widths = {b["upper"] - b["lower"] for b in internal_buckets}
    assert len(widths) == 1, f"内部段宽度不一致: {widths}"

    # 相邻内部段连续: 前一段 upper == 后一段 lower
    for i in range(len(internal_buckets) - 1):
        assert internal_buckets[i]["upper"] == internal_buckets[i + 1]["lower"], (
            f"内部段不连续: {internal_buckets[i]} → {internal_buckets[i + 1]}"
        )


def test_get_price_distribution_fallback(reports_client: TestClient) -> None:
    """样本量 < 30 (rooms=4 → 9 条) 触发兜底固定分段, 返回 6 个桶."""
    resp = reports_client.get(f"{_BASE}/price-distribution", params={"rooms": "4"})

    assert resp.status_code == 200
    data = resp.json()
    buckets: list[dict[str, Any]] = data["buckets"]
    total: int = data["total"]

    # rooms=4 → 每小区 1 条 × 9 小区 = 9 条 (< _MIN_SAMPLE_FOR_PERCENTILE)
    assert total == 9, f"rooms=4 样本数 {total} 不等于 9"
    # 兜底分段: 6 段 (FALLBACK_PRICE_BUCKETS)
    assert len(buckets) == 6, f"兜底分段桶数 {len(buckets)} 不等于 6"

    # 验证兜底标签
    expected_labels = ["<150万", "150-200万", "200-250万", "250-300万", "300-350万", "350万+"]
    actual_labels = [b["label"] for b in buckets]
    assert actual_labels == expected_labels, f"兜底标签不匹配: {actual_labels}"


# ─── 商圈列表端点 ────────────────────────────────────────────────────────────


def test_get_business_districts_success(reports_client: TestClient) -> None:
    """默认排序+分页返回 3 个商圈行 (sold_count desc)."""
    resp = reports_client.get(f"{_BASE}/business-districts")

    assert resp.status_code == 200, f"商圈列表请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    items: list[dict[str, Any]] = data["items"]
    total: int = data["total"]

    assert total == _NUM_BUSINESS_CIRCLES
    assert len(items) == _NUM_BUSINESS_CIRCLES

    # 每行必含字段
    for row in items:
        assert "business_circle" in row
        assert "district" in row
        assert "sold_count" in row
        assert "on_sale_count" in row
        # 3 商圈均为有效名称 (非 "未分类")
        assert row["business_circle"] != "未分类"

    # 3 商圈各 15 条成交 + 6 条在售 (3 小区 × 5 sold / 3 小区 × 2 on_sale)
    for row in items:
        assert row["sold_count"] == 15
        assert row["on_sale_count"] == 6


def test_get_business_districts_pagination(reports_client: TestClient) -> None:
    """page_size=2 返回 2 条, total=3."""
    resp = reports_client.get(
        f"{_BASE}/business-districts",
        params={"page": 1, "page_size": 2},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == _NUM_BUSINESS_CIRCLES
    assert len(data["items"]) == 2

    # 第 2 页应只剩 1 条
    resp_p2 = reports_client.get(
        f"{_BASE}/business-districts",
        params={"page": 2, "page_size": 2},
    )
    assert resp_p2.status_code == 200
    data_p2 = resp_p2.json()
    assert data_p2["total"] == _NUM_BUSINESS_CIRCLES
    assert len(data_p2["items"]) == 1


def test_get_business_districts_sort(reports_client: TestClient) -> None:
    """sort_by=avg_price_wan asc/desc 返回顺序相反.

    样本均价: 徐家汇=320, 五角场=380, 人民广场=440.
    """
    resp_asc = reports_client.get(
        f"{_BASE}/business-districts",
        params={"sort_by": "avg_price_wan", "sort_order": "asc"},
    )
    resp_desc = reports_client.get(
        f"{_BASE}/business-districts",
        params={"sort_by": "avg_price_wan", "sort_order": "desc"},
    )

    assert resp_asc.status_code == 200
    assert resp_desc.status_code == 200

    asc_names = [r["business_circle"] for r in resp_asc.json()["items"]]
    desc_names = [r["business_circle"] for r in resp_desc.json()["items"]]

    # 升序应为 徐家汇(320) → 五角场(380) → 人民广场(440)
    assert asc_names == ["徐家汇", "五角场", "人民广场"], f"升序顺序错误: {asc_names}"
    # 降序应为反序
    assert desc_names == ["人民广场", "五角场", "徐家汇"], f"降序顺序错误: {desc_names}"


# ─── 字典端点 ────────────────────────────────────────────────────────────────


def test_get_dictionary_data_source(reports_client: TestClient) -> None:
    """dict_type=data_source 返回 ['链家', '贝壳'] 集合."""
    resp = reports_client.get(f"{_BASE}/dictionaries", params={"dict_type": "data_source"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "data_source"
    assert set(data["items"]) == {"链家", "贝壳"}


def test_get_dictionary_rooms(reports_client: TestClient) -> None:
    """dict_type=rooms 返回 ['1', '2', '3', '4'] 字符串列表."""
    resp = reports_client.get(f"{_BASE}/dictionaries", params={"dict_type": "rooms"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "rooms"
    assert set(data["items"]) == {"1", "2", "3", "4"}


def test_get_dictionary_floor_level(reports_client: TestClient) -> None:
    """dict_type=floor_level 返回 ['低楼层', '中楼层', '高楼层'] 集合."""
    resp = reports_client.get(f"{_BASE}/dictionaries", params={"dict_type": "floor_level"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "floor_level"
    assert set(data["items"]) == {"低楼层", "中楼层", "高楼层"}


def test_get_dictionary_last_updated(reports_client: TestClient) -> None:
    """dict_type=last_updated 返回单元素 ISO 时间字符串列表."""
    resp = reports_client.get(f"{_BASE}/dictionaries", params={"dict_type": "last_updated"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "last_updated"
    assert len(data["items"]) == 1
    # 应为 ISO 格式时间字符串 (含 T)
    assert "T" in data["items"][0]


# ─── 多商圈对比端点 ──────────────────────────────────────────────────────────


def test_compare_success(reports_client: TestClient) -> None:
    """2 个商圈对比成功, 返回 7 行 summary + 趋势 + 结构."""
    resp = reports_client.get(
        f"{_BASE}/compare",
        params={"ids": "徐家汇,五角场"},
    )

    assert resp.status_code == 200, f"对比请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["business_circles"] == ["徐家汇", "五角场"]

    # summary 7 行指标 (成交套数/均价(万)/单价(元/㎡)/在售房源/去化周期(月)/价环比(%)/量环比(%))
    assert len(data["summary"]) == 7
    metric_names = [row["metric"] for row in data["summary"]]
    expected_metrics = ["成交套数", "均价(万)", "单价(元/㎡)", "在售房源", "去化周期(月)", "价环比(%)", "量环比(%)"]
    assert metric_names == expected_metrics, f"指标行不匹配: {metric_names}"

    # 每行 values 长度 = 商圈数 (2)
    for row in data["summary"]:
        assert len(row["values"]) == 2

    # 趋势 + 结构应存在
    assert isinstance(data["volume_trend"], list)
    assert isinstance(data["price_trend"], list)
    assert len(data["floor_structure"]) == 2
    assert len(data["room_structure"]) == 2


def test_compare_too_few(reports_client: TestClient) -> None:
    """Ids 数量 < 2 返回 400 (InvalidCompareIds)."""
    resp = reports_client.get(
        f"{_BASE}/compare",
        params={"ids": "徐家汇"},
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == 400
    assert "2" in body["message"] or "至少" in body["message"]


def test_compare_too_many(reports_client: TestClient) -> None:
    """Ids 数量 > 5 返回 400 (InvalidCompareIds)."""
    resp = reports_client.get(
        f"{_BASE}/compare",
        params={"ids": "徐家汇,五角场,人民广场,商圈A,商圈B,商圈C"},
    )

    assert resp.status_code == 400
    body = resp.json()
    assert body["code"] == 400
    assert "5" in body["message"] or "最多" in body["message"]


# ─── Bug 1: 价格分布时间窗口与趋势对齐 ────────────────────────────────────────


def test_get_price_distribution_window_aligned_with_trend(
    reports_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """Bug 1: 数据 sold_date 早于今天 30 天时, 价格分布与趋势使用同一时间窗口.

    修复前: 价格分布用 now 作 reference, 趋势用 MAX(sold_date), 两者错位导致分布为 0.
    修复后: 两者均用 MAX(sold_date) 作 reference, 窗口对齐, 总数一致.

    场景: range=4w (28 天), 数据最新 sold_date = today - 30d
    - 用 now 作基准: 窗口 [now-28d, now] 不含 30 天前数据 → 价格分布为 0 (BUG)
    - 用 MAX(sold_date) 作基准: 窗口 [now-58d, now-30d] 包含 30 天前数据 → 非零 (FIXED)
    """
    from datetime import datetime, timedelta, timezone

    from models.common import PropertyStatus
    from models.property.property import PropertyCurrent
    from services.reports.cache import invalidate_reports_cache

    # 将所有成交记录的 sold_date 统一设为 30 天前 (固定时间点, 避免边界波动)
    old_date = datetime.now(timezone.utc) - timedelta(days=30)
    db_session.query(PropertyCurrent).filter(PropertyCurrent.status == PropertyStatus.SOLD).update(
        {"sold_date": old_date}
    )
    db_session.commit()
    # 数据变更后清除报表缓存, 避免命中前序请求的缓存结果
    invalidate_reports_cache()

    pd_resp = reports_client.get(f"{_BASE}/price-distribution")
    trend_resp = reports_client.get(f"{_BASE}/trend")

    assert pd_resp.status_code == 200, f"价格分布请求失败: {pd_resp.status_code} {pd_resp.text}"
    assert trend_resp.status_code == 200, f"趋势请求失败: {trend_resp.status_code} {trend_resp.text}"

    pd_data = pd_resp.json()
    trend_data: list[dict[str, Any]] = trend_resp.json()

    pd_total = sum(b["count"] for b in pd_data["buckets"])
    trend_volume = sum(p["volume"] for p in trend_data)

    assert pd_total > 0, "价格分布应基于 reference_date (MAX(sold_date)) 返回非零数据"
    assert pd_total == trend_volume, f"价格分布总数 {pd_total} 应等于趋势成交量 {trend_volume} (时间窗口对齐)"


# ─── Bug 2: "未分类" 商圈对比 (DB business_circle 为 NULL/空串) ────────────────


def test_compare_with_uncategorized_circle(
    reports_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """Bug 修复: 对比接口支持 "未分类" 商圈 (DB business_circle 为 NULL/空串).

    场景: 用户在商圈列表点击 "未分类" 行的 "对比" 按钮 → compare_ids 含 "未分类".
    修复前: SQL ``Community.business_circle IN (['未分类', ...])`` 无法匹配 NULL,
            "未分类" 列全为 0, 用户看到的数据与列表矛盾.
    修复后: 使用 _build_bc_match_predicate, "未分类" 反向匹配 NULL/空串 → 返回真实数据.
    """
    import uuid
    from datetime import datetime, timedelta, timezone
    from decimal import Decimal

    from models.common import PropertyStatus
    from models.property.community import Community
    from models.property.property import PropertyCurrent
    from services.reports.cache import invalidate_reports_cache

    # 插入 business_circle=NULL 的小区 + 5 条成交记录 (落在默认 4w 窗口内)
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
            floor_level=floor_levels[j % 3],
            orientation="南北",
            build_area=Decimal(80) + Decimal(j * 10),
            sold_price_wan=Decimal(200 + j * 50),
            sold_date=now - timedelta(days=j * 5),
            is_active=True,
        )
        for j in range(5)
    ]
    db_session.add_all(uncategorized_properties)
    db_session.commit()
    # 数据变更后清除报表缓存, 避免命中前序请求的缓存结果
    invalidate_reports_cache()

    # 对比 "未分类" 与 "徐家汇" (样本数据 15 条成交)
    resp = reports_client.get(
        f"{_BASE}/compare",
        params={"ids": "未分类,徐家汇"},
    )

    assert resp.status_code == 200, f"对比请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["business_circles"] == ["未分类", "徐家汇"]

    # summary "成交套数" 行: "未分类" 应为 5 (刚插入), "徐家汇" 应为 15 (样本数据 3 小区 × 5)
    sold_count_row = next(row for row in data["summary"] if row["metric"] == "成交套数")
    assert sold_count_row["values"][0] == 5, f"'未分类' 成交套数应为 5, 实际 {sold_count_row['values'][0]} (修复前为 0)"
    assert sold_count_row["values"][1] == 15, f"'徐家汇' 成交套数应为 15, 实际 {sold_count_row['values'][1]}"

    # floor_structure / room_structure 都应包含 "未分类" 行
    floor_bcs = {row["business_circle"] for row in data["floor_structure"]}
    assert "未分类" in floor_bcs, f"floor_structure 缺少 '未分类': {floor_bcs}"

    room_bcs = {row["business_circle"] for row in data["room_structure"]}
    assert "未分类" in room_bcs, f"room_structure 缺少 '未分类': {room_bcs}"


def test_business_districts_includes_uncategorized(
    reports_client: TestClient,
    db_session: Session,
    reports_sample_data: dict[str, Any],
) -> None:
    """Bug 修复验证: 商圈列表应返回 "未分类" 行 (当 DB 存在 NULL/空串 business_circle).

    场景: DB 中部分小区 business_circle 为 NULL → 商圈列表聚合时归一化为 "未分类".
    前置条件: _build_bc_expr() 已正确归一化 (此测试验证归一化与下游对比接口的一致性).
    """
    import uuid
    from datetime import datetime, timedelta, timezone
    from decimal import Decimal

    from models.common import PropertyStatus
    from models.property.community import Community
    from models.property.property import PropertyCurrent
    from services.reports.cache import invalidate_reports_cache

    # 插入 business_circle="" 空串的小区 + 5 条成交记录
    empty_bc_community = Community(
        id=str(uuid.uuid4()),
        name="小区-空商圈-1",
        district="虹口区",
        business_circle="",  # 空串 → 归入 "未分类"
        is_active=True,
        total_properties=5,
    )
    db_session.add(empty_bc_community)
    db_session.commit()

    now = datetime.now(timezone.utc)
    floor_levels = ["低楼层", "中楼层", "高楼层"]
    empty_bc_properties = [
        PropertyCurrent(
            data_source="链家",
            source_property_id=f"src-empty-bc-{j}",
            community_id=empty_bc_community.id,
            status=PropertyStatus.SOLD,
            rooms=(j % 4) + 1,
            halls=2,
            floor_original=f"{j + 1}楼",
            floor_level=floor_levels[j % 3],
            orientation="南北",
            build_area=Decimal(80) + Decimal(j * 10),
            sold_price_wan=Decimal(200 + j * 50),
            sold_date=now - timedelta(days=j * 5),
            is_active=True,
        )
        for j in range(5)
    ]
    db_session.add_all(empty_bc_properties)
    db_session.commit()
    invalidate_reports_cache()

    resp = reports_client.get(f"{_BASE}/business-districts")

    assert resp.status_code == 200, f"商圈列表请求失败: {resp.status_code} {resp.text}"
    items: list[dict[str, Any]] = resp.json()["items"]

    # 应包含 "未分类" 行, 且 sold_count=5 (刚插入的)
    uncat_rows = [row for row in items if row["business_circle"] == "未分类"]
    assert len(uncat_rows) == 1, f"应仅有 1 个 '未分类' 行, 实际 {len(uncat_rows)}"
    assert uncat_rows[0]["sold_count"] == 5, f"'未分类' 行 sold_count 应为 5, 实际 {uncat_rows[0]['sold_count']}"


# ─── 等宽分段正确性与离群点裁剪 ──────────────────────────────────────────────


def test_equal_width_bucketing_correctness(reports_client: TestClient) -> None:
    """等宽分段正确性: 样本价格 200-560, 验证分段边界等宽且步长为候选值之一."""
    resp = reports_client.get(f"{_BASE}/price-distribution")
    assert resp.status_code == 200
    buckets: list[dict[str, Any]] = resp.json()["buckets"]

    # 提取内部段 - 排除首尾边缘桶
    internal = [b for b in buckets if b["upper"] is not None and not b["label"].startswith("<")]
    assert len(internal) >= 4, f"内部段数 {len(internal)} < 4"

    # 验证等宽
    widths = {b["upper"] - b["lower"] for b in internal}
    assert len(widths) == 1, f"内部段宽度不一致: {widths}"

    # 验证步长为候选值之一
    candidates = {10, 20, 25, 50, 100, 200, 250, 500}
    actual_width = widths.pop()
    assert actual_width in candidates, f"步长 {actual_width} 不在候选 {candidates}"

    # 验证相邻段连续
    for i in range(len(internal) - 1):
        assert internal[i]["upper"] == internal[i + 1]["lower"], "相邻段不连续"


def test_outlier_trimming(reports_client: TestClient) -> None:
    """P5/P95 裁剪: 若样本存在超出 [P5, P95] 范围的数据, 应追加边缘桶."""
    resp = reports_client.get(f"{_BASE}/price-distribution")
    assert resp.status_code == 200
    data = resp.json()
    buckets = data["buckets"]
    total: int = data["total"]

    # 样本价格 200-560, P5≈242, P95≈518
    # 下沿=240, 上沿=540; min=200 < 240 → 首部边缘桶; max=560 >= 540 → 尾部边缘桶
    has_lower_edge = any(b["label"].startswith("<") for b in buckets)
    has_upper_edge = any(b["upper"] is None for b in buckets)

    # 至少应有一个边缘桶 (因为样本量 45, P5/P95 必然裁剪掉一些数据)
    assert has_lower_edge or has_upper_edge, "应至少有一个边缘桶"

    # 边缘桶 + 内部段 count 之和 = total
    assert sum(b["count"] for b in buckets) == total


def test_build_equal_width_bounds_small_range() -> None:
    """数据范围过小 (< 40万) 时, 使用最小步长 10 万, 接受 n < 4 段.

    回归测试: 修复前当 P95-P5 < 40 万时, 所有候选步长都给 n < 4,
    fallback 错误地使用 500 万步长 * 8 段 = 4000 万宽度, 对集中在 30 万范围的数据完全荒谬.
    """
    from services.reports.bucketing import _build_equal_width_bounds

    # 场景1: P5=200, P95=230, range=30, step=10 → n=3 (< 4)
    bounds = _build_equal_width_bounds(p5=200, p95=230, has_below=False, max_price=230)
    assert bounds is not None
    internal = [b for b in bounds if b[0] is not None and b[1] is not None]
    assert len(internal) == 3, f"内部段数应为 3, 实际 {len(internal)}"
    widths = {b[1] - b[0] for b in internal}
    assert widths == {10}, f"内部段宽度应为 10 万, 实际 {widths}"
    # 相邻段连续
    for i in range(len(internal) - 1):
        assert internal[i][1] == internal[i + 1][0], "相邻段不连续"

    # 场景2: 极小范围 P5=200, P95=205, range=10, step=10 → n=1
    bounds = _build_equal_width_bounds(p5=200, p95=205, has_below=False, max_price=205)
    assert bounds is not None
    internal = [b for b in bounds if b[0] is not None and b[1] is not None]
    assert len(internal) == 1, f"内部段数应为 1, 实际 {len(internal)}"
    assert internal[0] == (200, 210, "200-210万")

    # 场景3: 小范围 + 离群点, 应追加边缘桶
    bounds = _build_equal_width_bounds(p5=200, p95=230, has_below=True, max_price=250)
    assert bounds is not None
    # 首部应有边缘桶: lower 为 None, upper 为下沿
    assert bounds[0][0] is None
    assert bounds[0][1] == 200
    # 尾部应有边缘桶: upper 为 None, lower 为上沿
    assert bounds[-1][1] is None
    assert bounds[-1][0] == 230


def test_build_equal_width_bounds_large_range() -> None:
    """数据范围过大 (> 4000万) 时, 使用最大步长 500 万, 裁剪到 8 段."""
    from services.reports.bucketing import _build_equal_width_bounds

    # P5=100, P95=5000, range=4900, 所有 step 都给 n > 8
    bounds = _build_equal_width_bounds(p5=100, p95=5000, has_below=False, max_price=5000)
    assert bounds is not None
    internal = [b for b in bounds if b[0] is not None and b[1] is not None]
    assert len(internal) == 8, f"内部段数应为 8, 实际 {len(internal)}"
    widths = {b[1] - b[0] for b in internal}
    assert widths == {500}, f"内部段宽度应为 500 万, 实际 {widths}"
    # 尾部应有边缘桶 (max=5000 >= selected_upper=100+8*500=4100)
    assert bounds[-1][1] is None
