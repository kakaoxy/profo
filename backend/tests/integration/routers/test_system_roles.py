"""系统角色管理路由集成测试.

覆盖 /api/v1/roles 下的角色列表、创建、查询、更新、删除等端点.
"""

import pytest
from fastapi.testclient import TestClient


API_PREFIX = "/api/v1/roles"


class TestListRoles:
    """GET /roles/ 角色列表接口测试."""

    def test_list_roles_as_admin(self, admin_client: TestClient) -> None:
        """管理员获取角色列表成功."""
        response = admin_client.get(f"{API_PREFIX}/")
        assert response.status_code == 200
        data = response.json()
        assert "items" in data
        assert "total" in data
        assert isinstance(data["items"], list)
        assert data["total"] >= 1

    def test_list_roles_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户访问角色列表返回 403."""
        response = user_client.get(f"{API_PREFIX}/")
        assert response.status_code == 403


class TestGetRole:
    """GET /roles/{role_id} 获取指定角色接口测试."""

    def test_get_role_as_admin(self, admin_client: TestClient) -> None:
        """管理员获取指定角色信息成功."""
        response = admin_client.get(f"{API_PREFIX}/admin-role")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == "admin"
        assert data["name"] == "管理员"
        assert "permissions" in data

    def test_get_role_not_found(self, admin_client: TestClient) -> None:
        """获取不存在的角色返回 404."""
        response = admin_client.get(f"{API_PREFIX}/nonexistent-role-id")
        assert response.status_code == 404

    def test_get_role_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权获取角色信息，返回 403."""
        response = user_client.get(f"{API_PREFIX}/admin-role")
        assert response.status_code == 403


class TestCreateRole:
    """POST /roles/ 创建角色接口测试."""

    def test_create_role_as_admin(self, admin_client: TestClient) -> None:
        """管理员创建新角色成功."""
        response = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "name": "测试角色",
                "code": "test_role",
                "description": "用于集成测试",
                "permissions": ["view_data"],
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "测试角色"
        assert data["code"] == "test_role"
        assert "id" in data

    def test_create_role_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权创建角色，返回 403."""
        response = user_client.post(
            f"{API_PREFIX}/",
            json={
                "name": "禁止角色",
                "code": "forbidden_role",
                "description": "不应创建",
                "permissions": ["view_data"],
            },
        )
        assert response.status_code == 403

    def test_create_role_duplicate_code(self, admin_client: TestClient) -> None:
        """创建重复角色代码返回 409."""
        response = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "name": "重复角色",
                "code": "admin",
                "description": "重复代码",
                "permissions": ["view_data"],
            },
        )
        assert response.status_code == 409


class TestUpdateRole:
    """PUT /roles/{role_id} 更新角色接口测试."""

    def test_update_role_as_admin(self, admin_client: TestClient) -> None:
        """管理员更新角色信息成功."""
        # 先创建一个角色用于更新
        create_resp = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "name": "待更新角色",
                "code": "to_update_role",
                "description": "更新前",
                "permissions": ["view_data"],
            },
        )
        role_id = create_resp.json()["id"]

        response = admin_client.put(
            f"{API_PREFIX}/{role_id}",
            json={"description": "更新后描述", "permissions": ["view_data", "edit_data"]},
        )
        assert response.status_code == 200
        data = response.json()
        assert data["description"] == "更新后描述"
        assert "edit_data" in data["permissions"]


class TestDeleteRole:
    """DELETE /roles/{role_id} 删除角色接口测试."""

    def test_delete_role_as_admin(self, admin_client: TestClient) -> None:
        """管理员删除无用户的角色成功返回 204."""
        # 先创建一个待删除角色
        create_resp = admin_client.post(
            f"{API_PREFIX}/",
            json={
                "name": "待删除角色",
                "code": "to_delete_role",
                "description": "即将删除",
                "permissions": ["view_data"],
            },
        )
        role_id = create_resp.json()["id"]

        response = admin_client.delete(f"{API_PREFIX}/{role_id}")
        assert response.status_code == 204

    def test_delete_role_with_users_forbidden(self, admin_client: TestClient) -> None:
        """删除有用户的角色返回 409."""
        # admin-role 下有 admin 用户，不能删除
        response = admin_client.delete(f"{API_PREFIX}/admin-role")
        assert response.status_code == 409

    def test_delete_role_not_found(self, admin_client: TestClient) -> None:
        """删除不存在的角色返回 404."""
        response = admin_client.delete(f"{API_PREFIX}/nonexistent-role-id")
        assert response.status_code == 404

    def test_delete_role_as_normal_user_forbidden(self, user_client: TestClient) -> None:
        """普通用户无权删除角色，返回 403."""
        response = user_client.delete(f"{API_PREFIX}/user-role")
        assert response.status_code == 403
