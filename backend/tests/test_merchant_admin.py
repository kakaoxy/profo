"""商户管理 V07：门店删除/合并/审核、详情聚合与 CSV 导出."""

import uuid
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import (
    BizDictItem,
    Lead,
    MerchantAgreement,
    MerchantBroker,
    MerchantBrokerBinding,
    MerchantStore,
    MerchantVisit,
    Role,
    User,
)
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone

API = "/api/v1"


def _client(session: Session, user: User, *, c_side: bool) -> TestClient:
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "admin", "ver": user.token_version},
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
        username=f"admin-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="门店负责员工",
        role_id=customer_role.id,
        status="active",
    )
    user.roles.append(user_role)
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def employee_client(seeded_db: dict, employee: User) -> TestClient:
    return _client(seeded_db["session"], employee, c_side=True)


@pytest.fixture
def customer_client(seeded_db: dict) -> TestClient:
    """纯 C 端客户账号（经纪人注册用，已绑定手机号）."""
    session: Session = seeded_db["session"]
    role = session.query(Role).filter(Role.code == "customer").one()
    phone = f"139{uuid.uuid4().int % 10**8:08d}"
    user = User(
        id=str(uuid.uuid4()),
        username=f"admin-broker-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="经纪人",
        role_id=role.id,
        status="active",
        phone=phone,
        phone_hash=hash_phone(phone),
    )
    session.add(user)
    session.commit()
    return _client(session, user, c_side=True)


