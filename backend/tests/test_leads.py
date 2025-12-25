"""
Leads API Tests
"""
import pytest
import sys
import os
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime

# Add backend directory to Python path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Set mock env vars for Settings validation
os.environ["JWT_SECRET_KEY"] = "test_secret_key_must_be_at_least_32_bytes_long"
os.environ["WECHAT_APPID"] = "test_appid"
os.environ["WECHAT_SECRET"] = "test_secret"
os.environ["DATABASE_URL"] = "sqlite:///./test_settings.db"  # Prevent touching prod DB

from main import app
from db import get_db, init_db
from models import Base, User
from models.lead import LeadStatus
import main # Import module to patch
from dependencies.auth import get_current_user

# Patch init_db to prevent side effects on startup
main.init_db = lambda: None

# Test database configuration
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_leads.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def override_get_db():
    try:
        db = TestingSessionLocal()
        yield db
    finally:
        db.close()

def override_get_current_user():
    # Return a mock user object
    return User(id="test_user_id", username="testuser", role_id="test_role", password="hashed_pwd")

app.dependency_overrides[get_db] = override_get_db
app.dependency_overrides[get_current_user] = override_get_current_user

@pytest.fixture(scope="function")
def client():
    Base.metadata.create_all(bind=engine)
    with TestClient(app) as test_client:
        yield test_client
    Base.metadata.drop_all(bind=engine)
    engine.dispose()  # Close connection to release file lock
    if os.path.exists("./test_leads.db"):
        os.remove("./test_leads.db")

@pytest.fixture
def sample_lead_data():
    return {
        "community_name": "Test Community",
        "layout": "2室1厅",
        "orientation": "South",
        "floor_info": "Middle",
        "area": 90.5,
        "total_price": 5000000,
        "unit_price": 55248,
        "district": "Test District",
        "business_area": "Test Area",
        "remarks": "Test Remarks"
    }

class TestLeadsAPI:
    """Test Leads API functionality"""

    def test_create_lead(self, client, sample_lead_data):
        """Test creating a new lead"""
        response = client.post("/api/v1/leads/", json=sample_lead_data)
        if response.status_code != 200:
            print(f"\nCreate Lead Failed: {response.json()}")
        assert response.status_code == 200
        data = response.json()
        assert data["community_name"] == sample_lead_data["community_name"]
        assert data["status"] == "pending_assessment"
        assert "id" in data

    def test_get_leads_list(self, client, sample_lead_data):
        """Test retrieving leads list"""
        client.post("/api/v1/leads/", json=sample_lead_data)
        response = client.get("/api/v1/leads/")
        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 1
        assert len(data["items"]) == 1
        assert data["items"][0]["community_name"] == sample_lead_data["community_name"]

    def test_filter_leads_by_status(self, client, sample_lead_data):
        """Test filtering leads by status"""
        # Create one default (pending_assessment)
        client.post("/api/v1/leads/", json=sample_lead_data)
        
        # Create another and update to visited
        res = client.post("/api/v1/leads/", json={**sample_lead_data, "community_name": "Visited Community"})
        lead_id = res.json()["id"]
        client.put(f"/api/v1/leads/{lead_id}", json={"status": "visited"})

        # Filter for pending_assessment
        response = client.get("/api/v1/leads/", params={"statuses": ["pending_assessment"]})
        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["items"][0]["community_name"] == "Test Community"

        # Filter for visited
        response = client.get("/api/v1/leads/", params={"statuses": ["visited"]})
        assert response.status_code == 200
        assert response.json()["total"] == 1
        assert response.json()["items"][0]["community_name"] == "Visited Community"

    def test_update_lead(self, client, sample_lead_data):
        """Test updating lead details and status audit"""
        res = client.post("/api/v1/leads/", json=sample_lead_data)
        lead_id = res.json()["id"]

        update_payload = {
            "status": "pending_visit",
            "eval_price": 4800000,
            "audit_reason": "Price is reasonable"
        }
        response = client.put(f"/api/v1/leads/{lead_id}", json=update_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "pending_visit"
        assert data["eval_price"] == 4800000
        assert data["audit_reason"] == "Price is reasonable"

    def test_add_follow_up(self, client, sample_lead_data):
        """Test adding a follow-up record"""
        res = client.post("/api/v1/leads/", json=sample_lead_data)
        lead_id = res.json()["id"]

        follow_up_payload = {
            "method": "phone",
            "content": "Called the owner, interested in selling."
        }
        response = client.post(f"/api/v1/leads/{lead_id}/follow-ups", json=follow_up_payload)
        assert response.status_code == 200
        data = response.json()
        assert data["method"] == "phone"
        assert data["content"] == "Called the owner, interested in selling."
        assert data["lead_id"] == lead_id

    def test_get_lead_detail(self, client, sample_lead_data):
        """Test getting single lead details"""
        res = client.post("/api/v1/leads/", json=sample_lead_data)
        lead_id = res.json()["id"]

        response = client.get(f"/api/v1/leads/{lead_id}")
        assert response.status_code == 200
        data = response.json()
        assert data["id"] == lead_id
        assert data["community_name"] == sample_lead_data["community_name"]
