"""项目子模块（装修、销售、现金流）路由集成测试.

覆盖 /api/v1/projects/ 下的装修阶段、照片、合同、销售角色、销售记录、现金流等端点.
"""

import pytest
from fastapi.testclient import TestClient


API_PREFIX = "/api/v1/projects"

_contract_counter = 0


def _next_contract_no() -> str:
    """生成唯一合同编号，避免测试间冲突."""
    global _contract_counter  # noqa: PLW0603
    _contract_counter += 1
    return f"MFB-SUB-{_contract_counter:04d}"


def _create_project(client: TestClient) -> str:
    """辅助函数：创建项目并返回项目ID."""
    resp = client.post(
        API_PREFIX,
        json={
            "community_name": "测试小区",
            "address": "测试地址123号",
            "contract_no": _next_contract_no(),
        },
    )
    assert resp.status_code == 201
    return resp.json()["id"]


def _create_renovating_project(client: TestClient) -> str:
    """辅助函数：创建项目并推进到 renovating 状态."""
    project_id = _create_project(client)
    resp = client.put(
        f"{API_PREFIX}/{project_id}/status",
        json={"status": "renovating"},
    )
    assert resp.status_code == 200
    return project_id


def _create_selling_project(client: TestClient) -> str:
    """辅助函数：创建项目并推进到 selling 状态."""
    project_id = _create_project(client)
    # signing → renovating → selling
    client.put(f"{API_PREFIX}/{project_id}/status", json={"status": "renovating"})
    resp = client.put(
        f"{API_PREFIX}/{project_id}/status",
        json={"status": "selling", "list_price": "150.0", "listing_date": "2026-05-01"},
    )
    assert resp.status_code == 200
    return project_id


# ========== 装修阶段 ==========


