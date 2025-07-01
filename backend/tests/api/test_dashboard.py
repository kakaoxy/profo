"""
数据看板API测试
"""
import pytest
from datetime import date, datetime, timedelta
from fastapi.testclient import TestClient


class TestDashboard:
    """数据看板测试类"""
    
    def test_get_dashboard_overview_empty(self, client: TestClient, authenticated_headers: dict):
        """测试获取空数据看板概览"""
        response = client.get("/api/v1/dashboard/stats/overview", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "latest_city_stats" in data
        assert "property_stats" in data
        assert "viewing_stats" in data
        assert data["property_stats"]["total"] == 0
        assert data["viewing_stats"]["total"] == 0
    
    def test_get_dashboard_overview_with_data(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取有数据的看板概览"""
        # 创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        # 创建看房笔记
        viewing_data = {
            "property_id": property_id,
            "viewing_date": "2024-01-15",
            "rating": 4
        }
        client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        
        # 获取概览
        response = client.get("/api/v1/dashboard/stats/overview", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["property_stats"]["total"] == 1
        assert data["property_stats"]["on_sale"] == 1
        assert data["property_stats"]["sold"] == 0
        assert data["viewing_stats"]["total"] == 1
    
    def test_get_trend_data_default(self, client: TestClient, authenticated_headers: dict):
        """测试获取默认趋势数据"""
        response = client.get("/api/v1/dashboard/stats/trend", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "trend_data" in data
        assert "date_range" in data
        assert isinstance(data["trend_data"], list)
        assert "start_date" in data["date_range"]
        assert "end_date" in data["date_range"]
    
    def test_get_trend_data_custom_days(self, client: TestClient, authenticated_headers: dict):
        """测试获取自定义天数的趋势数据"""
        response = client.get("/api/v1/dashboard/stats/trend?days=7", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "trend_data" in data
        assert "date_range" in data
        
        # 验证日期范围
        start_date = datetime.fromisoformat(data["date_range"]["start_date"]).date()
        end_date = datetime.fromisoformat(data["date_range"]["end_date"]).date()
        assert (end_date - start_date).days == 7
    
    def test_get_trend_data_invalid_days(self, client: TestClient, authenticated_headers: dict):
        """测试获取无效天数的趋势数据失败"""
        # 天数太小
        response = client.get("/api/v1/dashboard/stats/trend?days=5", headers=authenticated_headers)
        assert response.status_code == 422
        
        # 天数太大
        response = client.get("/api/v1/dashboard/stats/trend?days=400", headers=authenticated_headers)
        assert response.status_code == 422
    
    def test_get_recent_properties_empty(self, client: TestClient, authenticated_headers: dict):
        """测试获取空的最近房源"""
        response = client.get("/api/v1/dashboard/recent/properties", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_recent_properties_with_data(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取有数据的最近房源"""
        # 创建多个房源
        properties = [
            {
                "community_id": setup_basic_data["community_id"],
                "status": "在售",
                "layout_bedrooms": 2,
                "layout_living_rooms": 1,
                "area_sqm": 55.0,
                "listing_price_wan": 240.0
            },
            {
                "community_id": setup_basic_data["community_id"],
                "status": "已成交",
                "layout_bedrooms": 3,
                "layout_living_rooms": 2,
                "area_sqm": 80.0,
                "listing_price_wan": 350.0
            }
        ]
        
        for prop in properties:
            client.post("/api/v1/properties/", json=prop, headers=authenticated_headers)
        
        # 获取最近房源
        response = client.get("/api/v1/dashboard/recent/properties", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        
        # 验证数据结构
        for item in data:
            assert "id" in item
            assert "community_id" in item
            assert "status" in item
            assert "layout" in item
            assert "created_at" in item
    
    def test_get_recent_properties_with_limit(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取限制数量的最近房源"""
        # 创建多个房源
        for i in range(10):
            property_data = {
                "community_id": setup_basic_data["community_id"],
                "status": "在售"
            }
            client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        
        # 获取限制数量的最近房源
        response = client.get("/api/v1/dashboard/recent/properties?limit=3", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3
    
    def test_get_recent_viewings_empty(self, client: TestClient, authenticated_headers: dict):
        """测试获取空的最近看房笔记"""
        response = client.get("/api/v1/dashboard/recent/viewings", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_recent_viewings_with_data(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取有数据的最近看房笔记"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        # 创建多个看房笔记
        viewings = [
            {
                "property_id": property_id,
                "viewing_date": "2024-01-15",
                "rating": 4,
                "expected_purchase_price_wan": 235.0
            },
            {
                "property_id": property_id,
                "viewing_date": "2024-01-16",
                "rating": 5,
                "expected_purchase_price_wan": 240.0
            }
        ]
        
        for viewing in viewings:
            client.post("/api/v1/my-viewings/", json=viewing, headers=authenticated_headers)
        
        # 获取最近看房笔记
        response = client.get("/api/v1/dashboard/recent/viewings", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 2
        
        # 验证数据结构
        for item in data:
            assert "id" in item
            assert "property_id" in item
            assert "viewing_date" in item
            assert "rating" in item
            assert "created_at" in item
    
    def test_get_recent_viewings_with_limit(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取限制数量的最近看房笔记"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        # 创建多个看房笔记
        for i in range(10):
            viewing_data = {
                "property_id": property_id,
                "viewing_date": f"2024-01-{15+i:02d}",
                "rating": 4
            }
            client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        
        # 获取限制数量的最近看房笔记
        response = client.get("/api/v1/dashboard/recent/viewings?limit=3", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 3
