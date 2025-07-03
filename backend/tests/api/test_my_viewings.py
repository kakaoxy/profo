"""
个人看房笔记API测试
"""
import pytest
from datetime import date
from fastapi.testclient import TestClient


class TestMyViewings:
    """个人看房笔记测试类"""
    
    def test_create_viewing_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试创建看房笔记成功"""
        # 先创建房源
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
            "rating": 4,
            "expected_purchase_price_wan": 235.0,
            "notes_general": "整体感觉不错",
            "notes_pros": "采光好，交通便利",
            "notes_cons": "楼层稍低"
        }
        
        response = client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["property_id"] == viewing_data["property_id"]
        assert data["rating"] == viewing_data["rating"]
        assert float(data["expected_purchase_price_wan"]) == viewing_data["expected_purchase_price_wan"]
        assert data["notes_general"] == viewing_data["notes_general"]
        assert "id" in data
        assert "user_id" in data
        assert "created_at" in data
    
    def test_create_viewing_invalid_property(self, client: TestClient, authenticated_headers: dict):
        """测试创建看房笔记时房源不存在失败"""
        viewing_data = {
            "property_id": 999,  # 不存在的房源ID
            "viewing_date": "2024-01-15",
            "rating": 4
        }
        
        response = client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        
        assert response.status_code == 400
        assert "指定的房源不存在" in response.json()["detail"]
    
    def test_create_viewing_invalid_rating(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试创建看房笔记时评分无效失败"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        # 创建看房笔记（评分超出范围）
        viewing_data = {
            "property_id": property_id,
            "viewing_date": "2024-01-15",
            "rating": 6  # 超出1-5范围
        }
        
        response = client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        
        assert response.status_code == 422  # 验证错误
    
    def test_get_my_viewings_empty(self, client: TestClient, authenticated_headers: dict):
        """测试获取空看房笔记列表"""
        response = client.get("/api/v1/my-viewings/", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_my_viewings_with_data(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取有数据的看房笔记列表"""
        # 先创建房源和看房笔记
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        viewing_data = {
            "property_id": property_id,
            "viewing_date": "2024-01-15",
            "rating": 4
        }
        client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        
        # 获取列表
        response = client.get("/api/v1/my-viewings/", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["rating"] == viewing_data["rating"]
    
    def test_get_viewing_by_id_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试根据ID获取看房笔记成功"""
        # 先创建房源和看房笔记
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        viewing_data = {
            "property_id": property_id,
            "viewing_date": "2024-01-15",
            "rating": 4
        }
        create_response = client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        viewing_id = create_response.json()["id"]
        
        # 根据ID获取
        response = client.get(f"/api/v1/my-viewings/{viewing_id}", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == viewing_id
        assert data["rating"] == viewing_data["rating"]
    
    def test_get_viewing_by_id_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试根据不存在的ID获取看房笔记失败"""
        response = client.get("/api/v1/my-viewings/999", headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "看房笔记不存在" in response.json()["detail"]
    
    def test_update_viewing_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试更新看房笔记成功"""
        # 先创建房源和看房笔记
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        viewing_data = {
            "property_id": property_id,
            "viewing_date": "2024-01-15",
            "rating": 4,
            "notes_general": "原始笔记"
        }
        create_response = client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        viewing_id = create_response.json()["id"]
        
        # 更新看房笔记
        update_data = {
            "rating": 5,
            "notes_general": "更新后的笔记",
            "expected_purchase_price_wan": 230.0
        }
        response = client.put(f"/api/v1/my-viewings/{viewing_id}", json=update_data, headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == viewing_id
        assert data["rating"] == update_data["rating"]
        assert data["notes_general"] == update_data["notes_general"]
        assert float(data["expected_purchase_price_wan"]) == update_data["expected_purchase_price_wan"]
    
    def test_delete_viewing_success(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试删除看房笔记成功"""
        # 先创建房源和看房笔记
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        viewing_data = {
            "property_id": property_id,
            "viewing_date": "2024-01-15",
            "rating": 4
        }
        create_response = client.post("/api/v1/my-viewings/", json=viewing_data, headers=authenticated_headers)
        viewing_id = create_response.json()["id"]
        
        # 删除看房笔记
        response = client.delete(f"/api/v1/my-viewings/{viewing_id}", headers=authenticated_headers)
        
        assert response.status_code == 200
        assert "看房笔记删除成功" in response.json()["message"]
        
        # 验证笔记已被删除
        get_response = client.get(f"/api/v1/my-viewings/{viewing_id}", headers=authenticated_headers)
        assert get_response.status_code == 404
    
    def test_get_viewing_stats(self, client: TestClient, authenticated_headers: dict, setup_basic_data: dict):
        """测试获取看房统计"""
        # 先创建房源
        property_data = {
            "community_id": setup_basic_data["community_id"],
            "status": "在售"
        }
        property_response = client.post("/api/v1/properties/", json=property_data, headers=authenticated_headers)
        property_id = property_response.json()["id"]
        
        # 创建不同评分的看房笔记
        viewings = [
            {"property_id": property_id, "viewing_date": "2024-01-15", "rating": 4},
            {"property_id": property_id, "viewing_date": "2024-01-16", "rating": 5},
            {"property_id": property_id, "viewing_date": "2024-01-17", "rating": 4},
            {"property_id": property_id, "viewing_date": "2024-01-18", "rating": 3}
        ]
        
        for viewing in viewings:
            client.post("/api/v1/my-viewings/", json=viewing, headers=authenticated_headers)
        
        # 获取统计
        response = client.get("/api/v1/my-viewings/stats/summary", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["total_count"] == 4
        assert data["rating_3"] == 1
        assert data["rating_4"] == 2
        assert data["rating_5"] == 1
