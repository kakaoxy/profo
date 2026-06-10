"""线索管理 API 集成测试.

覆盖 /api/v1/leads/ 下的 CRUD、跟进记录、价格历史、漏斗统计等端点.
"""

import pytest
from fastapi.testclient import TestClient

API_PREFIX = "/api/v1/leads"

MINIMAL_LEAD = {
    "community_name": "测试小区",
}

FULL_LEAD = {
    "community_name": "阳光花园",
    "community_id": "COMM-001",
    "is_hot": 1,
    "layout": "三室两厅",
    "orientation": "南北",
    "floor_info": "中楼层/18层",
    "area": 89.5,
    "total_price": 300.0,
    "unit_price": 3.35,
    "eval_price": 280.0,
    "district": "浦东",
    "business_area": "陆家嘴",
    "remarks": "业主急售",
    "status": "pending_assessment",
    "images": [],
}


def _create_lead(client: TestClient, overrides: dict | None = None) -> dict:
    """辅助：创建线索并返回响应 JSON."""
    data = {**MINIMAL_LEAD, **(overrides or {})}
    resp = client.post(API_PREFIX, json=data)
    assert resp.status_code == 200
    return resp.json()


# ─── 创建线索 ───────────────────────────────────────────────


class TestCreateLead:
    """POST /leads 创建线索."""

    def test_create_success(self, admin_client: TestClient) -> None:
        """最小必填字段创建线索成功."""
        resp = admin_client.post(API_PREFIX, json=MINIMAL_LEAD)
        assert resp.status_code == 200
        data = resp.json()
        assert data["community_name"] == "测试小区"
        assert data["status"] == "pending_assessment"
        assert "id" in data
        assert "created_at" in data

    def test_create_with_optional_fields(self, admin_client: TestClient) -> None:
        """包含可选字段创建线索."""
        resp = admin_client.post(API_PREFIX, json=FULL_LEAD)
        assert resp.status_code == 200
        data = resp.json()
        assert data["community_name"] == "阳光花园"
        assert data["layout"] == "三室两厅"
        assert data["area"] == 89.5
        assert data["district"] == "浦东"

    def test_create_missing_community_name(self, admin_client: TestClient) -> None:
        """缺少必填字段 community_name 返回 422."""
        resp = admin_client.post(API_PREFIX, json={})
        assert resp.status_code == 422

    def test_create_with_custom_status(self, admin_client: TestClient) -> None:
        """指定状态创建线索."""
        payload = {**MINIMAL_LEAD, "status": "pending_visit"}
        resp = admin_client.post(API_PREFIX, json=payload)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending_visit"


# ─── 获取线索列表 ───────────────────────────────────────────