class TestRenovationEndpoints:
    """装修阶段相关端点测试."""

    def test_update_renovation_stage(self, admin_client: TestClient) -> None:
        """更新改造阶段成功."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project_id}/renovation",
            json={"renovation_stage": "拆除"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == project_id
        assert data["renovation_stage"] == "拆除"

    def test_update_renovation_stage_with_completed_at(self, admin_client: TestClient) -> None:
        """更新改造阶段并附带完成时间."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project_id}/renovation",
            json={
                "renovation_stage": "设计",
                "stage_completed_at": "2026-06-01T00:00:00Z",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["renovation_stage"] == "设计"

    def test_update_renovation_stage_invalid_project(self, admin_client: TestClient) -> None:
        """更新不存在项目的改造阶段返回 404 或错误."""
        resp = admin_client.put(
            f"{API_PREFIX}/nonexistent-project/renovation",
            json={"renovation_stage": "拆除"},
        )
        assert resp.status_code in (404, 400, 422)

    def test_upload_renovation_photo(self, admin_client: TestClient) -> None:
        """上传改造阶段照片成功."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={"stage": "拆除", "url": "https://example.com/photo.jpg"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["url"] == "https://example.com/photo.jpg"
        assert data["stage"] == "拆除"

    def test_upload_renovation_photo_with_optional_fields(self, admin_client: TestClient) -> None:
        """上传照片附带文件名和描述."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={
                "stage": "水电",
                "url": "https://example.com/photo2.jpg",
                "filename": "水电照片.jpg",
                "description": "水电阶段施工照片",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["filename"] == "水电照片.jpg"
        assert data["description"] == "水电阶段施工照片"

    def test_get_renovation_photos(self, admin_client: TestClient) -> None:
        """获取改造阶段照片列表."""
        project_id = _create_renovating_project(admin_client)
        # 先上传一张
        admin_client.post(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={"stage": "拆除", "url": "https://example.com/photo1.jpg"},
        )
        resp = admin_client.get(f"{API_PREFIX}/{project_id}/renovation/photos")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_get_renovation_photos_by_stage(self, admin_client: TestClient) -> None:
        """按阶段筛选改造照片."""
        project_id = _create_renovating_project(admin_client)
        admin_client.post(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={"stage": "拆除", "url": "https://example.com/a.jpg"},
        )
        admin_client.post(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={"stage": "水电", "url": "https://example.com/b.jpg"},
        )
        resp = admin_client.get(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={"stage": "拆除"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(item["stage"] == "拆除" for item in data["items"])

    def test_delete_renovation_photo(self, admin_client: TestClient) -> None:
        """删除改造阶段照片成功返回 204."""
        project_id = _create_renovating_project(admin_client)
        upload_resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/renovation/photos",
            params={"stage": "拆除", "url": "https://example.com/to_delete.jpg"},
        )
        photo_id = upload_resp.json()["id"]

        resp = admin_client.delete(f"{API_PREFIX}/{project_id}/renovation/photos/{photo_id}")
        assert resp.status_code == 204

    def test_delete_renovation_photo_not_found(self, admin_client: TestClient) -> None:
        """删除不存在的照片返回 404 或错误."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.delete(f"{API_PREFIX}/{project_id}/renovation/photos/nonexistent-photo")
        assert resp.status_code in (404, 400, 422)

    def test_get_renovation_contract(self, admin_client: TestClient) -> None:
        """获取装修合同信息."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/{project_id}/renovation/contract")
        # 新项目可能无合同数据，返回 200 或 404
        assert resp.status_code in (200, 404)

    def test_update_renovation_contract(self, admin_client: TestClient) -> None:
        """更新装修合同信息成功."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project_id}/renovation/contract",
            json={
                "renovation_company": "测试装修公司",
                "hard_contract_amount": 50000.0,
                "payment_ratio_1": 30.0,
                "payment_ratio_2": 40.0,
                "payment_ratio_3": 25.0,
                "payment_ratio_4": 5.0,
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["renovation_company"] == "测试装修公司"

    def test_update_renovation_contract_partial(self, admin_client: TestClient) -> None:
        """部分更新装修合同（仅软装费用）."""
        project_id = _create_renovating_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project_id}/renovation/contract",
            json={"soft_budget": 20000.0, "design_fee": 3000.0},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["soft_budget"] == 20000.0
        assert data["design_fee"] == 3000.0


# ========== 销售管理 ==========


class TestSalesEndpoints:
    """销售管理相关端点测试."""

    def test_update_sales_roles(self, admin_client: TestClient) -> None:
        """更新销售角色成功."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project_id}/selling/roles",
            json={
                "channel_manager_id": "admin-user",
                "property_agent_id": "admin-user",
                "negotiator_id": "admin-user",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == project_id

    def test_update_sales_roles_partial(self, admin_client: TestClient) -> None:
        """部分更新销售角色（仅渠道负责人）."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.put(
            f"{API_PREFIX}/{project_id}/selling/roles",
            json={"channel_manager_id": "admin-user"},
        )
        assert resp.status_code == 200

    def test_update_sales_roles_invalid_project(self, admin_client: TestClient) -> None:
        """更新不存在项目的销售角色返回错误."""
        resp = admin_client.put(
            f"{API_PREFIX}/nonexistent-project/selling/roles",
            json={"channel_manager_id": "admin-user"},
        )
        assert resp.status_code in (404, 400, 422)

    def test_create_viewing_record(self, admin_client: TestClient) -> None:
        """创建带看记录成功返回 201."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/selling/viewings",
            json={
                "record_type": "viewing",
                "customer_name": "张三",
                "customer_phone": "13800138000",
                "record_date": "2026-06-01T10:00:00Z",
                "notes": "客户对户型满意",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["record_type"] == "viewing"
        assert data["customer_name"] == "张三"

    def test_create_offer_record(self, admin_client: TestClient) -> None:
        """创建出价记录成功返回 201."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/selling/offers",
            json={
                "record_type": "offer",
                "customer_name": "李四",
                "record_date": "2026-06-02T14:00:00Z",
                "price": "150.5",
                "notes": "出价150.5万",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["record_type"] == "offer"

    def test_create_negotiation_record(self, admin_client: TestClient) -> None:
        """创建面谈记录成功返回 201."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/selling/negotiations",
            json={
                "record_type": "negotiation",
                "customer_name": "王五",
                "record_date": "2026-06-03T16:00:00Z",
                "notes": "面谈讨论价格",
                "result": "待跟进",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["record_type"] == "negotiation"

    def test_get_sales_records(self, admin_client: TestClient) -> None:
        """获取销售记录列表."""
        project_id = _create_selling_project(admin_client)
        # 先创建一条记录
        admin_client.post(
            f"{API_PREFIX}/{project_id}/selling/viewings",
            json={
                "record_type": "viewing",
                "customer_name": "测试客户",
                "record_date": "2026-06-01T10:00:00Z",
            },
        )
        resp = admin_client.get(f"{API_PREFIX}/{project_id}/selling/records")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1

    def test_get_sales_records_by_type(self, admin_client: TestClient) -> None:
        """按类型筛选销售记录."""
        project_id = _create_selling_project(admin_client)
        admin_client.post(
            f"{API_PREFIX}/{project_id}/selling/viewings",
            json={
                "record_type": "viewing",
                "customer_name": "客户A",
                "record_date": "2026-06-01T10:00:00Z",
            },
        )
        resp = admin_client.get(
            f"{API_PREFIX}/{project_id}/selling/records",
            params={"record_type": "viewing"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert all(item["record_type"] == "viewing" for item in data["items"])

    def test_delete_sales_record(self, admin_client: TestClient) -> None:
        """删除销售记录成功返回 204."""
        project_id = _create_selling_project(admin_client)
        create_resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/selling/viewings",
            json={
                "record_type": "viewing",
                "customer_name": "待删除客户",
                "record_date": "2026-06-01T10:00:00Z",
            },
        )
        record_id = create_resp.json()["id"]

        resp = admin_client.delete(f"{API_PREFIX}/{project_id}/selling/records/{record_id}")
        assert resp.status_code == 204

    def test_delete_sales_record_not_found(self, admin_client: TestClient) -> None:
        """删除不存在的销售记录返回 404 或错误."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.delete(f"{API_PREFIX}/{project_id}/selling/records/nonexistent-record")
        assert resp.status_code in (404, 400, 422)

    def test_get_sales_records_empty(self, admin_client: TestClient) -> None:
        """新项目无销售记录时返回空列表."""
        project_id = _create_selling_project(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/{project_id}/selling/records")
        assert resp.status_code == 200
        data = resp.json()
        assert data["total"] == 0
        assert data["items"] == []


# ========== 现金流 ==========


class TestCashflowEndpoints:
    """现金流管理相关端点测试."""

    def test_create_cashflow_record_income(self, admin_client: TestClient) -> None:
        """创建收入类现金流记录成功返回 201."""
        project_id = _create_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/cashflow",
            json={
                "type": "income",
                "category": "售房款",
                "amount": "2000000",
                "date": "2026-06-01T00:00:00Z",
                "description": "售房收入",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "income"
        assert data["category"] == "售房款"

    def test_create_cashflow_record_expense(self, admin_client: TestClient) -> None:
        """创建支出类现金流记录成功返回 201."""
        project_id = _create_project(admin_client)
        resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/cashflow",
            json={
                "type": "expense",
                "category": "装修费",
                "amount": "50000",
                "date": "2026-06-02T00:00:00Z",
                "description": "硬装费用",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["type"] == "expense"

    def test_create_cashflow_record_invalid_project(self, admin_client: TestClient) -> None:
        """为不存在的项目创建现金流记录返回错误."""
        resp = admin_client.post(
            f"{API_PREFIX}/nonexistent-project/cashflow",
            json={
                "type": "income",
                "category": "售房款",
                "amount": "100000",
                "date": "2026-06-01T00:00:00Z",
            },
        )
        assert resp.status_code in (404, 400, 422)

    def test_get_project_cashflow(self, admin_client: TestClient) -> None:
        """获取项目现金流明细和汇总."""
        project_id = _create_project(admin_client)
        # 先创建一条记录
        admin_client.post(
            f"{API_PREFIX}/{project_id}/cashflow",
            json={
                "type": "income",
                "category": "售房款",
                "amount": "100000",
                "date": "2026-06-01T00:00:00Z",
            },
        )
        resp = admin_client.get(f"{API_PREFIX}/{project_id}/cashflow")
        assert resp.status_code == 200
        data = resp.json()
        assert "records" in data
        assert "summary" in data
        assert len(data["records"]) >= 1
        summary = data["summary"]
        assert "total_income" in summary
        assert "total_expense" in summary
        assert "net_cash_flow" in summary

    def test_get_project_cashflow_empty(self, admin_client: TestClient) -> None:
        """新项目无现金流记录时返回空列表和零汇总."""
        project_id = _create_project(admin_client)
        resp = admin_client.get(f"{API_PREFIX}/{project_id}/cashflow")
        assert resp.status_code == 200
        data = resp.json()
        assert data["records"] == []

    def test_delete_cashflow_record(self, admin_client: TestClient) -> None:
        """删除现金流记录成功返回 204."""
        project_id = _create_project(admin_client)
        create_resp = admin_client.post(
            f"{API_PREFIX}/{project_id}/cashflow",
            json={
                "type": "expense",
                "category": "营销费",
                "amount": "5000",
                "date": "2026-06-03T00:00:00Z",
            },
        )
        record_id = create_resp.json()["id"]

        resp = admin_client.delete(f"{API_PREFIX}/{project_id}/cashflow/{record_id}")
        assert resp.status_code == 204

    def test_delete_cashflow_record_not_found(self, admin_client: TestClient) -> None:
        """删除不存在的现金流记录返回 404 或错误."""
        project_id = _create_project(admin_client)
        resp = admin_client.delete(f"{API_PREFIX}/{project_id}/cashflow/nonexistent-record")
        assert resp.status_code in (404, 400, 422)
