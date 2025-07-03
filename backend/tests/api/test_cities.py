"""
城市管理API测试
"""
import pytest
from fastapi.testclient import TestClient


class TestCities:
    """城市管理测试类"""
    
    def test_create_city_success(self, client: TestClient, authenticated_headers: dict, test_city_data: dict):
        """测试创建城市成功"""
        response = client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == test_city_data["name"]
        assert "id" in data
    
    def test_create_city_duplicate_name(self, client: TestClient, authenticated_headers: dict, test_city_data: dict):
        """测试创建重复城市名失败"""
        # 第一次创建
        response1 = client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        assert response1.status_code == 200
        
        # 第二次创建相同名称
        response2 = client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        assert response2.status_code == 400
        assert "城市名已存在" in response2.json()["detail"]
    
    def test_get_cities_empty(self, client: TestClient, authenticated_headers: dict):
        """测试获取空城市列表"""
        response = client.get("/api/v1/cities/", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_get_cities_with_data(self, client: TestClient, authenticated_headers: dict, test_city_data: dict):
        """测试获取有数据的城市列表"""
        # 先创建城市
        client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        
        # 获取列表
        response = client.get("/api/v1/cities/", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        assert len(data) == 1
        assert data[0]["name"] == test_city_data["name"]
    
    def test_get_city_by_id_success(self, client: TestClient, authenticated_headers: dict, test_city_data: dict):
        """测试根据ID获取城市成功"""
        # 先创建城市
        create_response = client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        city_id = create_response.json()["id"]
        
        # 根据ID获取
        response = client.get(f"/api/v1/cities/{city_id}", headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == city_id
        assert data["name"] == test_city_data["name"]
    
    def test_get_city_by_id_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试根据不存在的ID获取城市失败"""
        response = client.get("/api/v1/cities/999", headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "城市不存在" in response.json()["detail"]
    
    def test_update_city_success(self, client: TestClient, authenticated_headers: dict, test_city_data: dict):
        """测试更新城市成功"""
        # 先创建城市
        create_response = client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        city_id = create_response.json()["id"]
        
        # 更新城市
        update_data = {"name": "北京"}
        response = client.put(f"/api/v1/cities/{city_id}", json=update_data, headers=authenticated_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == city_id
        assert data["name"] == update_data["name"]
    
    def test_update_city_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试更新不存在的城市失败"""
        update_data = {"name": "北京"}
        response = client.put("/api/v1/cities/999", json=update_data, headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "城市不存在" in response.json()["detail"]
    
    def test_update_city_duplicate_name(self, client: TestClient, authenticated_headers: dict):
        """测试更新城市为重复名称失败"""
        # 创建两个城市
        city1_data = {"name": "上海"}
        city2_data = {"name": "北京"}
        
        response1 = client.post("/api/v1/cities/", json=city1_data, headers=authenticated_headers)
        response2 = client.post("/api/v1/cities/", json=city2_data, headers=authenticated_headers)
        
        city1_id = response1.json()["id"]
        
        # 尝试将城市1的名称改为城市2的名称
        update_data = {"name": "北京"}
        response = client.put(f"/api/v1/cities/{city1_id}", json=update_data, headers=authenticated_headers)
        
        assert response.status_code == 400
        assert "城市名已存在" in response.json()["detail"]
    
    def test_delete_city_success(self, client: TestClient, authenticated_headers: dict, test_city_data: dict):
        """测试删除城市成功"""
        # 先创建城市
        create_response = client.post("/api/v1/cities/", json=test_city_data, headers=authenticated_headers)
        city_id = create_response.json()["id"]
        
        # 删除城市
        response = client.delete(f"/api/v1/cities/{city_id}", headers=authenticated_headers)
        
        assert response.status_code == 200
        assert "城市删除成功" in response.json()["message"]
        
        # 验证城市已被删除
        get_response = client.get(f"/api/v1/cities/{city_id}", headers=authenticated_headers)
        assert get_response.status_code == 404
    
    def test_delete_city_not_found(self, client: TestClient, authenticated_headers: dict):
        """测试删除不存在的城市失败"""
        response = client.delete("/api/v1/cities/999", headers=authenticated_headers)
        
        assert response.status_code == 404
        assert "城市不存在" in response.json()["detail"]
    
    def test_create_city_without_auth(self, client: TestClient, test_city_data: dict):
        """测试无认证创建城市失败"""
        response = client.post("/api/v1/cities/", json=test_city_data)
        assert response.status_code == 403
