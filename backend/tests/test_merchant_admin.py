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
    OperationLog,
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

    # AC-V01-013：delete 审计 after 为空；删除原因并入 before（BR-M11-014）
    from models import OperationLog

    session = seeded_db["session"]
    session.expire_all()
    log = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.action == "delete")
        .one()
    )
    assert log.after is None
    assert log.before["delete_reason"] == "重复录入"

    # REQ-M11-004 分支 5：重复删除幂等（不再 404）
    again = admin_client.post(
        f"{API}/admin/merchant/stores/{store['id']}/delete",
        json={"reason": "重复录入"},
    )
    assert again.status_code == 200, again.text


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
    # R-V07-12 未确认取值口径（模型无门店编号列），落地为门店名以保证可读追溯
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

    session: Session = seeded_db["session"]
    log = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.action == "export")
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert log is not None
    assert log.after["count"] >= 1


def test_export_brokers_csv_masked_with_audit(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """经纪人 CSV 导出脱敏且写导出审计（操作人/条件/条数）."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)
    phone = f"135{uuid.uuid4().int % 10**8:08d}"
    created = admin_client.post(
        f"{API}/admin/merchant/brokers",
        json={"name": "导出经纪人", "phone": phone, "store_id": store["id"]},
    )
    assert created.status_code == 201, created.text

    resp = admin_client.get(f"{API}/admin/merchant/brokers/export")
    assert resp.status_code == 200
    content = resp.content.decode("utf-8-sig")
    assert "导出经纪人" in content
    assert phone not in content

    session: Session = seeded_db["session"]
    log = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_broker", OperationLog.action == "export")
        .order_by(OperationLog.id.desc())
        .first()
    )
    assert log is not None
    assert log.after["count"] >= 1


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


def test_store_list_source_filter_is_applied(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-M11-001：门店列表按来源筛选必须真实生效（避免参数未接线）."""
    company = _create_company(admin_client)
    employee_store = _create_store(admin_client, company["id"], employee.id, name="来源员工门店")
    backoffice_store = _create_store(admin_client, company["id"], employee.id, name="来源后台门店")
    session: Session = seeded_db["session"]
    session.query(MerchantStore).filter(MerchantStore.id == employee_store["id"]).update({"source": "employee"})
    session.commit()

    resp = admin_client.get(f"{API}/admin/merchant/stores", params={"source": "employee"})
    assert resp.status_code == 200, resp.text
    ids = [item["id"] for item in resp.json()["items"]]
    assert employee_store["id"] in ids
    assert backoffice_store["id"] not in ids


def test_store_list_broker_count_range_filter(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-M11-001：门店列表支持按经纪人数量区间筛选."""
    company = _create_company(admin_client)
    empty_store = _create_store(admin_client, company["id"], employee.id, name="无经纪人门店")
    staffed_store = _create_store(admin_client, company["id"], employee.id, name="有经纪人门店")
    _create_broker(admin_client, staffed_store["id"])

    resp = admin_client.get(f"{API}/admin/merchant/stores", params={"broker_count_min": 1})
    assert resp.status_code == 200, resp.text
    ids = [item["id"] for item in resp.json()["items"]]
    assert staffed_store["id"] in ids
    assert empty_store["id"] not in ids

    resp_zero = admin_client.get(f"{API}/admin/merchant/stores", params={"broker_count_min": 0, "broker_count_max": 0})
    assert resp_zero.status_code == 200, resp_zero.text
    zero_ids = [item["id"] for item in resp_zero.json()["items"]]
    assert empty_store["id"] in zero_ids
    assert staffed_store["id"] not in zero_ids


def test_store_list_created_date_range_filter(
    admin_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-M11-001：门店列表支持按创建日期区间筛选."""
    from datetime import datetime, timedelta, timezone

    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id, name="日期筛选门店")
    today = datetime.now(timezone.utc).date()
    yesterday = today - timedelta(days=1)

    resp = admin_client.get(f"{API}/admin/merchant/stores", params={"created_from": today.isoformat()})
    assert resp.status_code == 200, resp.text
    assert store["id"] in [item["id"] for item in resp.json()["items"]]

    resp_before = admin_client.get(f"{API}/admin/merchant/stores", params={"created_to": yesterday.isoformat()})
    assert resp_before.status_code == 200, resp_before.text
    assert store["id"] not in [item["id"] for item in resp_before.json()["items"]]


def test_duplicate_check_recalls_by_distance_alone(
    admin_client: TestClient,
    employee: User,
    employee_client: TestClient,
    seeded_db: dict,
) -> None:
    """REQ-M01B-002：500m 必须作为独立召回信号，名称/地址/电话都不同也能命中."""
    company = _create_company(admin_client)
    _create_store(admin_client, company["id"], employee.id, name="远洋大厦店")

    resp = employee_client.post(
        f"{API}/public/merchant/stores/check-duplicates",
        json={
            "store_name": "完全不同的名字",
            "address": "完全不同的路 88 号",
            "lng": 121.5058,
            "lat": 31.2454,
            "contact_phone": "13900008888",
        },
    )
    assert resp.status_code == 200, resp.text
    candidates = resp.json()["candidates"]
    assert candidates, "500m 内门店应作为候选返回"
    assert "distance" in candidates[0]["matched_by"]
    assert "name" not in candidates[0]["matched_by"]
    assert "address" not in candidates[0]["matched_by"]


def test_merge_preview_returns_migration_counts(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """REQ-M11-005 主流程 3：合并前预览待迁移数据量，且同门店合并被拒绝."""
    company = _create_company(admin_client)
    keep = _create_store(admin_client, company["id"], employee.id, name="预览保留门店")
    merged = _create_store(admin_client, company["id"], employee.id, name="预览被合并门店")
    _create_broker(admin_client, merged["id"])
    _create_visit(employee_client, merged["id"])
    template = _create_template(admin_client)
    _create_agreement(employee_client, merged, template["id"])
    lead = admin_client.post(f"{API}/leads", json={"community_name": "预览花园", "store_id": merged["id"]})
    assert lead.status_code == 201, lead.text

    resp = admin_client.get(
        f"{API}/admin/merchant/stores/{merged['id']}/merge-preview",
        params={"keep_store_id": keep["id"]},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["visits"] == 1
    assert body["leads"] == 1
    assert body["agreements"] == 1
    assert body["brokers"] == 1
    assert body["bindings"] == 1

    same = admin_client.get(
        f"{API}/admin/merchant/stores/{merged['id']}/merge-preview",
        params={"keep_store_id": merged["id"]},
    )
    assert same.status_code == 400, same.text
    assert "不能相同" in same.json()["message"]


def test_merge_and_agreement_review_require_internal_role(
    admin_client: TestClient,
    employee_client: TestClient,
    employee: User,
    seeded_db: dict,
) -> None:
    """BR-M12-003 / BR-M04-031：user 角色即便持有 merchant:write/agreement 也不得合并门店或审核协议."""
    company = _create_company(admin_client)
    keep = _create_store(admin_client, company["id"], employee.id, name="保留门店")
    merged = _create_store(admin_client, company["id"], employee.id, name="被合并门店")
    template = _create_template(admin_client)
    agreement = _create_agreement(employee_client, keep, template["id"])

    user_client = _client(seeded_db["session"], employee, c_side=False)

    denied_merge = user_client.post(
        f"{API}/admin/merchant/stores/merge",
        json={"keep_store_id": keep["id"], "merged_store_id": merged["id"], "reason": "越权尝试"},
    )
    assert denied_merge.status_code == 403, denied_merge.text
    assert "admin/operator" in denied_merge.json()["message"]

    denied_review = user_client.post(
        f"{API}/admin/merchant/agreements/{agreement['id']}/review",
        json={"approve": True, "remark": "越权尝试"},
    )
    assert denied_review.status_code == 403, denied_review.text

    # 数据未被改动
    session: Session = seeded_db["session"]
    session.expire_all()
    assert session.query(MerchantStore).filter(MerchantStore.id == merged["id"]).one().status != "merged"


def test_store_activation_disable_and_enable(admin_client: TestClient, employee: User, seeded_db: dict) -> None:
    """REQ-M11-003：门店可停用/启用，写审计；停用后禁止新建拜访."""
    company = _create_company(admin_client)
    store = _create_store(admin_client, company["id"], employee.id)

    disabled = admin_client.post(
        f"{API}/admin/merchant/stores/{store['id']}/activation",
        json={"target_status": "disabled", "reason": "门店装修停业"},
    )
    assert disabled.status_code == 200, disabled.text
    assert disabled.json()["status"] == "disabled"

    again = admin_client.post(
        f"{API}/admin/merchant/stores/{store['id']}/activation",
        json={"target_status": "disabled", "reason": "重复停用"},
    )
    assert again.status_code == 409, again.text

    session: Session = seeded_db["session"]
    logs = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.resource_id == store["id"])
        .all()
    )
    assert any(log.action == "disable" for log in logs)

    enabled = admin_client.post(
        f"{API}/admin/merchant/stores/{store['id']}/activation",
        json={"target_status": "normal", "reason": "恢复营业"},
    )
    assert enabled.status_code == 200, enabled.text
    assert enabled.json()["status"] == "normal"


def test_review_broker_store_requires_complete_fields(
    admin_client: TestClient,
    employee: User,
    customer_client: TestClient,
    seeded_db: dict,
) -> None:
    """REQ-M11-012 分支 2：必填字段缺失时拒绝转正并提示先补全."""
    company = _create_company(admin_client)
    customer_client.post(f"{API}/public/merchant/brokers/register", json={"name": "建店经纪人"})
    payload = {
        "company_id": company["id"],
        "store_name": f"缺字段自建店-{uuid.uuid4().hex[:5]}",
        "province": "上海市",
        "city": "上海市",
        "district": "浦东新区",
        "business_circle": "陆家嘴商圈",
        "address": "浦东南路 500 号",
        "lng": 121.52,
        "lat": 31.25,
        "contact_name": "李店长",
        "contact_phone": "13600004444",
        "cooperation_status": "not_cooperated",
        "force_create_reason": "测试数据",
    }
    created = customer_client.post(f"{API}/public/merchant/brokers/me/store", json=payload)
    assert created.status_code == 201, created.text
    store_id = created.json()["store"]["id"]

    session: Session = seeded_db["session"]
    row = session.query(MerchantStore).filter(MerchantStore.id == store_id).one()
    row.address = "   "
    session.commit()

    resp = admin_client.post(f"{API}/admin/merchant/stores/{store_id}/review", json={"action": "approve"})
    assert resp.status_code == 400, resp.text
    assert "详细地址" in resp.json()["message"]
    session.refresh(row)
    assert row.review_status == "pending"
