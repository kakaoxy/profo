"""房源预约接口测试（POST /public/bookings、GET /public/bookings/my、GET /public/projects/my/customers）.

覆盖：
1. 预约成功：已绑手机号 + 已发布房源 + 带 referrer 的访问埋点 → 归因正确
2. 无访问埋点 → referrer_user_id 为空
3. 重复预约幂等：返回既有记录 is_new=false，库内仍 1 行
4. 未绑手机号 → 409 + {"code":≠0,"message":...}
5. 房源不存在 / 未发布 → 404
6. 我的预约列表：房源快照字段 / created_at 倒序 / marketing_project_id 过滤
7. 归属我的预约客户列表：仅见归因于自己的预约 / 手机号脱敏 / 未登录 401
"""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import (
    L4MarketingProject,
    MarketingProjectStatus,
    ProjectBooking,
    ProjectVisit,
    PublishStatus,
    Role,
    User,
)
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash
from utils.crypto import hash_phone

_BOOKINGS_URL = "/api/v1/public/bookings"
_MY_CUSTOMERS_URL = "/api/v1/public/projects/my/customers"
_BASE_TIME = datetime(2026, 8, 23, 12, 0, 0, tzinfo=timezone.utc)


def _create_customer(
    session: Session,
    *,
    user_id: str,
    username: str,
    phone: str | None,
) -> User:
    """创建 C 端用户（可选手机号）."""
    role = session.query(Role).filter(Role.code == "customer").first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash("Test1234!"),
        nickname=username,
        phone=phone,
        phone_hash=hash_phone(phone) if phone else None,
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _create_project(
    session: Session,
    *,
    project_id: int,
    title: str,
    publish_status: str | None = None,
) -> L4MarketingProject:
    """创建房源（默认已发布）."""
    project = L4MarketingProject(
        id=project_id,
        community_id=f"comm-{project_id}",
        community_name=f"阳光花园{project_id}号院",
        layout="三室两厅",
        orientation="南北通透",
        floor_info="15/28层",
        area=120,
        total_price=500 + project_id,
        title=title,
        publish_status=publish_status or PublishStatus.PUBLISHED.value,
        project_status=MarketingProjectStatus.FOR_SALE.value,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _create_visit(
    session: Session,
    *,
    visitor_id: str,
    referrer_employee_id: str | None,
    marketing_project_id: int,
    created_at: datetime | None = None,
) -> ProjectVisit:
    """创建房源访问埋点记录."""
    visit = ProjectVisit(
        visitor_id=visitor_id,
        referrer_employee_id=referrer_employee_id,
        marketing_project_id=marketing_project_id,
        created_at=created_at or _BASE_TIME,
    )
    session.add(visit)
    session.commit()
    return visit


def _create_booking(
    session: Session,
    *,
    user_id: str,
    marketing_project_id: int,
    phone: str,
    created_at: datetime,
    referrer_user_id: str | None = None,
) -> ProjectBooking:
    """直接落库一条预约（列表测试造数据用）."""
    booking = ProjectBooking(
        marketing_project_id=marketing_project_id,
        user_id=user_id,
        phone=phone,
        phone_hash=hash_phone(phone),
        referrer_user_id=referrer_user_id,
        created_at=created_at,
    )
    session.add(booking)
    session.commit()
    session.refresh(booking)
    return booking


def _c_client(session: Session, user: User) -> Generator[TestClient, None, None]:
    """以指定 C 端用户构造客户端（c_access_token cookie + CSRF 头）."""
    token = create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )

    def _override() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override
    client = TestClient(app, cookies={"c_access_token": token})
    client.headers["X-Requested-With"] = "XMLHttpRequest"
    yield client
    app.dependency_overrides.clear()


