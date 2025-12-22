
import pytest
from datetime import datetime, timedelta
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from main import app
from models import Base, Community, CommunityCompetitor, PropertyCurrent, PropertyStatus
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
def monitor_data(db_session):
    """Create sample data for monitoring tests"""
    # Communities
    c1 = Community(name="Community A", district="D1", avg_price_wan=5.0)
    c2 = Community(name="Community B", district="D1", avg_price_wan=5.2)
    c3 = Community(name="Community C", district="D2", avg_price_wan=4.8)
    db_session.add_all([c1, c2, c3])
    db_session.commit()
    
    # Competitor A -> B
    comp = CommunityCompetitor(community_id=c1.id, competitor_community_id=c2.id)
    db_session.add(comp)
    
    # Properties for C1
    # 1. Active High Floor
    p1 = PropertyCurrent(
        data_source="src", source_property_id="p1", community_id=c1.id,
        status=PropertyStatus.FOR_SALE, floor_level="高", floor_number=20,
        floor_original="20/30", orientation="South",
        listed_price_wan=500.0, build_area=100.0, rooms=3,
        listed_date=datetime.now()
    )
    # 2. Active Low Floor
    p2 = PropertyCurrent(
        data_source="src", source_property_id="p2", community_id=c1.id,
        status=PropertyStatus.FOR_SALE, floor_level="低", floor_number=2,
        floor_original="2/30", orientation="South",
        listed_price_wan=480.0, build_area=100.0, rooms=3,
        listed_date=datetime.now()
    )
    # 3. Sold High Floor (Recent)
    p3 = PropertyCurrent(
        data_source="src", source_property_id="p3", community_id=c1.id,
        status=PropertyStatus.SOLD, floor_level="高", floor_number=22,
        floor_original="22/30", orientation="South",
        sold_price_wan=490.0, build_area=100.0, rooms=3,
        sold_date=datetime.now() - timedelta(days=10)
    )
    # 4. Sold Mid Floor (Recent)
    p4 = PropertyCurrent(
        data_source="src", source_property_id="p4", community_id=c1.id,
        status=PropertyStatus.SOLD, floor_level="中", floor_number=10,
        floor_original="10/30", orientation="South",
        sold_price_wan=485.0, build_area=100.0, rooms=3,
        sold_date=datetime.now() - timedelta(days=20)
    )
    
    db_session.add_all([p1, p2, p3, p4])
    db_session.commit()
    
    return {"c1": c1, "c2": c2, "c3": c3}

def test_sentiment(client, monitor_data):
    c1_id = monitor_data["c1"].id
    response = client.get(f"/api/monitor/communities/{c1_id}/sentiment")
    assert response.status_code == 200
    data = response.json()
    
    # Check structure
    assert "floor_stats" in data
    assert "inventory_months" in data
    
    stats = data["floor_stats"]
    high = next(s for s in stats if s["type"] == "high")
    low = next(s for s in stats if s["type"] == "low")
    mid = next(s for s in stats if s["type"] == "mid")
    
    # High: 1 active, 1 sold
    assert high["current_count"] == 1
    assert high["deals_count"] == 1
    
    # Low: 1 active, 0 sold
    assert low["current_count"] == 1
    assert low["deals_count"] == 0
    
    # Mid: 0 active, 1 sold
    assert mid["current_count"] == 0
    assert mid["deals_count"] == 1
    
    # Inventory Months Calculation:
    # Total Active = 2
    # Total Deals (annualized) = 2 (in last <1 month, so monthly avg = 2/12 = 0.166)
    # inventory = 2 / 0.166 = 12
    # Wait, my logic for avg deals was: total deals in last 12 months / 12.
    # Total deals = 2 (p3, p4). Time range is irrelevant as long as it's within 1 year.
    # Monthly Avg = 2 / 12 = 0.16666
    # Inventory months = 2 / 0.1666 = 12.0
    assert data["inventory_months"] == 12.0

def test_trends(client, monitor_data):
    c1_id = monitor_data["c1"].id
    response = client.get(f"/api/monitor/communities/{c1_id}/trends")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    # Should have data for current month at least
    current_month = datetime.now().strftime("%Y-%m")
    month_data = next((d for d in data if d["month"] == current_month), None)
    assert month_data is not None
    assert month_data["volume"] >= 2 # p3 and p4 sold this month

def test_competitors(client, monitor_data):
    c1_id = monitor_data["c1"].id
    c2_id = monitor_data["c2"].id
    c3_id = monitor_data["c3"].id
    
    # 1. List
    resp = client.get(f"/api/communities/{c1_id}/competitors")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["community_id"] == c2_id
    
    # 2. Add
    resp = client.post(f"/api/communities/{c1_id}/competitors", json={"competitor_community_id": c3_id})
    assert resp.status_code == 200
    
    resp = client.get(f"/api/communities/{c1_id}/competitors")
    assert len(resp.json()) == 2
    
    # 3. Remove
    resp = client.delete(f"/api/communities/{c1_id}/competitors/{c2_id}")
    assert resp.status_code == 200
    
    resp = client.get(f"/api/communities/{c1_id}/competitors")
    assert len(resp.json()) == 1
    assert resp.json()[0]["community_id"] == c3_id

def test_ai_strategy(client):
    resp = client.post("/api/monitor/ai-strategy", json={"project_id": "123", "user_context": "urgent"})
    assert resp.status_code == 200
    data = resp.json()
    assert "report_markdown" in data
    assert "risk_points" in data
    assert "action_plan" in data
