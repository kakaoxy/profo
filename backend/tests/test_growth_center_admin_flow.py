"""管理端获客中心统一线索流转/查号端点测试（/api/v1/admin/growth-center/leads/*）.

覆盖：booking 全矩阵流转（缺 reason/remark 422、重新激活 200）、
估价仅淘汰旁路与重新激活（409 拒绝、审计轨迹写入与保留、回写映射）、
招募新旧端点统一矩阵校验（旧端点回退 409、converted 终态 409）、
完整手机号查看（booking 原生解密/valuation 取 creator 号、状态不变、404）、
recruit:write 权限 403、remark 系统跟进记录与订阅通知静默路径。
"""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from models import Lead, LeadStatus, ProjectBooking, RecruitLead, RecruitLeadStatus, User
from models.growth_center import CustomerFollowUp
from settings import settings
from utils.auth import AUDIENCE_ADMIN, create_access_token
from utils.crypto import hash_phone

BASE = "/api/v1/admin/growth-center/leads"
OLD_RECRUIT_BASE = "/api/v1/admin/recruit/leads"


@pytest.fixture
def admin_flow_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """已认证管理员客户端（持 admin 角色全部权限含 recruit:write）.

    Cookie 认证的非安全方法（PUT）须携带 X-Requested-With 过 CSRF 中间件。
    """
    from main import app

    session: Session = seeded_db["session"]
    admin_user = seeded_db["users"]["admin"]
    token = create_access_token(
        data={"sub": admin_user.id, "role": "admin", "ver": admin_user.token_version},
        audience=AUDIENCE_ADMIN,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token}, headers={"X-Requested-With": "XMLHttpRequest"})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def low_perm_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """无 recruit:write 的后台登录用户客户端（user 角色仅只读权限）."""
    from main import app

    session: Session = seeded_db["session"]
    normal_user = seeded_db["users"]["normal"]
    token = create_access_token(
        data={"sub": normal_user.id, "role": "user", "ver": normal_user.token_version},
        audience=AUDIENCE_ADMIN,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"access_token": token}, headers={"X-Requested-With": "XMLHttpRequest"})
    yield client
    app.dependency_overrides.clear()


@pytest.fixture
def admin_flow_data(c_users: dict[str, User], seeded_db: dict[str, Any]) -> dict[str, Any]:
    """构建管理端流转测试自建数据（随测试事务回滚清理，不污染开发库）.

    - booking：new 状态预约线索（原生状态即统一 5 态，归属员工 A）；
    - valuation：估价线索（PENDING_ASSESSMENT，creator=customer 供手机号断言）；
    - recruit：new / contacted / converted 三条招募线索（新端点流转与矩阵校验）。
    """
    session: Session = seeded_db["session"]
    a = c_users["a"]
    customer = c_users["customer"]

    valuation = Lead(
        community_name="阳光花园",
        layout="2室1厅",
        area=89.5,
        expected_price=300.0,
        creator_id=customer.id,
        referrer_id=a.id,
    )
    recruit_new = RecruitLead(
        phone="13911110001",
        phone_hash=hash_phone("13911110001"),
        main_business_area="滨江商圈",
        referrer_employee_id=a.id,
        status=RecruitLeadStatus.NEW,
    )
    recruit_contacted = RecruitLead(
        phone="13911110002",
        phone_hash=hash_phone("13911110002"),
        main_business_area="滨江商圈",
        referrer_employee_id=a.id,
        status=RecruitLeadStatus.CONTACTED,
    )
    recruit_converted = RecruitLead(
        phone="13911110003",
        phone_hash=hash_phone("13911110003"),
        main_business_area="滨江商圈",
        referrer_employee_id=a.id,
        status=RecruitLeadStatus.CONVERTED,
    )
    booking = ProjectBooking(
        marketing_project_id=9101,
        user_id=customer.id,
        phone="13711110001",
        phone_hash=hash_phone("13711110001"),
        referrer_user_id=a.id,
    )
    session.add_all([valuation, recruit_new, recruit_contacted, recruit_converted, booking])
    session.commit()

    return {
        "booking_id": str(booking.id),
        "booking_phone": "13711110001",
        "valuation_id": valuation.id,
        "customer_phone": "13800001111",
        "recruit_new_id": recruit_new.id,
        "recruit_contacted_id": recruit_contacted.id,
        "recruit_converted_id": recruit_converted.id,
        "admin_id": seeded_db["users"]["admin"].id,
    }


