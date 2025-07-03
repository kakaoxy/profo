"""
测试配置和夹具
"""
import pytest
from typing import Generator
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlmodel import SQLModel

from app.core.database import get_db
from app.core.config import settings
from app.models import *  # 导入所有模型
from main import app

# 测试数据库URL
SQLALCHEMY_DATABASE_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, 
    connect_args={"check_same_thread": False}
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    """覆盖数据库依赖"""
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()


@pytest.fixture(scope="function")
def db() -> Generator:
    """数据库会话夹具"""
    # 创建测试数据库表
    SQLModel.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        # 清理测试数据库
        SQLModel.metadata.drop_all(bind=engine)


@pytest.fixture(scope="function")
def client(db) -> Generator:
    """测试客户端夹具"""
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c


@pytest.fixture
def test_user_data():
    """测试用户数据"""
    return {
        "username": "testuser",
        "password": "testpassword123",
        "nickname": "测试用户",
        "is_active": True
    }


@pytest.fixture
def test_city_data():
    """测试城市数据"""
    return {"name": "上海"}


@pytest.fixture
def test_agency_data():
    """测试中介公司数据"""
    return {"name": "链家"}


@pytest.fixture
def test_community_data():
    """测试小区数据"""
    return {
        "city_id": 1,
        "name": "汇成一村",
        "district": "徐汇",
        "business_circle": "上海南站",
        "address": "漕东路123弄"
    }


@pytest.fixture
def test_property_data():
    """测试房源数据"""
    return {
        "community_id": 1,
        "status": "在售",
        "layout_bedrooms": 2,
        "layout_living_rooms": 1,
        "layout_bathrooms": 1,
        "area_sqm": 55.0,
        "orientation": "双南",
        "floor_level": "中楼层",
        "total_floors": 6,
        "build_year": 1993,
        "listing_price_wan": 240.0
    }


@pytest.fixture
def authenticated_headers(client: TestClient, test_user_data: dict):
    """认证头部夹具"""
    # 注册用户
    response = client.post("/api/v1/auth/register", json=test_user_data)
    assert response.status_code == 200
    
    token_data = response.json()
    token = token_data["access_token"]
    
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def setup_basic_data(client: TestClient, authenticated_headers: dict):
    """设置基础测试数据"""
    # 创建城市
    city_response = client.post(
        "/api/v1/cities/",
        json={"name": "上海"},
        headers=authenticated_headers
    )
    city_id = city_response.json()["id"]
    
    # 创建中介公司
    agency_response = client.post(
        "/api/v1/agencies/",
        json={"name": "链家"},
        headers=authenticated_headers
    )
    agency_id = agency_response.json()["id"]
    
    # 创建小区
    community_response = client.post(
        "/api/v1/communities/",
        json={
            "city_id": city_id,
            "name": "汇成一村",
            "district": "徐汇",
            "business_circle": "上海南站"
        },
        headers=authenticated_headers
    )
    community_id = community_response.json()["id"]
    
    return {
        "city_id": city_id,
        "agency_id": agency_id,
        "community_id": community_id
    }
