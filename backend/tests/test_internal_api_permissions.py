"""
内部管理API权限控制测试
验证所有API端点仅对管理员(admin)和运营人员(operator)开放
"""
import pytest
from fastapi.testclient import TestClient
from fastapi import HTTPException, status

from main import app
from dependencies.auth import (
    get_current_active_user,
    get_current_internal_user,
    get_current_admin_user,
    get_current_operator_user
)


client = TestClient(app)


class MockRole:
    """模拟角色对象"""
    def __init__(self, code: str, permissions: list = None):
        self.code = code
        self.permissions = permissions or []


class MockUser:
    """模拟用户对象"""
    def __init__(self, user_id: str, username: str, role_code: str, permissions: list = None):
        self.id = user_id
        self.username = username
        self.nickname = f"{role_code}_user"
        self.status = "active"
        self.role = MockRole(role_code, permissions)


def create_mock_user(role_code: str) -> MockUser:
    """创建模拟用户"""
    permissions_map = {
        "admin": ["view_data", "edit_data", "manage_users", "manage_roles"],
        "operator": ["view_data", "edit_data"],
        "user": ["view_data"]
    }
    return MockUser(
        user_id=f"{role_code}-123",
        username=role_code,
        role_code=role_code,
        permissions=permissions_map.get(role_code, [])
    )


# ==================== 依赖注入覆盖函数 ====================

def override_get_current_active_user_admin():
    """覆盖依赖 - 返回管理员用户"""
    return create_mock_user("admin")


def override_get_current_active_user_operator():
    """覆盖依赖 - 返回运营人员用户"""
    return create_mock_user("operator")


def override_get_current_active_user_normal():
    """覆盖依赖 - 返回普通用户"""
    return create_mock_user("user")


