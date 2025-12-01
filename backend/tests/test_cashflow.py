"""
现金流相关API测试
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
from db import get_db, Base
from models import Project, CashFlowRecord
from models.base import CashFlowType, CashFlowCategory


# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_cashflow.db"
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


class TestCashFlowAPI:
    """测试现金流相关API"""

    def create_test_project(self, client, project_data):
        """辅助方法：创建测试项目"""
        response = client.post("/api/v1/projects", json=project_data)
        return response.json()["data"]["id"]

    def test_create_income_record(self, client, sample_project_data):
        """测试创建收入记录"""
        project_id = self.create_test_project(client, sample_project_data)

        income_data = {
            "type": "income",
            "category": "售房款",
            "amount": 1000000,
            "date": datetime.now().isoformat(),
            "description": "售房收入",
            "related_stage": "在售阶段"
        }

        response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=income_data)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["msg"] == "success"
        assert data["data"]["type"] == "income"
        assert data["data"]["category"] == "售房款"
        assert data["data"]["amount"] == 1000000

    def test_create_expense_record(self, client, sample_project_data):
        """测试创建支出记录"""
        project_id = self.create_test_project(client, sample_project_data)

        expense_data = {
            "type": "expense",
            "category": "装修费",
            "amount": 50000,
            "date": datetime.now().isoformat(),
            "description": "装修费用",
            "related_stage": "改造阶段"
        }

        response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=expense_data)
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["msg"] == "success"
        assert data["data"]["type"] == "expense"
        assert data["data"]["category"] == "装修费"
        assert data["data"]["amount"] == 50000

    def test_invalid_category_type_combination(self, client, sample_project_data):
        """测试无效的现金流类型和分类组合"""
        project_id = self.create_test_project(client, sample_project_data)

        # 收入类型使用支出分类（应该失败）
        invalid_data = {
            "type": "income",
            "category": "装修费",  # 这是支出分类
            "amount": 50000,
            "date": datetime.now().isoformat(),
            "description": "无效记录"
        }

        response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=invalid_data)
        assert response.status_code == 400
        data = response.json()
        assert "收入类型不能使用分类" in data["detail"]

        # 支出类型使用收入分类（应该失败）
        invalid_data2 = {
            "type": "expense",
            "category": "售房款",  # 这是收入分类
            "amount": 1000000,
            "date": datetime.now().isoformat(),
            "description": "无效记录"
        }

        response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=invalid_data2)
        assert response.status_code == 400
        data = response.json()
        assert "支出类型不能使用分类" in data["detail"]

    def test_get_cashflow_summary(self, client, sample_project_data):
        """测试获取现金流汇总"""
        project_id = self.create_test_project(client, sample_project_data)

        # 创建收入记录
        income_data = {
            "type": "income",
            "category": "售房款",
            "amount": 1000000,
            "date": datetime.now().isoformat(),
            "description": "售房收入"
        }
        client.post(f"/api/v1/projects/{project_id}/cashflow", json=income_data)

        # 创建支出记录
        expense_data = {
            "type": "expense",
            "category": "装修费",
            "amount": 200000,
            "date": datetime.now().isoformat(),
            "description": "装修费用"
        }
        client.post(f"/api/v1/projects/{project_id}/cashflow", json=expense_data)

        # 获取现金流汇总
        response = client.get(f"/api/v1/projects/{project_id}/cashflow")
        assert response.status_code == 200
        data = response.json()
        assert data["code"] == 200
        assert data["msg"] == "success"

        # 验证汇总数据
        summary = data["data"]["summary"]
        assert summary["total_income"] == 1000000
        assert summary["total_expense"] == 200000
        assert summary["net_cash_flow"] == 800000
        assert summary["roi"] == 4.0  # (1000000-200000)/200000 = 4.0

        # 验证明细数据
        records = data["data"]["records"]
        assert len(records) == 2

    def test_get_cashflow_records(self, client, sample_project_data):
        """测试获取现金流记录列表"""
        project_id = self.create_test_project(client, sample_project_data)

        # 创建多个现金流记录
        records_data = [
            {
                "type": "expense",
                "category": "履约保证金",
                "amount": 10000,
                "date": datetime.now().isoformat(),
                "description": "保证金"
            },
            {
                "type": "expense",
                "category": "中介佣金",
                "amount": 30000,
                "date": datetime.now().isoformat(),
                "description": "中介费"
            },
            {
                "type": "income",
                "category": "溢价款",
                "amount": 50000,
                "date": datetime.now().isoformat(),
                "description": "溢价收入"
            }
        ]

        for record_data in records_data:
            client.post(f"/api/v1/projects/{project_id}/cashflow", json=record_data)

        # 获取现金流记录
        response = client.get(f"/api/v1/projects/{project_id}/cashflow")
        assert response.status_code == 200
        data = response.json()
        assert len(data["data"]["records"]) == 3

    def test_delete_cashflow_record(self, client, sample_project_data):
        """测试删除现金流记录"""
        project_id = self.create_test_project(client, sample_project_data)

        # 创建现金流记录
        record_data = {
            "type": "expense",
            "category": "装修费",
            "amount": 50000,
            "date": datetime.now().isoformat(),
            "description": "装修费用"
        }
        create_response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=record_data)
        record_id = create_response.json()["data"]["id"]

        # 删除记录
        response = client.delete(f"/api/v1/cashflow/{record_id}?project_id={project_id}")
        assert response.status_code == 200

        # 验证记录已删除
        response = client.get(f"/api/v1/projects/{project_id}/cashflow")
        data = response.json()
        assert len(data["data"]["records"]) == 0

    def test_delete_nonexistent_cashflow_record(self, client, sample_project_data):
        """测试删除不存在的现金流记录"""
        project_id = self.create_test_project(client, sample_project_data)
        fake_record_id = "nonexistent-record-id"

        response = client.delete(f"/api/v1/cashflow/{fake_record_id}?project_id={project_id}")
        assert response.status_code == 404
        data = response.json()
        assert "现金流记录不存在" in data["detail"]

    def test_create_cashflow_record_for_nonexistent_project(self, client):
        """测试为不存在的项目创建现金流记录"""
        fake_project_id = "nonexistent-project-id"

        record_data = {
            "type": "expense",
            "category": "装修费",
            "amount": 50000,
            "date": datetime.now().isoformat(),
            "description": "装修费用"
        }

        response = client.post(f"/api/v1/projects/{fake_project_id}/cashflow", json=record_data)
        assert response.status_code == 404
        data = response.json()
        assert "项目不存在" in data["detail"]

    def test_cashflow_summary_with_zero_expense(self, client, sample_project_data):
        """测试只有收入没有支出的现金流汇总"""
        project_id = self.create_test_project(client, sample_project_data)

        # 只创建收入记录
        income_data = {
            "type": "income",
            "category": "售房款",
            "amount": 1000000,
            "date": datetime.now().isoformat(),
            "description": "售房收入"
        }
        client.post(f"/api/v1/projects/{project_id}/cashflow", json=income_data)

        # 获取现金流汇总
        response = client.get(f"/api/v1/projects/{project_id}/cashflow")
        data = response.json()
        summary = data["data"]["summary"]
        assert summary["total_income"] == 1000000
        assert summary["total_expense"] == 0
        assert summary["net_cash_flow"] == 1000000
        assert summary["roi"] == 0.0  # 支出为0时，ROI为0

    def test_cashflow_categories_validation(self, client, sample_project_data):
        """测试所有现金流分类的验证"""
        project_id = self.create_test_project(client, sample_project_data)

        # 测试所有有效的支出分类
        expense_categories = [
            "履约保证金",
            "中介佣金",
            "装修费",
            "营销费",
            "其他支出",
            "税费",
            "运营杂费"
        ]

        for category in expense_categories:
            record_data = {
                "type": "expense",
                "category": category,
                "amount": 1000,
                "date": datetime.now().isoformat(),
                "description": f"测试{category}"
            }
            response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=record_data)
            assert response.status_code == 200, f"支出分类 {category} 应该有效"

        # 测试所有有效的收入分类
        income_categories = [
            "回收保证金",
            "溢价款",
            "服务费",
            "其他收入",
            "售房款"
        ]

        for category in income_categories:
            record_data = {
                "type": "income",
                "category": category,
                "amount": 1000,
                "date": datetime.now().isoformat(),
                "description": f"测试{category}"
            }
            response = client.post(f"/api/v1/projects/{project_id}/cashflow", json=record_data)
            assert response.status_code == 200, f"收入分类 {category} 应该有效"""}