"""项目核心 API 集成测试.

覆盖 /api/v1/projects/ 下的 CRUD、状态变更、统计、导出等端点.
"""

from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

API_PREFIX = "/api/v1/projects"

MINIMAL_PROJECT = {
    "community_name": "测试小区",
    "address": "测试地址123号",
    "contract_no": "MFB-202604-0001",
}


def _create_project(client: TestClient, overrides: dict | None = None) -> dict:
    """辅助：创建项目并返回响应 JSON."""
    data = {**MINIMAL_PROJECT, **(overrides or {})}
    resp = client.post(API_PREFIX, json=data)
    assert resp.status_code == 201
    return resp.json()


# ─── 创建项目 ───────────────────────────────────────────────


class TestCreateProject:
    """POST /projects 创建项目."""

    def test_create_success(self, admin_client: TestClient) -> None:
        """最小必填字段创建项目成功."""
        resp = admin_client.post(API_PREFIX, json=MINIMAL_PROJECT)
        assert resp.status_code == 201
        data = resp.json()
        assert data["community_name"] == "测试小区"
        assert data["address"] == "测试地址123号"
        assert data["contract_no"] == "MFB-202604-0001"
        assert data["status"] == "signing"
        assert "id" in data
        assert "created_at" in data

    def test_create_with_optional_fields(self, admin_client: TestClient) -> None:
        """包含可选字段创建项目."""
        payload = {
            **MINIMAL_PROJECT,
            "area": "89.5",
            "layout": "三室两厅",
            "orientation": "南北",
            "owner_name": "张三",
            "owner_phone": "13800138000",
            "signing_price": "100.5",
            "signing_date": "2026-04-01",
        }
        resp = admin_client.post(API_PREFIX, json=payload)
        assert resp.status_code == 201
        data = resp.json()
        assert Decimal(data["area"]) == Decimal("89.5")
        assert data["layout"] == "三室两厅"
        assert data["owner_name"] == "张三"

    def test_create_missing_community_name(self, admin_client: TestClient) -> None:
        """缺少必填字段 community_name 返回 422."""
        payload = {"address": "测试地址", "contract_no": "MFB-001"}
        resp = admin_client.post(API_PREFIX, json=payload)
        assert resp.status_code == 422

    def test_create_missing_address(self, admin_client: TestClient) -> None:
        """缺少必填字段 address 返回 422."""
        payload = {"community_name": "小区", "contract_no": "MFB-001"}
        resp = admin_client.post(API_PREFIX, json=payload)
        assert resp.status_code == 422

    def test_create_missing_contract_no(self, admin_client: TestClient) -> None:
        """缺少必填字段 contract_no 返回 422."""
        payload = {"community_name": "小区", "address": "地址"}
        resp = admin_client.post(API_PREFIX, json=payload)
        assert resp.status_code == 422

    def test_create_empty_body(self, admin_client: TestClient) -> None:
        """空请求体返回 422."""
        resp = admin_client.post(API_PREFIX, json={})
        assert resp.status_code == 422


# ─── 获取项目列表 ───────────────────────────────────────────


