"""
项目相关API测试
测试项目核心功能，验证自定义异常处理是否正确工作
"""
import pytest
import sys
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# 添加backend目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from db import get_db
from models import Base, User, Role
from models import Project, FinanceRecord
from models.common import ProjectStatus, CashFlowType, CashFlowCategory
from utils.auth import get_password_hash


# 测试数据库配置 - 使用文件数据库确保数据持久化
TEST_DB_PATH = "/tmp/test_profo.db"
SQLALCHEMY_DATABASE_URL = f"sqlite:///{TEST_DB_PATH}"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


# 存储 token 供所有测试使用
_test_token = None


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="session", autouse=True)
def setup_test_db():
    """Setup test database and create admin user once for all tests"""
    global _test_token

    # Clean up any existing test database
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)

    # Create tables
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()

    # Create admin role
    admin_role = Role(
        name="管理员",
        code="admin",
        description="拥有所有权限",
        permissions=["view_data", "edit_data", "manage_users", "manage_roles"]
    )
    db.add(admin_role)
    db.commit()

    # Create admin user
    admin = User(
        username="admin",
        password=get_password_hash("Fdd123.."),
        nickname="系统管理员",
        role_id=admin_role.id,
        status="active"
    )
    db.add(admin)
    db.commit()
    db.close()

    # Get token
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/auth/token",
            data={"username": "admin", "password": "Fdd123.."}
        )
        assert response.status_code == 200, f"Failed to get token: {response.text}"
        _test_token = response.json()["access_token"]

    yield

    # Cleanup
    if os.path.exists(TEST_DB_PATH):
        os.remove(TEST_DB_PATH)


@pytest.fixture
def client():
    """Create a fresh test client for each test"""
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers():
    """Return authorization headers"""
    return {"Authorization": f"Bearer {_test_token}"}


@pytest.fixture
def sample_project_data():
    import uuid
    return {
        "community_name": "测试小区",
        "address": "测试地址",
        "owner_name": "测试业主",
        "owner_phone": "13800138000",
        "contract_no": f"TEST-{uuid.uuid4().hex[:8].upper()}",
        "signing_price": 500,
        "signing_date": "2026-01-01",
        "signing_period": 180,
    }


class TestProjectAPI:
    """测试项目相关API"""

    def test_create_project(self, client, auth_headers, sample_project_data):
        """测试创建项目"""
        response = client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )
        assert response.status_code == 201
        data = response.json()
        assert data["community_name"] == sample_project_data["community_name"]
        assert data["status"] == "signing"

    def test_get_project_list(self, client, auth_headers, sample_project_data):
        """测试获取项目列表"""
        # 先创建项目
        client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )

        response = client.get("/api/v1/projects", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    def test_get_project_stats(self, client, auth_headers, sample_project_data):
        """测试获取项目统计"""
        # 创建项目
        client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )

        response = client.get("/api/v1/projects/stats", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "signing" in data
        assert "renovating" in data
        assert "selling" in data
        assert "sold" in data

    def test_get_project_detail(self, client, auth_headers, sample_project_data):
        """测试获取项目详情"""
        # 创建项目
        create_response = client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )
        project_id = create_response.json()["id"]

        response = client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == project_id
        assert data["community_name"] == sample_project_data["community_name"]

    def test_update_project(self, client, auth_headers, sample_project_data):
        """测试更新项目信息"""
        # 创建项目
        create_response = client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )
        project_id = create_response.json()["id"]

        # 更新项目信息
        update_data = {"community_name": "更新后的小区名称", "notes": "更新后的备注"}
        response = client.put(
            f"/api/v1/projects/{project_id}",
            json=update_data,
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["community_name"] == "更新后的小区名称"

    def test_delete_project(self, client, auth_headers, sample_project_data):
        """测试删除项目"""
        # 创建项目
        create_response = client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )
        project_id = create_response.json()["id"]

        # 删除项目
        response = client.delete(f"/api/v1/projects/{project_id}", headers=auth_headers)
        assert response.status_code == 204

        # 验证项目已删除（应该返回404）
        get_response = client.get(f"/api/v1/projects/{project_id}", headers=auth_headers)
        assert get_response.status_code == 404

    def test_nonexistent_project(self, client, auth_headers):
        """测试访问不存在的项目 - 验证自定义异常处理"""
        fake_project_id = "nonexistent-project-id"

        response = client.get(f"/api/v1/projects/{fake_project_id}", headers=auth_headers)
        assert response.status_code == 404
        data = response.json()
        # 验证返回格式符合 AGENTS.md 规范：{"detail":"..."}
        assert "detail" in data
        assert "项目不存在" in data["detail"]

    def test_update_nonexistent_project(self, client, auth_headers):
        """测试更新不存在的项目 - 验证自定义异常处理"""
        fake_project_id = "nonexistent-project-id"

        response = client.put(
            f"/api/v1/projects/{fake_project_id}",
            json={"community_name": "测试"},
            headers=auth_headers
        )
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "项目不存在" in data["detail"]

    def test_delete_nonexistent_project(self, client, auth_headers):
        """测试删除不存在的项目 - 验证自定义异常处理"""
        fake_project_id = "nonexistent-project-id"

        response = client.delete(f"/api/v1/projects/{fake_project_id}", headers=auth_headers)
        assert response.status_code == 404
        data = response.json()
        assert "detail" in data
        assert "项目不存在" in data["detail"]

    def test_status_transition_signing_to_renovating(self, client, auth_headers, sample_project_data):
        """测试状态流转：签约 -> 改造"""
        # 创建项目
        create_response = client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )
        project_id = create_response.json()["id"]

        # 更新状态为改造中
        response = client.put(
            f"/api/v1/projects/{project_id}/status",
            json={"status": "renovating"},
            headers=auth_headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "renovating"

    def test_invalid_status_transition_to_sold(self, client, auth_headers, sample_project_data):
        """测试非法状态流转：签约 -> 已售（应该失败）- 验证自定义异常处理"""
        # 创建项目
        create_response = client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )
        project_id = create_response.json()["id"]

        # 尝试直接从签约跳到已售（应该失败）
        response = client.put(
            f"/api/v1/projects/{project_id}/status",
            json={"status": "sold"},
            headers=auth_headers
        )
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "只有在售或已售状态才能切换到已售状态" in data["detail"]

    def test_get_next_contract_no(self, client, auth_headers):
        """测试获取下一个合同编号"""
        response = client.get("/api/v1/projects/contract-no/next", headers=auth_headers)
        assert response.status_code == 200
        # 验证格式：MFB-年月-4位序号
        contract_no = response.json()
        assert contract_no.startswith("MFB-")

    def test_project_filter_by_status(self, client, auth_headers, sample_project_data):
        """测试按状态筛选项目"""
        # 创建项目
        client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )

        # 筛选签约阶段的项目
        response = client.get("/api/v1/projects?status=signing", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

    def test_project_filter_by_community_name(self, client, auth_headers, sample_project_data):
        """测试按小区名称筛选项目"""
        # 创建项目
        client.post(
            "/api/v1/projects",
            json=sample_project_data,
            headers=auth_headers
        )

        # 按小区名称筛选
        response = client.get("/api/v1/projects?community_name=测试小区", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1

        # 按不存在的小区名称筛选
        response = client.get("/api/v1/projects?community_name=不存在的小区", headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
