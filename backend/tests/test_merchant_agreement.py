"""商户管理 V05：协议模板、发起、审核、签名 PDF、作废与到期扫描."""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from PIL import Image
from sqlalchemy.orm import Session

import db
from models import (
    BizDictItem,
    MerchantAgreement,
    MerchantStore,
    MerchantStoreStatusLog,
    Role,
    User,
)
from settings import settings
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash

API = "/api/v1"
SIGN_API = f"{API}/public/merchant/agreement-sign"


def _client(session: Session, user: User, *, c_side: bool) -> TestClient:
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
def _local_storage() -> Generator[None, None, None]:
    """测试固定本地存储，避免依赖 OSS 网络."""
    from utils import storage

    previous = storage._storage_backend
    storage._storage_backend = storage.LocalStorage()
    yield
    storage._storage_backend = previous


@pytest.fixture(autouse=True)
def _seed_dicts(seeded_db: dict) -> None:
    session: Session = seeded_db["session"]
    existing = (
        session.query(BizDictItem)
        .filter(BizDictItem.dict_code == "merchant_cooperation_status", BizDictItem.code == "not_cooperated")
        .first()
    )
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
        username=f"agreement-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="协议员工",
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
def signature_url() -> Generator[str, None, None]:
    path = Path(settings.upload_dir) / f"test-sign-{uuid.uuid4().hex}.png"
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.new("RGB", (240, 100), color=(255, 255, 255)).save(path)
    yield f"/static/uploads/{path.name}"
    path.unlink(missing_ok=True)


def _merchant_client(seeded_db: dict) -> TestClient:
    """构造持 customer 角色的商户端客户端（C 端令牌，模拟微信登录后的商户）."""
    session: Session = seeded_db["session"]
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"merchant-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="商户签署人",
        role_id=customer_role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    return _client(session, user, c_side=True)


