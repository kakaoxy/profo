"""系统认证路由集成测试.

覆盖 /api/v1/auth 下的登录、刷新令牌、获取当前用户、API Key 管理等端点.
"""

import pytest
from fastapi.testclient import TestClient


API_PREFIX = "/api/v1/auth"


class TestLogin:
    """POST /auth/login 登录接口测试."""

    def test_login_success(self, admin_client: TestClient) -> None:
        """管理员账号登录成功，返回 access_token 和 refresh_token."""
        response = admin_client.post(
            f"{API_PREFIX}/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert "expires_in" in data
        assert "user" in data
        assert data["user"]["username"] == "admin"

    def test_login_wrong_password(self, admin_client: TestClient) -> None:
        """错误密码登录返回 401."""
        response = admin_client.post(
            f"{API_PREFIX}/login",
            json={"username": "admin", "password": "WrongPassword1!"},
        )
        assert response.status_code == 401

    def test_login_nonexistent_user(self, admin_client: TestClient) -> None:
        """不存在的用户登录返回 401."""
        response = admin_client.post(
            f"{API_PREFIX}/login",
            json={"username": "nonexistent_user", "password": "SomePass123!"},
        )
        assert response.status_code == 401


class TestRefreshToken:
    """POST /auth/refresh 刷新令牌接口测试."""

    def test_refresh_token_success(self, admin_client: TestClient) -> None:
        """使用有效 refresh_token 刷新成功."""
        login_resp = admin_client.post(
            f"{API_PREFIX}/login",
            json={"username": "admin", "password": "Admin123!"},
        )
        refresh_token = login_resp.json()["refresh_token"]

        response = admin_client.post(
            f"{API_PREFIX}/refresh",
            json={"refresh_token": refresh_token},
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data

    def test_refresh_token_invalid(self, admin_client: TestClient) -> None:
        """无效 refresh_token 返回 401."""
        response = admin_client.post(
            f"{API_PREFIX}/refresh",
            json={"refresh_token": "invalid_token_value"},
        )
        assert response.status_code == 401


class TestGetCurrentUser:
    """GET /auth/me 获取当前用户信息接口测试."""

    def test_me_authenticated(self, admin_client: TestClient) -> None:
        """已认证用户获取自身信息."""
        response = admin_client.get(f"{API_PREFIX}/me")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert "id" in data
        assert "role" in data

    def test_me_unauthenticated(self, seeded_db: dict) -> None:
        """未认证用户访问 /auth/me 返回 401."""
        from main import app

        client = TestClient(app)
        response = client.get(f"{API_PREFIX}/me")
        assert response.status_code == 401


class TestApiKey:
    """API Key 创建、查询、撤销接口测试."""

    def test_create_api_key(self, admin_client: TestClient) -> None:
        """生成 API Key 成功，返回完整 key 和前缀."""
        response = admin_client.post(f"{API_PREFIX}/api-key")
        assert response.status_code == 200
        data = response.json()
        assert "api_key" in data
        assert "prefix" in data
        assert "created_at" in data
        assert len(data["api_key"]) > 0

    def test_get_api_key_info(self, admin_client: TestClient) -> None:
        """创建 API Key 后查询返回前缀和状态信息（不含完整 key）."""
        admin_client.post(f"{API_PREFIX}/api-key")

        response = admin_client.get(f"{API_PREFIX}/api-key")
        assert response.status_code == 200
        data = response.json()
        assert data is not None
        assert "prefix" in data
        assert "status" in data
        assert "id" in data

    def test_get_api_key_info_none(self, admin_client: TestClient) -> None:
        """未创建 API Key 时查询返回 null."""
        response = admin_client.get(f"{API_PREFIX}/api-key")
        assert response.status_code == 200
        assert response.json() is None

    def test_delete_api_key(self, admin_client: TestClient) -> None:
        """撤销 API Key 成功返回 204."""
        admin_client.post(f"{API_PREFIX}/api-key")

        response = admin_client.delete(f"{API_PREFIX}/api-key")
        assert response.status_code == 204

        # 撤销后查询应为 null
        info_resp = admin_client.get(f"{API_PREFIX}/api-key")
        assert info_resp.status_code == 200
        assert info_resp.json() is None

    def test_delete_api_key_not_found(self, admin_client: TestClient) -> None:
        """未创建 API Key 时撤销返回 404."""
        response = admin_client.delete(f"{API_PREFIX}/api-key")
        assert response.status_code == 404
