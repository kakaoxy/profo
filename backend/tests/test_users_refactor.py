
import pytest
from unittest.mock import MagicMock
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base
from main import app
from db import get_db
from dependencies.auth import get_current_admin_user, get_current_active_user

@pytest.fixture
def db_session():
    """Create in-memory database for testing"""
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite:///:memory:", 
        connect_args={"check_same_thread": False}, 
        poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()

# Test overrides
@pytest.fixture
def client_admin(db_session):
    """Create FastAPI test client with admin auth and test db"""
    
    # Override auth dependencies
    app.dependency_overrides[get_current_admin_user] = lambda: MagicMock(id="admin_id", username="admin", role_id="admin_role")
    app.dependency_overrides[get_current_active_user] = lambda: MagicMock(id="admin_id", username="admin", role_id="admin_role")
    app.dependency_overrides[get_db] = lambda: db_session
    
    with TestClient(app) as client:
        yield client
    
    # Clean up overrides
    app.dependency_overrides = {}

class TestRoleManagement:
    def test_create_and_get_role(self, client_admin):
        # Create role
        response = client_admin.post(
            "/api/users/roles",
            json={
                "name": "Test Role",
                "code": "test_role",
                "description": "Test description",
                "permissions": ["view_data"]
            }
        )
        assert response.status_code == 200, response.text
        role_data = response.json()
        assert role_data["name"] == "Test Role"
        role_id = role_data["id"]

        # Get role
        response = client_admin.get(f"/api/users/roles/{role_id}")
        assert response.status_code == 200
        assert response.json()["id"] == role_id

    def test_update_role(self, client_admin):
        # Create role
        create_res = client_admin.post(
            "/api/users/roles",
            json={"name": "Role To Update", "code": "update_role"}
        )
        assert create_res.status_code == 200, create_res.text
        role_id = create_res.json()["id"]

        # Update role
        response = client_admin.put(
            f"/api/users/roles/{role_id}",
            json={"name": "Updated Role Name"}
        )
        assert response.status_code == 200
        assert response.json()["name"] == "Updated Role Name"
        
        # Verify update
        get_res = client_admin.get(f"/api/users/roles/{role_id}")
        assert get_res.json()["name"] == "Updated Role Name"

    def test_delete_role(self, client_admin):
        # Create role
        create_res = client_admin.post(
            "/api/users/roles",
            json={"name": "Role To Delete", "code": "delete_role"}
        )
        role_id = create_res.json()["id"]

        # Delete role
        response = client_admin.delete(f"/api/users/roles/{role_id}")
        assert response.status_code == 200

        # Verify deletion
        get_res = client_admin.get(f"/api/users/roles/{role_id}")
        assert get_res.status_code == 404

class TestUserManagement:
    def test_create_and_get_user(self, client_admin, monkeypatch):
        # Mock password hash to avoid passlib/bcrypt incompatibility
        monkeypatch.setattr("services.user_service.get_password_hash", lambda p: f"hashed_{p}")

        # Create role for user first
        role_res = client_admin.post(
            "/api/users/roles",
            json={"name": "User Role", "code": "user_role"}
        )
        role_id = role_res.json()["id"]

        # Create user
        response = client_admin.post(
            "/api/users/users",
            json={
                "username": "newuser",
                "password": "StrongPassword123!",
                "nickname": "New User",
                "role_id": role_id
            }
        )
        assert response.status_code == 200, response.text
        user_data = response.json()
        assert user_data["username"] == "newuser"
        user_id = user_data["id"]

        # Get user
        response = client_admin.get(f"/api/users/users/{user_id}")
        assert response.status_code == 200
        assert response.json()["username"] == "newuser"

    def test_get_users_list(self, client_admin):
        response = client_admin.get("/api/users/users")
        assert response.status_code == 200
        assert "items" in response.json()