def _create_company(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/companies",
        json={
            "company_name": f"协议公司-{uuid.uuid4().hex[:6]}",
            "contact_name": "公司联系人",
            "contact_phone": "13800001111",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_store(
    admin_client: TestClient,
    company_id: str,
    *,
    owner_employee_id: str,
    contact_name: str = "王店长",
    contact_phone: str = "13700002222",
) -> dict:
    payload = {
        "company_id": company_id,
        "store_name": f"协议门店-{uuid.uuid4().hex[:5]}",
        "province": "上海市",
        "city": "上海市",
        "district": "浦东新区",
        "business_circle": "陆家嘴商圈",
        "address": "世纪大道 100 号",
        "lng": 121.5057,
        "lat": 31.2453,
        "contact_name": contact_name,
        "contact_phone": contact_phone,
        "cooperation_status": "not_cooperated",
        "owner_employee_id": owner_employee_id,
        "force_create_reason": "测试数据",
    }
    resp = admin_client.post(f"{API}/admin/merchant/stores", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()["store"]


def _create_template(admin_client: TestClient) -> dict:
    resp = admin_client.post(
        f"{API}/admin/merchant/agreement-templates",
        json={
            "template_name": "门店合作模板",
            "cooperation_type": "store",
            "content": "一、合作范围\n二、结算方式\n三、有效期",
            "version": "v1",
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _create_agreement(
    client: TestClient,
    *,
    subject_type: str,
    store_id: str | None,
    company_id: str | None,
    template_id: str,
    signer_name: str = "王店长",
    signer_phone: str = "13700002222",
) -> dict:
    resp = client.post(
        f"{API}/public/merchant/agreements",
        json={
            "subject_type": subject_type,
            "store_id": store_id,
            "company_id": company_id,
            "template_id": template_id,
            "signer_name": signer_name,
            "signer_phone": signer_phone,
            "expire_at": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
        },
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_template_crud_and_agreement_sign_flow(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
    signature_url: str,
) -> None:
    """模板→发起（直接待签署）→签名 PDF→门店已合作."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    # REQ-IT5-03：发起即待签署，不再经过审核
    assert agreement["status"] == "pending_sign"
    assert agreement["sign_code"]

    review = admin_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/review",
        json={"approve": True},
    )
    assert review.status_code == 404, review.text

    sign = employee_client.post(
        f"{API}/public/merchant/agreements/{agreement['id']}/sign",
        json={"signer_name": "王店长", "signer_phone": "13700002222", "signature_url": signature_url},
    )
    assert sign.status_code == 200, sign.text
    assert sign.json()["status"] == "signed"
    assert sign.json()["file_url"].endswith(".pdf")

    session: Session = seeded_db["session"]
    store_row = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    assert store_row.cooperation_status == "cooperated"
    log = session.query(MerchantStoreStatusLog).filter(MerchantStoreStatusLog.store_id == store["id"]).one()
    assert log.to_status == "cooperated"

    duplicate = employee_client.post(
        f"{API}/public/merchant/agreements/{agreement['id']}/sign",
        json={"signer_name": "王店长", "signer_phone": "13700002222", "signature_url": signature_url},
    )
    assert duplicate.status_code == 409, duplicate.text


def test_signer_mismatch_and_pending_sign(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
    signature_url: str,
) -> None:
    """员工签署人必须与门店联系人一致；发起即待签署（REQ-IT5-03 取消审核）."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)

    mismatch = employee_client.post(
        f"{API}/public/merchant/agreements",
        json={
            "subject_type": "store",
            "store_id": store["id"],
            "template_id": template["id"],
            "signer_name": "冒名",
            "signer_phone": "13700002222",
        },
    )
    assert mismatch.status_code == 400, mismatch.text

    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    assert agreement["status"] == "pending_sign"
    # REQ-IT5-03：审核已下线，员工发起后可直接签署
    sign = employee_client.post(
        f"{API}/public/merchant/agreements/{agreement['id']}/sign",
        json={"signer_name": "王店长", "signer_phone": "13700002222", "signature_url": signature_url},
    )
    assert sign.status_code == 200, sign.text
    assert sign.json()["status"] == "signed"


def test_employee_can_use_store_broker_as_signer(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-IT5-04：员工可用本门店经纪人为签署人，任意冒名仍拒绝（保持防冒名口径）."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    broker_phone = f"139{uuid.uuid4().int % 10**8:08d}"
    broker = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": "门店经纪人甲", "phone": broker_phone, "store_id": store["id"]},
    )
    assert broker.status_code == 201, broker.text

    resp = employee_client.post(
        f"{API}/public/merchant/agreements",
        json={
            "subject_type": "store",
            "store_id": store["id"],
            "template_id": template["id"],
            "signer_name": "门店经纪人甲",
            "signer_phone": broker_phone,
        },
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["signer_name"] == "门店经纪人甲"

    # 既不是门店联系人、也不是本店经纪人的签署人仍被拒绝
    mismatch = employee_client.post(
        f"{API}/public/merchant/agreements",
        json={
            "subject_type": "store",
            "store_id": store["id"],
            "template_id": template["id"],
            "signer_name": "冒名",
            "signer_phone": f"138{uuid.uuid4().int % 10**8:08d}",
        },
    )
    assert mismatch.status_code == 400, mismatch.text


def test_company_subject_forbidden_for_employee(
    admin_client: TestClient,
    employee_client: TestClient,
    seeded_db: dict,
) -> None:
    """公司主体协议仅运营/管理员可发起."""
    company = _create_company(admin_client)
    template = _create_template(admin_client)
    resp = employee_client.post(
        f"{API}/public/merchant/agreements",
        json={
            "subject_type": "company",
            "company_id": company["id"],
            "template_id": template["id"],
            "signer_name": "公司联系人",
            "signer_phone": "13800001111",
        },
    )
    assert resp.status_code == 403, resp.text


def test_void_scan_and_supplement(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """作废保留文件；扫描件上传；补充协议关联."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )

    scan = admin_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/scan",
        json={
            "file_url": "/static/uploads/scan-test.pdf",
            "signer_name": "王店长",
            "signer_phone": "13700002222",
        },
    )
    assert scan.status_code == 200, scan.text
    assert scan.json()["status"] == "signed"

    supplement = employee_client.post(
        f"{API}/public/merchant/agreements/{agreement['id']}/supplement",
        json={"file_url": "/static/uploads/supplement.pdf", "remark": "补充约定"},
    )
    assert supplement.status_code == 201, supplement.text
    detail = admin_client.get(f"{API}/admin/merchant/agreements/{agreement['id']}").json()
    assert supplement.json()["id"] in detail["supplement_agreement_ids"]

    void = admin_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/void",
        json={"reason": "合作终止"},
    )
    assert void.status_code == 200
    assert void.json()["status"] == "voided"
    assert void.json()["file_url"] == "/static/uploads/scan-test.pdf"


def test_employee_upload_scan_requires_matching_signer(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """员工上传盖章扫描件：数据范围内可传，签署人必须与门店联系人一致."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    mismatch = employee_client.post(
        f"{API}/public/merchant/agreements/{agreement['id']}/scan",
        json={
            "file_url": "/static/uploads/scan-test.pdf",
            "signer_name": "冒名",
            "signer_phone": "13700002222",
        },
    )
    assert mismatch.status_code == 400, mismatch.text

    scan = employee_client.post(
        f"{API}/public/merchant/agreements/{agreement['id']}/scan",
        json={
            "file_url": "/static/uploads/scan-test.pdf",
            "signer_name": "王店长",
            "signer_phone": "13700002222",
        },
    )
    assert scan.status_code == 200, scan.text
    assert scan.json()["status"] == "signed"
    store_row = session_store(seeded_db, store["id"])
    assert store_row.cooperation_status == "cooperated"


def session_store(seeded_db: dict, store_id: str) -> MerchantStore:
    """读取门店最新状态（测试辅助）."""
    session: Session = seeded_db["session"]
    session.expire_all()
    return session.query(MerchantStore).filter(MerchantStore.id == store_id).one()


def test_expiring_events_and_expire_scan(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """距到期 30 天内产生事件；到期扫描置已过期."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    session: Session = seeded_db["session"]
    row = session.query(MerchantAgreement).filter(MerchantAgreement.id == agreement["id"]).one()
    row.status = "signed"
    row.expire_at = datetime.now(timezone.utc) + timedelta(days=10)
    session.commit()

    events = admin_client.get(f"{API}/admin/merchant/agreements/expiring-events?days=30")
    assert events.status_code == 200
    assert any(event["agreement_id"] == agreement["id"] for event in events.json())

    row.expire_at = datetime.now(timezone.utc) - timedelta(days=1)
    session.commit()
    scan = admin_client.post(f"{API}/admin/merchant/agreements/expire-scan")
    assert scan.status_code == 200
    assert scan.json()["updated"] == 1
    session.refresh(row)
    assert row.status == "expired"


def test_store_subject_agreement_does_not_set_company_id(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """BR-M04-005：签约主体二选一，门店主体协议不得同时写 company_id."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    assert agreement["store_id"] == store["id"]
    assert agreement["company_id"] is None

    session: Session = seeded_db["session"]
    row = session.query(MerchantAgreement).filter(MerchantAgreement.id == agreement["id"]).one()
    assert row.company_id is None
    assert row.store_id == store["id"]


def test_agreement_list_filters_expire_range_and_sorts_by_signed_at(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-M04-006：到期时间范围筛选 + 默认按签署时间倒序（BR-M04-022）."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    created = [
        _create_agreement(
            employee_client,
            subject_type="store",
            store_id=store["id"],
            company_id=None,
            template_id=template["id"],
        )
        for _ in range(3)
    ]

    session: Session = seeded_db["session"]
    rows = {
        row.id: row for row in session.query(MerchantAgreement).filter(MerchantAgreement.store_id == store["id"]).all()
    }
    rows[created[0]["id"]].expire_at = datetime(2026, 3, 10, tzinfo=timezone.utc)
    rows[created[0]["id"]].signed_at = datetime(2026, 3, 20, tzinfo=timezone.utc)
    rows[created[1]["id"]].expire_at = datetime(2026, 3, 20, tzinfo=timezone.utc)
    rows[created[1]["id"]].signed_at = datetime(2026, 4, 1, tzinfo=timezone.utc)
    rows[created[2]["id"]].expire_at = datetime(2026, 5, 1, tzinfo=timezone.utc)
    session.commit()

    resp = admin_client.get(
        f"{API}/admin/merchant/agreements",
        params={"page": 1, "page_size": 50, "expire_from": "2026-03-01", "expire_to": "2026-03-31"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    ids = [item["id"] for item in body["items"]]
    assert ids == [created[1]["id"], created[0]["id"]]


def test_admin_can_add_supplement_agreement(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
) -> None:
    """REQ-M04-007：后台可新增补充协议并关联原协议."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    parent = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    resp = admin_client.post(
        f"{API}/admin/merchant/agreements/{parent['id']}/supplements",
        json={"remark": "延长合作期一年", "file_url": "/static/supplement.pdf"},
    )
    assert resp.status_code == 201, resp.text
    child = resp.json()
    assert child["status"] == "signed"
    assert child["remark"] == "延长合作期一年"

    detail = admin_client.get(f"{API}/admin/merchant/agreements/{parent['id']}")
    assert detail.status_code == 200
    assert child["id"] in detail.json()["supplement_agreement_ids"]


def test_merchant_self_sign_via_share_code(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
    signature_url: str,
) -> None:
    """REQ-IT5-03：商户凭分享码微信登录后自助签署，员工侧直接看到已签署."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )
    customer_client = _merchant_client(seeded_db)
    code = agreement["sign_code"]
    assert agreement["status"] == "pending_sign"
    assert code

    # 分享码错误 → 403，不泄露协议内容
    forbidden = customer_client.get(f"{SIGN_API}/{agreement['id']}?code=invalid-code-123")
    assert forbidden.status_code == 403, forbidden.text

    view = customer_client.get(f"{SIGN_API}/{agreement['id']}?code={code}")
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["can_sign"] is True
    assert body["status_label"] == "待签署"
    assert body["content"]

    signed = customer_client.post(
        f"{SIGN_API}/{agreement['id']}?code={code}",
        json={
            "signer_name": "王店长",
            "signer_phone": "13700002222",
            "signature_url": signature_url,
            "confirmed": True,
        },
    )
    assert signed.status_code == 200, signed.text
    assert signed.json()["status"] == "signed"

    session: Session = seeded_db["session"]
    store_row = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    assert store_row.cooperation_status == "cooperated"

    # 重复签署 → 409
    again = customer_client.post(
        f"{SIGN_API}/{agreement['id']}?code={code}",
        json={
            "signer_name": "王店长",
            "signer_phone": "13700002222",
            "signature_url": signature_url,
            "confirmed": True,
        },
    )
    assert again.status_code == 409, again.text


def test_share_link_without_sign_code_is_rejected(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """历史协议缺分享码时必须拒绝，不能把调用方传入的 code 认领为分享码."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
    )

    session: Session = seeded_db["session"]
    row = session.query(MerchantAgreement).filter(MerchantAgreement.id == agreement["id"]).one()
    row.sign_code = None
    session.commit()

    customer_client = _merchant_client(seeded_db)
    claimed = customer_client.get(f"{SIGN_API}/{agreement['id']}?code=claim-by-anyone")
    assert claimed.status_code == 403, claimed.text
    assert "签署链接无效" in claimed.json()["message"]

    session.expire_all()
    assert session.query(MerchantAgreement).filter(MerchantAgreement.id == agreement["id"]).one().sign_code is None


def test_scan_upload_proxy_requires_reason(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-M04-009：运营代签必须填写代签原因，并写入审计."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], owner_employee_id=employee.id)
    template = _create_template(admin_client)
    agreement = _create_agreement(
        employee_client,
        subject_type="store",
        store_id=store["id"],
        company_id=None,
        template_id=template["id"],
        signer_name="王店长",
        signer_phone="13700002222",
    )
    payload = {
        "file_url": "/static/scan.pdf",
        "signer_name": "李代签",
        "signer_phone": "13900001111",
    }
    blocked = admin_client.post(f"{API}/admin/merchant/agreements/{agreement['id']}/scan", json=payload)
    assert blocked.status_code == 400, blocked.text
    assert "代签原因" in blocked.json()["message"]

    allowed = admin_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/scan",
        json={**payload, "reason": "店长出差，运营代为盖章"},
    )
    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["status"] == "signed"

    from models import OperationLog

    session: Session = seeded_db["session"]
    log = (
        session.query(OperationLog)
        .filter(
            OperationLog.resource_type == "merchant_agreement",
            OperationLog.resource_id == str(agreement["id"]),
            OperationLog.action == "update",
        )
        .order_by(OperationLog.created_at.desc())
        .first()
    )
    assert log is not None
    assert log.after["sign_reason"] == "店长出差，运营代为盖章"
