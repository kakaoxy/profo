#!/usr/bin/env python3
"""
测试在售和已售状态之间的直接转换
"""
import sys
import os
from datetime import datetime

# 添加backend目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from db import get_db
from models import Base

# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_status_transition.db"
engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 正确的依赖覆盖实现
def override_get_db():
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()

app.dependency_overrides[get_db] = override_get_db

def test_selling_to_sold_direct_transition():
    """测试在售到已售的直接状态切换"""
    # 创建测试数据库表
    Base.metadata.create_all(bind=engine)
    
    with TestClient(app) as client:
        # 创建测试项目
        project_data = {
            "name": "测试项目",
            "community_name": "测试小区",
            "address": "测试地址",
            "owner_name": "测试业主",
            "owner_phone": "13800138000",
            "notes": "测试备注"
        }
        
        response = client.post("/api/v1/projects", json=project_data)
        project_id = response.json()["data"]["id"]
        
        # 流转到在售阶段
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "renovating"})
        client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        
        # 测试直接从在售切换到已售
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "sold"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "sold"
        
        # 测试直接从已售切换回在售
        response = client.put(f"/api/v1/projects/{project_id}/status", json={"status": "selling"})
        assert response.status_code == 200
        assert response.json()["data"]["status"] == "selling"
        
        print("所有测试通过！")
    
    # 清理测试数据库
    Base.metadata.drop_all(bind=engine)

if __name__ == "__main__":
    test_selling_to_sold_direct_transition()