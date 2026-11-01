"""商户管理 V02/V03：公司、门店建档、查重、数据范围、合作状态与拜访."""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import (
    BizDictItem,
    MerchantStore,
    MerchantStoreStatusLog,
    MerchantVisit,
    OperationLog,
    Role,
    User,
)
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C, create_access_token, get_password_hash

API = "/api/v1"


def _client_for(session: Session, user: User, *, c_side: bool) -> TestClient:
    """构造已认证客户端（后台或 C 端员工）."""
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    audience = AUDIENCE_C if c_side else AUDIENCE_ADMIN
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "user", "ver": user.token_version},
        audience=audience,
    )
    cookie_name = "c_access_token" if c_side else "access_token"
    return TestClient(
        app,
        cookies={cookie_name: token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )


@pytest.fixture(autouse=True)
def _seed_merchant_dicts(seeded_db: dict[str, Any]) -> None:
    """补齐商户域字典项（测试库会话启动时会 TRUNCATE 掉迁移种子）."""
    session: Session = seeded_db["session"]
    seeds = [
        ("merchant_cooperation_status", "not_cooperated", "未合作", 10),
        ("merchant_cooperation_status", "negotiating", "洽谈中", 20),
        ("merchant_cooperation_status", "cooperated", "已合作", 30),
        ("merchant_cooperation_status", "paused", "暂停", 40),
        ("merchant_cooperation_status", "terminated", "终止", 50),
        ("merchant_visit_result", "not_met", "未见到人", 10),
        ("merchant_visit_result", "interested", "有意向", 20),
        ("merchant_visit_result", "cooperated", "已合作", 30),
        ("merchant_visit_result", "other", "其他", 40),
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


def _make_c_employee(session: Session, nickname: str) -> User:
    """C 端员工账号：customer 主角色 + user 附加角色（与小程序绑定账号一致）."""
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user_role = session.query(Role).filter(Role.code == "user").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"merchant-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=customer_role.id,
        status="active",
    )
    user.roles.append(user_role)
    session.add(user)
    session.commit()
    return user


@pytest.fixture
def admin_http(seeded_db: dict[str, Any]) -> TestClient:
    """后台 admin 客户端."""
    return _client_for(seeded_db["session"], seeded_db["users"]["admin"], c_side=False)


@pytest.fixture
def employee_user(seeded_db: dict[str, Any]) -> User:
    """小程序员工账号（customer + user 附加角色）."""
    return _make_c_employee(seeded_db["session"], "拓展员工")


@pytest.fixture
def employee_http(seeded_db: dict[str, Any], employee_user: User) -> TestClient:
    """小程序员工客户端."""
    return _client_for(seeded_db["session"], employee_user, c_side=True)


@pytest.fixture
def other_employee(seeded_db: dict[str, Any]) -> User:
    """另一名员工（数据范围隔离用）."""
    return _make_c_employee(seeded_db["session"], "另一员工")


@pytest.fixture
def other_http(seeded_db: dict[str, Any], other_employee: User) -> TestClient:
    """另一名员工的 C 端客户端."""
    return _client_for(seeded_db["session"], other_employee, c_side=True)


def _create_company(admin_http: TestClient, name: str | None = None) -> dict:
    resp = admin_http.post(
        f"{API}/admin/merchant/companies",
        json={"company_name": name or f"测试公司-{uuid.uuid4().hex[:8]}", "contact_phone": "13800001111"},
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


def _store_payload(company_id: str, *, name: str | None = None, phone: str = "13700002222", **overrides) -> dict:
    payload = {
        "company_id": company_id,
        "store_name": name or f"测试门店-{uuid.uuid4().hex[:5]}",
        "province": "上海市",
        "city": "上海市",
        "district": "浦东新区",
        "business_circle": "陆家嘴商圈",
        "address": "世纪大道 100 号",
        "lng": 121.5057,
        "lat": 31.2453,
        "contact_name": "王店长",
        "contact_phone": phone,
        "cooperation_status": "not_cooperated",
    }
    payload.update(overrides)
    return payload


def _first_visit(**overrides) -> dict:
    payload = {
        "contact_name": "王店长",
        "contact_phone": "13700002222",
        "lng": 121.5057,
        "lat": 31.2453,
        "address": "世纪大道 100 号",
        "location_status": "normal",
        "result": "interested",
    }
    payload.update(overrides)
    return payload


def _create_employee_store(employee_http: TestClient, company_id: str, **overrides) -> dict:
    visit_overrides = overrides.pop("first_visit", None) or {}
    payload = _store_payload(company_id, **overrides)
    payload["first_visit"] = _first_visit(**visit_overrides)
    resp = employee_http.post(f"{API}/public/merchant/stores", json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


def test_company_create_and_audit(admin_http: TestClient, seeded_db: dict[str, Any]) -> None:
    """公司创建成功，审计记录 create 且手机号掩码."""
    company = _create_company(admin_http)
    session: Session = seeded_db["session"]
    log = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_company", OperationLog.resource_id == company["id"])
        .one()
    )
    assert log.action == "create"
    assert log.before is None
    assert log.after["contact_phone"] == "138****1111"
    assert company["contact_phone_masked"] == "138****1111"


def test_employee_create_store_with_first_visit(
    admin_http: TestClient,
    employee_http: TestClient,
    employee_user: User,
    seeded_db: dict[str, Any],
) -> None:
    """员工现场建档：门店 + 首访同事务，归属当前员工."""
    company = _create_company(admin_http)
    employee = employee_user
    from services.system.permission import permission_service

    assert permission_service.get_user_permission_codes(seeded_db["session"], employee) >= {
        "merchant:write",
        "merchant:visit",
    }
    result = _create_employee_store(employee_http, company["id"])
    store = result["store"]
    first_visit = result["first_visit"]

    assert store["source"] == "employee"
    assert store["review_status"] == "approved"
    assert store["owner_employee_id"] == employee.id
    assert store["status"] == "normal"
    assert store["cooperation_status"] == "not_cooperated"
    assert first_visit is not None
    assert first_visit["visit_source"] == "first"
    assert store["last_visit_at"] is not None

    session: Session = seeded_db["session"]
    assert session.query(MerchantStore).count() == 1
    assert session.query(MerchantVisit).count() == 1
    visit_logs = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_visit", OperationLog.resource_id == first_visit["id"])
        .all()
    )
    assert [log.action for log in visit_logs] == ["create"]


def test_employee_store_requires_first_visit(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """员工新建门店缺少首访 → 拒绝，不产生门店."""
    company = _create_company(admin_http)
    resp = employee_http.post(f"{API}/public/merchant/stores", json=_store_payload(company["id"]))
    assert resp.status_code == 400, resp.text
    assert seeded_db["session"].query(MerchantStore).count() == 0


def test_first_visit_failure_rolls_back_store(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """首访定位非法 → 整笔回滚，门店不落库."""
    company = _create_company(admin_http)
    payload = _store_payload(company["id"])
    payload["first_visit"] = _first_visit(lng=None, lat=None, location_status="normal")
    resp = employee_http.post(f"{API}/public/merchant/stores", json=payload)
    assert resp.status_code == 400, resp.text
    assert seeded_db["session"].query(MerchantStore).count() == 0


def test_duplicate_check_and_force_reason(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """查重命中只提示；无理由拒绝，有理由允许强制新建."""
    company = _create_company(admin_http)
    _create_employee_store(employee_http, company["id"], name="同一家门店", address="世纪大道 100 号")

    check = employee_http.post(
        f"{API}/public/merchant/stores/check-duplicates",
        json={
            "store_name": "同一家门店",
            "address": "世纪大道 100 号",
            "lng": 121.5057,
            "lat": 31.2453,
            "contact_phone": "13700002222",
        },
    )
    assert check.status_code == 200, check.text
    candidates = check.json()["candidates"]
    assert candidates
    assert {"name", "address", "phone", "distance"} <= set(candidates[0]["matched_by"])

    no_reason = _store_payload(company["id"], name="同一家门店", address="世纪大道 100 号")
    no_reason["first_visit"] = _first_visit()
    resp = employee_http.post(f"{API}/public/merchant/stores", json=no_reason)
    assert resp.status_code == 400, resp.text

    forced = no_reason | {"force_create_reason": "确认不是同一家"}
    resp = employee_http.post(f"{API}/public/merchant/stores", json=forced)
    assert resp.status_code == 201, resp.text
    session = seeded_db["session"]
    assert session.query(MerchantStore).count() == 2
    create_log = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.action == "create")
        .order_by(OperationLog.created_at.desc())
        .first()
    )
    assert create_log is not None
    assert create_log.after["force_create_reason"] == "确认不是同一家"
    assert create_log.after["duplicates"]


def test_data_scope_and_forbidden_detail(
    admin_http: TestClient,
    employee_http: TestClient,
    other_http: TestClient,
    seeded_db: dict,
) -> None:
    """User 仅见本人门店；他人详情 403；admin 全量."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]

    assert employee_http.get(f"{API}/public/merchant/stores").json()["total"] == 1
    assert other_http.get(f"{API}/public/merchant/stores").json()["total"] == 0
    assert other_http.get(f"{API}/public/merchant/stores/{store['id']}").status_code == 403
    assert admin_http.get(f"{API}/admin/merchant/stores").json()["total"] == 1


def test_employee_status_permission_and_agreement_prerequisite(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """员工仅可改洽谈中；已合作必须已签协议."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]

    ok = employee_http.post(
        f"{API}/public/merchant/stores/{store['id']}/status",
        json={"target_status": "negotiating", "reason": "已初步接洽"},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["cooperation_status"] == "negotiating"

    denied = employee_http.post(
        f"{API}/public/merchant/stores/{store['id']}/status",
        json={"target_status": "cooperated", "reason": "想直接合作"},
    )
    assert denied.status_code == 403, denied.text

    no_agreement = admin_http.post(
        f"{API}/admin/merchant/stores/{store['id']}/status",
        json={"target_status": "cooperated", "reason": "运营变更"},
    )
    assert no_agreement.status_code == 400, no_agreement.text
    logs = seeded_db["session"].query(MerchantStoreStatusLog).all()
    assert len(logs) == 1
    assert logs[0].to_status == "negotiating"


def test_visit_backfill_distance_and_last_visit(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """补录 7 天限制、500 米异常原因、last_visit_at 仅向前更新."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]

    too_old = (datetime.now(timezone.utc) - timedelta(days=8)).isoformat()
    resp = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "visited_at": too_old,
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": 121.5057,
            "lat": 31.2453,
            "is_backfill": True,
            "backfill_reason": "补录",
        },
    )
    assert resp.status_code == 400, resp.text

    recent = (datetime.now(timezone.utc) - timedelta(days=3)).isoformat()
    ok = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "visited_at": recent,
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": 121.5057,
            "lat": 31.2453,
            "is_backfill": True,
            "backfill_reason": "补录",
        },
    )
    assert ok.status_code == 201, ok.text
    assert ok.json()["is_backfill"] is True

    far = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": 121.60,
            "lat": 31.30,
        },
    )
    assert far.status_code == 400, far.text
    assert "500 米" in far.json()["message"]

    with_reason = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": 121.60,
            "lat": 31.30,
            "distance_abnormal_reason": "在附近分店",
        },
    )
    assert with_reason.status_code == 201, with_reason.text
    assert with_reason.json()["distance_m"] > 500

    store_row = seeded_db["session"].query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    assert store_row.last_visit_at is not None
    # 补录时间早于首访时不得回退 last_visit_at
    assert store_row.last_visit_at >= datetime.fromisoformat(store["last_visit_at"])


def test_store_update_audit_and_relocate(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """关键字段变更写审计；搬迁保留原门店历史."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]

    edit = employee_http.put(
        f"{API}/public/merchant/stores/{store['id']}",
        json={"store_name": "门店改名"},
    )
    assert edit.status_code == 200, edit.text
    assert edit.json()["store_name"] == "门店改名"
    logs = (
        seeded_db["session"]
        .query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.action == "update")
        .all()
    )
    assert logs
    assert logs[-1].before["store_name"] != logs[-1].after["store_name"]

    no_type = employee_http.put(
        f"{API}/public/merchant/stores/{store['id']}",
        json={"address": "世纪大道 200 号", "lng": 121.51, "lat": 31.25},
    )
    assert no_type.status_code == 400, no_type.text

    relocated = employee_http.put(
        f"{API}/public/merchant/stores/{store['id']}",
        json={
            "address": "世纪大道 200 号",
            "lng": 121.51,
            "lat": 31.25,
            "change_type": "relocate",
            "change_reason": "门店搬迁",
        },
    )
    assert relocated.status_code == 200, relocated.text
    body = relocated.json()
    assert body["old_store_id"] == store["id"]
    assert body["new_store"]["address"] == "世纪大道 200 号"

    session: Session = seeded_db["session"]
    old = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    assert old.status == "relocated"
    assert old.relocated_to_store_id == body["new_store"]["id"]
    # 历史拜访仍留在原门店
    visits = session.query(MerchantVisit).filter(MerchantVisit.store_id == store["id"]).all()
    assert len(visits) == 1


def test_store_update_rejects_stale_updated_at(
    admin_http: TestClient,
    employee_http: TestClient,
) -> None:
    """REQ-M11-003 分支：并发修改时提交旧 updated_at 必须返回 409."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]
    url = f"{API}/public/merchant/stores/{store['id']}"
    stale_version = store["updated_at"]

    first = employee_http.put(url, json={"store_name": "第一次改名"})
    assert first.status_code == 200, first.text

    stale = employee_http.put(
        url,
        json={"store_name": "第二次改名", "expected_updated_at": stale_version},
    )
    assert stale.status_code == 409, stale.text
    assert "他人修改" in stale.json()["message"]


def test_visit_location_auth_denied_and_missing_store_coordinates(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """AC-V03-007：拒绝定位授权不得降级提交；门店无坐标时不得 500."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]

    denied = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "contact_name": "王店长",
            "location_status": "degraded",
            "location_failure_type": "auth_denied",
            "location_failure_reason": "用户拒绝授权",
        },
    )
    assert denied.status_code == 400, denied.text
    assert "授权" in denied.json()["message"]

    degraded = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "contact_name": "王店长",
            "location_status": "degraded",
            "location_failure_type": "timeout",
            "location_failure_reason": "弱网超时",
        },
    )
    assert degraded.status_code == 201, degraded.text
    assert degraded.json()["location_failure_type"] == "timeout"

    unavailable = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "contact_name": "王店长",
            "location_status": "degraded",
            "location_failure_type": "unavailable",
            "location_failure_reason": "设备定位服务不可用",
        },
    )
    assert unavailable.status_code == 201, unavailable.text
    assert unavailable.json()["location_status"] == "missing"

    # 门店无坐标（v110 允许坐标缺失）：distance 计算跳过，不得因 float(None) 抛 500
    session = seeded_db["session"]
    store_row = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    store_row.lng = None
    store_row.lat = None
    session.commit()

    visit = employee_http.post(
        f"{API}/public/merchant/visits",
        json={
            "store_id": store["id"],
            "contact_name": "王店长",
            "location_status": "normal",
            "lng": 121.5057,
            "lat": 31.2453,
        },
    )
    assert visit.status_code == 201, visit.text
    assert visit.json()["distance_m"] is None


