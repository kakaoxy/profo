"""系统用户管理路由集成测试.

覆盖 /api/v1/users 下的用户列表、创建、查询、更新、删除、密码管理等端点.
"""

import pytest
from fastapi.testclient import TestClient


API_PREFIX = "/api/v1/users"


class TestListUsers:
    """GET /users/ 用户列表接口测试."""

    def test_list_users_as_admin(self, admin_client: TestClient) -> None:
        """管理员获取用户列表成功."""
        response = admin_client.get(f"{API_PREFIX}/")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert data["total"] >= 1

    def test_list_users_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户访问用户列表返回 403."""
        response = user_client.get(f"{API_PREFIX}/")
        assert response.status_code == 403


class TestSimpleUserList:
    """GET /users/simple 简化用户列表接口测试."""

    def test_simple_list_as_admin(self, admin_client: TestClient) -> None:
        """管理员获取简化用户列表成功."""
        response = admin_client.get(f"{API_PREFIX}/simple")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data

    def test_simple_list_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户（user 角色）无权访问简化用户列表，返回 403."""
        response = user_client.get(f"{API_PREFIX}/simple")
        assert response.status_code == 403


class TestGetCurrentUser:
    """GET /users/me 获取当前用户信息接口测试."""

    def test_me_as_admin(self, admin_client: TestClient) -> None:
        """管理员获取自身信息."""
        response = admin_client.get(f"{API_PREFIX}/me")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "admin"
        assert "role" in data

    def test_me_as_normal_user(self, user_client: TestClient) -> None:
        """普通用户获取自身信息."""
        response = user_client.get(f"{API_PREFIX}/me")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"


class TestGetUserById:
    """GET /users/{user_id} 获取指定用户接口测试."""

    def test_get_user_as_admin(self, admin_client: TestClient) -> None:
        """管理员获取指定用户信息成功."""
        response = admin_client.get(f"{API_PREFIX}/normal-user")
        assert response.status_code == 200
        data = response.json()
        assert data["username"] == "testuser"

    def test_get_user_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权获取指定用户信息，返回 403."""
        response = user_client.get(f"{API_PREFIX}/admin-user")
        assert response.status_code == 403


class TestCreateUser:
    """POST /users/ 创建用户接口测试."""

    def test_create_user_as_admin(self, admin_client: TestClient) -> None:
        """管理员创建新用户成功."""
        response = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "username": "newuser01",
                "password": "NewPass123!",
                "nickname": "新建用户",
                "role_id": "user-role",
            },
        )
        assert response.status_code == 201
        data = response.json()
        assert data["username"] == "newuser01"
        assert data["nickname"] == "新建用户"
        assert "id" in data

    def test_create_user_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权创建用户，返回 403."""
        response = user_client.post(
            f"{API_PREFIX}/",
            json={
                "username": "forbidden_user",
                "password": "NewPass123!",
                "nickname": "禁止创建",
                "role_id": "user-role",
            },
        )
        assert response.status_code == 403

    def test_create_user_duplicate_username(self, admin_client: TestClient) -> None:
        """创建重复用户名返回 409."""
        response = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "username": "admin",
                "password": "NewPass123!",
                "nickname": "重复用户名",
                "role_id": "admin-role",
            },
        )
        assert response.status_code == 409


class TestUpdateUser:
    """PUT /users/{user_id} 更新用户接口测试."""

    def test_update_user_as_admin(self, admin_client: TestClient) -> None:
        """管理员更新用户信息成功."""
        response = admin_client.put(
            f"{API_PREFIX}/normal-user",
            json={"nickname": "更新后昵称"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["nickname"] == "更新后昵称"


class TestResetPassword:
    """PUT /users/{user_id}/reset-password 重置密码接口测试."""

    def test_reset_password_as_admin(self, admin_client: TestClient) -> None:
        """管理员重置用户密码成功."""
        response = admin_client.put(
            f"{API_PREFIX}/normal-user/reset-password",
            json={"password": "ResetPass123!"},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "密码重置成功"

    def test_reset_password_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权重置密码，返回 403."""
        response = user_client.put(
            f"{API_PREFIX}/admin-user/reset-password",
            json={"password": "ResetPass123!"},
        )
        assert response.status_code == 403


class TestDeleteUser:
    """DELETE /users/{user_id} 删除用户接口测试."""

    def test_delete_user_as_admin(self, admin_client: TestClient) -> None:
        """管理员删除用户成功返回 204."""
        # 先创建一个待删除用户
        create_resp = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "username": "to_delete_user",
                "password": "DeletePass123!",
                "nickname": "待删除用户",
                "role_id": "user-role",
            },
        )
        user_id = create_resp.json()["id"]

        response = admin_client.delete(f"{API_PREFIX}/{user_id}")
        assert response.status_code == 204

    def test_delete_self_forbidden(self, admin_client: TestClient) -> None:
        """管理员不能删除自己，返回 400."""
        response = admin_client.delete(f"{API_PREFIX}/admin-user")
        assert response.status_code == 400

    def test_delete_user_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权删除用户，返回 403."""
        response = user_client.delete(f"{API_PREFIX}/admin-user")
        assert response.status_code == 403


class TestChangePassword:
    """POST /users/change-password 修改当前用户密码接口测试."""

    def test_change_password_success(self, user_client: TestClient) -> None:
        """普通用户修改自身密码成功."""
        response = user_client.post(
            f"{API_PREFIX}/change-password",
            json={
                "current_password": "Test123!",
                "new_password": "NewTest456!",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["message"] == "密码修改成功"

    def test_change_password_wrong_current(self, user_client: TestClient) -> None:
        """当前密码错误时修改密码失败，返回 400."""
        response = user_client.post(
            f"{API_PREFIX}/change-password",
            json={
                "current_password": "WrongCurrent1!",
                "new_password": "NewTest456!",
            },
        )
        assert response.status_code == 400