def override_get_current_internal_user_admin():
    """覆盖依赖 - 返回管理员用户（内部管理接口）"""
    user = create_mock_user("admin")
    if user.role.code not in ["admin", "operator"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


def override_get_current_internal_user_operator():
    """覆盖依赖 - 返回运营人员用户（内部管理接口）"""
    user = create_mock_user("operator")
    if user.role.code not in ["admin", "operator"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


def override_get_current_internal_user_normal():
    """覆盖依赖 - 返回普通用户（内部管理接口）- 应该抛出403"""
    user = create_mock_user("user")
    if user.role.code not in ["admin", "operator"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


def override_get_current_admin_user_admin():
    """覆盖依赖 - 返回管理员用户（仅admin接口）"""
    user = create_mock_user("admin")
    if user.role.code != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


def override_get_current_admin_user_operator():
    """覆盖依赖 - 返回运营人员用户（仅admin接口）- 应该抛出403"""
    user = create_mock_user("operator")
    if user.role.code != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


def override_get_current_operator_user_admin():
    """覆盖依赖 - 返回管理员用户（operator接口）"""
    user = create_mock_user("admin")
    if user.role.code not in ["admin", "operator"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


def override_get_current_operator_user_operator():
    """覆盖依赖 - 返回运营人员用户（operator接口）"""
    user = create_mock_user("operator")
    if user.role.code not in ["admin", "operator"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="权限不足")
    return user


# ==================== 测试类 ====================

class TestInternalAPIPermissions:
    """测试内部管理API权限控制"""

    def setup_method(self):
        """每个测试方法前重置依赖"""
        # 保存原始依赖
        self.original_deps = {
            "get_current_active_user": app.dependency_overrides.get(get_current_active_user),
            "get_current_internal_user": app.dependency_overrides.get(get_current_internal_user),
            "get_current_admin_user": app.dependency_overrides.get(get_current_admin_user),
            "get_current_operator_user": app.dependency_overrides.get(get_current_operator_user),
        }

    def teardown_method(self):
        """每个测试方法后恢复依赖"""
        # 恢复原始依赖
        for key, value in self.original_deps.items():
            dep_map = {
                "get_current_active_user": get_current_active_user,
                "get_current_internal_user": get_current_internal_user,
                "get_current_admin_user": get_current_admin_user,
                "get_current_operator_user": get_current_operator_user,
            }
            if value:
                app.dependency_overrides[dep_map[key]] = value
            else:
                if dep_map[key] in app.dependency_overrides:
                    del app.dependency_overrides[dep_map[key]]

    # ==================== 房源相关接口测试 ====================

    def test_properties_list_admin_access(self):
        """测试管理员可以访问房源列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_admin

        response = client.get("/api/v1/properties")
        # 由于我们没有真实的数据库，预期可能是422或404，但不应该是403
        assert response.status_code != 403

    def test_properties_list_operator_access(self):
        """测试运营人员可以访问房源列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_operator

        response = client.get("/api/v1/properties")
        assert response.status_code != 403

    def test_properties_list_normal_user_denied(self):
        """测试普通用户无法访问房源列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/properties")
        assert response.status_code == 403

    def test_properties_detail_normal_user_denied(self):
        """测试普通用户无法访问房源详情"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/properties/1")
        assert response.status_code == 403

    def test_communities_search_normal_user_denied(self):
        """测试普通用户无法访问小区搜索"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/properties/communities/search?q=test")
        assert response.status_code == 403

    # ==================== 线索管理接口测试 ====================

    def test_leads_list_normal_user_denied(self):
        """测试普通用户无法访问线索列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/leads/")
        assert response.status_code == 403

    def test_leads_create_normal_user_denied(self):
        """测试普通用户无法创建线索"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.post("/api/v1/leads/", json={"community_name": "测试小区", "total_price": 500})
        assert response.status_code == 403

    def test_leads_detail_normal_user_denied(self):
        """测试普通用户无法访问线索详情"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/leads/123")
        assert response.status_code == 403

    # ==================== 项目管理接口测试 ====================

    def test_projects_list_normal_user_denied(self):
        """测试普通用户无法访问项目列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/projects")
        assert response.status_code == 403

    def test_projects_create_normal_user_denied(self):
        """测试普通用户无法创建项目"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.post("/api/v1/projects", json={"community_name": "测试小区"})
        assert response.status_code == 403

    def test_projects_detail_normal_user_denied(self):
        """测试普通用户无法访问项目详情"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/projects/123")
        assert response.status_code == 403

    def test_projects_renovation_normal_user_denied(self):
        """测试普通用户无法访问项目改造接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/projects/123/renovation/photos")
        assert response.status_code == 403

    def test_projects_sales_normal_user_denied(self):
        """测试普通用户无法访问项目销售接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/projects/123/selling/records")
        assert response.status_code == 403

    # ==================== 现金流接口测试 ====================

    def test_cashflow_normal_user_denied(self):
        """测试普通用户无法访问现金流接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/projects/123/cashflow")
        assert response.status_code == 403

    # ==================== 市场监控接口测试 ====================

    def test_monitor_sentiment_normal_user_denied(self):
        """测试普通用户无法访问市场情绪接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/monitor/communities/1/sentiment")
        assert response.status_code == 403

    def test_monitor_trends_normal_user_denied(self):
        """测试普通用户无法访问市场趋势接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/monitor/communities/1/trends")
        assert response.status_code == 403

    def test_monitor_radar_normal_user_denied(self):
        """测试普通用户无法访问竞品雷达接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/monitor/communities/1/radar")
        assert response.status_code == 403

    def test_competitors_list_normal_user_denied(self):
        """测试普通用户无法访问竞品列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/communities/1/competitors")
        assert response.status_code == 403

    # ==================== 数据导入接口测试 ====================

    def test_push_normal_user_denied(self):
        """测试普通用户无法访问数据推送接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        # 发送非空数组以通过验证，但应该返回403
        response = client.post("/api/v1/push", json=[{"test": "data"}])
        assert response.status_code == 403

    def test_upload_csv_normal_user_denied(self):
        """测试普通用户无法访问CSV上传接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.post("/api/v1/upload/csv")
        assert response.status_code == 403

    def test_upload_download_normal_user_denied(self):
        """测试普通用户无法访问下载失败记录接口"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/upload/download/test.csv")
        assert response.status_code == 403

    # ==================== 用户管理接口测试 ====================

    def test_users_simple_normal_user_denied(self):
        """测试普通用户无法访问简化用户列表"""
        app.dependency_overrides[get_current_internal_user] = override_get_current_internal_user_normal

        response = client.get("/api/v1/users/simple")
        assert response.status_code == 403

    # ==================== 管理员接口测试（仅admin可访问） ====================

    def test_users_list_operator_denied(self):
        """测试运营人员无法访问用户列表（仅admin）"""
        app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user_operator

        response = client.get("/api/v1/users/users")
        assert response.status_code == 403

    def test_roles_list_operator_denied(self):
        """测试运营人员无法访问角色列表（仅admin）"""
        app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user_operator

        response = client.get("/api/v1/roles")
        assert response.status_code == 403

    def test_admin_communities_merge_operator_denied(self):
        """测试运营人员无法访问小区合并接口（仅admin）"""
        app.dependency_overrides[get_current_admin_user] = override_get_current_admin_user_operator

        response = client.post("/api/v1/admin/communities/merge", json={"primary_id": 1, "merge_ids": [2]})
        assert response.status_code == 403


class TestPublicAPIAccess:
    """测试公共接口（无需认证）"""

    def test_root_endpoint_no_auth(self):
        """测试根路径无需认证"""
        response = client.get("/")
        assert response.status_code == 200

    def test_health_endpoint_no_auth(self):
        """测试健康检查端点无需认证"""
        response = client.get("/health")
        assert response.status_code == 200


class TestAuthAPIAccess:
    """测试认证相关接口"""

    def test_login_endpoint_no_auth(self):
        """测试登录接口无需认证"""
        response = client.post("/api/v1/auth/login", json={"username": "test", "password": "test"})
        # 预期返回401（凭据错误），而不是403（权限不足）
        assert response.status_code == 401

    def test_token_endpoint_no_auth(self):
        """测试token接口无需认证"""
        response = client.post("/api/v1/auth/token", data={"username": "test", "password": "test"})
        # 预期返回401（凭据错误），而不是403（权限不足）
        assert response.status_code == 401


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
