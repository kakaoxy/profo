from fastapi.testclient import TestClient
import sys
import os

# Ensure backend root is in sys.path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from main import app
from dependencies.auth import get_current_operator_user

client = TestClient(app)

# Mock Auth
async def mock_get_current_operator_user():
    return {"id": "test-admin-id", "role": {"code": "admin"}, "name": "Test Admin"}

app.dependency_overrides[get_current_operator_user] = mock_get_current_operator_user

def test_admin_mini_projects_flow():
    # 1. List Projects (Should be success)
    response = client.get("/api/v1/admin/mini/projects")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data

    # 2. Create Consultant
    consultant_data = {"name": "Test Consultant", "role": "Manager"}
    response = client.post("/api/v1/admin/mini/consultants", json=consultant_data)
    assert response.status_code == 200, response.text
    c_id = response.json()["id"]

    # 3. Create Independent Project
    project_data = {
        "title": "Test Mini Project",
        "consultant_id": c_id
    }
    response = client.post("/api/v1/admin/mini/projects", json=project_data)
    assert response.status_code == 200, response.text
    p_id = response.json()["id"]
    
    # 4. Get Project
    response = client.get(f"/api/v1/admin/mini/projects/{p_id}")
    assert response.status_code == 200
    assert response.json()["title"] == "Test Mini Project"
    
    # 5. Add Photo (Mocking URL)
    photo_data = {
        "image_url": "http://example.com/test.jpg",
        "renovation_stage": "design"
    }
    response = client.post(f"/api/v1/admin/mini/projects/{p_id}/photos", json=photo_data)
    assert response.status_code == 200, response.text
    assert response.json()["image_url"] == "http://example.com/test.jpg"
    
    # 6. Verify Photos List
    response = client.get(f"/api/v1/admin/mini/projects/{p_id}/photos")
    assert response.status_code == 200
    assert len(response.json()) == 1
