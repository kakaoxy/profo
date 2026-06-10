"""市场监控路由集成测试.

覆盖 /api/v1/monitor/ 下的情绪、趋势、竞品、AI策略、雷达、市场统计等端点.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from db import get_db
from models import Community

API_PREFIX = "/api/v1/monitor"

COMMUNITY_ID = "test-community-001"
COMPETITOR_ID = "test-competitor-001"


@pytest.fixture()
def _seed_communities(seeded_db: dict) -> None:
    """向测试数据库插入主小区和竞品小区记录（供竞品/雷达测试使用）."""
    session: Session = seeded_db["session"]
    session.add(Community(id=COMMUNITY_ID, name="测试小区"))
    session.add(Community(id=COMPETITOR_ID, name="竞品小区A"))
    session.commit()


def _get_session_from_overrides() -> Session:
    """从 app dependency_overrides 获取当前测试 session."""
    from main import app

    gen = app.dependency_overrides[get_db]()
    return next(gen)


# ─── 未认证访问 ─────────────────────────────────────────────


class TestUnauthenticatedAccess:
    """未认证用户访问监控端点返回 401."""

    @pytest.fixture()
    def unauth_client(self) -> TestClient:
        """无认证信息的 TestClient."""
        from main import app

        return TestClient(app)

    def test_sentiment_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/sentiment")
        assert resp.status_code == 401

    def test_trends_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends")
        assert resp.status_code == 401

    def test_ai_strategy_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.post(f"{API_PREFIX}/ai-strategy", json={"project_id": "p1", "user_context": "test"})
        assert resp.status_code == 401

    def test_radar_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/radar")
        assert resp.status_code == 401

    def test_competitors_list_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors")
        assert resp.status_code == 401

    def test_competitors_add_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": COMPETITOR_ID},
        )
        assert resp.status_code == 401

    def test_competitors_delete_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.delete(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors/{COMPETITOR_ID}")
        assert resp.status_code == 401

    def test_market_stats_unauthenticated(self, unauth_client: TestClient) -> None:
        resp = unauth_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/market-stats")
        assert resp.status_code == 401


# ─── 普通用户权限不足 ───────────────────────────────────────


class TestForbiddenAccess:
    """普通用户（role=user）访问监控端点返回 403."""

    def test_sentiment_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/sentiment")
        assert resp.status_code == 403

    def test_trends_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends")
        assert resp.status_code == 403

    def test_ai_strategy_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.post(f"{API_PREFIX}/ai-strategy", json={"project_id": "p1", "user_context": "test"})
        assert resp.status_code == 403

    def test_radar_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/radar")
        assert resp.status_code == 403

    def test_competitors_list_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors")
        assert resp.status_code == 403

    def test_competitors_add_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": COMPETITOR_ID},
        )
        assert resp.status_code == 403

    def test_competitors_delete_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.delete(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors/{COMPETITOR_ID}")
        assert resp.status_code == 403

    def test_market_stats_forbidden(self, user_client: TestClient) -> None:
        resp = user_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/market-stats")
        assert resp.status_code == 403


# ─── 市场情绪 ───────────────────────────────────────────────


class TestMarketSentiment:
    """GET /monitor/communities/{community_id}/sentiment."""

    def test_sentiment_returns_200(self, admin_client: TestClient) -> None:
        """无数据时仍返回200，楼层统计为零."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/sentiment")
        assert resp.status_code == 200
        data = resp.json()
        assert "floor_stats" in data
        assert "inventory_months" in data
        assert isinstance(data["floor_stats"], list)
        assert len(data["floor_stats"]) == 3  # high/mid/low

    def test_sentiment_floor_stats_structure(self, admin_client: TestClient) -> None:
        """楼层统计包含正确的字段."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/sentiment")
        data = resp.json()
        for stat in data["floor_stats"]:
            assert "type" in stat
            assert "deals_count" in stat
            assert "deal_avg_price" in stat
            assert "current_count" in stat
            assert "current_avg_price" in stat

    def test_sentiment_empty_data_defaults(self, admin_client: TestClient) -> None:
        """无数据时 inventory_months 为 99.9."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/sentiment")
        data = resp.json()
        assert data["inventory_months"] == 99.9
        for stat in data["floor_stats"]:
            assert stat["deals_count"] == 0
            assert stat["current_count"] == 0


# ─── 趋势数据 ───────────────────────────────────────────────