def _create_company(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/companies",
        json={"company_name": f"后台公司-{uuid.uuid4().hex[:6]}", "contact_phone": "13800001111"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_store(admin_client: TestClient, company_id: str, owner_id: str, *, name: str | None = None) -> dict:
    payload = {
        "company_id": company_id,
        "store_name": name or f"后台门店-{uuid.uuid4().hex[:5]}",
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
    }
    resp = admin_client.post(f"{API}/admin/merchant/stores", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["store"]


def _create_broker(admin_client: TestClient, store_id: str | None) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": "经纪人", "phone": f"135{uuid.uuid4().int % 10**8:08d}", "store_id": store_id},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_visit(employee_client: TestClient, store_id: str) -> dict:
    resp = employee_client.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store_id,
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": 121.5057,
            "lat": 31.2453,
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_template(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/agreement-templates",
        json={"template_name": "后台模板", "cooperation_type": "store", "content": "合作条款", "version": "v1"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_agreement(employee_client: TestClient, store: dict, template_id: str) -> dict:
    resp = employee_client.post(
        f"{API}/public/merchant/agreements",
        json={
            "subject_type": "store",
            "store_id": store["id"],
            "template_id": template_id,
            "signer_name": store["contact_name"],
            "signer_phone": store["contact_phone"],
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_soft_delete_without_relations(admin_client: TestClient, employee: User, seeded_db: dict) -> None:
    """无关联门店软删成功，默认列表不可见."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    resp = admin_client.post(
        f"{API}/admin/merchant/stores/{store['id']}/delete",
        json={"reason": "重复录入"},
    )
    assert resp.status_code == 200, resp.text
    assert admin_client.get(f"{API}/admin/merchant/stores").json()["total"] == 0
    row = seeded_db["session"].query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    assert row.is_deleted is True


def test_soft_delete_with_relations_rejected(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """存在拜访/绑定/线索/协议时拒绝删除."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    _create_visit(employee_client, store["id"])
    resp = admin_client.post(
        f"{API}/admin/merchant/stores/{store['id']}/delete",
        json={"reason": "删除"},
    )
    assert resp.status_code == 409, resp.text
    assert "拜访记录" in resp.json()["message"]


def test_merge_migrates_relations(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """合并迁移拜访/绑定/经纪人/线索/协议，原门店标记已合并."""
    company = _create_company(admin_client)
    keep = _create_store(admin_client, company["id"], employee.id, name="保留门店")
    merged = _create_store(admin_client, company["id"], employee.id, name="被合并门店")
    broker = _create_broker(admin_client, merged["id"])
    _create_visit(employee_client, merged["id"])
    template = _create_template(admin_client)
    _create_agreement(employee_client, merged, template["id"])
    lead = admin_client.post(f"{API}/leads", json={"community_name": "阳光花园", "store_id": merged["id"]})
    assert lead.status_code == 201, lead.text

    resp = admin_client.post(
        f"{API}/admin/merchant/stores/merge",
        json={"keep_store_id": keep["id"], "merged_store_id": merged["id"], "reason": "重复门店"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["visits"] == 1
    assert resp.json()["brokers"] == 1
    assert resp.json()["agreements"] == 1
    assert resp.json()["leads"] == 1

    session: Session = seeded_db["session"]
    old = session.query(MerchantStore).filter(MerchantStore.id == merged["id"]).one()
    assert old.status == "merged"
    assert old.merged_to_store_id == keep["id"]
    assert old.former_store_no == "被合并门店"
    assert session.query(MerchantVisit).filter(MerchantVisit.store_id == keep["id"]).count() == 1
    assert session.query(Lead).filter(Lead.store_id == keep["id"]).count() == 1
    assert session.query(MerchantAgreement).filter(MerchantAgreement.store_id == keep["id"]).count() == 1
    assert session.query(MerchantBroker).filter(MerchantBroker.id == broker["id"]).one().store_id == keep["id"]
    assert session.query(MerchantBrokerBinding).filter(MerchantBrokerBinding.store_id == keep["id"]).count() == 1
    keep_row = session.query(MerchantStore).filter(MerchantStore.id == keep["id"]).one()
    assert keep_row.last_visit_at is not None


def test_store_detail_aggregation(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """详情聚合档案/经纪人/拜访/协议/线索统计."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    _create_broker(admin_client, store["id"])
    _create_visit(employee_client, store["id"])
    template = _create_template(admin_client)
    _create_agreement(employee_client, store, template["id"])
    admin_client.post(f"{API}/leads", json={"community_name": "阳光花园", "store_id": store["id"]})

    detail = admin_client.get(f"{API}/admin/merchant/stores/{store['id']}/detail")
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["store"]["id"] == store["id"]
    assert len(body["brokers"]) == 1
    assert body["visits"]["total"] == 1
    assert len(body["agreements"]) == 1
    assert body["lead_stats"]["total"] == 1


def test_export_stores_csv_masked(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """CSV 导出返回文件流且手机号脱敏."""
    company = _create_company(admin_client)
    _create_store(admin_client, company["id"], employee.id)
    resp = admin_client.get(f"{API}/admin/merchant/stores/export")
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/csv")
    content = resp.content.decode("utf-8-sig")
    assert "门店名称" in content
    assert "****" in content


def test_edit_legacy_store_with_null_coordinates(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """存量门店经纬度为空时编辑坐标不应触发 500."""
    session: Session = seeded_db["session"]
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    row = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    row.lng = None
    row.lat = None
    session.commit()

    resp = admin_client.put(
        f"{API}/admin/merchant/stores/{store['id']}",
        json={"lng": 121.5, "lat": 31.24, "change_type": "correct", "change_reason": "补齐坐标"},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["lng"] == 121.5
    assert resp.json()["lat"] == 31.24


def test_review_broker_store_approve_and_merge(
    admin_client: TestClient,
    employee: User,
    customer_client: TestClient,
    seeded_db: dict,
) -> None:
    """经纪人自建门店 admin 转正；合并到已有门店."""
    company = _create_company(admin_client)
    keep = _create_store(admin_client, company["id"], employee.id, name="保留门店")

    # 经纪人注册并自建门店
    register = customer_client.post(
        f"{API}/public/merchant/brokers/register",
        json={"name": "建店经纪人"},
    )
    assert register.status_code == 200, register.text
    payload = {
        "company_id": company["id"],
        "store_name": f"自建门店-{uuid.uuid4().hex[:5]}",
        "province": "上海市",
        "city": "上海市",
        "district": "浦东新区",
        "business_circle": "陆家嘴商圈",
        "address": "浦东南路 200 号",
        "lng": 121.51,
        "lat": 31.24,
        "contact_name": "李店长",
        "contact_phone": "13600003333",
        "cooperation_status": "not_cooperated",
        "force_create_reason": "测试数据",
    }
    created = customer_client.post(f"{API}/public/merchant/brokers/me/store", json=payload)
    assert created.status_code == 201, created.text
    pending_store = created.json()["store"]
    assert pending_store["review_status"] == "pending"

    approve = admin_client.post(
        f"{API}/admin/merchant/stores/{pending_store['id']}/review",
        json={"action": "approve"},
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["review_status"] == "approved"

    # 第二家自建门店合并到保留门店
    payload["store_name"] = f"待合并自建店-{uuid.uuid4().hex[:5]}"
    payload["address"] = "浦东南路 300 号"
    second = customer_client.post(f"{API}/public/merchant/brokers/me/store", json=payload)
    assert second.status_code == 201, second.text
    second_store = second.json()["store"]
    merge = admin_client.post(
        f"{API}/admin/merchant/stores/{second_store['id']}/review",
        json={"action": "merge", "target_store_id": keep["id"]},
    )
    assert merge.status_code == 200, merge.text
    session: Session = seeded_db["session"]
    row = session.query(MerchantStore).filter(MerchantStore.id == second_store["id"]).one()
    assert row.status == "merged"
    assert row.review_status == "merged"


pytestmark = pytest.mark.usefixtures("seeded_db")
