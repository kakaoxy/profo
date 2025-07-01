"""
房源管理API测试
"""
import pytest
from fastapi.testclient import TestClient


class TestProperties:
    """房源管理测试类"""
    
    def test_create_property_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试创建房源成功"""
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售",
            "layout_bedrooms": 2,
            "layout_living_rooms": 1,
            "layout_bathrooms": 1,
            "area_sqm": 55.0,
            "orientation": "双南",
            "floor_level": "中楼层",
            "total_floors": 6,
            "build_year": 1993,
            "listing_price_wan": 240.0
        }
        
        response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["community_id"] == property_data["community_id"]
        assert data["status"] == property_data["status"]
        assert data["layout_bedrooms"] == property_data["layout_bedrooms"]
        assert float(data["area_sqm"]) == property_data["area_sqm"]
        assert "id" in data
        assert "created_at" in data
        assert "updated_at" in data
    
    def test_create_property_invalid_community(self, client: TestClient, authenticated_headers: dict):
        """测试创建房源时小区不存在失败"""
        property_data = {
            "community_id": 999,  # 不存在的小区ID
            "status": "在售"
        }
        
        response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        
        assert response.status_code == 400
        assert "指定的小区不存在" in response.json()["detail"]
    
    def test_get_properties_empty(self, client: TestClient, authenticated_headers: dict):
        """测试获取空房源列表"""
        response = client.get("/api/v1/properties/", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_properties_with_data(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取有数据的房源列表"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售",
            "layout_bedrooms": 2,
            "area_sqm": 55.0,
            "listing_price_wan": 240.0
        }
        client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        
        # 获取列表
        response = client.get("/api/v1/properties/", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["status"] == property_data["status"]
    
    def test_get_properties_with_filters(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试带筛选条件获取房源列表"""
        # 创建多个房源
        property1 = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售",
            "layout_bedrooms": 2,
            "listing_price_wan": 200.0
        }
        property2 = {
            "community_id": setup_basic_data["community_id"],
            "status": "已成交",
            "layout_bedrooms": 3,
            "listing_price_wan": 300.0
        }
        
        client.post("/api/v1/properties/", json=property1, headers=authenticated_headers)
        client.post("/api/v1/properties/", json=property2, headers=authenticated_headers)
        
        # 按状态筛选
        response = client.get("/api/v1/properties/?status=在售", headers=authenticated_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["status"] == "在售"
        
        # 按价格区间筛选
        response = client.get("/api/v1/properties/?min_price=250&max_price=350", headers=authenticated_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert float(data[0]["listing_price_wan"]) == 300.0
        
        # 按卧室数量筛选
        response = client.get("/api/v1/properties/?bedrooms=3", headers=authenticated_headers)
        assert response.status_code == 200
        data = response.json()
        assert len(data) == 1
        assert data[0]["layout_bedrooms"] == 3
    
    def test_get_property_by_id_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试根据ID获取房源成功"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售",
            "layout_bedrooms": 2
        }
        create_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = create_response.json()["id"]
        
        # 根据ID获取
        response = client.get(f"/api/v1/properties/{property_id}", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == property_id
        assert data["status"] == property_data["status"]
    
    def test_get_property_by_id_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试根据不存在的ID获取房源失败"""
        response = client.get("/api/v1/properties/999", headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "房源不存在" in response.json()["detail"]
    
    def test_update_property_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试更新房源成功"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售",
            "layout_bedrooms": 2,
            "listing_price_wan": 240.0
        }
        create_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = create_response.json()["id"]
        
        # 更新房源
        update_data = {
            "status": "已成交",
            "deal_price_wan": 235.0
        }
        response = client.put(f"/api/v1/properties/{property_id}", json=update_data, headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == property_id
        assert data["status"] == update_data["status"]
        assert float(data["deal_price_wan"]) == update_data["deal_price_wan"]
    
    def test_update_property_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试更新不存在的房源失败"""
        update_data = {"status": "已成交"}
        response = client.put("/api/v1/properties/999", json=update_data, headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "房源不存在" in response.json()["detail"]
    
    def test_delete_property_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试删除房源成功"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        create_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = create_response.json()["id"]
        
        # 删除房源
        response = client.delete(f"/api/v1/properties/{property_id}", headers=authenticated_headers)
        
        assert response.status_code == 200
        assert "房源删除成功" in response.json()["message"]
        
        # 验证房源已被删除
        get_response = client.get(f"/api/v1/properties/{property_id}", headers=authenticated_headers)
        assert get_response.status_code == 404
    
    def test_delete_property_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试删除不存在的房源失败"""
        response = client.delete("/api/v1/properties/999", headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "房源不存在" in response.json()["detail"]
    
    def test_get_property_stats(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取房源统计"""
        # 创建不同状态的房源
        properties = [
            {"community_id": setup_basic_data["community_id"], "status": "在售"},
            {"community_id": setup_basic_data["community_id"], "status": "在售"},
            {"community_id": setup_basic_data["community_id"], "status": "已成交"},
            {"community_id": setup_basic_data["community_id"], "status": "个人记录"}
        ]
        
        for prop in properties:
            client.post("/api/v1/properties/", json=prop, headers=authenticated_headers)
        
        # 获取统计
        response = client.get("/api/v1/properties/stats/summary", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 4
        assert data["on_sale_count"] == 2
        assert data["sold_count"] == 1
        assert data["personal_count"] == 1