def test_store_update_rejects_blank_required_fields_and_out_of_china_coordinates(
    employee_http: TestClient,
    admin_http: TestClient,
    seeded_db: dict,
) -> None:
    """必填字段被清空拒绝（REQ-M01B-003 分支 2）；坐标越界拒绝（M09-001）；无变化不写审计."""
    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]
    url = f"{API}/public/merchant/stores/{store['id']}"

    blank = employee_http.put(url, json={"store_name": "   "})
    assert blank.status_code == 400, blank.text
    assert "门店名称不能为空" in blank.json()["message"]

    blank_address = employee_http.put(url, json={"address": "  "})
    assert blank_address.status_code == 400, blank_address.text

    blank_reason = employee_http.put(url, json={"remark": "备注", "change_type": "edit", "change_reason": "   "})
    assert blank_reason.status_code == 422, blank_reason.text

    no_reason_correct = employee_http.put(
        url,
        json={"address": "世纪大道 200 号", "lng": 121.51, "lat": 31.25, "change_type": "correct"},
    )
    assert no_reason_correct.status_code == 400, no_reason_correct.text
    assert "变更原因" in no_reason_correct.json()["message"]

    # REQ-M02-002：地址变/坐标未变、坐标变/地址未变、跨区域、大距离分别给出差异化提示
    address_only = employee_http.put(
        url, json={"address": "南京东路 999 号", "change_type": "edit", "change_reason": "地址纠错"}
    )
    assert address_only.status_code == 400, address_only.text
    assert "重新选点" in address_only.json()["message"]

    coord_only = employee_http.put(
        url, json={"lng": 121.5001, "lat": 31.2401, "change_type": "edit", "change_reason": "坐标纠错"}
    )
    assert coord_only.status_code == 400, coord_only.text
    assert "确认地址" in coord_only.json()["message"]

    cross_region = employee_http.put(
        url, json={"district": "黄浦区", "change_type": "correct", "change_reason": "区县纠错"}
    )
    assert cross_region.status_code == 400, cross_region.text
    assert "门店搬迁" in cross_region.json()["message"]

    session = seeded_db["session"]
    session.expire_all()
    before_count = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.action == "update")
        .count()
    )
    # 与当前值完全一致：不写审计、返回 409「没有需要更新的字段」
    same = employee_http.put(url, json={"store_name": store["store_name"]})
    assert same.status_code == 409, same.text
    session.expire_all()
    after_count = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_store", OperationLog.action == "update")
        .count()
    )
    assert after_count == before_count


