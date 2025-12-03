"""
项目相关API测试
"""
import pytest
import sys
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
from decimal import Decimal

# 添加backend目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from db import get_db
from models import Base
from models import Project, CashFlowRecord
from models.base import ProjectStatus, RenovationStage, CashFlowType, CashFlowCategory


# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db


@pytest.fixture(scope="function")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def sample_project_data():
    return {
        "name": "测试项目",
        "community_name": "测试小区",
        "address": "测试地址",
        "owner_name": "测试业主",
        "owner_phone": "13800138000",
        "notes": "测试备注"
    }


class TestProjectAPI:
    """测试项目相关API"""

    def test_create_project(self, client, sample_project_data):
        """测试创建项目"""
        response = client.post("/api/v1/projects", json=sample_project_data)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["msg"] == "success"
        assert data["data"]["name"] == sample_project_data["name"]
        assert data["data"]["status"] == "signing"  # 默认状态应该是签约阶段

    def test_get_project_list(self, client, sample_project_data):
        """测试获取项目列表"""
        # 先创建项目
        client.post("/api/v1/projects", json=sample_project_data)

        response = client.get("/api/v1/projects")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["total"] == 1
        assert len(data["data"]["items"]) == 1

    def test_get_project_stats(self, client, sample_project_data):
        """测试获取项目统计"""
        # 创建项目
        client.post("/api/v1/projects", json=sample_project_data)

        response = client.get("/api/v1/projects/stats")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["signing"] == 1
        assert data["data"]["renovating"] == 0
        assert data["data"]["selling"] == 0
        assert data["data"]["sold"] == 0

    def test_get_project_detail(self, client, sample_project_data):
        """测试获取项目详情"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        response = client.get(f"/api/v1/projects/{project_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["id"] == project_id
        assert data["data"]["name"] == sample_project_data["name"]

    def test_update_project_in_signing_stage(self, client, sample_project_data):
        """测试在签约阶段更新项目信息"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 更新项目信息
        update_data = {"name": "更新后的项目名称", "notes": "更新后的备注"}
        response = client.put(f"/api/v1/projects/{project_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["name"] == "更新后的项目名称"
        assert data["data"]["notes"] == "更新后的备注"

    def test_update_project_in_renovating_stage(self, client, sample_project_data):
        """测试在改造阶段更新项目信息（应该成功）"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 将项目状态改为改造阶段
        status_update = {"status": "renovating"}
        client.put(f"/api/v1/projects/{project_id}/status", json=status_update)

        # 尝试更新项目信息（应该成功）
        update_data = {"name": "改造阶段更新名称"}
        response = client.put(f"/api/v1/projects/{project_id}", json=update_data)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["name"] == "改造阶段更新名称"

    def test_status_transition_flow(self, client, sample_project_data):
        """测试状态流转"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 签约 -> 改造
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "renovating"

        # 改造 -> 在售
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "selling"

        # 在售 -> 已售
        complete_data = {"sold_price": 1000000, "sold_date": datetime.now().isoformat()}
        response = client.post(f"/api/v1/projects/{project_id}/complete", json=complete_data)
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "sold"

    def test_invalid_status_transition(self, client, sample_project_data):
        """测试非法状态流转"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 尝试直接从签约跳到已售（应该失败）
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "sold"})
        assert response.status_code == 400
        data = response.json()
        assert "不允许" in data["error"]["message"]

    def test_renovation_stage_update(self, client, sample_project_data):
        """测试改造阶段更新"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 先将项目状态改为改造阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})

        # 更新改造阶段
        renovation_data = {"renovation_stage": "水电", "stage_completed_at": datetime.now().isoformat()}
        response = client.put(f"/api/v1/projects/{project_id}/renovation", json=renovation_data)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["renovation_stage"] == "水电"

    def test_renovation_stage_update_without_renovating_status(self, client, sample_project_data):
        """测试在非改造阶段更新改造阶段（应该失败）"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 尝试更新改造阶段（应该失败）
        renovation_data = {"renovation_stage": "水电"}
        response = client.put(f"/api/v1/projects/{project_id}/renovation", json=renovation_data)
        assert response.status_code == 400
        data = response.json()
        assert "改造阶段" in data["error"]["message"]

    def test_sales_roles_update(self, client, sample_project_data):
        """测试销售角色更新"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 先将项目状态改为在售阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        # 更新销售角色
        roles_data = {
            "property_agent": "房源维护人",
            "client_agent": "客源维护人",
            "first_viewer": "首看人"
        }
        response = client.put(f"/api/v1/projects/{project_id}/selling/roles", json=roles_data)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["property_agent"] == "房源维护人"
        assert data["data"]["client_agent"] == "客源维护人"
        assert data["data"]["first_viewer"] == "首看人"

    def test_sales_roles_update_without_selling_status(self, client, sample_project_data):
        """测试在非在售阶段更新销售角色（应该失败）"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 尝试更新销售角色（应该失败）
        roles_data = {"property_agent": "房源维护人"}
        response = client.put(f"/api/v1/projects/{project_id}/selling/roles", json=roles_data)
        assert response.status_code == 400
        data = response.json()
        assert "在售阶段" in data["error"]["message"]

    def test_renovation_photo_upload(self, client, sample_project_data):
        """测试改造阶段照片上传"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 先将项目状态改为改造阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})

        # 上传照片
        photo_data = {
            "stage": "水电",
            "url": "https://example.com/photo.jpg",
            "filename": "photo.jpg",
            "description": "水电改造照片"
        }
        response = client.post(f"/api/v1/projects/{project_id}/renovation/photos", params=photo_data)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["stage"] == "水电"
        assert data["data"]["url"] == "https://example.com/photo.jpg"

    def test_create_sales_records(self, client, sample_project_data):
        """测试创建销售记录"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 先将项目状态改为在售阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        # 创建带看记录
        viewing_data = {
            "record_type": "viewing",
            "customer_name": "客户姓名",
            "customer_phone": "13800138000",
            "record_date": datetime.now().isoformat(),
            "notes": "带看记录"
        }
        response = client.post(f"/api/v1/projects/{project_id}/selling/viewings", json=viewing_data)
        assert response.status_code == 200
        assert response.json()["data"]["record_type"] == "viewing"

        # 创建出价记录
        offer_data = {
            "record_type": "offer",
            "customer_name": "客户姓名",
            "customer_phone": "13800138000",
            "record_date": datetime.now().isoformat(),
            "price": 900000,
            "notes": "出价记录"
        }
        response = client.post(f"/api/v1/projects/{project_id}/selling/offers", json=offer_data)
        assert response.status_code == 200
        assert response.json()["data"]["record_type"] == "offer"
        assert response.json()["data"]["price"] == 900000

        # 创建面谈记录
        negotiation_data = {
            "record_type": "negotiation",
            "customer_name": "客户姓名",
            "customer_phone": "13800138000",
            "record_date": datetime.now().isoformat(),
            "notes": "面谈记录"
        }
        response = client.post(f"/api/v1/projects/{project_id}/selling/negotiations", json=negotiation_data)
        assert response.status_code == 200
        assert response.json()["data"]["record_type"] == "negotiation"

    def test_get_sales_records(self, client, sample_project_data):
        """测试获取销售记录"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 先将项目状态改为在售阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        # 创建销售记录
        record_data = {
            "record_type": "viewing",
            "customer_name": "客户姓名",
            "customer_phone": "13800138000",
            "record_date": datetime.now().isoformat(),
            "notes": "测试记录"
        }
        client.post(f"/api/v1/projects/{project_id}/selling/viewings", json=record_data)

        # 获取销售记录
        response = client.get(f"/api/v1/projects/{project_id}/selling/records")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert len(data["data"]) == 1
        assert data["data"][0]["record_type"] == "viewing"

    def test_delete_sales_record(self, client, sample_project_data):
        """测试删除销售记录"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 先将项目状态改为在售阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        # 创建销售记录
        record_data = {
            "record_type": "viewing",
            "customer_name": "客户姓名",
            "customer_phone": "13800138000",
            "record_date": datetime.now().isoformat(),
            "notes": "测试记录"
        }
        create_response = client.post(f"/api/v1/projects/{project_id}/selling/viewings", json=record_data)
        record_id = create_response.json()["data"]["id"]

        # 删除销售记录
        response = client.delete(f"/api/v1/projects/{project_id}/selling/records/{record_id}")
        assert response.status_code == 200

        # 验证记录已删除
        response = client.get(f"/api/v1/projects/{project_id}/selling/records")
        assert len(response.json()["data"]) == 0

    def test_get_project_report(self, client, sample_project_data):
        """测试获取项目报告"""
        # 创建项目
        create_response = client.post("/api/v1/projects", json=sample_project_data)
        project_id = create_response.json()["data"]["id"]

        # 获取项目报告
        response = client.get(f"/api/v1/projects/{project_id}/report")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["data"]["project_id"] == project_id
        assert data["data"]["project_name"] == sample_project_data["name"]
        assert "total_investment" in data["data"]
        assert "total_income" in data["data"]
        assert "net_profit" in data["data"]
        assert "roi" in data["data"]

    def test_nonexistent_project(self, client):
        """测试访问不存在的项目"""
        fake_project_id = "nonexistent-project-id"

        response = client.get(f"/api/v1/projects/{fake_project_id}")
        assert response.status_code == 404
        data = response.json()
        assert "项目不存在" in data["error"]["message"]

    def test_project_filter_by_status(self, client, sample_project_data):
        """测试按状态筛选项目"""
        # 创建两个项目
        client.post("/api/v1/projects", json=sample_project_data)

        project_data2 = sample_project_data.copy()
        project_data2["name"] = "第二个项目"
        create_response = client.post("/api/v1/projects", json=project_data2)
        project_id2 = create_response.json()["data"]["id"]

        # 将第二个项目状态改为改造阶段
        client.put(f"/api/v1/projects/{project_id2}/status", json={"status": "renovating"})

        # 筛选签约阶段的项目
        response = client.get("/api/v1/projects?status=signing")
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["total"] == 1
        assert data["data"]["items"][0]["status"] == "signing"

        # 筛选改造阶段的项目
        response = client.get("/api/v1/projects?status=renovating")
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["total"] == 1
        assert data["data"]["items"][0]["status"] == "renovating"

    def test_project_filter_by_community_name(self, client, sample_project_data):
        """测试按小区名称筛选项目"""
        # 创建两个项目
        client.post("/api/v1/projects", json=sample_project_data)

        project_data2 = sample_project_data.copy()
        project_data2["name"] = "第二个项目"
        project_data2["community_name"] = "另一个小区"
        client.post("/api/v1/projects", json=project_data2)

        # 按小区名称筛选
        response = client.get("/api/v1/projects?community_name=测试小区")
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["total"] == 1
        assert data["data"]["items"][0]["community_name"] == "测试小区"

        # 按部分小区名称筛选
        response = client.get("/api/v1/projects?community_name=小区")
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["total"] == 2  # 两个项目的小区名称都包含"小区"