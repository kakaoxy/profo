"""
项目状态流转测试
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
from db import get_db, Base


# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_status.db"
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


class TestStatusFlow:
    """测试项目状态流转逻辑"""

    def create_test_project(self, client, project_data):
        """辅助方法：创建测试项目"""
        response = client.post("/api/v1/projects", json=project_data)
        return response.json()["data"]["id"]

    def test_normal_status_flow(self, client, sample_project_data):
        """测试正常的状态流转路径"""
        project_id = self.create_test_project(client, sample_project_data)

        # 验证初始状态
        response = client.get(f"/api/v1/projects/{project_id}")
        assert response.json()["data"]["status"] == "signing"

        # 1. 签约 -> 改造
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "renovating"

        # 2. 改造 -> 在售
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "selling"

        # 3. 在售 -> 已售
        complete_data = {
            "sold_price": 1000000,
            "sold_date": datetime.now().isoformat()
        }
        response = client.post(f"/api/v1/projects/{project_id}/complete", json=complete_data)
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "sold"

    def test_direct_signing_to_sold(self, client, sample_project_data):
        """测试直接从签约跳到已售（应该失败）"""
        project_id = self.create_test_project(client, sample_project_data)

        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "sold"})
        assert response.status_code == 400
        assert "不允许从状态 'signing' 转换到 'sold'" in response.json()["detail"]

    def test_direct_signing_to_selling(self, client, sample_project_data):
        """测试直接从签约跳到在售（应该失败）"""
        project_id = self.create_test_project(client, sample_project_data)

        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        assert response.status_code == 400
        assert "不允许从状态 'signing' 转换到 'selling'" in response.json()["detail"]

    def test_direct_renovating_to_sold(self, client, sample_project_data):
        """测试直接从改造跳到已售（应该失败）"""
        project_id = self.create_test_project(client, sample_project_data)

        # 先改为改造阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})

        # 尝试直接跳到已售
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "sold"})
        assert response.status_code == 400
        assert "不允许从状态 'renovating' 转换到 'sold'" in response.json()["detail"]

    def test_reverse_flow_signing_to_sold(self, client, sample_project_data):
        """测试反向流转：已售 -> 签约（应该失败）"""
        project_id = self.create_test_project(client, sample_project_data)

        # 正常流转到已售
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        complete_data = {
            "sold_price": 1000000,
            "sold_date": datetime.now().isoformat()
        }
        client.post(f"/api/v1/projects/{project_id}/complete", json=complete_data)

        # 尝试反向流转
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "signing"})
        assert response.status_code == 400
        assert "不允许从状态 'sold' 转换到 'signing'" in response.json()["detail"]

    def test_reverse_flow_selling_to_renovating(self, client, sample_project_data):
        """测试反向流转：在售 -> 改造（应该失败）"""
        project_id = self.create_test_project(client, sample_project_data)

        # 正常流转到在售
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        # 尝试反向流转
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        assert response.status_code == 400
        assert "不允许从状态 'selling' 转换到 'renovating'" in response.json()["detail"]

    def test_renovation_stage_completion_flow(self, client, sample_project_data):
        """测试改造阶段完成后的状态流转"""
        project_id = self.create_test_project(client, sample_project_data)

        # 流转到改造阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})

        # 更新改造阶段到交付
        renovation_data = {
            "renovation_stage": "交付",
            "stage_completed_at": datetime.now().isoformat()
        }
        response = client.put(f"/api/v1/projects/{project_id}/renovation", json=renovation_data)
        assert response.status_code == 200

        # 从改造阶段的交付状态可以流转到在售
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "selling"

    def test_complete_project_api(self, client, sample_project_data):
        """测试完成项目API"""
        project_id = self.create_test_project(client, sample_project_data)

        # 流转到在售阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        # 完成项目
        complete_data = {
            "sold_price": 1200000,
            "sold_date": datetime.now().isoformat()
        }
        response = client.post(f"/api/v1/projects/{project_id}/complete", json=complete_data)
        assert response.status_code == 200
        data = response.json()
        assert data["data"]["status"] == "sold"
        assert data["data"]["sale_price"] == 1200000

    def test_complete_project_without_selling_status(self, client, sample_project_data):
        """测试在非在售阶段完成项目（应该失败）"""
        project_id = self.create_test_project(client, sample_project_data)

        # 不流转到在售阶段，直接尝试完成项目
        complete_data = {
            "sold_price": 1200000,
            "sold_date": datetime.now().isoformat()
        }
        response = client.post(f"/api/v1/projects/{project_id}/complete", json=complete_data)
        assert response.status_code == 400
        assert "只有在售阶段的项目才能标记为已售" in response.json()["detail"]

    def test_status_transition_with_timestamp(self, client, sample_project_data):
        """测试状态流转时的时间戳记录"""
        project_id = self.create_test_project(client, sample_project_data)

        # 记录初始状态时间
        initial_response = client.get(f"/api/v1/projects/{project_id}")
        initial_status_changed_at = initial_response.json()["data"]["status_changed_at"]

        # 等待一小段时间
        import time
        time.sleep(0.1)

        # 状态流转
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        new_status_changed_at = response.json()["data"]["status_changed_at"]

        # 验证时间戳已更新
        assert new_status_changed_at != initial_status_changed_at

    def test_multiple_projects_status_flow(self, client, sample_project_data):
        """测试多个项目的状态流转"""
        # 创建多个项目
        project_ids = []
        for i in range(3):
            project_data = sample_project_data.copy()
            project_data["name"] = f"测试项目{i+1}"
            project_id = self.create_test_project(client, project_data)
            project_ids.append(project_id)

        # 将项目流转到不同阶段
        # 项目1：签约阶段
        # 项目2：改造阶段
        client.put(f"/api/v1/projects/{project_ids[1]}/status", json={"status": "renovating"})

        # 项目3：在售阶段
        client.put(f"/api/v1/projects/{project_ids[2]}/status", json={"status": "renovating"})
        client.put(f"/api/v1/projects/{project_ids[2]}/status", json={"status": "selling"})

        # 验证统计
        response = client.get("/api/v1/projects/stats")
        stats = response.json()["data"]
        assert stats["signing"] == 1
        assert stats["renovating"] == 1
        assert stats["selling"] == 1
        assert stats["sold"] == 0

    def test_status_transition_with_renovation_stage_constraint(self, client, sample_project_data):
        """测试改造阶段约束的状态流转"""
        project_id = self.create_test_project(client, sample_project_data)

        # 流转到改造阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})

        # 更新到非交付阶段
        renovation_data = {"renovation_stage": "水电"}
        client.put(f"/api/v1/projects/{project_id}/renovation", json=renovation_data)

        # 仍然可以流转到在售（业务规则允许）
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        assert response.status_code == 200

    def test_invalid_status_value(self, client, sample_project_data):
        """测试无效的状态值"""
        project_id = self.create_test_project(client, sample_project_data)

        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "invalid_status"})
        assert response.status_code == 422  # Pydantic验证错误

    def test_status_flow_with_operations_in_each_stage(self, client, sample_project_data):
        """测试在每个阶段进行相应操作的完整流程"""
        project_id = self.create_test_project(client, sample_project_data)

        # 1. 签约阶段：更新项目信息
        update_data = {"name": "更新后的项目名称"}
        response = client.put(f"/api/v1/projects/{project_id}", json=update_data)
        assert response.status_code == 200

        # 2. 改造阶段：更新改造阶段和上传照片
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})

        renovation_data = {"renovation_stage": "设计"}
        response = client.put(f"/api/v1/projects/{project_id}/renovation", json=renovation_data)
        assert response.status_code == 200

        photo_data = {
            "stage": "设计",
            "url": "https://example.com/design.jpg",
            "filename": "design.jpg"
        }
        response = client.post(f"/api/v1/projects/{project_id}/renovation/photos", params=photo_data)
        assert response.status_code == 200

        # 3. 在售阶段：更新销售角色和创建销售记录
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})

        roles_data = {
            "property_agent": "房源维护人",
            "client_agent": "客源维护人"
        }
        response = client.put(f"/api/v1/projects/{project_id}/selling/roles", json=roles_data)
        assert response.status_code == 200

        viewing_data = {
            "record_type": "viewing",
            "customer_name": "客户姓名",
            "customer_phone": "13800138000",
            "record_date": datetime.now().isoformat(),
            "notes": "带看记录"
        }
        response = client.post(f"/api/v1/projects/{project_id}/selling/viewings", json=viewing_data)
        assert response.status_code == 200

        # 4. 已售阶段：完成项目
        complete_data = {
            "sold_price": 1000000,
            "sold_date": datetime.now().isoformat()
        }
        response = client.post(f"/api/v1/projects/{project_id}/complete", json=complete_data)
        assert response.status_code == 200

        # 验证最终状态
        response = client.get(f"/api/v1/projects/{project_id}")
        final_data = response.json()["data"]
        assert final_data["status"] == "sold"
        assert final_data["sale_price"] == 1000000
        assert final_data["property_agent"] == "房源维护人"
        assert final_data["renovation_stage"] == "设计"""} "file_path":"C:\Users\Bugco\Desktop\test\profo\backend\tests\test_status_flow.py"}