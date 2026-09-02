"""「我的客户」C 端聚合接口测试（/api/v1/public/customers/my/*）.

覆盖：列表归属过滤与 module/status 筛选及计数、badge new 口径、
招募/估价/预约状态流转矩阵（含 eliminated→contacted 重新激活）、
估价淘汰原因回写映射（audit 轨迹）与重新激活回写 pending_visit、
booking 查看即联系/状态默认值（存量回填语义）、
跟进记录（创建校验/倒序/流转 remark 系统跟进）、归属安全（IDOR 404）
与招募查看号码隐式流转、订阅通知静默路径（模板未配置不报错）。
"""

from collections.abc import Callable
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Lead, LeadStatus, ProjectBooking, RecruitLead, RecruitLeadStatus, User
from models.growth_center import CustomerFollowUp
from services.growth_center.customer_notify import notify_customer_status_changed, notify_new_customer_lead
from settings import settings
from utils.crypto import hash_phone

BASE = "/api/v1/public/customers/my"

# my_customers_data 中 A 名下线索的固定计数口径：
# 估价 2（v1/v4）+ 房源单 1（s1）+ 招募 4（r1/r2/r_converted/r_eliminated）+ 预约 1
_EXPECTED_MODULE_COUNTS = {"valuation": 2, "booking": 1, "sheet": 1, "recruit": 4}
_EXPECTED_STATUS_COUNTS = {"new": 5, "contacted": 1, "high_intent": 0, "converted": 1, "eliminated": 1}


def test_list_ownership_filter(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
) -> None:
    """列表仅返回 referrer=当前用户的线索；他人线索与内部创建者线索不出现."""
    client = c_client_factory(c_users["a"])
    resp = client.get(BASE)
    assert resp.status_code == 200
    body = resp.json()

    assert body["total"] == 8
    ids = {item["id"] for item in body["items"]}
    assert len(ids) == 8
    # 他人线索不出现
    assert my_customers_data["recruit_b_id"] not in ids
    assert my_customers_data["valuation_b_id"] not in ids
    # 内部员工（admin）创建、归属 A 的估价线索被口径剔除
    assert my_customers_data["valuation_internal_id"] not in ids
    # A 自己的 4 模块线索均在
    assert my_customers_data["valuation_id"] in ids
    assert my_customers_data["sheet_id"] in ids
    assert my_customers_data["recruit_new_id"] in ids
    assert my_customers_data["booking_id"] in ids

    # 估价与房源单共用 leads 表，按 source_property_id 拆分 module；手机号取 creator 并脱敏
    items_by_id = {item["id"]: item for item in body["items"]}
    valuation = items_by_id[my_customers_data["valuation_id"]]
    assert valuation["module"] == "valuation"
    assert valuation["unified_status"] == "new"
    # 列表读路径 native_status 取 PG 枚举 label（大写）；phone/flow 写路径回 .value（小写）
    assert valuation["native_status"] == "PENDING_ASSESSMENT"
    assert valuation["phone_masked"] == "138****1111"
    sheet = items_by_id[my_customers_data["sheet_id"]]
    assert sheet["module"] == "sheet"
    assert sheet["sheet_code"] is None
    booking = items_by_id[my_customers_data["booking_id"]]
    assert booking["module"] == "booking"
    assert booking["phone_masked"] == "137****0001"
    recruit = items_by_id[my_customers_data["recruit_new_id"]]
    assert recruit["module"] == "recruit"
    assert recruit["phone_masked"] == "139****0001"


