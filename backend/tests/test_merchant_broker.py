"""商户管理 V04：经纪人认证、绑定/换绑/解绑审核、二维码与自建门店."""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import (
    BizDictItem,
    Lead,
    LeadFollowUp,
    MerchantBroker,
    MerchantCompany,
    MerchantStore,
    MerchantStoreQRCode,
    RecruitLead,
    RecruitLeadStatus,
    Role,
    User,
)
from models.common.base import FollowUpMethod
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone

API = "/api/v1"


def _client(session: Session, user: User, *, c_side: bool) -> TestClient:
    """构造已认证客户端."""
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "customer", "ver": user.token_version},
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
    seeds = [
        ("merchant_cooperation_status", "not_cooperated", "未合作", 10),
        ("merchant_cooperation_status", "negotiating", "洽谈中", 20),
        ("merchant_visit_result", "interested", "有意向", 20),
    ]
    existing = {
        (row.dict_code, row.code)
        for row in session.query(BizDictItem).filter(BizDictItem.dict_code.like("merchant_%")).all()
    }
    for dict_code, code, label, sort_order in seeds:
        if (dict_code, code) in existing:
            continue
        session.add(
            BizDictItem(
                dict_code=dict_code,
                code=code,
                label=label,
                sort_order=sort_order,
                enabled=True,
                is_builtin=True,
            ),
        )
    session.commit()