def _no_auth_client(session: Session) -> Generator[TestClient, None, None]:
    """无认证客户端（未登录 401 用例用）."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestCreateBooking:
    """POST /public/bookings 预约创建."""

    def test_create_booking_success_with_visit_attribution(self, seeded_db: dict[str, Any]) -> None:
        """预约成功 + 访问埋点归因：最近一次带 referrer 的 visit 决定 referrer_user_id."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-1", username="bkcustomer1", phone="13800138001")
        project = _create_project(session, project_id=9101, title="笋盘一套")
        # 两条埋点：早的无 referrer，晚的带 referrer → 应取后者
        _create_visit(
            session,
            visitor_id="visitor-1",
            referrer_employee_id=None,
            marketing_project_id=project.id,
            created_at=_BASE_TIME - timedelta(hours=2),
        )
        _create_visit(
            session,
            visitor_id="visitor-1",
            referrer_employee_id="employee-a",
            marketing_project_id=project.id,
            created_at=_BASE_TIME - timedelta(hours=1),
        )

        for client in _c_client(session, customer):
            resp = client.post(_BOOKINGS_URL, json={"marketing_project_id": project.id, "visitor_id": "visitor-1"})

        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["is_new"] is True
        assert body["booking"]["marketing_project_id"] == project.id
        assert body["booking"]["project_title"] == "笋盘一套"

        booking = session.query(ProjectBooking).filter(ProjectBooking.user_id == customer.id).one()
        assert booking.referrer_user_id == "employee-a"
        assert booking.phone == "13800138001"
        assert booking.phone_hash == hash_phone("13800138001")

    def test_create_booking_without_visit_no_referrer(self, seeded_db: dict[str, Any]) -> None:
        """无访问埋点 → referrer_user_id 为空."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-2", username="bkcustomer2", phone="13800138002")
        project = _create_project(session, project_id=9102, title="无埋点房源")

        for client in _c_client(session, customer):
            resp = client.post(_BOOKINGS_URL, json={"marketing_project_id": project.id})

        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        assert resp.json()["is_new"] is True
        booking = session.query(ProjectBooking).filter(ProjectBooking.user_id == customer.id).one()
        assert booking.referrer_user_id is None

    def test_create_booking_idempotent(self, seeded_db: dict[str, Any]) -> None:
        """重复预约幂等：返回既有记录 is_new=false，库内仍 1 行."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-3", username="bkcustomer3", phone="13800138003")
        project = _create_project(session, project_id=9103, title="幂等房源")

        for client in _c_client(session, customer):
            first = client.post(_BOOKINGS_URL, json={"marketing_project_id": project.id})
            second = client.post(_BOOKINGS_URL, json={"marketing_project_id": project.id})

        assert first.status_code == 200, first.text
        assert second.status_code == 200, second.text
        assert first.json()["is_new"] is True
        assert second.json()["is_new"] is False
        assert second.json()["booking"]["id"] == first.json()["booking"]["id"]
        assert session.query(ProjectBooking).filter(ProjectBooking.user_id == customer.id).count() == 1

    def test_create_booking_without_phone_returns_409(self, seeded_db: dict[str, Any]) -> None:
        """未绑手机号 → 409 + {"code":≠0,"message":...}."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-4", username="bkcustomer4", phone=None)
        project = _create_project(session, project_id=9104, title="无手机号房源")

        for client in _c_client(session, customer):
            resp = client.post(_BOOKINGS_URL, json={"marketing_project_id": project.id})

        assert resp.status_code == 409, f"应返回 409，实际 {resp.status_code}: {resp.text}"
        body = resp.json()
        assert body["code"] != 0
        assert body["message"]
        assert session.query(ProjectBooking).filter(ProjectBooking.user_id == customer.id).count() == 0

    def test_create_booking_project_not_found(self, seeded_db: dict[str, Any]) -> None:
        """房源不存在 → 404."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-5", username="bkcustomer5", phone="13800138005")

        for client in _c_client(session, customer):
            resp = client.post(_BOOKINGS_URL, json={"marketing_project_id": 999999})

        assert resp.status_code == 404, f"应返回 404，实际 {resp.status_code}: {resp.text}"
        assert resp.json()["code"] != 0

    def test_create_booking_unpublished_project(self, seeded_db: dict[str, Any]) -> None:
        """房源未发布（草稿）→ 404 业务错误."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-6", username="bkcustomer6", phone="13800138006")
        project = _create_project(
            session,
            project_id=9106,
            title="草稿房源",
            publish_status=PublishStatus.DRAFT.value,
        )

        for client in _c_client(session, customer):
            resp = client.post(_BOOKINGS_URL, json={"marketing_project_id": project.id})

        assert resp.status_code == 404, f"应返回 404，实际 {resp.status_code}: {resp.text}"
        assert resp.json()["code"] != 0


class TestMyBookings:
    """GET /public/bookings/my 我的预约列表."""

    def test_my_bookings_snapshot_order_and_filter(self, seeded_db: dict[str, Any]) -> None:
        """列表含快照字段、created_at 倒序、marketing_project_id 过滤生效."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-7", username="bkcustomer7", phone="13800138007")
        early_project = _create_project(session, project_id=9107, title="早预约房源")
        late_project = _create_project(session, project_id=9108, title="晚预约房源")
        _create_booking(
            session,
            user_id=customer.id,
            marketing_project_id=early_project.id,
            phone="13800138007",
            created_at=_BASE_TIME - timedelta(hours=1),
        )
        _create_booking(
            session,
            user_id=customer.id,
            marketing_project_id=late_project.id,
            phone="13800138007",
            created_at=_BASE_TIME,
        )

        for client in _c_client(session, customer):
            all_resp = client.get(f"{_BOOKINGS_URL}/my")
            filtered_resp = client.get(f"{_BOOKINGS_URL}/my", params={"marketing_project_id": early_project.id})

        assert all_resp.status_code == 200, all_resp.text
        items = all_resp.json()
        assert len(items) == 2
        # created_at 倒序：晚预约的在前
        assert items[0]["marketing_project_id"] == late_project.id
        assert items[1]["marketing_project_id"] == early_project.id
        # 快照字段
        first = items[0]
        assert first["project_title"] == "晚预约房源"
        assert first["community_name"] == late_project.community_name
        assert first["cover_image"] is None
        assert first["layout"] == "三室两厅"
        assert first["total_price"] == float(late_project.total_price)
        assert first["created_at"] is not None

        # 过滤
        assert filtered_resp.status_code == 200, filtered_resp.text
        filtered = filtered_resp.json()
        assert len(filtered) == 1
        assert filtered[0]["marketing_project_id"] == early_project.id

    def test_my_bookings_empty(self, seeded_db: dict[str, Any]) -> None:
        """无预约 → 空列表."""
        session: Session = seeded_db["session"]
        customer = _create_customer(session, user_id="bk-customer-8", username="bkcustomer8", phone="13800138008")

        for client in _c_client(session, customer):
            resp = client.get(f"{_BOOKINGS_URL}/my")

        assert resp.status_code == 200
        assert resp.json() == []


