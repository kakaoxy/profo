"""估价分享归因 + 员工获客接口测试.

覆盖：
1. C 端提交估价时 referrer 归因：
   - 客户直接提交（无 referrer）：creator=客户，referrer_id=None
   - 经分享提交（referrer=有效员工）：creator=客户，referrer_id=员工
   - 非法 referrer（不存在 / 非 active 用户）静默忽略，不阻断提交
   - admin 后台 POST /leads 录入：creator=员工，referrer_id=None
2. 员工获客接口 /public/leads/my/acquired：
   - 归属隔离（员工A看不到员工B的获客）
   - 来源标签（customer_share / employee_entry）
   - 手机号脱敏（仅分享归因且客户有手机号时返回）
   - 分页与状态筛选
   - 手机号接口归属校验（他人线索 404 / 直接录入线索返回 null）
"""

from collections.abc import Generator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import LeadStatus, Role, User
from models.lead import Lead
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone

_PUBLIC_LEADS = "/api/v1/public/leads"
_ADMIN_LEADS = "/api/v1/leads"


def _create_customer_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str = "C端员工",
    phone: str | None = None,
    status: str = "active",
) -> User:
    """创建 customer 主角色的用户（纯 C 端身份，无后台身份）."""
    customer_role = session.query(Role).filter(Role.code == "customer").first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash("Test1234!"),
        nickname=nickname,
        phone=phone,
        phone_hash=hash_phone(phone) if phone else None,
        role_id=customer_role.id,
        status=status,
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_employee_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    nickname: str = "员工",
    phone: str | None = None,
) -> User:
    """创建后台身份（user 主角色）+ customer 附加角色的员工，与生产员工模型一致."""
    user_role = session.query(Role).filter(Role.code == "user").first()
    customer_role = session.query(Role).filter(Role.code == "customer").first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash("Test1234!"),
        nickname=nickname,
        phone=phone,
        phone_hash=hash_phone(phone) if phone else None,
        role_id=user_role.id,
        status="active",
    )
    session.add(user)
    session.flush()
    user.roles.append(customer_role)
    session.commit()
    session.refresh(user)
    return user