@pytest.fixture
def customer_user(seeded_db: dict) -> User:
    """纯 C 端客户账号（已绑定手机号）."""
    session: Session = seeded_db["session"]
    role = session.query(Role).filter(Role.code == "customer").one()
    phone = f"139{uuid.uuid4().int % 10**8:08d}"
    user = User(
        id=str(uuid.uuid4()),
        username=f"broker-{uuid.uuid4().hex[:8]}",
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
def broker_client(seeded_db: dict, customer_user: User) -> TestClient:
    return _client(seeded_db["session"], customer_user, c_side=True)


@pytest.fixture
def employee(seeded_db: dict) -> User:
    """C 端员工账号（customer 主 + user 附加），用于生成邀请/分享归因."""
    session: Session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user_role = session.query(Role).filter(Role.code == "user").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"broker-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="拓展员工",
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
def admin_client(seeded_db: dict) -> TestClient:
    return _client(seeded_db["session"], seeded_db["users"]["admin"], c_side=False)


def _create_company(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/companies",
        json={"company_name": f"经纪公司-{uuid.uuid4().hex[:6]}", "contact_phone": "13800001111"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_store(admin_client: TestClient, company_id: str, *, review_status: str | None = None) -> dict:
    payload = {
        "company_id": company_id,
        "store_name": f"门店-{uuid.uuid4().hex[:5]}",
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
        "force_create_reason": "测试数据",
    }
    resp = admin_client.post(f"{API}/admin/merchant/stores", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["store"]


def _register(broker_client: TestClient, name: str = "小李", **extra) -> dict:
    resp = broker_client.post(f"{API}/public/merchant/brokers/register", json={"name": name} | extra)
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_register_requires_phone(seeded_db: dict) -> None:
    """未完善手机号不能注册经纪人."""
    session: Session = seeded_db["session"]
    role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"nophone-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    client = _client(session, user, c_side=True)
    resp = client.post(f"{API}/public/merchant/brokers/register", json={"name": "小李"})
    assert resp.status_code == 400
    assert "手机号" in resp.json()["message"]


def test_register_and_recruit_match(broker_client: TestClient, customer_user: User, seeded_db: dict) -> None:
    """注册成功；手机号哈希匹配招募线索."""
    session: Session = seeded_db["session"]
    recruit = RecruitLead(
        phone=customer_user.phone,
        phone_hash=customer_user.phone_hash,
        main_business_area="陆家嘴商圈",
        status=RecruitLeadStatus.NEW,
    )
    session.add(recruit)
    session.commit()

    result = _register(broker_client)
    broker = result["broker"]
    assert broker["name"] == "小李"
    assert broker["bind_status"] == "unbound"
    assert broker["phone_masked"].startswith("139")
    row = session.query(MerchantBroker).filter(MerchantBroker.id == broker["id"]).one()
    assert row.recruit_lead_id == recruit.id


def test_register_duplicate_phone_conflict(broker_client: TestClient, customer_user: User, seeded_db: dict) -> None:
    """同一手机号已被其他账号认证 → 409."""
    session: Session = seeded_db["session"]
    session.add(
        MerchantBroker(
            user_id="other-user-id",
            name="已有经纪人",
            phone=customer_user.phone,
            phone_hash=customer_user.phone_hash,
            bind_status="unbound",
            source="self_apply",
            bind_source="none",
        ),
    )
    session.commit()
    resp = broker_client.post(f"{API}/public/merchant/brokers/register", json={"name": "冒名"})
    assert resp.status_code == 409, resp.text


def test_bind_store_and_history(
    broker_client: TestClient,
    admin_client: TestClient,
    seeded_db: dict,
) -> None:
    """首次绑定免审生效，我的门店只读展示，历史保留."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"])
    _register(broker_client)

    bind = broker_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": store["id"]})
    assert bind.status_code == 200, bind.text
    assert bind.json()["bind_status"] == "bound"
    assert bind.json()["store_id"] == store["id"]

    my_store = broker_client.get(f"{API}/public/merchant/brokers/me/store")
    assert my_store.status_code == 200
    assert my_store.json()["store_name"] == store["store_name"]

    history = broker_client.get(f"{API}/public/merchant/brokers/me/bindings").json()
    assert len(history) == 1
    assert history[0]["status"] == "active"

    again = broker_client.post(
        f"{API}/public/merchant/brokers/me/bind",
        json={"store_id": _create_store(admin_client, company["id"])["id"]},
    )
    assert again.status_code == 409, again.text


def test_change_binding_requires_approval(
    broker_client: TestClient,
    admin_client: TestClient,
    seeded_db: dict,
) -> None:
    """换绑审核前原绑定有效，通过后原绑定失效、新绑定生效."""
    company = _create_company(admin_client)
    old_store = _create_store(admin_client, company["id"])
    new_store = _create_store(admin_client, company["id"])
    _register(broker_client)
    broker_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": old_store["id"]})

    change = broker_client.post(
        f"{API}/public/merchant/brokers/me/change",
        json={"store_id": new_store["id"], "reason": "换店"},
    )
    assert change.status_code == 200, change.text
    binding_id = change.json()["id"]
    assert change.json()["status"] == "pending"
    me = broker_client.get(f"{API}/public/merchant/brokers/me").json()
    assert me["store_id"] == old_store["id"]

    pending = admin_client.get(f"{API}/admin/merchant/bindings/pending")
    assert pending.status_code == 200
    assert len(pending.json()) == 1

    approve = admin_client.post(
        f"{API}/admin/merchant/bindings/{binding_id}/approve",
        json={"approve": True},
    )
    assert approve.status_code == 200, approve.text
    assert approve.json()["status"] == "active"
    me = broker_client.get(f"{API}/public/merchant/brokers/me").json()
    assert me["store_id"] == new_store["id"]
    history = broker_client.get(f"{API}/public/merchant/brokers/me/bindings").json()
    statuses = {row["status"] for row in history}
    assert "unbound" in statuses
    assert "active" in statuses


def test_unbind_approval_and_rejection(
    broker_client: TestClient,
    admin_client: TestClient,
    seeded_db: dict,
) -> None:
    """解绑审核通过后未绑定；拒绝时保持原绑定."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"])
    _register(broker_client)
    broker_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": store["id"]})

    unbind = broker_client.post(f"{API}/public/merchant/brokers/me/unbind", json={"reason": "离职"})
    assert unbind.status_code == 200
    binding_id = unbind.json()["id"]
    reject = admin_client.post(
        f"{API}/admin/merchant/bindings/{binding_id}/approve",
        json={"approve": False, "remark": "暂不处理"},
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "rejected"
    assert broker_client.get(f"{API}/public/merchant/brokers/me").json()["store_id"] == store["id"]

    second = broker_client.post(f"{API}/public/merchant/brokers/me/unbind", json={"reason": "离职"})
    assert second.status_code == 200
    approve = admin_client.post(
        f"{API}/admin/merchant/bindings/{second.json()['id']}/approve",
        json={"approve": True},
    )
    assert approve.status_code == 200
    assert broker_client.get(f"{API}/public/merchant/brokers/me").json()["bind_status"] == "unbound_after"


def test_qr_register_auto_bind_and_bound_scan_no_change(
    broker_client: TestClient,
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """扫码注册自动绑定；已绑定经纪人扫其他门店码不自动换绑."""
    company = _create_company(admin_client)
    store_a = _create_store(admin_client, company["id"])
    store_b = _create_store(admin_client, company["id"])

    session: Session = seeded_db["session"]
    code_a = "qr-a-" + uuid.uuid4().hex[:8]
    code_b = "qr-b-" + uuid.uuid4().hex[:8]
    for code, store in ((code_a, store_a), (code_b, store_b)):
        session.add(
            MerchantStoreQRCode(
                code=code,
                store_id=store["id"],
                inviter_employee_id=employee.id,
                expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            ),
        )
    session.commit()

    resolved = broker_client.get(f"{API}/public/merchant/broker-qrcodes/{code_a}")
    assert resolved.status_code == 200
    assert resolved.json()["valid"] is True
    assert resolved.json()["store_id"] == store_a["id"]

    result = _register(broker_client, qrcode_code=code_a)
    assert result["auto_bound"] is True
    assert result["broker"]["store_id"] == store_a["id"]
    assert result["broker"]["bind_source"] == "qrcode"
    assert result["broker"]["inviter_employee_id"] == employee.id

    again = _register(broker_client, qrcode_code=code_b)
    assert again["auto_bound"] is False
    assert again["broker"]["store_id"] == store_a["id"]
    assert again["qr_invalid_reason"]


def test_broker_create_store_pending_and_owned_by_inviter(
    broker_client: TestClient,
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """经纪人注册建店 → review_status=pending、source=broker、owner=邀请员工、自动绑定."""
    company = _create_company(admin_client)
    _register(broker_client, referrer=employee.id)
    payload = {
        "company_id": company["id"],
        "store_name": f"经纪自建店-{uuid.uuid4().hex[:5]}",
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
    }
    resp = broker_client.post(f"{API}/public/merchant/brokers/me/store", json=payload)
    assert resp.status_code == 201, resp.text
    store = resp.json()["store"]
    assert store["review_status"] == "pending"
    assert store["source"] == "broker"
    assert store["owner_employee_id"] == employee.id
    assert store["created_by_broker_id"] is not None
    me = broker_client.get(f"{API}/public/merchant/brokers/me")
    assert me.json()["store_id"] == store["id"]


def test_admin_broker_crud_and_disable_unbind(
    broker_client: TestClient,
    admin_client: TestClient,
    seeded_db: dict,
) -> None:
    """后台列表/新建/重复手机号/停用自动解绑."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"])
    _register(broker_client)

    listing = admin_client.get(f"{API}/admin/merchant/brokers")
    assert listing.status_code == 200
    assert listing.json()["total"] == 1

    created = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": "后台经纪人", "phone": "13500001111", "store_id": store["id"]},
    )
    assert created.status_code == 201, created.text
    assert created.json()["bind_status"] == "bound"

    duplicate = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": "重复", "phone": "13500001111"},
    )
    assert duplicate.status_code == 409

    disabled = admin_client.post(
        f"{API}/admin/merchant/brokers/{created.json()['id']}/status",
        json={"target_status": "disabled", "reason": "停用"},
    )
    assert disabled.status_code == 200
    assert disabled.json()["bind_status"] == "disabled"
    assert disabled.json()["store_id"] is None


def test_admin_force_change_keeps_history(
    broker_client: TestClient,
    admin_client: TestClient,
) -> None:
    """后台强制换绑：原绑定解绑留痕，新门店立即生效."""
    company = _create_company(admin_client)
    old_store = _create_store(admin_client, company["id"])
    new_store = _create_store(admin_client, company["id"])
    broker = _register(broker_client)["broker"]
    broker_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": old_store["id"]})

    change = admin_client.post(
        f"{API}/admin/merchant/brokers/{broker['id']}/change",
        json={"store_id": new_store["id"], "reason": "运营调整"},
    )
    assert change.status_code == 200, change.text
    assert change.json()["store_id"] == new_store["id"]

    history = broker_client.get(f"{API}/public/merchant/brokers/me/bindings").json()
    old = next(row for row in history if row["store_id"] == old_store["id"])
    new = next(row for row in history if row["store_id"] == new_store["id"])
    assert old["status"] == "unbound"
    assert old["reason"] == "运营调整"
    assert new["status"] == "active"


def test_qr_invalid_and_expired(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """无效短码 valid=false；过期码提示已过期."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"])
    session: Session = seeded_db["session"]
    expired = MerchantStoreQRCode(
        code="exp-" + uuid.uuid4().hex[:8],
        store_id=store["id"],
        inviter_employee_id=employee.id,
        expires_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    session.add(expired)
    session.commit()

    client = _client(session, employee, c_side=True)
    invalid = client.get(f"{API}/public/merchant/broker-qrcodes/not-exist")
    assert invalid.status_code == 200
    assert invalid.json()["valid"] is False

    expired_resp = client.get(f"{API}/public/merchant/broker-qrcodes/{expired.code}")
    assert expired_resp.status_code == 200
    assert expired_resp.json()["valid"] is False
    assert "过期" in expired_resp.json()["reason"]


def test_selectable_store_search_filters_and_hides_contact(
    broker_client: TestClient,
    admin_client: TestClient,
    seeded_db: dict,
) -> None:
    """可选门店仅返回正常且已转正，字段不含联系人/电话."""
    session: Session = seeded_db["session"]
    company = _create_company(admin_client)
    approved = _create_store(admin_client, company["id"])
    pending = _create_store(admin_client, company["id"])
    disabled = _create_store(admin_client, company["id"])
    session.query(MerchantStore).filter(MerchantStore.id == pending["id"]).update(
        {"review_status": "pending"},
        synchronize_session=False,
    )
    session.query(MerchantStore).filter(MerchantStore.id == disabled["id"]).update(
        {"status": "disabled"},
        synchronize_session=False,
    )
    session.commit()

    resp = broker_client.get(f"{API}/public/merchant/broker-stores", params={"keyword": "门店"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == approved["id"]
    assert "contact_phone" not in body["items"][0]
    assert set(body["items"][0]).issuperset(
        {"id", "store_name", "company_name", "address", "district", "business_circle"}
    )

    keyword = broker_client.get(
        f"{API}/public/merchant/broker-stores",
        params={"keyword": approved["store_name"]},
    ).json()
    assert keyword["items"][0]["id"] == approved["id"]

    # 建店可选公司：仅正常公司，字段只含 id/名称
    disabled_company = _create_company(admin_client)
    session.query(MerchantStore).filter(MerchantStore.company_id == disabled_company["id"]).delete(
        synchronize_session=False
    )
    db_company = session.query(MerchantCompany).filter(MerchantCompany.id == disabled_company["id"]).one()
    db_company.status = "disabled"
    session.commit()
    companies = broker_client.get(
        f"{API}/public/merchant/broker-companies",
        params={"keyword": "经纪公司"},
    ).json()
    ids = {item["id"] for item in companies["items"]}
    assert disabled_company["id"] not in ids
    assert companies["items"][0]["company_name"]
    assert "contact_phone" not in companies["items"][0]


def test_my_recommended_leads_with_followups(
    broker_client: TestClient,
    seeded_db: dict,
) -> None:
    """经纪人仅能看到本人推荐线索，并返回完整跟进记录."""
    session: Session = seeded_db["session"]
    broker = _register(broker_client)["broker"]
    other_broker = MerchantBroker(
        user_id=None,
        name="其他经纪人",
        phone="13800002222",
        phone_hash=hash_phone("13800002222"),
        bind_status="unbound",
        source="self_apply",
        bind_source="none",
    )
    session.add(other_broker)
    session.flush()
    lead = Lead(community_name="经纪人推荐小区", broker_id=broker["id"], creator_id=None)
    other_lead = Lead(community_name="他人推荐小区", broker_id=other_broker.id, creator_id=None)
    session.add_all([lead, other_lead])
    session.flush()
    session.add_all(
        [
            LeadFollowUp(
                lead_id=lead.id,
                method=FollowUpMethod.PHONE,
                content="首次沟通",
                followed_at=datetime.now(timezone.utc) - timedelta(hours=2),
                created_by_id="admin-user",
            ),
            LeadFollowUp(
                lead_id=lead.id,
                method=FollowUpMethod.VISIT,
                content="带看跟进",
                followed_at=datetime.now(timezone.utc) - timedelta(hours=1),
                created_by_id="admin-user",
            ),
        ]
    )
    session.commit()

    resp = broker_client.get(f"{API}/public/merchant/brokers/me/leads")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["community_name"] == "经纪人推荐小区"
    assert [row["content"] for row in body["items"][0]["follow_ups"]] == ["带看跟进", "首次沟通"]


pytestmark = pytest.mark.usefixtures("seeded_db")


def test_reject_binding_writes_audit_and_disabled_broker_cannot_be_approved(
    broker_client: TestClient,
    admin_client: TestClient,
    seeded_db: dict,
) -> None:
    """审核拒绝写审计；经纪人停用后存量 pending 申请不得通过."""
    from models import OperationLog

    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"])
    _register(broker_client)
    broker_client.post(f"{API}/public/merchant/brokers/me/bind", json={"store_id": store["id"]})

    unbind = broker_client.post(f"{API}/public/merchant/brokers/me/unbind", json={"reason": "离职"})
    binding_id = unbind.json()["id"]
    reject = admin_client.post(
        f"{API}/admin/merchant/bindings/{binding_id}/approve",
        json={"approve": False, "remark": "暂不处理"},
    )
    assert reject.status_code == 200, reject.text

    session = seeded_db["session"]
    session.expire_all()
    log = (
        session.query(OperationLog)
        .filter(
            OperationLog.resource_type == "merchant_broker_binding",
            OperationLog.action == "reject",
        )
        .order_by(OperationLog.created_at.desc())
        .first()
    )
    assert log is not None
    assert log.after["remark"] == "暂不处理"

    # 停用经纪人后，新的 pending 申请不得通过
    second = broker_client.post(f"{API}/public/merchant/brokers/me/unbind", json={"reason": "离职"})
    assert second.status_code == 200, second.text
    me = broker_client.get(f"{API}/public/merchant/brokers/me").json()
    disable = admin_client.post(
        f"{API}/admin/merchant/brokers/{me['id']}/status",
        json={"target_status": "disabled", "reason": "E2E 停用"},
    )
    assert disable.status_code == 200, disable.text

    approve = admin_client.post(
        f"{API}/admin/merchant/bindings/{second.json()['id']}/approve",
        json={"approve": True},
    )
    assert approve.status_code == 400, approve.text
    assert "停用" in approve.json()["message"]


def test_phone_change_syncs_broker_phone_and_hash(
    broker_client: TestClient,
    customer_user: User,
    seeded_db: dict,
) -> None:
    """AC-V04-015：用户改手机号后，经纪人档案的手机号与 phone_hash 同步更新."""
    from models.merchant import MerchantBroker

    _register(broker_client, name="换号经纪人")

    session: Session = seeded_db["session"]
    customer_user.password = get_password_hash("Test123456")
    session.commit()

    new_phone = f"139{uuid.uuid4().int % 10**8:08d}"
    resp = broker_client.put(
        f"{API}/public/users/phone",
        json={"phone": new_phone, "password": "Test123456"},
    )
    assert resp.status_code == 200, resp.text

    session.expire_all()
    broker = session.query(MerchantBroker).filter(MerchantBroker.user_id == str(customer_user.id)).one()
    assert broker.phone == new_phone
    assert broker.phone_hash == hash_phone(new_phone)