class TestGetLeads:
    """GET /leads 获取线索列表."""

    def test_list_empty(self, admin_client: TestClient) -> None:
        """无线索时返回空列表."""
        resp = admin_client.get(API_PREFIX)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_with_data(self, admin_client: TestClient) -> None:
        """创建线索后列表包含数据."""
        _create_lead(admin_client)
        resp = admin_client.get(API_PREFIX)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    def test_pagination(self, admin_client: TestClient) -> None:
        """分页参数生效."""
        for i in range(3):
            _create_lead(admin_client, {"community_name": f"小区{i}"})

        resp = admin_client.get(API_PREFIX, params={"page": 1, "page_size": 2})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 2
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total"] >= 3

    def test_filter_by_status(self, admin_client: TestClient) -> None:
        """按状态筛选."""
        _create_lead(admin_client)
        resp = admin_client.get(API_PREFIX, params={"statuses": "pending_assessment"})
        assert resp.status_code == 200
        data = resp.json()
        for item in data["items"]:
            assert item["status"] == "pending_assessment"

    def test_search_by_community_name(self, admin_client: TestClient) -> None:
        """按小区名称搜索."""
        _create_lead(admin_client, {"community_name": "翡翠城"})
        resp = admin_client.get(API_PREFIX, params={"search": "翡翠城"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for item in data["items"]:
            assert "翡翠城" in item["community_name"]


# ─── 获取线索详情 ───────────────────────────────────────────


class TestGetLead:
    """GET /leads/{lead_id} 获取线索详情."""

    def test_get_existing(self, admin_client: TestClient) -> None:
        """获取已存在的线索."""
        lead = _create_lead(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/{lead['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == lead["id"]
        assert data["community_name"] == lead["community_name"]

    def test_get_not_found(self, admin_client: TestClient) -> None:
        """不存在的线索 ID 返回 404."""
        resp = admin_client.get(f"{API_PREFIX}/nonexistent-id")
        assert resp.status_code == 404


# ─── 更新线索 ───────────────────────────────────────────────


class TestUpdateLead:
    """PUT /leads/{lead_id} 更新线索."""

    def test_update_success(self, admin_client: TestClient) -> None:
        """更新部分字段成功."""
        lead = _create_lead(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{lead['id']}",
            json={"community_name": "新小区名", "area": 120.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["community_name"] == "新小区名"
        assert data["area"] == 120.0

    def test_update_not_found(self, admin_client: TestClient) -> None:
        """更新不存在的线索返回 404."""
        resp = admin_client.put(
            f"{API_PREFIX}/nonexistent-id",
            json={"community_name": "不存在"},
        )
        assert resp.status_code == 404

    def test_update_empty_body(self, admin_client: TestClient) -> None:
        """空更新体不报错（所有字段可选）."""
        lead = _create_lead(admin_client)
        resp = admin_client.put(f"{API_PREFIX}/{lead['id']}", json={})
        assert resp.status_code == 200

    def test_update_status(self, admin_client: TestClient) -> None:
        """更新线索状态."""
        lead = _create_lead(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{lead['id']}",
            json={"status": "pending_visit"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "pending_visit"


# ─── 删除线索 ───────────────────────────────────────────────


class TestDeleteLead:
    """DELETE /leads/{lead_id} 删除线索."""

    def test_delete_success(self, admin_client: TestClient) -> None:
        """删除已存在线索返回 204."""
        lead = _create_lead(admin_client)
        resp = admin_client.delete(f"{API_PREFIX}/{lead['id']}")
        assert resp.status_code == 204

        # 删除后获取应返回 404
        get_resp = admin_client.get(f"{API_PREFIX}/{lead['id']}")
        assert get_resp.status_code == 404


# ─── 漏斗统计 ───────────────────────────────────────────────


class TestLeadFunnelStats:
    """GET /leads/stats/funnel 获取线索漏斗统计."""

    def test_funnel_empty(self, admin_client: TestClient) -> None:
        """无线索时各阶段计数为 0."""
        resp = admin_client.get(f"{API_PREFIX}/stats/funnel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["evaluating"] == 0
        assert data["rejected"] == 0
        assert data["visiting"] == 0
        assert data["signed"] == 0

    def test_funnel_with_data(self, admin_client: TestClient) -> None:
        """创建线索后统计数量增加."""
        _create_lead(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/stats/funnel")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert data["evaluating"] >= 1


# ─── 跟进记录 ───────────────────────────────────────────────


class TestFollowUps:
    """线索跟进记录端点."""

    def test_add_follow_up(self, admin_client: TestClient) -> None:
        """添加跟进记录成功."""
        lead = _create_lead(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{lead['id']}/follow-ups",
            json={"method": "phone", "content": "电话沟通，业主有意向"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["method"] == "phone"
        assert data["content"] == "电话沟通，业主有意向"
        assert data["lead_id"] == lead["id"]
        assert "id" in data

    def test_get_follow_ups(self, admin_client: TestClient) -> None:
        """获取跟进记录列表."""
        lead = _create_lead(admin_client)
        admin_client.post(
            f"{API_PREFIX}/{lead['id']}/follow-ups",
            json={"method": "wechat", "content": "微信跟进"},
        )
        resp = admin_client.get(f"{API_PREFIX}/{lead['id']}/follow-ups")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["method"] == "wechat"

    def test_add_follow_up_invalid_method(self, admin_client: TestClient) -> None:
        """无效跟进方式返回 422."""
        lead = _create_lead(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{lead['id']}/follow-ups",
            json={"method": "invalid", "content": "测试"},
        )
        assert resp.status_code == 422


# ─── 价格历史 ───────────────────────────────────────────────


class TestPriceHistory:
    """线索价格历史端点."""

    def test_add_price_record(self, admin_client: TestClient) -> None:
        """添加价格记录成功."""
        lead = _create_lead(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{lead['id']}/prices",
            json={"price": 260.0, "remark": "二次授权"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["price"] == 260.0
        assert data["remark"] == "二次授权"
        assert data["lead_id"] == lead["id"]
        assert "id" in data

    def test_get_price_history(self, admin_client: TestClient) -> None:
        """获取价格历史记录."""
        lead = _create_lead(admin_client)
        admin_client.post(
            f"{API_PREFIX}/{lead['id']}/prices",
            json={"price": 250.0, "remark": "首次估价"},
        )
        resp = admin_client.get(f"{API_PREFIX}/{lead['id']}/prices")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data) >= 1
        assert data[0]["price"] == 250.0

    def test_add_price_missing_required(self, admin_client: TestClient) -> None:
        """缺少必填字段 price 返回 422."""
        lead = _create_lead(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{lead['id']}/prices",
            json={"remark": "无价格"},
        )
        assert resp.status_code == 422


# ─── 未认证访问 ─────────────────────────────────────────────


class TestUnauthenticatedAccess:
    """未认证用户访问线索端点返回 401."""

    @pytest.fixture()
    def unauth_client(self, seeded_db: dict) -> TestClient:
        """无认证信息的 TestClient."""
        from main import app

        return TestClient(app)

    def test_list_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证访问列表返回 401."""
        resp = unauth_client.get(API_PREFIX)
        assert resp.status_code == 401

    def test_create_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证创建线索返回 401."""
        resp = unauth_client.post(API_PREFIX, json=MINIMAL_LEAD)
        assert resp.status_code == 401

    def test_get_detail_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证获取详情返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/some-id")
        assert resp.status_code == 401

    def test_funnel_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证获取漏斗统计返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/stats/funnel")
        assert resp.status_code == 401


# ─── 普通用户权限不足 ───────────────────────────────────────


class TestForbiddenAccess:
    """普通用户（role=user）访问线索端点返回 403."""

    def test_list_forbidden(self, user_client: TestClient) -> None:
        """普通用户访问列表返回 403."""
        resp = user_client.get(API_PREFIX)
        assert resp.status_code == 403

    def test_create_forbidden(self, user_client: TestClient) -> None:
        """普通用户创建线索返回 403."""
        resp = user_client.post(API_PREFIX, json=MINIMAL_LEAD)
        assert resp.status_code == 403

    def test_get_detail_forbidden(self, user_client: TestClient) -> None:
        """普通用户获取详情返回 403."""
        resp = user_client.get(f"{API_PREFIX}/some-id")
        assert resp.status_code == 403

    def test_funnel_forbidden(self, user_client: TestClient) -> None:
        """普通用户获取漏斗统计返回 403."""
        resp = user_client.get(f"{API_PREFIX}/stats/funnel")
        assert resp.status_code == 403

    def test_follow_up_forbidden(self, user_client: TestClient) -> None:
        """普通用户添加跟进记录返回 403."""
        resp = user_client.post(
            f"{API_PREFIX}/some-id/follow-ups",
            json={"method": "phone", "content": "测试"},
        )
        assert resp.status_code == 403

    def test_price_forbidden(self, user_client: TestClient) -> None:
        """普通用户添加价格记录返回 403."""
        resp = user_client.post(
            f"{API_PREFIX}/some-id/prices",
            json={"price": 100.0},
        )
        assert resp.status_code == 403