class TestGetProjects:
    """GET /projects 获取项目列表."""

    def test_list_empty(self, admin_client: TestClient) -> None:
        """无项目时返回空列表."""
        resp = admin_client.get(API_PREFIX)
        assert resp.status_code == 200
        data = resp.json()
        assert data["items"] == []
        assert data["total"] == 0

    def test_list_with_data(self, admin_client: TestClient) -> None:
        """创建项目后列表包含数据."""
        _create_project(admin_client)
        resp = admin_client.get(API_PREFIX)
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    def test_pagination(self, admin_client: TestClient) -> None:
        """分页参数生效."""
        for i in range(3):
            _create_project(admin_client, {"contract_no": f"MFB-PAG-{i:04d}"})

        resp = admin_client.get(API_PREFIX, params={"page": 1, "page_size": 2})
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["items"]) <= 2
        assert data["page"] == 1
        assert data["page_size"] == 2
        assert data["total"] >= 3

    def test_filter_by_status(self, admin_client: TestClient) -> None:
        """按状态筛选."""
        _create_project(admin_client)
        resp = admin_client.get(API_PREFIX, params={"status": "signing"})
        assert resp.status_code == 200
        data = resp.json()
        for item in data["items"]:
            assert item["status"] == "signing"

    def test_filter_by_community_name(self, admin_client: TestClient) -> None:
        """按小区名称筛选."""
        _create_project(admin_client, {"community_name": "阳光花园"})
        resp = admin_client.get(API_PREFIX, params={"community_name": "阳光花园"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] >= 1
        for item in data["items"]:
            assert "阳光花园" in item["community_name"]


# ─── 获取项目详情 ───────────────────────────────────────────


class TestGetProject:
    """GET /projects/{project_id} 获取项目详情."""

    def test_get_existing(self, admin_client: TestClient) -> None:
        """获取已存在的项目."""
        project = _create_project(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/{project['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == project["id"]
        assert data["community_name"] == project["community_name"]

    def test_get_with_full_param(self, admin_client: TestClient) -> None:
        """full=true 获取完整详情."""
        project = _create_project(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/{project['id']}", params={"full": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == project["id"]

    def test_get_not_found(self, admin_client: TestClient) -> None:
        """不存在的项目 ID 返回 404."""
        resp = admin_client.get(f"{API_PREFIX}/nonexistent-id")
        assert resp.status_code == 404


# ─── 更新项目 ───────────────────────────────────────────────


class TestUpdateProject:
    """PUT /projects/{project_id} 更新项目."""

    def test_update_success(self, admin_client: TestClient) -> None:
        """更新部分字段成功."""
        project = _create_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project['id']}",
            json={"community_name": "新小区名", "area": "120.0"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["community_name"] == "新小区名"
        assert Decimal(data["area"]) == Decimal("120.0")

    def test_update_not_found(self, admin_client: TestClient) -> None:
        """更新不存在的项目返回 404."""
        resp = admin_client.put(
            f"{API_PREFIX}/nonexistent-id",
            json={"community_name": "不存在"},
        )
        assert resp.status_code == 404

    def test_update_empty_body(self, admin_client: TestClient) -> None:
        """空更新体不报错（所有字段可选）."""
        project = _create_project(admin_client)
        resp = admin_client.put(f"{API_PREFIX}/{project['id']}", json={})
        assert resp.status_code == 200


# ─── 删除项目 ───────────────────────────────────────────────


class TestDeleteProject:
    """DELETE /projects/{project_id} 删除项目."""

    def test_delete_success(self, admin_client: TestClient) -> None:
        """删除已存在项目返回 204."""
        project = _create_project(admin_client)
        resp = admin_client.delete(f"{API_PREFIX}/{project['id']}")
        assert resp.status_code == 204

        # 删除后获取应返回 404
        get_resp = admin_client.get(f"{API_PREFIX}/{project['id']}")
        assert get_resp.status_code == 404


# ─── 项目状态变更 ───────────────────────────────────────────


class TestProjectStatus:
    """PUT /projects/{project_id}/status 更新项目状态."""

    def test_update_status_to_renovating(self, admin_client: TestClient) -> None:
        """状态从 signing 变更为 renovating."""
        project = _create_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project['id']}/status",
            json={"status": "renovating"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "renovating"

    def test_update_status_to_selling(self, admin_client: TestClient) -> None:
        """状态变更为 selling 并附带挂牌信息."""
        project = _create_project(admin_client)
        # 先推进到 renovating
        admin_client.put(
            f"{API_PREFIX}/{project['id']}/status",
            json={"status": "renovating"},
        )
        resp = admin_client.put(
            f"{API_PREFIX}/{project['id']}/status",
            json={"status": "selling", "list_price": "150.0", "listing_date": "2026-05-01"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "selling"

    def test_update_status_not_found(self, admin_client: TestClient) -> None:
        """更新不存在项目的状态返回 404."""
        resp = admin_client.put(
            f"{API_PREFIX}/nonexistent-id/status",
            json={"status": "renovating"},
        )
        assert resp.status_code == 404

    def test_update_status_invalid_value(self, admin_client: TestClient) -> None:
        """无效状态值返回 422."""
        project = _create_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project['id']}/status",
            json={"status": "invalid_status"},
        )
        assert resp.status_code == 422


# ─── 项目统计 ───────────────────────────────────────────────


class TestProjectStats:
    """GET /projects/stats 获取项目统计."""

    def test_stats_empty(self, admin_client: TestClient) -> None:
        """无项目时各状态计数为 0."""
        resp = admin_client.get(f"{API_PREFIX}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "signing" in data
        assert "renovating" in data
        assert "selling" in data
        assert "sold" in data

    def test_stats_with_data(self, admin_client: TestClient) -> None:
        """创建项目后 signing 计数增加."""
        _create_project(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert data["signing"] >= 1


# ─── 合同编号 ───────────────────────────────────────────────


class TestContractNo:
    """GET /projects/contract-no/next 获取下一个合同编号."""

    def test_get_next_contract_no(self, admin_client: TestClient) -> None:
        """返回格式为 MFB-年月-序号 的合同编号."""
        resp = admin_client.get(f"{API_PREFIX}/contract-no/next")
        assert resp.status_code == 200
        contract_no = resp.json()
        assert isinstance(contract_no, str)
        assert contract_no.startswith("MFB-")

    def test_contract_no_format(self, admin_client: TestClient) -> None:
        """合同编号格式正确（MFB-YYYYMM-NNNN）."""
        resp = admin_client.get(f"{API_PREFIX}/contract-no/next")
        contract_no = resp.json()
        parts = contract_no.split("-")
        assert len(parts) == 3
        assert parts[0] == "MFB"
        assert len(parts[1]) == 6  # YYYYMM
        assert len(parts[2]) == 4  # NNNN


# ─── 未认证访问 ─────────────────────────────────────────────


class TestUnauthenticatedAccess:
    """未认证用户访问项目端点返回 401."""

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
        """未认证创建项目返回 401."""
        resp = unauth_client.post(API_PREFIX, json=MINIMAL_PROJECT)
        assert resp.status_code == 401

    def test_get_detail_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证获取详情返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/some-id")
        assert resp.status_code == 401

    def test_contract_no_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证获取合同编号返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/contract-no/next")
        assert resp.status_code == 401

    def test_stats_unauthenticated(self, unauth_client: TestClient) -> None:
        """未认证获取统计返回 401."""
        resp = unauth_client.get(f"{API_PREFIX}/stats")
        assert resp.status_code == 401


# ─── 普通用户权限不足 ───────────────────────────────────────


class TestForbiddenAccess:
    """普通用户（role=user）访问项目端点返回 403."""

    def test_list_forbidden(self, user_client: TestClient) -> None:
        """普通用户访问列表返回 403."""
        resp = user_client.get(API_PREFIX)
        assert resp.status_code == 403

    def test_create_forbidden(self, user_client: TestClient) -> None:
        """普通用户创建项目返回 403."""
        resp = user_client.post(API_PREFIX, json=MINIMAL_PROJECT)
        assert resp.status_code == 403
