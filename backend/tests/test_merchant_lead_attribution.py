"""商户管理 V06：线索五维归属、二级联动、估价代填自动归因."""

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import inspect
from sqlalchemy.orm import Session

import db
from models import BizDictItem, Lead, MerchantBroker, MerchantStore, OperationLog, Role, User
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone

API = "/api/v1"


def _client(session: Session, user: User, *, c_side: bool) -> TestClient:
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "user", "ver": user.token_version},
        audience=AUDIENCE_C if c_side else AUDIENCE_ADMIN,
    )
    return TestClient(
        app,
        cookies={"c_access_token" if c_side else "access_token": token},
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
    return _client(seeded_db["session"], seeded_db["users"]["admin"], c_side=False)


@pytest.fixture
def employee(seeded_db: dict) -> User:
    session: Session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user_role = session.query(Role).filter(Role.code == "user").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"lead-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="归属员工",
        role_id=customer_role.id,
        status="active",
    )
    user.roles.append(user_role)
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def customer_user(seeded_db: dict) -> User:
    session: Session = seeded_db["session"]
    role = session.query(Role).filter(Role.code == "customer").one()
    phone = f"139{uuid.uuid4().int % 10**8:08d}"
    user = User(
        id=str(uuid.uuid4()),
        username=f"lead-broker-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="经纪人",
        role_id=role.id,
        status="active",
        phone=phone,
        phone_hash=hash_phone(phone),
    )
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def customer_client(seeded_db: dict, customer_user: User) -> TestClient:
    return _client(seeded_db["session"], customer_user, c_side=True)


