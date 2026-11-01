"""商户管理 V09：协议到期 / 拜访超期通知、去重、收件人与任务监控."""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import (
    MerchantAgreement,
    MerchantCompany,
    MerchantStore,
    MerchantVisit,
    Notification,
    NotificationDeliveryLog,
    NotificationRecipient,
    Role,
    User,
)
from services.notification.events import EventType
from services.notification.service import EmitResult, NotificationEvent, NotificationService
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash
from utils.crypto import hash_phone

API = "/api/v1"
AGREEMENT_TYPE = str(EventType.MERCHANT_AGREEMENT_EXPIRING)
VISIT_TYPE = str(EventType.MERCHANT_VISIT_OVERDUE)
_SHANGHAI = ZoneInfo("Asia/Shanghai")


def _biz_date(value: datetime) -> str:
    """业务日期（Asia/Shanghai），与通知去重键/模板口径一致."""
    return value.astimezone(_SHANGHAI).date().isoformat()


def _client(session: Session, user: User) -> TestClient:
    from main import app

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    token = create_access_token(
        data={"sub": user.id, "role": user.role.code if user.role else "customer", "ver": user.token_version},
        audience=AUDIENCE_ADMIN,
    )
    return TestClient(
        app,
        cookies={"access_token": token},
        headers={"X-Requested-With": "XMLHttpRequest"},
    )


def _make_employee(session: Session, nickname: str = "员工", *, status: str = "active") -> User:
    """C 端员工账号：customer 主角色 + user 附加角色（与小程序绑定账号一致）."""
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user_role = session.query(Role).filter(Role.code == "user").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"v09-employee-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=customer_role.id,
        status=status,
    )
    user.roles.append(user_role)
    session.add(user)
    session.commit()
    return user