def test_broker_options_scoped_to_visible_stores(
    admin_http: TestClient,
    employee_http: TestClient,
    other_http: TestClient,
    employee_user: User,
    seeded_db: dict,
) -> None:
    """REQ-M12-003：经纪人下拉按数据范围收敛，员工看不到范围外门店的经纪人."""
    company = _create_company(admin_http)
    mine = _create_employee_store(employee_http, company["id"], name="我的门店")["store"]
    theirs = _create_employee_store(
        other_http,
        company["id"],
        name="他人门店",
        address="南京西路 200 号",
        lng=121.4595,
        lat=31.2295,
        contact_phone="13700009999",
        first_visit={"lng": 121.4595, "lat": 31.2295},
    )["store"]

    for store_id, name, phone in (
        (mine["id"], "我的经纪人", "13800002222"),
        (theirs["id"], "他人经纪人", "13800003333"),
    ):
        created = admin_http.post(
            f"{API}/admin/merchant/brokers",
            json={"name": name, "phone": phone, "store_id": store_id},
        )
        assert created.status_code == 201, created.text

    employee_admin = _client_for(seeded_db["session"], employee_user, c_side=False)
    resp = employee_admin.get(f"{API}/admin/merchant/brokers/options")
    assert resp.status_code == 200, resp.text
    names = {item["name"] for item in resp.json()["items"]}
    assert names == {"我的经纪人"}

    admin_options = admin_http.get(f"{API}/admin/merchant/brokers/options")
    assert {item["name"] for item in admin_options.json()["items"]} == {"我的经纪人", "他人经纪人"}


