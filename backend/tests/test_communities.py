"""市场情报 - 小区管理 admin 端点集成测试.

覆盖端点 (参考 routers/market/communities.py):
- GET /api/v1/admin/business-circles (按区域过滤的去重商圈字典)

测试策略:
- 使用 conftest_reports.reports_client (admin 受众 token + property:read)
- 复用 reports_sample_data fixture (3 商圈 × 3 小区, 分布于 3 个行政区)
- 验证 HTTP 状态码 + 字典结构 (type="business_circle", items 去重)
"""

# ruff: noqa: F811
# 本文件通过参数名注入 pytest fixtures (reports_client / reports_noauth_client /
# reports_sample_data)。参数名与导入名同名会触发 ruff F811 误报，故文件级抑制。

from typing import Any

from fastapi.testclient import TestClient

# 注册 conftest_reports 中的 fixtures (非 conftest.py 文件需显式导入供 pytest 发现)
from tests.conftest_reports import (  # noqa: F401
    reports_client,
    reports_noauth_client,
    reports_sample_data,
)

# admin 商圈字典端点
_BASE = "/api/v1/admin/business-circles"

# 样本数据行政区 → 商圈映射 (与 conftest_reports._BC_DISTRICT_MAP 对齐)
_EXPECTED_BUSINESS_CIRCLES = {"徐家汇", "五角场", "人民广场"}


# ─── 全量字典 ────────────────────────────────────────────────────────────────


def test_get_business_circles_all(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """无过滤参数返回全部去重商圈."""
    resp = reports_client.get(_BASE)

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["type"] == "business_circle"
    assert set(data["items"]) == _EXPECTED_BUSINESS_CIRCLES


# ─── district 过滤 ───────────────────────────────────────────────────────────


def test_get_business_circles_by_district(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """district=徐汇区 精确过滤, 仅返回该区域商圈 徐家汇."""
    resp = reports_client.get(_BASE, params={"district": "徐汇区"})

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert data["type"] == "business_circle"
    assert data["items"] == ["徐家汇"]


def test_get_business_circles_district_no_match(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """District 未命中 (不存在区域) 返回空 items."""
    resp = reports_client.get(_BASE, params={"district": "不存在区"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["type"] == "business_circle"
    assert data["items"] == []


def test_get_business_circles_district_and_search(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """District + search 组合过滤: 两条件 AND 生效.

    - district=徐汇区 & search=徐 → 命中 徐家汇
    - district=杨浦区 & search=徐 → 无交集 (五角场 不含 "徐")
    """
    resp_hit = reports_client.get(_BASE, params={"district": "徐汇区", "search": "徐"})
    assert resp_hit.status_code == 200
    assert resp_hit.json()["items"] == ["徐家汇"]

    resp_miss = reports_client.get(_BASE, params={"district": "杨浦区", "search": "徐"})
    assert resp_miss.status_code == 200
    assert resp_miss.json()["items"] == []


# ─── limit 限制 ──────────────────────────────────────────────────────────────


def test_get_business_circles_limit(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """limit=1 只返回 1 条."""
    resp = reports_client.get(_BASE, params={"limit": 1})

    assert resp.status_code == 200, f"请求失败: {resp.status_code} {resp.text}"
    data = resp.json()
    assert len(data["items"]) == 1
    assert data["items"][0] in _EXPECTED_BUSINESS_CIRCLES


def test_get_business_circles_limit_exceeded(
    reports_client: TestClient,
    reports_sample_data: dict[str, Any],
) -> None:
    """Limit > 200 返回 422 (FastAPI 参数校验)."""
    resp = reports_client.get(_BASE, params={"limit": 201})

    assert resp.status_code == 422
    body = resp.json()
    assert body["code"] == 422
    assert "limit" in body["message"] or "参数" in body["message"]


# ─── 鉴权 ────────────────────────────────────────────────────────────────────


def test_get_business_circles_no_auth(reports_noauth_client: TestClient) -> None:
    """未携带 access_token cookie 访问返回 401."""
    resp = reports_noauth_client.get(_BASE)

    assert resp.status_code == 401
    body = resp.json()
    assert body["code"] == 401
    assert "message" in body
