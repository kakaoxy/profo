"""V08 高德地图 Key 后台配置：读写、清空、权限与地图页读取."""

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient

import db
from models import Role, SystemConfig, User
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash

API = "/api/v1"
AMAP_KEY = "amap_js_key"


def _client(session, user: User) -> TestClient:
    from main import app

    def _override_get_db() -> Generator:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "user", "ver": user.token_version},
        audience=AUDIENCE_ADMIN,
    )
    return TestClient(
        app,
        cookies={"access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )


@pytest.fixture
def admin_client(seeded_db: dict) -> TestClient:
    return _client(seeded_db["session"], seeded_db["users"]["admin"])


@pytest.fixture
def operator_client(seeded_db: dict) -> TestClient:
    session = seeded_db["session"]
    role = session.query(Role).filter(Role.code == "operator").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"amap-op-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="运营",
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    return _client(session, user)


def test_amap_config_save_read_and_clear(admin_client: TestClient, seeded_db: dict) -> None:
    """管理员保存 Key → 已配置；地图页读取同值；空值保存 = 清除."""
    initial = admin_client.get(f"{API}/amap-config")
    assert initial.status_code == 200, initial.text
    assert initial.json()["configured"] is False
    assert initial.json()["js_key"] == ""

    saved = admin_client.put(f"{API}/amap-config", json={"js_key": "  test-amap-key  "})
    assert saved.status_code == 200, saved.text
    assert saved.json()["configured"] is True
    assert saved.json()["js_key"] == "test-amap-key"
    assert saved.json()["updated_by_name"]

    map_config = admin_client.get(f"{API}/admin/merchant/map/config")
    assert map_config.status_code == 200, map_config.text
    assert map_config.json()["js_key"] == "test-amap-key"

    cleared = admin_client.put(f"{API}/amap-config", json={"js_key": "   "})
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["configured"] is False
    assert cleared.json()["js_key"] == ""

    session = seeded_db["session"]
    row = session.query(SystemConfig).filter(SystemConfig.key == AMAP_KEY).one()
    assert row.value == ""


def test_amap_config_requires_admin(operator_client: TestClient) -> None:
    """运营不可读写系统级地图配置（仅 admin）."""
    assert operator_client.get(f"{API}/amap-config").status_code == 403
    assert operator_client.put(f"{API}/amap-config", json={"js_key": "x"}).status_code == 403
