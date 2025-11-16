"""
API 集成测试 - 房源查询接口
测试 requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.10
"""
import pytest
from datetime import datetime
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import Base, Community, PropertyCurrent, PropertyStatus
from db import get_db


@pytest.fixture
def db_session():
    """Create in-memory database for testing"""
    engine = create_engine(
        "sqlite:///:memory:",
        echo=False,
        connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def client(db_session):
    """Create test client with database override"""
    def override_get_db():
        try:
            yield db_session
        finally:
            pass
    
    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


@pytest.fixture
def sample_data(db_session):
    """Create sample data for testing"""
    # Create communities
    community1 = Community(
        name="测试小区A", district="朝阳区", business_circle="CBD",
        is_active=True, created_at=datetime.now(), updated_at=datetime.now()
    )
    community2 = Community(
        name="测试小区B", district="海淀区", business_circle="中关村",
        is_active=True, created_at=datetime.now(), updated_at=datetime.now()
    )
    db_session.add_all([community1, community2])
    db_session.commit()
    
    # Create properties - for sale
    prop1 = PropertyCurrent(
        data_source="链家", source_property_id="TEST001", community_id=community1.id,
        status=PropertyStatus.FOR_SALE, rooms=3, halls=2, baths=2, orientation="南",
        floor_original="15/28", floor_number=15, total_floors=28, floor_level="中楼层",
        build_area=120.5, listed_price_wan=800.0, listed_date=datetime(2024, 1, 1),
        is_active=True, created_at=datetime.now(), updated_at=datetime.now()
    )
    prop2 = PropertyCurrent(
        data_source="贝壳", source_property_id="TEST002", community_id=community1.id,
        status=PropertyStatus.FOR_SALE, rooms=2, halls=1, baths=1, orientation="东南",
        floor_original="8/18", floor_number=8, total_floors=18, floor_level="中楼层",
        build_area=85.0, listed_price_wan=550.0, listed_date=datetime(2024, 1, 15),
        is_active=True, created_at=datetime.now(), updated_at=datetime.now()
    )
    prop3 = PropertyCurrent(
        data_source="链家", source_property_id="TEST003", community_id=community2.id,
        status=PropertyStatus.FOR_SALE, rooms=4, halls=2, baths=2, orientation="南北",
        floor_original="20/30", floor_number=20, total_floors=30, floor_level="高楼层",
        build_area=150.0, listed_price_wan=1200.0, listed_date=datetime(2024, 2, 1),
        is_active=True, created_at=datetime.now(), updated_at=datetime.now()
    )
    
    # Create properties - sold
    prop4 = PropertyCurrent(
        data_source="链家", source_property_id="TEST004", community_id=community1.id,
        status=PropertyStatus.SOLD, rooms=2, halls=1, baths=1, orientation="东",
        floor_original="5/10", floor_number=5, total_floors=10, floor_level="中楼层",
        build_area=75.0, sold_price_wan=480.0, listed_date=datetime(2024, 1, 1),
        sold_date=datetime(2024, 3, 15), is_active=True,
        created_at=datetime.now(), updated_at=datetime.now()
    )
    prop5 = PropertyCurrent(
        data_source="贝壳", source_property_id="TEST005", community_id=community2.id,
        status=PropertyStatus.SOLD, rooms=3, halls=2, baths=2, orientation="南",
        floor_original="12/20", floor_number=12, total_floors=20, floor_level="中楼层",
        build_area=110.0, sold_price_wan=750.0, listed_date=datetime(2024, 1, 10),
        sold_date=datetime(2024, 2, 20), is_active=True,
        created_at=datetime.now(), updated_at=datetime.now()
    )
    
    db_session.add_all([prop1, prop2, prop3, prop4, prop5])
    db_session.commit()
    
    return {"communities": [community1, community2]}


def test_query_all_properties(client, sample_data):
    """Test querying all properties without filters - Requirement 4.1"""
    response = client.get("/api/properties")
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert len(data["items"]) == 5


def test_filter_by_status_for_sale(client, sample_data):
    """Test filtering by status (在售) - Requirement 4.1"""
    response = client.get("/api/properties", params={"status": "在售"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3
    for item in data["items"]:
        assert item["status"] == "在售"


def test_filter_by_status_sold(client, sample_data):
    """Test filtering by status (成交) - Requirement 4.1"""
    response = client.get("/api/properties", params={"status": "成交"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2
    for item in data["items"]:
        assert item["status"] == "成交"


def test_filter_by_community_name(client, sample_data):
    """Test filtering by community name - Requirement 4.2"""
    response = client.get("/api/properties", params={"community_name": "测试小区A"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3


def test_filter_by_price_range(client, sample_data):
    """Test filtering by price range - Requirement 4.3"""
    response = client.get("/api/properties", params={
        "status": "在售", "min_price": 500, "max_price": 900
    })
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 2


def test_filter_by_area_range(client, sample_data):
    """Test filtering by area range - Requirement 4.4"""
    response = client.get("/api/properties", params={"min_area": 80, "max_area": 120})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 3


def test_filter_by_rooms(client, sample_data):
    """Test filtering by room types - Requirement 4.5"""
    response = client.get("/api/properties", params={"rooms": "2,3"})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 4


def test_sort_by_price_ascending(client, sample_data):
    """Test sorting by price ascending - Requirement 4.7"""
    response = client.get("/api/properties", params={
        "status": "在售", "sort_by": "listed_price_wan", "sort_order": "asc"
    })
    assert response.status_code == 200
    data = response.json()
    prices = [item["total_price"] for item in data["items"]]
    assert prices == sorted(prices)


def test_pagination(client, sample_data):
    """Test pagination - Requirement 4.8"""
    response = client.get("/api/properties", params={"page": 1, "page_size": 2})
    assert response.status_code == 200
    data = response.json()
    assert data["total"] == 5
    assert data["page"] == 1
    assert len(data["items"]) == 2


def test_calculated_unit_price(client, sample_data):
    """Test unit price calculation - Requirement 4.10"""
    response = client.get("/api/properties", params={"status": "在售"})
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        expected = round((item["total_price"] * 10000) / item["build_area"], 2)
        assert item["unit_price"] == expected


def test_calculated_transaction_duration(client, sample_data):
    """Test transaction duration calculation - Requirement 4.10"""
    response = client.get("/api/properties", params={"status": "成交"})
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert item["transaction_duration_days"] is not None
        assert item["transaction_duration_days"] > 0