class TestTrends:
    """GET /monitor/communities/{community_id}/trends."""

    def test_trends_returns_200(self, admin_client: TestClient) -> None:
        """无数据时返回200和空列表."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    def test_trends_default_months(self, admin_client: TestClient) -> None:
        """默认 months=6."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends")
        assert resp.status_code == 200

    def test_trends_custom_months(self, admin_client: TestClient) -> None:
        """自定义 months 参数."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends", params={"months": 12})
        assert resp.status_code == 200

    def test_trends_months_too_low(self, admin_client: TestClient) -> None:
        """months < 1 返回 422."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends", params={"months": 0})
        assert resp.status_code == 422

    def test_trends_months_too_high(self, admin_client: TestClient) -> None:
        """months > 24 返回 422."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/trends", params={"months": 25})
        assert resp.status_code == 422


# ─── AI策略 ─────────────────────────────────────────────────


class TestAIStrategy:
    """POST /monitor/ai-strategy."""

    def test_ai_strategy_success(self, admin_client: TestClient) -> None:
        """生成AI策略建议成功."""
        resp = admin_client.post(
            f"{API_PREFIX}/ai-strategy",
            json={"project_id": "proj-001", "user_context": "三室两厅，89平"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "report_markdown" in data
        assert "risk_points" in data
        assert "action_plan" in data

    def test_ai_strategy_risk_points_structure(self, admin_client: TestClient) -> None:
        """risk_points 包含 profit_critical_price 和 daily_cost."""
        resp = admin_client.post(
            f"{API_PREFIX}/ai-strategy",
            json={"project_id": "proj-001", "user_context": "test"},
        )
        data = resp.json()
        assert "profit_critical_price" in data["risk_points"]
        assert "daily_cost" in data["risk_points"]

    def test_ai_strategy_missing_project_id(self, admin_client: TestClient) -> None:
        """缺少 project_id 返回 422."""
        resp = admin_client.post(
            f"{API_PREFIX}/ai-strategy",
            json={"user_context": "test"},
        )
        assert resp.status_code == 422

    def test_ai_strategy_missing_user_context(self, admin_client: TestClient) -> None:
        """缺少 user_context 返回 422."""
        resp = admin_client.post(
            f"{API_PREFIX}/ai-strategy",
            json={"project_id": "proj-001"},
        )
        assert resp.status_code == 422

    def test_ai_strategy_empty_body(self, admin_client: TestClient) -> None:
        """空请求体返回 422."""
        resp = admin_client.post(f"{API_PREFIX}/ai-strategy", json={})
        assert resp.status_code == 422


# ─── 竞品管理 ───────────────────────────────────────────────


class TestCompetitors:
    """竞品列表/添加/删除."""

    @pytest.fixture(autouse=True)
    def _setup_communities(self, _seed_communities: None) -> None:
        """每个测试用例前确保小区记录存在."""

    def test_list_competitors_empty(self, admin_client: TestClient) -> None:
        """无竞品时返回空列表."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors")
        assert resp.status_code == 200
        assert resp.json() == []

    def test_add_competitor_success(self, admin_client: TestClient) -> None:
        """添加竞品成功返回 201."""
        resp = admin_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": COMPETITOR_ID},
        )
        assert resp.status_code == 201

    def test_add_competitor_conflict(self, admin_client: TestClient) -> None:
        """重复添加竞品返回 409."""
        admin_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": COMPETITOR_ID},
        )
        resp = admin_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": COMPETITOR_ID},
        )
        assert resp.status_code == 409

    def test_add_competitor_missing_field(self, admin_client: TestClient) -> None:
        """缺少 competitor_community_id 返回 422."""
        resp = admin_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={},
        )
        assert resp.status_code == 422

    def test_delete_competitor_not_found(self, admin_client: TestClient) -> None:
        """删除不存在的竞品返回 404."""
        resp = admin_client.delete(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors/nonexistent-id")
        assert resp.status_code == 404

    def test_add_then_delete_competitor(self, admin_client: TestClient) -> None:
        """添加后删除竞品成功返回 204."""
        comp_id = "comp-to-delete"
        # 需要先创建竞品小区记录
        session = _get_session_from_overrides()
        session.add(Community(id=comp_id, name="待删除竞品小区"))
        session.commit()

        admin_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": comp_id},
        )
        resp = admin_client.delete(f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors/{comp_id}")
        assert resp.status_code == 204


# ─── 周边雷达 ───────────────────────────────────────────────


class TestNeighborhoodRadar:
    """GET /monitor/communities/{community_id}/radar."""

    def test_radar_returns_200_empty(self, admin_client: TestClient) -> None:
        """无小区数据时返回200和空items."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/radar")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert isinstance(data["items"], list)

    def test_radar_item_structure(self, admin_client: TestClient, _seed_communities: None) -> None:
        """雷达数据项包含正确的字段."""
        # 添加竞品关系
        admin_client.post(
            f"{API_PREFIX}/communities/{COMMUNITY_ID}/competitors",
            json={"competitor_community_id": COMPETITOR_ID},
        )

        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/radar")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) >= 1
        item = data["items"][0]
        assert "community_id" in item
        assert "community_name" in item
        assert "is_subject" in item
        assert "listing_count" in item
        assert "deal_count" in item
        assert "spread_percent" in item
        assert "spread_label" in item


# ─── 小区市场统计 ───────────────────────────────────────────


class TestCommunityMarketStats:
    """GET /monitor/communities/{community_id}/market-stats."""

    def test_market_stats_returns_200(self, admin_client: TestClient) -> None:
        """无数据时返回200和默认值."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/market-stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "on_sale" in data
        assert "avg_price" in data
        assert "volume_30d" in data
        assert "price_trend_30d" in data
        assert "is_price_up" in data

    def test_market_stats_empty_data_defaults(self, admin_client: TestClient) -> None:
        """无数据时各字段为默认值."""
        resp = admin_client.get(f"{API_PREFIX}/communities/{COMMUNITY_ID}/market-stats")
        data = resp.json()
        assert data["on_sale"] == 0
        assert data["avg_price"] == 0
        assert data["volume_30d"] == 0
        assert data["price_trend_30d"] == 0
        assert data["is_price_up"] is None
