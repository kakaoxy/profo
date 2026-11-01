"""商户管理 V08：门店地图点位、统计、坐标缺失与员工拜访轨迹."""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import BizDictItem, MerchantStore, OperationLog, Role, User
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash

API = "/api/v1"


def _c_client(session: Session, user: User) -> TestClient:
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "user", "ver": user.token_version},
        audience=AUDIENCE_C,
    )
    return TestClient(
        app,
        cookies={"c_access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )


@pytest.fixture(autouse=True)
def _seed_dicts(seeded_db: dict) -> None:
    session: Session = seeded_db["session"]
    existing = session.query(BizDictItem).filter(BizDictItem.dict_code == "merchant_cooperation_status").first()
    if existing is None:
        session.add(
            BizDictItem(
                dict_code="merchant_cooperation_status",
                code="not_cooperated",
                label="未合作",
                sort_order=10,
                enabled=True,
                is_builtin=True,
            ),
        )
        session.commit()


@pytest.fixture
def admin_client(seeded_db: dict) -> TestClient:
    """后台 admin 客户端（有 merchant:map）."""
    from main import app

    session: Session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    from utils.auth import AUDIENCE_ADMIN
    from utils.auth import create_access_token as _create

    token = _create(data={"sub": "admin-user", "role": "admin", "ver": 1}, audience=AUDIENCE_ADMIN)
    return TestClient(app, cookies={"access_token": token}, headers={"X-Requested-With": "XMLHttpRequest"})


@pytest.fixture
def employee(seeded_db: dict) -> User:
    session: Session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user_role = session.query(Role).filter(Role.code == "user").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"map-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="轨迹员工",
        role_id=customer_role.id,
        status="active",
    )
    user.roles.append(user_role)
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def employee_client(seeded_db: dict, employee: User) -> TestClient:
    return _c_client(seeded_db["session"], employee)


def _create_company(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/companies",
        json={"company_name": f"地图公司-{uuid.uuid4().hex[:6]}", "contact_phone": "13800001111"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_store(admin_client: TestClient, company_id: str, owner_id: str) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/stores",
        json={
            "company_id": company_id,
            "store_name": f"地图门店-{uuid.uuid4().hex[:5]}",
            "province": "上海市",
            "city": "上海市",
            "district": "浦东新区",
            "business_circle": "陆家嘴商圈",
            "address": "世纪大道 100 号",
            "lng": 121.5057,
            "lat": 31.2453,
            "contact_name": "王店长",
            "contact_phone": f"137{uuid.uuid4().int % 10**8:08d}",
            "cooperation_status": "not_cooperated",
            "owner_employee_id": owner_id,
            "force_create_reason": "测试数据",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()["store"]


def _create_visit(employee_client: TestClient, store_id: str, lng: float = 121.5057, lat: float = 31.2453) -> dict:
    resp = employee_client.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store_id,
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": lng,
            "lat": lat,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_map_points_stats_and_missing_coordinate(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """地图返回点位/统计/经纪人数；坐标缺失门店 has_coordinate=false."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    broker = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": "地图经纪人", "phone": f"135{uuid.uuid4().int % 10**8:08d}", "store_id": store["id"]},
    )
    assert broker.status_code == 201, broker.text

    session: Session = seeded_db["session"]
    missing = MerchantStore(
        company_id=company["id"],
        company_name=company["company_name"],
        store_name="坐标缺失门店",
        province="上海市",
        city="上海市",
        district="浦东新区",
        business_circle="陆家嘴商圈",
        address="无坐标地址",
        lng=None,
        lat=None,
        contact_name="李店长",
        contact_phone="13600001111",
        contact_phone_hash="hash",
        cooperation_status="not_cooperated",
        source="import",
        owner_employee_id=employee.id,
        status="normal",
        review_status="approved",
        is_deleted=False,
        last_visit_at=datetime.now(timezone.utc),
    )
    session.add(missing)
    session.commit()

    resp = admin_client.get(f"{API}/admin/merchant/map/stores")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    normal_point = next(point for point in body["points"] if point["id"] == store["id"])
    missing_point = next(point for point in body["points"] if point["id"] == missing.id)
    assert normal_point["has_coordinate"] is True
    assert normal_point["broker_count"] == 1
    assert missing_point["has_coordinate"] is False
    assert missing_point["lng"] is None
    assert body["stats"]["store_count"] == 2
    assert body["stats"]["broker_count"] == 1
    # REQ-M09-005：最近拜访时间倒序，无拜访记录的门店排在最后
    assert body["points"][0]["id"] == missing.id


def test_map_skips_non_gcj02_store(admin_client: TestClient, employee: User, seeded_db: dict) -> None:
    """REQ-M09-001：非 GCJ-02 坐标的门店不打点."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    session: Session = seeded_db["session"]
    session.query(MerchantStore).filter(MerchantStore.id == store["id"]).update({"coordinate_system": "bd09"})
    session.commit()

    resp = admin_client.get(f"{API}/admin/merchant/map/stores")
    assert resp.status_code == 200, resp.text
    ids = [point["id"] for point in resp.json()["points"]]
    assert store["id"] not in ids


def test_employee_track_ordered_and_audited(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """轨迹按时间升序返回，统计正确，查看写审计."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    first = _create_visit(employee_client, store["id"])
    second = _create_visit(employee_client, store["id"])
    assert first["visited_at"] <= second["visited_at"]

    today = datetime.now(timezone.utc).date().isoformat()
    resp = admin_client.get(
        f"{API}/admin/merchant/tracks?employee_id={employee.id}&start_date={today}&end_date={today}",
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["stats"]["visit_count"] == 2
    assert body["stats"]["store_count"] == 1
    assert body["items"][0]["has_coordinate"] is True

    log = (
        seeded_db["session"]
        .query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_track", OperationLog.resource_id == employee.id)
        .one()
    )
    assert log.action == "view"
    assert log.after["visit_count"] == 2


def test_track_range_limit(
    admin_client: TestClient,
    employee: User,
) -> None:
    """轨迹日期范围超过 31 天拒绝."""
    start = (datetime.now(timezone.utc).date() - timedelta(days=40)).isoformat()
    resp = admin_client.get(f"{API}/admin/merchant/tracks?employee_id={employee.id}&start_date={start}")
    assert resp.status_code == 400, resp.text
    assert "31" in resp.json()["message"]


def test_normal_user_forbidden_map(seeded_db: dict) -> None:
    """User 默认无 merchant:map，访问地图 403."""
    from main import app
    from utils.auth import AUDIENCE_ADMIN
    from utils.auth import create_access_token as _create

    session: Session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    user = seeded_db["users"]["normal"]
    token = _create(data={"sub": user.id, "role": "user", "ver": user.token_version}, audience=AUDIENCE_ADMIN)
    client = TestClient(app, cookies={"access_token": token}, headers={"X-Requested-With": "XMLHttpRequest"})
    resp = client.get(f"{API}/admin/merchant/map/stores")
    assert resp.status_code == 403, resp.text


pytestmark = pytest.mark.usefixtures("seeded_db")