# ─── booking 全矩阵流转 ──────────────────────────────────────────────────────


def test_booking_new_to_contacted_success(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """Booking new→contacted：200 返回 unified_status/native_status，DB 同步回写."""
    booking_id = admin_flow_data["booking_id"]

    resp = admin_flow_client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "contacted"})
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "contacted"


def test_booking_eliminate_missing_reason_422(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """Booking 淘汰缺 reason：422 且 DB 状态不变."""
    booking_id = admin_flow_data["booking_id"]

    resp = admin_flow_client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "eliminated"})
    assert resp.status_code == 422

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "new"


def test_booking_reactivate_remark_required_then_success(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """Booking 重新激活（eliminated→contacted）：缺 remark 422；带 remark 200 且落系统跟进记录."""
    booking_id = admin_flow_data["booking_id"]

    # 先流转至 eliminated
    resp = admin_flow_client.put(
        f"{BASE}/booking/{booking_id}/status",
        json={"status": "eliminated", "reason": "no_intent"},
    )
    assert resp.status_code == 200

    # 缺 remark 422，DB 状态不变
    resp = admin_flow_client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "contacted"})
    assert resp.status_code == 422
    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "eliminated"

    # 带 remark 重新激活成功
    resp = admin_flow_client.put(
        f"{BASE}/booking/{booking_id}/status",
        json={"status": "contacted", "remark": "客户重新有看房意向"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "contacted"

    # remark 非空自动落一条系统跟进记录（重新激活文案，操作人=当前管理员）
    rows = (
        db_session.query(CustomerFollowUp)
        .filter(CustomerFollowUp.module == "booking", CustomerFollowUp.lead_id == booking_id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].content == "重新激活为已联系：客户重新有看房意向"
    assert rows[0].created_by_id == admin_flow_data["admin_id"]


# ─── valuation 淘汰旁路 / 重新激活 ───────────────────────────────────────────


def test_valuation_non_bypass_transition_409(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """估价线非旁路流转（new→contacted）拒绝 409，DB 状态不变."""
    lead_id = admin_flow_data["valuation_id"]

    resp = admin_flow_client.put(f"{BASE}/valuation/{lead_id}/status", json={"status": "contacted"})
    assert resp.status_code == 409

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.PENDING_ASSESSMENT


def test_valuation_eliminate_lost_to_competitor_writes_audit(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """估价淘汰带 reason lost_to_competitor：回写 LOST_TO_COMPETITOR 并写审计轨迹."""
    lead_id = admin_flow_data["valuation_id"]

    resp = admin_flow_client.put(
        f"{BASE}/valuation/{lead_id}/status",
        json={"status": "eliminated", "reason": "lost_to_competitor", "remark": "客户选了他家"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "eliminated", "native_status": LeadStatus.LOST_TO_COMPETITOR.value}

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.LOST_TO_COMPETITOR
    assert lead.auditor_id == admin_flow_data["admin_id"]
    assert lead.audit_time is not None
    assert lead.audit_reason == "客户选了他家"


def test_valuation_reactivate_writeback_pending_visit_keeps_audit(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """估价重新激活：缺 remark 422；带 remark 回写 pending_visit 且审计字段保留淘汰时写入值."""
    lead_id = admin_flow_data["valuation_id"]

    # 先淘汰（写入审计字段）
    resp = admin_flow_client.put(
        f"{BASE}/valuation/{lead_id}/status",
        json={"status": "eliminated", "reason": "lost_to_competitor", "remark": "客户选了他家"},
    )
    assert resp.status_code == 200
    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    eliminated_at = lead.audit_time

    # 缺 remark 422
    resp = admin_flow_client.put(f"{BASE}/valuation/{lead_id}/status", json={"status": "contacted"})
    assert resp.status_code == 422

    # 带 remark 重新激活：回写 pending_visit
    resp = admin_flow_client.put(
        f"{BASE}/valuation/{lead_id}/status",
        json={"status": "contacted", "remark": "客户又有意向了"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": LeadStatus.PENDING_VISIT.value}

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.PENDING_VISIT
    # 审计字段保留淘汰时写入的值（不写新审计数据也不清除）
    assert lead.auditor_id == admin_flow_data["admin_id"]
    assert lead.audit_time == eliminated_at
    assert lead.audit_reason == "客户选了他家"


# ─── recruit 新旧端点统一矩阵校验 ────────────────────────────────────────────


def test_recruit_new_endpoint_transition_success(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """招募新端点（统一流转）new→contacted：200 返回统一/原生状态，DB 回写."""
    lead_id = admin_flow_data["recruit_new_id"]

    resp = admin_flow_client.put(f"{BASE}/recruit/{lead_id}/status", json={"status": "contacted"})
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    lead = db_session.query(RecruitLead).filter(RecruitLead.id == lead_id).one()
    assert lead.status == RecruitLeadStatus.CONTACTED


def test_recruit_old_endpoint_matrix_rejects(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """招募旧端点受统一矩阵约束：contacted→new 回退 409；converted 终态再流转 409（新旧端点一致）."""
    # 旧端点回退 contacted→new
    resp = admin_flow_client.put(
        f"{OLD_RECRUIT_BASE}/{admin_flow_data['recruit_contacted_id']}/status",
        json={"status": "new"},
    )
    assert resp.status_code == 409

    # converted 终态再流转：旧端点与新端点均 409
    resp = admin_flow_client.put(
        f"{OLD_RECRUIT_BASE}/{admin_flow_data['recruit_converted_id']}/status",
        json={"status": "contacted"},
    )
    assert resp.status_code == 409
    resp = admin_flow_client.put(
        f"{BASE}/recruit/{admin_flow_data['recruit_converted_id']}/status",
        json={"status": "high_intent"},
    )
    assert resp.status_code == 409

    # DB 状态均不变
    contacted = db_session.query(RecruitLead).filter(RecruitLead.id == admin_flow_data["recruit_contacted_id"]).one()
    assert contacted.status == RecruitLeadStatus.CONTACTED
    converted = db_session.query(RecruitLead).filter(RecruitLead.id == admin_flow_data["recruit_converted_id"]).one()
    assert converted.status == RecruitLeadStatus.CONVERTED


# ─── 完整手机号查看 ──────────────────────────────────────────────────────────


def test_booking_phone_full_number_status_unchanged(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """Booking 查看完整号码：解密返回明文且状态不变（管理端无「查看即联系」）."""
    booking_id = admin_flow_data["booking_id"]

    resp = admin_flow_client.get(f"{BASE}/booking/{booking_id}/phone")
    assert resp.status_code == 200
    assert resp.json() == {"phone": admin_flow_data["booking_phone"]}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "new"


def test_valuation_phone_returns_creator_phone(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
) -> None:
    """Valuation 查看号码：返回 creator 用户手机号且状态不变."""
    lead_id = admin_flow_data["valuation_id"]

    resp = admin_flow_client.get(f"{BASE}/valuation/{lead_id}/phone")
    assert resp.status_code == 200
    assert resp.json() == {"phone": admin_flow_data["customer_phone"]}

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.PENDING_ASSESSMENT


def test_phone_nonexistent_lead_404(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
) -> None:
    """不存在的线索ID查看号码统一 404."""
    assert admin_flow_client.get(f"{BASE}/recruit/nonexistent-lead-id/phone").status_code == 404
    assert admin_flow_client.get(f"{BASE}/valuation/nonexistent-lead-id/phone").status_code == 404


# ─── 权限与通知静默路径 ──────────────────────────────────────────────────────


def test_low_permission_user_403(
    low_perm_client: TestClient,
    admin_flow_data: dict[str, Any],
) -> None:
    """无 recruit:write 的后台登录用户：流转与查号均 403."""
    resp = low_perm_client.put(
        f"{BASE}/booking/{admin_flow_data['booking_id']}/status",
        json={"status": "contacted"},
    )
    assert resp.status_code == 403

    resp = low_perm_client.get(f"{BASE}/recruit/{admin_flow_data['recruit_new_id']}/phone")
    assert resp.status_code == 403


def test_transition_notify_silent_without_template(
    admin_flow_client: TestClient,
    admin_flow_data: dict[str, Any],
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """订阅通知静默路径：模板未配置（默认 settings）时流转成功不报错.

    强制模板键为空串（默认值即空串，避免本地 env 恰好配置走真实发送分支），
    booking 线索有归属员工且状态实际变化，必经通知挂点（通知内部捕获一切异常）。
    """
    monkeypatch.setattr(settings, "wechat_customer_lead_template_id", "")

    resp = admin_flow_client.put(
        f"{BASE}/booking/{admin_flow_data['booking_id']}/status",
        json={"status": "contacted", "remark": "电话沟通了看房需求"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(admin_flow_data["booking_id"])).one()
    assert booking.status == "contacted"