class TestMyCustomerBookings:
    """GET /public/projects/my/customers 归属我的预约客户列表."""

    def test_only_own_attributed_bookings_desc_order(self, seeded_db: dict[str, Any]) -> None:
        """员工 A 只见归因于自己的预约（他人归因与无归因不可见），created_at 倒序."""
        session: Session = seeded_db["session"]
        employee_a = _create_customer(session, user_id="bk-employee-a", username="bkemployeea", phone=None)
        _create_customer(session, user_id="bk-employee-b", username="bkemployeeb", phone=None)
        project_early = _create_project(session, project_id=9201, title="A早房源")
        project_late = _create_project(session, project_id=9202, title="A晚房源")
        # 员工 A：2 条归因（一早一晚）
        _create_booking(
            session,
            user_id="bk-customer-a1",
            marketing_project_id=project_early.id,
            phone="13800138001",
            created_at=_BASE_TIME - timedelta(hours=1),
            referrer_user_id=employee_a.id,
        )
        _create_booking(
            session,
            user_id="bk-customer-a2",
            marketing_project_id=project_late.id,
            phone="13800138002",
            created_at=_BASE_TIME,
            referrer_user_id=employee_a.id,
        )
        # 员工 B：1 条归因
        _create_booking(
            session,
            user_id="bk-customer-b1",
            marketing_project_id=project_early.id,
            phone="13800138003",
            created_at=_BASE_TIME - timedelta(hours=2),
            referrer_user_id="bk-employee-b",
        )
        # 无归因：1 条
        _create_booking(
            session,
            user_id="bk-customer-n1",
            marketing_project_id=project_early.id,
            phone="13800138004",
            created_at=_BASE_TIME - timedelta(hours=3),
            referrer_user_id=None,
        )

        for client in _c_client(session, employee_a):
            resp = client.get(_MY_CUSTOMERS_URL)

        assert resp.status_code == 200, f"应返回 200，实际 {resp.status_code}: {resp.text}"
        items = resp.json()
        assert len(items) == 2
        # created_at 倒序：晚预约的在前
        assert items[0]["marketing_project_id"] == project_late.id
        assert items[1]["marketing_project_id"] == project_early.id
        # 快照字段
        first = items[0]
        assert first["project_title"] == "A晚房源"
        assert first["community_name"] == project_late.community_name
        assert first["layout"] == "三室两厅"
        assert first["total_price"] == float(project_late.total_price)
        assert first["created_at"] is not None

    def test_customer_phone_masked(self, seeded_db: dict[str, Any]) -> None:
        """customer_phone_masked 为脱敏格式（前3后4中间****），不含完整手机号."""
        session: Session = seeded_db["session"]
        employee_a = _create_customer(session, user_id="bk-employee-a2", username="bkemployeea2", phone=None)
        project = _create_project(session, project_id=9203, title="脱敏房源")
        _create_booking(
            session,
            user_id="bk-customer-m1",
            marketing_project_id=project.id,
            phone="13800138001",
            created_at=_BASE_TIME,
            referrer_user_id=employee_a.id,
        )

        for client in _c_client(session, employee_a):
            resp = client.get(_MY_CUSTOMERS_URL)

        assert resp.status_code == 200, resp.text
        items = resp.json()
        assert len(items) == 1
        assert items[0]["customer_phone_masked"] == "138****8001"
        resp_text = str(items)
        assert "13800138001" not in resp_text

    def test_requires_login(self, seeded_db: dict[str, Any]) -> None:
        """未登录 → 401."""
        session: Session = seeded_db["session"]
        for client in _no_auth_client(session):
            resp = client.get(_MY_CUSTOMERS_URL)

        assert resp.status_code == 401, f"应返回 401，实际 {resp.status_code}: {resp.text}"
        assert resp.json()["code"] != 0