def _create_company(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/companies",
        json={"company_name": f"归属公司-{uuid.uuid4().hex[:6]}", "contact_phone": "13800001111"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_store(admin_client: TestClient, company_id: str, owner_employee_id: str) -> dict:
    payload = {
        "company_id": company_id,
        "store_name": f"归属门店-{uuid.uuid4().hex[:5]}",
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
        "owner_employee_id": owner_employee_id,
        "force_create_reason": "测试数据",
    }
    resp = admin_client.post(f"{API}/admin/merchant/stores", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["store"]


def _create_broker(admin_client: TestClient, store_id: str | None, name: str = "小李") -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": name, "phone": f"135{uuid.uuid4().int % 10**8:08d}", "store_id": store_id},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _register_broker(client: TestClient, employee_id: str | None = None) -> dict:
    extra = {"referrer": employee_id} if employee_id else {}
    resp = client.post(f"{API}/public/merchant/brokers/register", json={"name": "代填经纪人"} | extra)
    assert resp.status_code == 200, resp.text
    return resp.json()


def _create_lead(client: TestClient, **extra) -> dict:
    resp = client.post(
        f"{API}/leads",
        json={
            "community_name": "阳光花园",
            "layout": "2室1厅",
            "area": 89.5,
            "total_price": 300,
        }
        | extra,
    )
    assert resp.status_code in (200, 201), resp.text
    return resp.json()


def test_columns_migrated(seeded_db: dict) -> None:
    """Leads 五维归属列已存在."""
    columns = {col["name"] for col in inspect(seeded_db["session"].get_bind()).get_columns("leads")}
    for column in ("store_id", "broker_id", "store_owner_employee_id", "broker_inviter_employee_id"):
        assert column in columns


def test_lead_with_store_and_broker(admin_client: TestClient, employee: User, seeded_db: dict) -> None:
    """门店+经纪人+员工快照正确，归属完整；列表按门店/经纪人筛选."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    broker = _create_broker(admin_client, store["id"])

    lead = _create_lead(admin_client, store_id=store["id"], broker_id=broker["id"])
    assert lead["store_id"] == store["id"]
    assert lead["store_name"] == store["store_name"]
    assert lead["broker_id"] == broker["id"]
    assert lead["store_owner_employee_id"] == employee.id
    assert lead["store_owner_name"] == "归属员工"
    assert lead["attribution_status"] == "complete"

    listed = admin_client.get(f"{API}/leads?store_id={store['id']}&broker_id={broker['id']}")
    assert listed.status_code == 200
    assert listed.json()["total"] == 1
    assert listed.json()["items"][0]["broker_name"] == "小李"


def test_lead_attribution_employee_filter(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """归属员工筛选：分享员工/门店归属员工/经纪人邀请员工任一命中（V06 / BR-M07-021）."""
    session: Session = seeded_db["session"]
    session.add_all(
        [
            Lead(community_name="分享归因线索", referrer_id=employee.id),
            Lead(community_name="门店归属线索", store_owner_employee_id=employee.id),
            Lead(community_name="经纪人邀请线索", broker_inviter_employee_id=employee.id),
            Lead(community_name="无归属线索"),
        ],
    )
    session.commit()

    resp = admin_client.get(f"{API}/leads?attribution_employee_id={employee.id}")
    assert resp.status_code == 200, resp.text
    assert resp.json()["total"] == 3
    names = {item["community_name"] for item in resp.json()["items"]}
    assert names == {"分享归因线索", "门店归属线索", "经纪人邀请线索"}


def test_attribution_change_writes_audit_log(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """归属字段变更写审计日志（BR-M07-007 / AC-V06-016）."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    broker = _create_broker(admin_client, store["id"])
    lead = _create_lead(admin_client)

    updated = admin_client.put(
        f"{API}/leads/{lead['id']}",
        json={"store_id": store["id"], "broker_id": broker["id"]},
    )
    assert updated.status_code == 200, updated.text

    session: Session = seeded_db["session"]
    logs = (
        session.query(OperationLog)
        .filter(
            OperationLog.resource_type == "lead",
            OperationLog.resource_id == lead["id"],
            OperationLog.action == "update",
        )
        .all()
    )
    assert len(logs) == 1
    assert logs[0].before["store_id"] is None
    assert logs[0].after["store_id"] == store["id"]
    assert logs[0].after["store_owner_employee_id"] == employee.id
    assert logs[0].after["broker_id"] == broker["id"]


def test_employee_lead_list_scoped_to_own_attribution(seeded_db: dict) -> None:
    """员工（非 admin/operator）线索列表仅返回本人创建或本人归因线索."""
    session: Session = seeded_db["session"]
    user_role = session.query(Role).filter(Role.code == "user").one()
    employee = User(
        id=str(uuid.uuid4()),
        username=f"scope-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="范围员工",
        role_id=user_role.id,
        status="active",
    )
    session.add(employee)
    session.flush()
    session.add_all(
        [
            Lead(community_name="本人创建线索", creator_id=employee.id),
            Lead(community_name="本人归因线索", store_owner_employee_id=employee.id),
            Lead(community_name="他人线索"),
        ],
    )
    session.commit()

    employee_client = _client(session, employee, c_side=False)
    resp = employee_client.get(f"{API}/leads")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 2
    assert {item["community_name"] for item in body["items"]} == {"本人创建线索", "本人归因线索"}

    # 统计与列表同范围（V01 AC-V01-010 口径）
    stats = employee_client.get(f"{API}/leads/stats").json()
    assert stats["pending_assessment"] == 2


def test_lead_list_marks_disabled_or_deleted_attribution(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """门店/经纪人停用或门店删除：保留历史名称并返回状态标记（REQ-M07-004 分支 1）."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    broker = _create_broker(admin_client, store["id"])
    lead = _create_lead(admin_client, store_id=store["id"], broker_id=broker["id"])

    session: Session = seeded_db["session"]
    store_row = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    broker_row = session.query(MerchantBroker).filter(MerchantBroker.id == broker["id"]).one()
    store_row.status = "disabled"
    broker_row.bind_status = "disabled"
    session.commit()

    listed = admin_client.get(f"{API}/leads?store_id={store['id']}")
    assert listed.status_code == 200, listed.text
    item = listed.json()["items"][0]
    assert item["id"] == lead["id"]
    assert item["store_name"] == store["store_name"]
    assert item["store_status"] == "disabled"
    assert item["broker_status"] == "disabled"

    # 门店软删除后仍展示历史名称，状态标记为 deleted
    store_row.is_deleted = True
    session.commit()
    listed = admin_client.get(f"{API}/leads?store_id={store['id']}")
    item = listed.json()["items"][0]
    assert item["store_name"] == store["store_name"]
    assert item["store_status"] == "deleted"


def test_broker_options_for_lead_entry(admin_client: TestClient, employee: User, seeded_db: dict) -> None:
    """门店→经纪人二级联动选项：按门店只看有效绑定，未选门店可按姓名搜索."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    broker = _create_broker(admin_client, store["id"], name="联动经纪人")

    resp = admin_client.get(f"{API}/admin/merchant/brokers/options?store_id={store['id']}&bind_status=bound")
    assert resp.status_code == 200, resp.text
    items = resp.json()["items"]
    assert len(items) == 1
    assert items[0]["id"] == broker["id"]
    assert items[0]["store_id"] == store["id"]
    # 不暴露手机号等敏感字段
    assert "phone_masked" not in items[0]

    search = admin_client.get(f"{API}/admin/merchant/brokers/options?keyword=联动经纪人")
    assert search.status_code == 200, search.text
    assert {item["id"] for item in search.json()["items"]} == {broker["id"]}


def test_lead_broker_unbound_missing_store(admin_client: TestClient, seeded_db: dict) -> None:
    """仅经纪人且无绑定门店 → 缺门店/待审核."""
    broker = _create_broker(admin_client, None, name="独立经纪人")
    lead = _create_lead(admin_client, broker_id=broker["id"])
    assert lead["store_id"] is None
    assert lead["broker_id"] == broker["id"]
    assert lead["attribution_status"] == "missing_store"


def test_lead_broker_store_mismatch_rejected(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """经纪人不属于所选门店 → 拒绝."""
    company = _create_company(admin_client)
    store_a = _create_store(admin_client, company["id"], employee.id)
    store_b = _create_store(admin_client, company["id"], employee.id)
    broker = _create_broker(admin_client, store_a["id"])
    resp = admin_client.post(
        f"{API}/leads",
        json={"community_name": "阳光花园", "store_id": store_b["id"], "broker_id": broker["id"]},
    )
    assert resp.status_code == 400, resp.text


def test_broker_valuation_submit_auto_attribution(
    admin_client: TestClient,
    customer_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """经纪人代填估价：broker/store/邀请员工/分享员工五维并存."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    _register_broker(customer_client, employee.id)
    bind = customer_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": store["id"]})
    assert bind.status_code == 200, bind.text

    resp = customer_client.post(
        f"{API}/public/leads",
        json={
            "community_name": "阳光花园",
            "layout": "2室1厅",
            "floor_info": "6/12",
            "area": 89.5,
            "total_price": 300,
            "referrer": employee.id,
        },
    )
    assert resp.status_code == 201, resp.text
    lead = resp.json()
    session: Session = seeded_db["session"]
    row = session.query(Lead).filter(Lead.id == lead["id"]).one()
    assert row.referrer_id == employee.id
    assert row.store_id == store["id"]
    assert row.broker_id is not None
    assert row.store_owner_employee_id == employee.id
    assert row.broker_inviter_employee_id == employee.id


def test_update_clear_store_keeps_broker(admin_client: TestClient, employee: User, seeded_db: dict) -> None:
    """显式清空门店：门店/门店员工快照清空，经纪人保留."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    broker = _create_broker(admin_client, store["id"])
    lead = _create_lead(admin_client, store_id=store["id"], broker_id=broker["id"])
    updated = admin_client.put(f"{API}/leads/{lead['id']}", json={"store_id": None})
    assert updated.status_code == 200, updated.text
    assert updated.json()["store_id"] is None
    assert updated.json()["store_owner_employee_id"] is None
    assert updated.json()["broker_id"] == broker["id"]
    assert updated.json()["attribution_status"] == "missing_store"


def test_store_broker_linkage_and_broker_search(
    admin_client: TestClient,
    employee: User,
    customer_client: TestClient,
    seeded_db: dict,
) -> None:
    """门店有效经纪人联动；经纪人姓名搜索返回脱敏手机号."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    _register_broker(customer_client, employee.id)
    customer_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": store["id"]})
    client = _client(seeded_db["session"], employee, c_side=True)

    linked = client.get(f"{API}/public/merchant/stores/{store['id']}/brokers")
    assert linked.status_code == 200
    assert len(linked.json()) == 1
    assert linked.json()[0]["phone_masked"].startswith("139")

    searched = client.get(f"{API}/public/merchant/brokers/search?keyword=代填")
    assert searched.status_code == 200
    assert any(item["name"] == "代填经纪人" for item in searched.json())


def test_legacy_lead_shows_none(admin_client: TestClient, seeded_db: dict) -> None:
    """存量线索五维为空 → attribution_status=none，不报错."""
    lead = _create_lead(admin_client)
    assert lead["store_id"] is None
    assert lead["broker_id"] is None
    assert lead["attribution_status"] == "none"


pytestmark = pytest.mark.usefixtures("seeded_db")