def test_list_module_status_filters_and_counts(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
) -> None:
    """module/status 筛选生效；module_counts/status_counts 恒为全部线索口径."""
    client = c_client_factory(c_users["a"])

    # module 筛选
    resp = client.get(BASE, params={"module": "recruit"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 4
    assert {item["module"] for item in body["items"]} == {"recruit"}
    # counts 不受筛选影响
    assert body["module_counts"] == _EXPECTED_MODULE_COUNTS
    assert body["status_counts"] == _EXPECTED_STATUS_COUNTS

    # status 筛选
    resp = client.get(BASE, params={"status": "contacted"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert [item["id"] for item in body["items"]] == [my_customers_data["recruit_contacted_id"]]

    # module + status 组合筛选
    resp = client.get(BASE, params={"module": "valuation", "status": "new"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 2
    assert {item["id"] for item in body["items"]} == {
        my_customers_data["valuation_id"],
        my_customers_data["valuation_spare_id"],
    }

    # sheet 单模块筛选
    resp = client.get(BASE, params={"module": "sheet"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["total"] == 1
    assert body["items"][0]["id"] == my_customers_data["sheet_id"]


def test_badge_new_count(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
) -> None:
    """Badge = 统一状态 new 的线索数（估价/房源单/招募 new + 预约恒 new）."""
    client = c_client_factory(c_users["a"])
    resp = client.get(f"{BASE}/badge")
    assert resp.status_code == 200
    assert resp.json()["new_count"] == 5

    # 招募 new→contacted 后 badge 减一；其余 new 线索（含预约）不受影响
    resp = client.put(
        f"{BASE}/recruit/{my_customers_data['recruit_new_id']}/status",
        json={"status": "contacted"},
    )
    assert resp.status_code == 200
    resp = client.get(f"{BASE}/badge")
    assert resp.status_code == 200
    assert resp.json()["new_count"] == 4


def test_recruit_transition_success_chain(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """招募合法流转逐级成功，响应与 DB 均回写原生状态."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["recruit_new_id"]

    resp = client.put(f"{BASE}/recruit/{lead_id}/status", json={"status": "contacted"})
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    resp = client.put(f"{BASE}/recruit/{lead_id}/status", json={"status": "high_intent"})
    assert resp.status_code == 200
    assert resp.json()["unified_status"] == "high_intent"

    resp = client.put(f"{BASE}/recruit/{lead_id}/status", json={"status": "converted"})
    assert resp.status_code == 200
    assert resp.json()["unified_status"] == "converted"

    lead = db_session.query(RecruitLead).filter(RecruitLead.id == lead_id).one()
    assert lead.status == RecruitLeadStatus.CONVERTED


def test_recruit_invalid_transitions_409(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """非法流转（回退/终态再流转/终态自我流转）一律 409 且 DB 状态不变."""
    client = c_client_factory(c_users["a"])

    # converted → contacted（回退）
    resp = client.put(
        f"{BASE}/recruit/{my_customers_data['recruit_converted_id']}/status",
        json={"status": "contacted"},
    )
    assert resp.status_code == 409

    # 终态 eliminated → converted
    resp = client.put(
        f"{BASE}/recruit/{my_customers_data['recruit_eliminated_id']}/status",
        json={"status": "converted"},
    )
    assert resp.status_code == 409

    # 终态流转到自身
    resp = client.put(
        f"{BASE}/recruit/{my_customers_data['recruit_converted_id']}/status",
        json={"status": "converted"},
    )
    assert resp.status_code == 409

    lead = db_session.query(RecruitLead).filter(RecruitLead.id == my_customers_data["recruit_converted_id"]).one()
    assert lead.status == RecruitLeadStatus.CONVERTED


def test_booking_invalid_transitions_409(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """Booking 全矩阵流转：终态回退与终态自我流转 409 且 DB 状态不变."""
    client = c_client_factory(c_users["a"])
    booking_id = my_customers_data["booking_id"]

    # new → converted 合法流转至终态
    resp = client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "converted"})
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "converted", "native_status": "converted"}

    # 终态回退 / 终态流转到自身一律 409
    resp = client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "new"})
    assert resp.status_code == 409
    resp = client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "converted"})
    assert resp.status_code == 409

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "converted"


def test_booking_transition_success_with_follow_up(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """Booking 合法流转 new→contacted：响应/DB 回写 status 列，remark 落系统跟进记录."""
    client = c_client_factory(c_users["a"])
    booking_id = my_customers_data["booking_id"]

    resp = client.put(
        f"{BASE}/booking/{booking_id}/status",
        json={"status": "contacted", "remark": "电话沟通了看房需求"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "contacted"

    rows = (
        db_session.query(CustomerFollowUp)
        .filter(CustomerFollowUp.module == "booking", CustomerFollowUp.lead_id == booking_id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].content == "状态流转为已联系：电话沟通了看房需求"
    assert rows[0].created_by_id == c_users["a"].id


def test_booking_eliminate_reason_required_and_success(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """Booking 淘汰：reason 缺失 422 且 DB 状态不变；带 reason 成功回写 eliminated."""
    client = c_client_factory(c_users["a"])
    booking_id = my_customers_data["booking_id"]

    resp = client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "eliminated"})
    assert resp.status_code == 422

    resp = client.put(
        f"{BASE}/booking/{booking_id}/status",
        json={"status": "eliminated", "reason": "no_intent"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "eliminated", "native_status": "eliminated"}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "eliminated"


def test_booking_reactivate_remark_required_and_success(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """Booking 重新激活（eliminated→contacted）：remark 缺失 422；带 remark 成功并落系统跟进."""
    client = c_client_factory(c_users["a"])
    booking_id = my_customers_data["booking_id"]

    # 先流转至 eliminated
    resp = client.put(
        f"{BASE}/booking/{booking_id}/status",
        json={"status": "eliminated", "reason": "no_intent"},
    )
    assert resp.status_code == 200

    # 无 remark 拒绝
    resp = client.put(f"{BASE}/booking/{booking_id}/status", json={"status": "contacted"})
    assert resp.status_code == 422
    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "eliminated"

    # 带 remark 重新激活成功
    resp = client.put(
        f"{BASE}/booking/{booking_id}/status",
        json={"status": "contacted", "remark": "客户重新有看房意向"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "contacted"

    rows = (
        db_session.query(CustomerFollowUp)
        .filter(CustomerFollowUp.module == "booking", CustomerFollowUp.lead_id == booking_id)
        .all()
    )
    assert len(rows) == 1
    assert rows[0].content == "重新激活为已联系：客户重新有看房意向"
    assert rows[0].created_by_id == c_users["a"].id


def test_booking_phone_view_implicit_transition(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """Booking 查看即联系：new 状态查看号码后自动流转 contacted；非 new 状态查看不变."""
    client = c_client_factory(c_users["a"])
    booking_id = my_customers_data["booking_id"]

    # new → 查看即联系
    resp = client.get(f"{BASE}/booking/{booking_id}/phone")
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == my_customers_data["booking_phone"]
    assert body["unified_status"] == "contacted"
    assert body["native_status"] == "contacted"

    booking = db_session.query(ProjectBooking).filter(ProjectBooking.id == int(booking_id)).one()
    assert booking.status == "contacted"

    # 非 new（contacted）→ 查看号码状态不变
    resp = client.get(f"{BASE}/booking/{booking_id}/phone")
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == my_customers_data["booking_phone"]
    assert body["unified_status"] == "contacted"
    assert body["native_status"] == "contacted"

    db_session.refresh(booking)
    assert booking.status == "contacted"


def test_booking_default_status_new_backfill(
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """存量回填语义：新建 booking 未显式传 status（或显式传 None）落库后 status == new.

    覆盖模型 default/server_default 链路（对应启动迁移对存量行的回填语义）。
    """
    b_default = ProjectBooking(
        marketing_project_id=990001,
        user_id=c_users["customer"].id,
        phone="13700000011",
        phone_hash=hash_phone("13700000011"),
        referrer_user_id=c_users["a"].id,
    )
    b_none = ProjectBooking(
        marketing_project_id=990002,
        user_id=c_users["customer"].id,
        phone="13700000012",
        phone_hash=hash_phone("13700000012"),
        referrer_user_id=c_users["a"].id,
        status=None,
    )
    db_session.add_all([b_default, b_none])
    db_session.commit()

    db_session.expire_all()
    rows = {
        b.id: b.status
        for b in db_session.query(ProjectBooking).filter(ProjectBooking.id.in_([b_default.id, b_none.id])).all()
    }
    assert rows[b_default.id] == "new"
    assert rows[b_none.id] == "new"


def test_valuation_eliminate_writeback_lost_to_competitor(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """估价线淘汰旁路：lost_to_competitor → 原生 LOST_TO_COMPETITOR + 审计轨迹回写."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["valuation_id"]

    resp = client.put(
        f"{BASE}/valuation/{lead_id}/status",
        json={"status": "eliminated", "reason": "lost_to_competitor", "remark": "客户选了他家"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["unified_status"] == "eliminated"
    assert body["native_status"] == LeadStatus.LOST_TO_COMPETITOR.value

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.LOST_TO_COMPETITOR
    assert lead.auditor_id == c_users["a"].id
    assert lead.audit_time is not None
    assert lead.audit_reason == "客户选了他家"


def test_valuation_eliminate_writeback_no_intent(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """估价线淘汰旁路：no_intent → 原生 REJECTED."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["valuation_spare_id"]

    resp = client.put(f"{BASE}/valuation/{lead_id}/status", json={"status": "eliminated", "reason": "no_intent"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["unified_status"] == "eliminated"
    assert body["native_status"] == LeadStatus.REJECTED.value

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.REJECTED


def test_valuation_non_eliminated_transition_409(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
) -> None:
    """估价/房源单仅支持淘汰旁路：非 eliminated 目标状态一律 409."""
    client = c_client_factory(c_users["a"])
    for target in ("contacted", "high_intent", "converted"):
        resp = client.put(f"{BASE}/valuation/{my_customers_data['valuation_id']}/status", json={"status": target})
        assert resp.status_code == 409


def test_valuation_eliminate_missing_reason_422(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """Eliminated 缺 reason（或 reason 非法取值）校验失败 422，DB 状态不变."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["valuation_id"]

    resp = client.put(f"{BASE}/valuation/{lead_id}/status", json={"status": "eliminated"})
    assert resp.status_code == 422

    resp = client.put(f"{BASE}/valuation/{lead_id}/status", json={"status": "eliminated", "reason": ""})
    assert resp.status_code == 422

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.PENDING_ASSESSMENT


def test_valuation_reactivate_writeback_pending_visit(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """估价重新激活（eliminated→contacted）：原生状态回写 pending_visit，审计字段保持淘汰时写入值."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["valuation_id"]

    # 先淘汰（写入审计字段）
    resp = client.put(
        f"{BASE}/valuation/{lead_id}/status",
        json={"status": "eliminated", "reason": "lost_to_competitor", "remark": "客户选了他家"},
    )
    assert resp.status_code == 200

    # 重新激活：无 remark 拒绝
    resp = client.put(f"{BASE}/valuation/{lead_id}/status", json={"status": "contacted"})
    assert resp.status_code == 422
    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.LOST_TO_COMPETITOR

    # 带 remark 重新激活成功：回写 pending_visit
    resp = client.put(
        f"{BASE}/valuation/{lead_id}/status",
        json={"status": "contacted", "remark": "客户又有意向了"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["unified_status"] == "contacted"
    assert body["native_status"] == LeadStatus.PENDING_VISIT.value

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.PENDING_VISIT
    # 重新激活不写审计字段：保持淘汰时写入的值（未被清除/覆盖为重新激活数据）
    assert lead.auditor_id == c_users["a"].id
    assert lead.audit_time is not None
    assert lead.audit_reason == "客户选了他家"

    rows = (
        db_session.query(CustomerFollowUp)
        .filter(CustomerFollowUp.module == "valuation", CustomerFollowUp.lead_id == lead_id)
        .all()
    )
    assert any(row.content == "重新激活为已联系：客户又有意向了" for row in rows)


def test_follow_up_create_validation_and_desc_order(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """POST 跟进记录写入 created_by_id；空内容拒绝；GET 按跟进时间倒序."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["recruit_new_id"]

    # 空内容与超长内容拒绝
    resp = client.post(f"{BASE}/recruit/{lead_id}/follow-ups", json={"content": ""})
    assert resp.status_code == 422
    resp = client.post(f"{BASE}/recruit/{lead_id}/follow-ups", json={"content": "长" * 501})
    assert resp.status_code == 422

    # 成功创建：201 + created_by_id=当前用户
    resp = client.post(f"{BASE}/recruit/{lead_id}/follow-ups", json={"content": "首次电话沟通"})
    assert resp.status_code == 201
    first = resp.json()
    assert first["module"] == "recruit"
    assert first["lead_id"] == lead_id
    assert first["created_by_id"] == c_users["a"].id
    assert first["created_by_name"] == "员工A"

    resp = client.post(f"{BASE}/recruit/{lead_id}/follow-ups", json={"content": "第二次沟通"})
    assert resp.status_code == 201
    second = resp.json()

    # 显式改写首条时间保证倒序断言确定性（默认同秒创建可能并列）
    earlier = db_session.get(CustomerFollowUp, first["id"])
    assert earlier is not None
    earlier.created_at = datetime.now(timezone.utc) - timedelta(hours=2)
    db_session.commit()

    resp = client.get(f"{BASE}/recruit/{lead_id}/follow-ups")
    assert resp.status_code == 200
    items = resp.json()
    assert [item["id"] for item in items] == [second["id"], first["id"]]


def test_transition_remark_creates_system_follow_up(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
) -> None:
    """流转携带 remark 自动落一条系统跟进记录（created_by_id=操作人）."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["recruit_contacted_id"]

    resp = client.put(
        f"{BASE}/recruit/{lead_id}/status",
        json={"status": "high_intent", "remark": "客户明确意向"},
    )
    assert resp.status_code == 200

    resp = client.get(f"{BASE}/recruit/{lead_id}/follow-ups")
    assert resp.status_code == 200
    items = resp.json()
    assert len(items) == 1
    assert items[0]["content"] == "状态流转为意向高：客户明确意向"
    assert items[0]["created_by_id"] == c_users["a"].id
    assert items[0]["module"] == "recruit"


def test_ownership_security_404(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
) -> None:
    """他人访问详情/phone/follow-ups（读写）统一 404，不泄露存在性；本人可访问."""
    a_client = c_client_factory(c_users["a"])
    b_client = c_client_factory(c_users["b"])
    lead_id = my_customers_data["recruit_new_id"]

    # B 访问 A 的线索 → 404
    assert b_client.get(f"{BASE}/recruit/{lead_id}").status_code == 404
    assert b_client.get(f"{BASE}/recruit/{lead_id}/phone").status_code == 404
    assert b_client.get(f"{BASE}/recruit/{lead_id}/follow-ups").status_code == 404
    assert b_client.post(f"{BASE}/recruit/{lead_id}/follow-ups", json={"content": "越权写入"}).status_code == 404
    assert b_client.put(f"{BASE}/recruit/{lead_id}/status", json={"status": "contacted"}).status_code == 404

    # 不存在的线索同样 404
    assert a_client.get(f"{BASE}/recruit/nonexistent-lead-id").status_code == 404

    # 本人正常访问
    resp = a_client.get(f"{BASE}/recruit/{lead_id}")
    assert resp.status_code == 200
    assert resp.json()["module"] == "recruit"
    assert "timeline" in resp.json()


def test_recruit_phone_view_implicit_transition(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """招募查看完整号码：解密返回明文，并隐式流转 new→contacted."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["recruit_new_id"]

    resp = client.get(f"{BASE}/recruit/{lead_id}/phone")
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == my_customers_data["recruit_new_phone"]
    assert body["unified_status"] == "contacted"
    assert body["native_status"] == "contacted"

    lead = db_session.query(RecruitLead).filter(RecruitLead.id == lead_id).one()
    assert lead.status == RecruitLeadStatus.CONTACTED


def test_valuation_phone_view_keeps_status(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """估价线查看号码：返回 creator 解密手机号，状态不变（无隐式流转）."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["valuation_id"]

    resp = client.get(f"{BASE}/valuation/{lead_id}/phone")
    assert resp.status_code == 200
    body = resp.json()
    assert body["phone"] == my_customers_data["customer_phone"]
    assert body["unified_status"] == "new"
    assert body["native_status"] == "pending_assessment"

    lead = db_session.query(Lead).filter(Lead.id == lead_id).one()
    assert lead.status == LeadStatus.PENDING_ASSESSMENT


def test_recruit_reactivate_remark_required_and_success(
    c_client_factory: Callable[[User], TestClient],
    my_customers_data: dict[str, Any],
    c_users: dict[str, User],
    db_session: Session,
) -> None:
    """招募重新激活（eliminated→contacted）：remark 缺失 422；带 remark 成功回写原生状态并落系统跟进."""
    client = c_client_factory(c_users["a"])
    lead_id = my_customers_data["recruit_eliminated_id"]

    # 无 remark 拒绝
    resp = client.put(f"{BASE}/recruit/{lead_id}/status", json={"status": "contacted"})
    assert resp.status_code == 422
    lead = db_session.query(RecruitLead).filter(RecruitLead.id == lead_id).one()
    assert lead.status == RecruitLeadStatus.ELIMINATED

    # 带 remark 重新激活成功
    resp = client.put(
        f"{BASE}/recruit/{lead_id}/status",
        json={"status": "contacted", "remark": "客户重新有合作意向"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"unified_status": "contacted", "native_status": "contacted"}

    lead = db_session.query(RecruitLead).filter(RecruitLead.id == lead_id).one()
    assert lead.status == RecruitLeadStatus.CONTACTED

    rows = (
        db_session.query(CustomerFollowUp)
        .filter(CustomerFollowUp.module == "recruit", CustomerFollowUp.lead_id == lead_id)
        .all()
    )
    assert any(row.content == "重新激活为已联系：客户重新有合作意向" for row in rows)


def test_customer_notify_silent_without_template(
    c_users: dict[str, User],
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """订阅通知静默路径：模板未配置（默认 settings）时新线索/状态变更通知均不报错."""
    # 强制模板未配置（默认值即空串），避免本地 env 恰好配置时走真实发送分支
    monkeypatch.setattr(settings, "wechat_customer_lead_template_id", "")

    # 任一调用抛异常即测试失败：新线索 / 状态变更 / 无归属员工三个路径均静默
    notify_new_customer_lead(db_session, "valuation", "notify-lead-1", c_users["a"].id, "阳光花园")
    notify_customer_status_changed(db_session, "recruit", "notify-lead-2", c_users["a"].id, "已联系", "滨江商圈")
    notify_new_customer_lead(db_session, "booking", "notify-lead-3", None, "房源标题")
