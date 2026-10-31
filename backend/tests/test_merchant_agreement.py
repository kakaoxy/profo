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
from models import BizDictItem, MerchantAgreement, MerchantStore, MerchantStoreStatusLog, Role, User
from settings import settings
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash

API = "/api/v1"


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
    """模板→发起→审核→签名 PDF→门店已合作."""
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
    assert agreement["status"] == "not_initiated"
    assert agreement["review_status"] == "pending"

    review = admin_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/review",
        json={"approve": True},
    )
    assert review.status_code == 200, review.text
    assert review.json()["status"] == "pending_sign"

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


def test_signer_mismatch_and_rejection(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """员工签署人必须与门店联系人一致；审核驳回退回未发起."""
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
    reject = admin_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/review",
        json={"approve": False, "remark": "条款需修改"},
    )
    assert reject.status_code == 200
    assert reject.json()["status"] == "not_initiated"
    assert reject.json()["review_status"] == "rejected"


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
    row.review_status = "approved"
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