def _make_operator(session: Session, nickname: str = "运营") -> User:
    role = session.query(Role).filter(Role.code == "operator").one()
    user = User(
        id=str(uuid.uuid4()),
        username=f"v09-operator-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    return user


def _make_company(session: Session, name: str, phone: str | None = None) -> MerchantCompany:
    company = MerchantCompany(
        company_name=name,
        contact_name="公司联系人",
        contact_phone=phone,
    )
    session.add(company)
    session.flush()
    return company


def _make_store(
    session: Session,
    company: MerchantCompany,
    *,
    name: str,
    owner_employee_id: str | None,
    last_visit_at: datetime | None = None,
    status: str = "normal",
    is_deleted: bool = False,
) -> MerchantStore:
    store = MerchantStore(
        company_id=company.id,
        company_name=company.company_name,
        store_name=name,
        province="上海市",
        city="上海市",
        district="浦东新区",
        business_circle="陆家嘴商圈",
        address="世纪大道 100 号",
        contact_name="王店长",
        contact_phone="13700002222",
        source="backoffice",
        owner_employee_id=owner_employee_id,
        last_visit_at=last_visit_at,
        status=status,
        review_status="approved",
        is_deleted=is_deleted,
    )
    session.add(store)
    session.flush()
    return store


def _make_visit(session: Session, store: MerchantStore, *, employee_id: str, visited_at: datetime) -> MerchantVisit:
    visit = MerchantVisit(
        store_id=store.id,
        employee_id=employee_id,
        visited_at=visited_at,
        contact_name="王店长",
        visit_source="regular",
    )
    session.add(visit)
    session.flush()
    return visit


def _make_agreement(
    session: Session,
    *,
    subject_type: str = "store",
    store: MerchantStore | None = None,
    company: MerchantCompany | None = None,
    expire_at: datetime,
    status: str = "signed",
) -> MerchantAgreement:
    agreement = MerchantAgreement(
        store_id=store.id if store is not None else None,
        company_id=company.id if company is not None else None,
        subject_type=subject_type,
        agreement_no=f"V09-{uuid.uuid4().hex[:8]}",
        status=status,
        review_status="approved",
        signer_name="王店长",
        signer_phone="13700002222",
        expire_at=expire_at,
    )
    session.add(agreement)
    session.commit()
    return agreement


def _notifications(session: Session, notification_type: str) -> list[Notification]:
    return (
        session.query(Notification)
        .filter(Notification.type == notification_type)
        .order_by(Notification.created_at.asc())
        .all()
    )


def _recipient_ids(session: Session, notification: Notification) -> set[str]:
    return {
        row.user_id
        for row in session.query(NotificationRecipient)
        .filter(NotificationRecipient.notification_id == notification.id)
        .all()
    }


def _run(admin_client: TestClient) -> dict:
    resp = admin_client.post(f"{API}/admin/merchant/notify/run-daily")
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_agreement_expiring_notification_recipient_dedup_list_and_read(
    seeded_db: dict,
) -> None:
    """AC-V09-001/003/004/008/009/010/014：门店主体到期提醒→归属员工→列表已读."""
    session: Session = seeded_db["session"]
    employee = _make_employee(session)
    admin_client = _client(session, seeded_db["users"]["admin"])
    employee_client = _client(session, employee)

    company = _make_company(session, "到期测试公司")
    store = _make_store(session, company, name="到期测试门店", owner_employee_id=employee.id)
    expire_at = datetime.now(timezone.utc) + timedelta(days=10)
    agreement = _make_agreement(session, store=store, expire_at=expire_at)
    # AC-V09-002：已作废 / 已过期协议不产生提醒
    voided = _make_agreement(
        session,
        store=store,
        expire_at=expire_at,
        status="voided",
    )
    expired = _make_agreement(
        session,
        store=store,
        expire_at=datetime.now(timezone.utc) - timedelta(days=1),
    )
    session.commit()

    result = _run(admin_client)
    assert result["agreements"]["scanned"] == 1, result
    assert result["agreements"]["created"] == 1, result
    assert result["agreements"]["failed"] == 0

    notification = _notifications(session, AGREEMENT_TYPE)[0]
    assert notification.category == "merchant"
    assert notification.title == f"合作协议即将到期：{store.store_name}"
    assert notification.body == f"将于 {_biz_date(expire_at)} 到期，请及时续签"
    assert notification.action_type == "route"
    assert notification.action_url == f"/admin/merchant/agreements/{agreement.id}"
    assert notification.dedupe_key == f"merchant:agreement_expiring:{agreement.id}:{_biz_date(expire_at)}"
    assert notification.source_id == agreement.id
    assert {voided.id, expired.id} & {n.source_id for n in _notifications(session, AGREEMENT_TYPE)} == set()
    assert _recipient_ids(session, notification) == {employee.id}
    # AC-V09-014：正文不含明文手机号
    assert "13700002222" not in f"{notification.title}{notification.body}"

    # AC-V09-003：同一协议重复扫描只去重，不新建通知
    second = _run(admin_client)
    assert second["agreements"]["created"] == 0
    assert second["agreements"]["deduped"] == 1
    assert len(_notifications(session, AGREEMENT_TYPE)) == 1

    # AC-V09-008/009/010：仅本人可见、分类筛选、标记已读
    listed = employee_client.get(f"{API}/notifications?category=merchant").json()
    assert listed["total"] == 1
    assert listed["items"][0]["action_url"] == f"/admin/merchant/agreements/{agreement.id}"
    unread = employee_client.get(f"{API}/notifications/unread-count").json()
    assert unread["by_category"]["merchant"] == 1

    read = employee_client.post(f"{API}/notifications/{notification.id}/read")
    assert read.status_code == 200, read.text
    session.expire_all()
    recipient = (
        session.query(NotificationRecipient).filter(NotificationRecipient.notification_id == notification.id).one()
    )
    assert recipient.read_at is not None

    unread_after = employee_client.get(f"{API}/notifications?category=merchant&unread=true").json()
    assert unread_after["total"] == 0


def test_company_subject_recipient_and_operator_fallback(seeded_db: dict) -> None:
    """AC-V09-015：公司联系人匹配系统用户；未匹配转运营."""
    session: Session = seeded_db["session"]
    employee_phone = "13900003333"
    phone_owner = _make_employee(session, nickname="公司联系人")
    phone_owner.phone = employee_phone
    phone_owner.phone_hash = hash_phone(employee_phone)
    session.commit()
    operator = _make_operator(session)
    admin_client = _client(session, seeded_db["users"]["admin"])

    matched_company = _make_company(session, "联系人命中公司", employee_phone)
    matched = _make_agreement(
        session,
        subject_type="company",
        company=matched_company,
        expire_at=datetime.now(timezone.utc) + timedelta(days=12),
    )
    unmatched_company = _make_company(session, "联系人未命中公司", "13811119999")
    unmatched = _make_agreement(
        session,
        subject_type="company",
        company=unmatched_company,
        expire_at=datetime.now(timezone.utc) + timedelta(days=8),
    )
    session.commit()

    result = _run(admin_client)
    assert result["agreements"]["created"] == 2, result

    notifications = _notifications(session, AGREEMENT_TYPE)
    matched_note = next(n for n in notifications if n.source_id == matched.id)
    unmatched_note = next(n for n in notifications if n.source_id == unmatched.id)
    assert matched_note.title == "合作协议即将到期：联系人命中公司"
    assert _recipient_ids(session, matched_note) == {phone_owner.id}
    assert unmatched_note.title == "合作协议即将到期：联系人未命中公司"
    assert _recipient_ids(session, unmatched_note) == {operator.id}


def test_visit_overdue_scan_filters_and_new_cycle(seeded_db: dict) -> None:
    """AC-V09-005/006/007：超期提醒、停用/合并不提醒、新拜访后重新计算."""
    session: Session = seeded_db["session"]
    now = datetime.now(timezone.utc)
    employee = _make_employee(session)
    operator = _make_operator(session)
    inactive_employee = _make_employee(session, nickname="离职员工", status="inactive")
    admin_client = _client(session, seeded_db["users"]["admin"])
    company = _make_company(session, "拜访测试公司")

    overdue = _make_store(
        session,
        company,
        name="超期门店A",
        owner_employee_id=employee.id,
        last_visit_at=now - timedelta(days=40),
    )
    earliest = _make_store(session, company, name="仅历史拜访门店B", owner_employee_id=employee.id)
    _make_visit(session, earliest, employee_id=employee.id, visited_at=now - timedelta(days=45))
    no_visit = _make_store(session, company, name="无拜访门店C", owner_employee_id=employee.id)
    merged = _make_store(
        session,
        company,
        name="已合并门店D",
        owner_employee_id=employee.id,
        last_visit_at=now - timedelta(days=60),
        status="merged",
    )
    disabled = _make_store(
        session,
        company,
        name="已停用门店E",
        owner_employee_id=employee.id,
        last_visit_at=now - timedelta(days=60),
        status="disabled",
    )
    no_owner = _make_store(
        session,
        company,
        name="无归属门店F",
        owner_employee_id=None,
        last_visit_at=now - timedelta(days=50),
    )
    inactive_owner = _make_store(
        session,
        company,
        name="离职归属门店G",
        owner_employee_id=inactive_employee.id,
        last_visit_at=now - timedelta(days=35),
    )
    deleted = _make_store(
        session,
        company,
        name="已删除门店H",
        owner_employee_id=employee.id,
        last_visit_at=now - timedelta(days=60),
        is_deleted=True,
    )
    session.commit()

    result = _run(admin_client)
    # 正常门店 = A/B/C/F/G；D/E/H 不扫描
    assert result["visits"]["scanned"] == 5, result
    assert result["visits"]["created"] == 4, result
    assert result["visits"]["skipped"] == 1

    notifications = _notifications(session, VISIT_TYPE)
    by_store = {n.source_id: n for n in notifications}
    assert set(by_store) == {overdue.id, earliest.id, no_owner.id, inactive_owner.id}
    assert merged.id not in by_store
    assert disabled.id not in by_store
    assert deleted.id not in by_store
    assert no_visit.id not in by_store

    assert by_store[overdue.id].title == "门店超期未拜访：超期门店A"
    assert by_store[overdue.id].body.startswith("最近拜访 ")
    assert by_store[overdue.id].action_url == f"/admin/merchant/stores/{overdue.id}"
    assert _recipient_ids(session, by_store[overdue.id]) == {employee.id}
    assert _recipient_ids(session, by_store[earliest.id]) == {employee.id}
    # 归属员工为空 / 已停用 → 运营兜底
    assert _recipient_ids(session, by_store[no_owner.id]) == {operator.id}
    assert _recipient_ids(session, by_store[inactive_owner.id]) == {operator.id}
    # earliest 门店的锚点是最早拜访时间
    assert by_store[earliest.id].dedupe_key == (
        f"merchant:visit_overdue:{earliest.id}:{_biz_date(now - timedelta(days=45))}"
    )

    # 重复扫描去重
    second = _run(admin_client)
    assert second["visits"]["created"] == 0
    assert second["visits"]["deduped"] == 4
    assert len(_notifications(session, VISIT_TYPE)) == 4

    # AC-V09-007：新增拜访（20 天前）后不再超期；再形成新的超期周期时按新日期生成
    overdue.last_visit_at = now - timedelta(days=20)
    session.commit()
    third = _run(admin_client)
    assert third["visits"]["created"] == 0
    assert len(_notifications(session, VISIT_TYPE)) == 4

    overdue.last_visit_at = now - timedelta(days=33)
    session.commit()
    fourth = _run(admin_client)
    assert fourth["visits"]["created"] == 1, fourth
    notifications_after = _notifications(session, VISIT_TYPE)
    assert len(notifications_after) == 5
    expected_key = f"merchant:visit_overdue:{overdue.id}:{_biz_date(now - timedelta(days=33))}"
    assert any(n.dedupe_key == expected_key for n in notifications_after)


def test_merchant_preference_off_skips_in_app(seeded_db: dict) -> None:
    """分类偏好关闭后不产生收件记录；重新开启后可补发（去重/新建各按状态）."""
    session: Session = seeded_db["session"]
    employee = _make_employee(session)
    admin_client = _client(session, seeded_db["users"]["admin"])
    employee_client = _client(session, employee)
    company = _make_company(session, "偏好测试公司")
    store = _make_store(session, company, name="偏好测试门店", owner_employee_id=employee.id)
    first = _make_agreement(
        session,
        store=store,
        expire_at=datetime.now(timezone.utc) + timedelta(days=10),
    )
    session.commit()

    prefs = employee_client.get(f"{API}/notifications/preferences").json()
    assert prefs["categories"]["merchant"]["label"] == "商户"
    assert prefs["categories"]["merchant"]["description"] == "协议到期、门店拜访超期"

    off = employee_client.put(
        f"{API}/notifications/preferences",
        json={"categories": {"merchant": {"in_app": False}}},
    )
    assert off.status_code == 200, off.text

    second = _make_agreement(
        session,
        store=store,
        expire_at=datetime.now(timezone.utc) + timedelta(days=15),
    )
    session.commit()
    result = _run(admin_client)
    # 两条协议均解析到有效收件人，但用户关闭了站内信 → 跳过而非失败
    assert result["agreements"]["skipped"] == 2, result
    assert result["agreements"]["created"] == 0
    assert len(_notifications(session, AGREEMENT_TYPE)) == 0

    on = employee_client.put(
        f"{API}/notifications/preferences",
        json={"categories": {"merchant": {"in_app": True}}},
    )
    assert on.status_code == 200, on.text
    result = _run(admin_client)
    assert result["agreements"]["created"] == 2, result
    notifications = _notifications(session, AGREEMENT_TYPE)
    assert {n.source_id for n in notifications} == {first.id, second.id}


def test_task_failure_isolation_retry_and_run_records(
    seeded_db: dict,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """AC-V09-011/012: 单条模板异常不中断整批；修复后下一轮可重试；运行统计可查询."""
    session: Session = seeded_db["session"]
    employee = _make_employee(session)
    admin_client = _client(session, seeded_db["users"]["admin"])
    company = _make_company(session, "失败隔离公司")
    store = _make_store(session, company, name="失败隔离门店", owner_employee_id=employee.id)
    broken = _make_agreement(
        session,
        store=store,
        expire_at=datetime.now(timezone.utc) + timedelta(days=10),
    )
    healthy = _make_agreement(
        session,
        store=store,
        expire_at=datetime.now(timezone.utc) + timedelta(days=20),
    )
    session.commit()

    original_emit = NotificationService.emit

    def _flaky_emit(self: NotificationService, event: NotificationEvent) -> EmitResult:
        if event.type == EventType.MERCHANT_AGREEMENT_EXPIRING and event.source_id == broken.id:
            msg = "模拟模板缺失"
            raise ValueError(msg)
        return original_emit(self, event)

    monkeypatch.setattr(NotificationService, "emit", _flaky_emit)
    result = _run(admin_client)
    assert result["agreements"]["created"] == 1, result
    assert result["agreements"]["failed"] == 1, result
    assert any("TEMPLATE_MISSING" in error for error in result["agreements"]["errors"])
    assert {n.source_id for n in _notifications(session, AGREEMENT_TYPE)} == {healthy.id}

    monkeypatch.undo()
    retry = _run(admin_client)
    assert retry["agreements"]["created"] == 1, retry
    assert retry["agreements"]["deduped"] == 1, retry
    assert {n.source_id for n in _notifications(session, AGREEMENT_TYPE)} == {broken.id, healthy.id}

    records = admin_client.get(
        f"{API}/admin/merchant/notify/runs?date={retry['run_date']}&notify_type=agreement"
    ).json()
    assert len(records) == 2, records
    assert records[0]["stats"]["run_date"] == retry["run_date"]
    assert records[0]["stats"]["agreements"]["created"] == 1


def test_notify_task_requires_operator_role(seeded_db: dict) -> None:
    """REQ-M14-006：任务补跑与统计仅 admin/operator 可操作."""
    session: Session = seeded_db["session"]
    employee = _make_employee(session)
    client = _client(session, employee)
    resp = client.post(f"{API}/admin/merchant/notify/run-daily")
    assert resp.status_code == 403, resp.text
    runs = client.get(f"{API}/admin/merchant/notify/runs")
    assert runs.status_code == 403, runs.text


def test_daily_task_expires_due_agreements(seeded_db: dict) -> None:
    """REQ-M04-005：每日任务把已到期的已签署协议置为已过期，并写审计."""
    session: Session = seeded_db["session"]
    employee = _make_employee(session)
    admin_client = _client(session, seeded_db["users"]["admin"])

    company = _make_company(session, "过期扫描公司")
    store = _make_store(session, company, name="过期扫描门店", owner_employee_id=employee.id)
    due = _make_agreement(
        session,
        store=store,
        expire_at=datetime.now(timezone.utc) - timedelta(days=2),
    )
    session.commit()

    result = _run(admin_client)
    assert result["expired_agreements"] == 1, result

    session.expire_all()
    assert session.query(MerchantAgreement).filter(MerchantAgreement.id == due.id).one().status == "expired"

    from models import OperationLog

    log = (
        session.query(OperationLog)
        .filter(OperationLog.resource_type == "merchant_agreement", OperationLog.action == "expire_batch")
        .order_by(OperationLog.created_at.desc())
        .first()
    )
    assert log is not None
    assert log.after["count"] >= 1


def test_in_app_notification_records_delivery_log(seeded_db: dict) -> None:
    """站内信投递必须落 notification_delivery_logs（channel=in_app），供审计追溯."""
    session: Session = seeded_db["session"]
    employee = _make_employee(session)
    admin_client = _client(session, seeded_db["users"]["admin"])

    company = _make_company(session, "站内信审计公司")
    store = _make_store(session, company, name="站内信审计门店", owner_employee_id=employee.id)
    _make_agreement(session, store=store, expire_at=datetime.now(timezone.utc) + timedelta(days=5))
    session.commit()

    result = _run(admin_client)
    assert result["agreements"]["created"] == 1, result

    notification = _notifications(session, AGREEMENT_TYPE)[0]
    logs = (
        session.query(NotificationDeliveryLog).filter(NotificationDeliveryLog.notification_id == notification.id).all()
    )
    assert any(log.channel == "in_app" and log.status == "success" for log in logs), [
        (log.channel, log.status) for log in logs
    ]
    in_app = [log for log in logs if log.channel == "in_app"]
    assert {log.user_id for log in in_app} == {employee.id}


def test_notify_task_records_consecutive_failure_alerts(seeded_db: dict) -> None:
    """REQ-M14-006：连续 3 次任务失败后写告警审计（无外部告警通道时以审计+日志兜底）."""
    from models import OperationLog
    from services.merchant.tasks import record_failure

    session: Session = seeded_db["session"]
    for index in range(3):
        record_failure(session, RuntimeError(f"模拟失败 {index}"))

    session.expire_all()
    alerts = (
        session.query(OperationLog)
        .filter(
            OperationLog.resource_type == "merchant_notify_task",
            OperationLog.action == "notify_alert",
        )
        .all()
    )
    assert len(alerts) == 1
    assert alerts[0].after["reason"] == "consecutive_failures"
    assert alerts[0].after["count"] >= 3
