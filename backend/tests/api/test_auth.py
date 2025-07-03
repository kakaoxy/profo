"""
认证API测试
"""
import pytest
from fastapi.testclient import TestClient


class TestAuth:
    """认证测试类"""
    
    def test_register_success(self, client: TestClient, test_user_data: dict):
        """测试用户注册成功"""
        response = client.post("/api/v1/auth/register", json=test_user_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["username"] == test_user_data["username"]
        assert data["user"]["nickname"] == test_user_data["nickname"]
        assert "hashed_password" not in data["user"]  # 确保密码不会返回
    
    def test_register_duplicate_username(self, client: TestClient, test_user_data: dict):
        """测试重复用户名注册失败"""
        # 第一次注册
        response1 = client.post("/api/v1/auth/register", json=test_user_data)
        assert response1.status_code == 200
        
        # 第二次注册相同用户名
        response2 = client.post("/api/v1/auth/register", json=test_user_data)
        assert response2.status_code == 400
        assert "用户名已存在" in response2.json()["detail"]
    
    def test_register_invalid_data(self, client: TestClient):
        """测试无效数据注册失败"""
        invalid_data = {
            "username": "",  # 空用户名
            "password": "123"  # 密码太短
        }
        response = client.post("/api/v1/auth/register", json=invalid_data)
        assert response.status_code == 422  # 验证错误
    
    def test_login_success(self, client: TestClient, test_user_data: dict):
        """测试登录成功"""
        # 先注册用户
        client.post("/api/v1/auth/register", json=test_user_data)
        
        # 登录
        login_data = {
            "username": test_user_data["username"],
            "password": test_user_data["password"]
        }
        response = client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert "user" in data
        assert data["user"]["username"] == test_user_data["username"]
    
    def test_login_wrong_username(self, client: TestClient, test_user_data: dict):
        """测试错误用户名登录失败"""
        # 先注册用户
        client.post("/api/v1/auth/register", json=test_user_data)
        
        # 使用错误用户名登录
        login_data = {
            "username": "wronguser",
            "password": test_user_data["password"]
        }
        response = client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == 401
        assert "用户名或密码错误" in response.json()["detail"]
    
    def test_login_wrong_password(self, client: TestClient, test_user_data: dict):
        """测试错误密码登录失败"""
        # 先注册用户
        client.post("/api/v1/auth/register", json=test_user_data)
        
        # 使用错误密码登录
        login_data = {
            "username": test_user_data["username"],
            "password": "wrongpassword"
        }
        response = client.post("/api/v1/auth/login", json=login_data)
        
        assert response.status_code == 401
        assert "用户名或密码错误" in response.json()["detail"]
    
    def test_access_protected_endpoint_without_token(self, client: TestClient):
        """测试无令牌访问受保护端点失败"""
        response = client.get("/api/v1/cities/")
        assert response.status_code == 403  # 无认证头
    
    def test_access_protected_endpoint_with_invalid_token(self, client: TestClient):
        """测试无效令牌访问受保护端点失败"""
        headers = {"Authorization": "Bearer invalid_token"}
        response = client.get("/api/v1/cities/", headers=headers)
        assert response.status_code == 401
    
    def test_access_protected_endpoint_with_valid_token(self, client: TestClient, authenticated_headers: dict):
        """测试有效令牌访问受保护端点成功"""
        response = client.get("/api/v1/cities/", headers=authenticated_headers)
        assert response.status_code == 200
    
    def test_wechat_login_not_configured(self, client: TestClient):
        """测试微信登录未配置时的响应"""
        wechat_data = {"code": "test_code"}
        response = client.post("/api/v1/auth/wechat-login", json=wechat_data)
        assert response.status_code == 501
        assert "微信登录功能未配置" in response.json()["detail"]