@contextmanager
def _make_c_client(session: Session, user: User) -> Generator[TestClient, None, None]:
    """创建指定用户的 C 端客户端（aud=c）."""
    token = create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    client = TestClient(app, cookies={"c_access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    try:
        yield client
    finally:
        app.dependency_overrides.clear()


def _submit_lead(client: TestClient, *, community_name: str, referrer: str | None = None) -> str:
    """通过 /public/leads 提交估价，返回 lead_id."""
    payload: dict[str, Any] = {"community_name": community_name, "floor_info": "1/6层"}
    if referrer is not None:
        payload["referrer"] = referrer
    resp = client.post(_PUBLIC_LEADS, json=payload)
    assert resp.status_code == 201, f"提交应返回 201，实际 {resp.status_code}: {resp.text}"
    return resp.json()["id"]


class TestShareAttribution:
    """C 端提交估价 referrer 归因."""

    def test_direct_submit_creator_is_customer_no_referrer(
        self, c_end_client: TestClient, seeded_db: dict[str, Any]
    ) -> None:
        """客户直接提交（无 referrer）：creator=客户，referrer_id=None."""
        session: Session = seeded_db["session"]
        lead_id = _submit_lead(c_end_client, community_name="直接提交小区")

        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.creator_id == "customer-user"
        assert lead.referrer_id is None

    def test_shared_submit_referrer_is_valid_employee(
        self, c_end_client: TestClient, seeded_db: dict[str, Any]
    ) -> None:
        """经分享提交（referrer=有效员工）：creator=客户，referrer_id=员工."""
        session: Session = seeded_db["session"]
        admin_id = seeded_db["users"]["admin"].id
        lead_id = _submit_lead(c_end_client, community_name="分享提交小区", referrer=admin_id)

        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.creator_id == "customer-user"
        assert lead.referrer_id == admin_id

    def test_invalid_referrer_ignored(self, c_end_client: TestClient, seeded_db: dict[str, Any]) -> None:
        """非法 referrer（不存在 / 非 active / 无后台身份）静默忽略，不阻断提交."""
        session: Session = seeded_db["session"]

        # 不存在的员工：静默忽略
        lead_id = _submit_lead(c_end_client, community_name="无效员工小区", referrer="no-such-employee")
        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.creator_id == "customer-user"
        assert lead.referrer_id is None

        # 非 active 员工：静默忽略
        inactive = _create_customer_user(session, user_id="emp-inactive", username="empinactive", status="inactive")
        lead_id = _submit_lead(c_end_client, community_name="非活跃员工小区", referrer=inactive.id)
        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.creator_id == "customer-user"
        assert lead.referrer_id is None

        # 仅 C 端身份（customer 主角色，无后台身份）的 active 用户：不是员工，静默忽略
        customer_only = _create_customer_user(session, user_id="emp-customer-only", username="empcustomeronly")
        lead_id = _submit_lead(c_end_client, community_name="仅C端用户小区", referrer=customer_only.id)
        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.creator_id == "customer-user"
        assert lead.referrer_id is None

    def test_admin_lead_create_creator_is_employee(self, backend_client: TestClient, seeded_db: dict[str, Any]) -> None:
        """Admin 后台 POST /leads 录入：creator=员工，referrer_id=None."""
        session: Session = seeded_db["session"]
        resp = backend_client.post(_ADMIN_LEADS, json={"community_name": "后台录入小区", "floor_info": "1/6层"})
        assert resp.status_code == 200, f"后台录入应返回 200，实际 {resp.status_code}: {resp.text}"
        lead_id = resp.json()["id"]

        lead = session.query(Lead).filter(Lead.id == lead_id).first()
        assert lead is not None
        assert lead.creator_id == seeded_db["users"]["admin"].id
        assert lead.referrer_id is None


@pytest.fixture
def acquired_setup(seeded_db: dict[str, Any], customer_user: User) -> dict[str, Any]:
    """员工获客接口基础数据.

    - emp_a：1 条分享归因线索（客户提交，referrer=emp_a）+ 1 条直接录入线索
    - emp_b：1 条分享归因线索（客户提交，referrer=emp_b）
    """
    session: Session = seeded_db["session"]
    emp_a = _create_employee_user(session, user_id="emp-a", username="empa", nickname="员工A")
    emp_b = _create_employee_user(session, user_id="emp-b", username="empb", nickname="员工B")

    # 分享归因线索的手机号取自 creator（客户），需给客户绑定手机号（脱敏/解密断言依赖）
    customer_user.phone = "13800138001"
    customer_user.phone_hash = hash_phone("13800138001")
    session.commit()

    with _make_c_client(session, customer_user) as customer_client:
        lead_share_a = _submit_lead(customer_client, community_name="分享A小区", referrer=emp_a.id)
        lead_share_b = _submit_lead(customer_client, community_name="分享B小区", referrer=emp_b.id)

    with _make_c_client(session, emp_a) as emp_a_client:
        lead_direct_a = _submit_lead(emp_a_client, community_name="直接A小区")

    return {
        "session": session,
        "emp_a": emp_a,
        "emp_b": emp_b,
        "lead_share_a": lead_share_a,
        "lead_share_b": lead_share_b,
        "lead_direct_a": lead_direct_a,
    }


class TestAcquiredLeads:
    """员工获客接口."""

    def test_acquired_isolation_source_and_phone_mask(self, acquired_setup: dict[str, Any]) -> None:
        """归属隔离 + 来源标签 + 手机号脱敏."""
        session: Session = acquired_setup["session"]
        emp_a: User = acquired_setup["emp_a"]
        emp_b: User = acquired_setup["emp_b"]

        # 员工A：应看到 2 条（分享归因 + 直接录入），看不到员工B的
        with _make_c_client(session, emp_a) as client:
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired")
            assert resp.status_code == 200, f"获客列表应返回 200，实际 {resp.status_code}: {resp.text}"
            body = resp.json()
            assert body["total"] == 2
            by_id = {item["id"]: item for item in body["items"]}

            share_item = by_id[acquired_setup["lead_share_a"]]
            assert share_item["source"] == "customer_share"
            assert share_item["phone_masked"] == "138****8001"
            assert share_item["status_display"] == "待评估"
            assert share_item["status_color"] == "#FFA500"

            direct_item = by_id[acquired_setup["lead_direct_a"]]
            assert direct_item["source"] == "employee_entry"
            assert direct_item["phone_masked"] is None

        # 员工B：应只看到 1 条自己的分享，看不到员工A的分享与直接录入
        with _make_c_client(session, emp_b) as client:
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired")
            assert resp.status_code == 200
            body = resp.json()
            assert body["total"] == 1
            ids = {item["id"] for item in body["items"]}
            assert ids == {acquired_setup["lead_share_b"]}

    def test_acquired_pagination_and_status_filter(self, acquired_setup: dict[str, Any]) -> None:
        """分页与状态筛选."""
        session: Session = acquired_setup["session"]
        emp_a: User = acquired_setup["emp_a"]

        # 追加一条已签约的直接录入线索（默认提交为 PENDING_ASSESSMENT）
        with _make_c_client(session, emp_a) as emp_a_client:
            lead_extra_id = _submit_lead(emp_a_client, community_name="直接A2小区")
        extra_lead = session.query(Lead).filter(Lead.id == lead_extra_id).first()
        assert extra_lead is not None
        extra_lead.status = LeadStatus.SIGNED
        session.commit()

        with _make_c_client(session, emp_a) as client:
            # 状态筛选：仅 signed
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired", params={"status": "signed"})
            assert resp.status_code == 200
            body = resp.json()
            assert body["total"] == 1
            assert body["items"][0]["status"] == "signed"

            # 分页：page_size=1 → 每页 1 条，total 反映全部
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired", params={"page": 1, "page_size": 1})
            assert resp.status_code == 200
            body = resp.json()
            assert body["total"] == 3
            assert len(body["items"]) == 1
            assert body["page"] == 1
            assert body["page_size"] == 1

    def test_acquired_stats(self, acquired_setup: dict[str, Any]) -> None:
        """获客状态统计（与列表同口径）."""
        session: Session = acquired_setup["session"]
        emp_a: User = acquired_setup["emp_a"]

        with _make_c_client(session, emp_a) as client:
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired/stats")
            assert resp.status_code == 200, f"获客统计应返回 200，实际 {resp.status_code}: {resp.text}"
            body = resp.json()
            assert body["total"] == 2
            assert body["pending_assessment"] == 2
            assert body["pending_visit"] == 0
            assert body["visited"] == 0
            assert body["signed"] == 0
            assert body["rejected"] == 0

    def test_acquired_phone_ownership(self, acquired_setup: dict[str, Any]) -> None:
        """手机号接口归属校验：分享归因返回真实手机号 / 直接录入返回 null / 他人线索 404."""
        session: Session = acquired_setup["session"]
        emp_a: User = acquired_setup["emp_a"]
        emp_b: User = acquired_setup["emp_b"]

        # 员工A查看自己分享归因线索 → 解密真实手机号
        with _make_c_client(session, emp_a) as client:
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired/{acquired_setup['lead_share_a']}/phone")
            assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
            assert resp.json()["phone"] == "13800138001"

            # 直接录入线索 → phone=null
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired/{acquired_setup['lead_direct_a']}/phone")
            assert resp.status_code == 200
            assert resp.json()["phone"] is None

        # 员工B查看员工A的分享线索 → 404（不归属）
        with _make_c_client(session, emp_b) as client:
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired/{acquired_setup['lead_share_a']}/phone")
            assert resp.status_code == 404, f"他人线索应返回 404，实际 {resp.status_code}: {resp.text}"

            # 不存在的线索 → 404
            resp = client.get(f"{_PUBLIC_LEADS}/my/acquired/no-such-lead/phone")
            assert resp.status_code == 404