def test_visit_create_is_idempotent_with_client_request_id(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """REQ-M03-002：同一员工重复提交同一 client_request_id 只落一条拜访."""
    from models.merchant import MerchantVisit

    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]
    payload = _first_visit(client_request_id="first-visit-key-001")

    first = employee_http.post(f"{API}/public/merchant/visits", json=payload | {"store_id": store["id"]})
    assert first.status_code == 201, first.text
    second = employee_http.post(f"{API}/public/merchant/visits", json=payload | {"store_id": store["id"]})
    assert second.status_code == 201, second.text
    assert second.json()["id"] == first.json()["id"], (first.text, second.text)

    session = seeded_db["session"]
    count = session.query(MerchantVisit).filter(MerchantVisit.client_request_id == "first-visit-key-001").count()
    assert count == 1


def test_duplicate_check_tolerates_store_without_coordinates(
    admin_http: TestClient,
    employee_http: TestClient,
    seeded_db: dict,
) -> None:
    """存量门店坐标为空时查重不得 500（旧实现 float(None)），且 completed 语义准确."""
    from models.merchant import MerchantStore

    company = _create_company(admin_http)
    store = _create_employee_store(employee_http, company["id"])["store"]

    session: Session = seeded_db["session"]
    row = session.query(MerchantStore).filter(MerchantStore.id == store["id"]).one()
    row.lng = None
    row.lat = None
    session.commit()

    resp = admin_http.post(
        f"{API}/admin/merchant/stores/check-duplicates",
        json={
            "store_name": row.store_name,
            "address": row.address,
            "lng": 121.5057,
            "lat": 31.2453,
            "contact_phone": "13700002222",
        },
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["completed"] is True
    assert body["candidates"], "同名同址门店应被召回"
    assert all(item["distance_m"] is None for item in body["candidates"])
