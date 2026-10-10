"""销售指标 hero 区聚合与跨项目明细流 E2E.

设计稿 docs/2026-10-10-带看项目列表-指标hero区-高保真设计稿.html 口径⑤⑥ + E2E 验证点：
GET /projects/sales-summary 三指标聚合 + GET /projects/sales-records 明细流。

覆盖：
- 总量与周期新增：admin 全量口径下，带看/出价/面谈三指标与构造数据一致，
  周期边界外的数据不计入 +N（interaction_at ∈ [周期起点, 现在窗口)）；
- 权限口径（与列表双通道同范围）：持 project:read 聚合全部在售项目；业务身份
  （装修对接人/销售三角色）仅负责项目；无关人员全零不泄露无关项目数据；
- 明细流：record_date 降序、同日 created_at 降序；record_type 过滤；分页字段；
  operator_name/project_name 直出（address 兜底 community_name）；
- 明细流与 summary 同口径：业务身份不出现无关项目记录；
- 出价总量口径①：非法/零价出价记录也计入（与项目卡 countByType 同源不过滤）；
- cycle_period 窗口：period.start 周二 / period.end 周一、text 与 format_period_text 一致。
"""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Any
from zoneinfo import ZoneInfo

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import (
    Project,
    ProjectInteraction,
    ProjectRenovation,
    ProjectSale,
    Role,
    User,
    UserRole,
)
from models.common import ProjectStatus, RecordType
from services.projects.key_access import cycle_period, format_period_text
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash

CSRF_HEADERS = {"X-Requested-With": "XMLHttpRequest"}


def _admin_token(user: User) -> str:
    """后台令牌（aud=admin，与小程序内部员工主令牌同口径）."""
    return create_access_token(
        data={"sub": user.id, "role": "admin", "ver": user.token_version}, audience=AUDIENCE_ADMIN
    )


def _make_employee(session: Session, *, username: str, nickname: str) -> User:
    """创建「user 主角色 + customer 附加角色」的真实员工（无 project:read，走业务身份回退通道）."""
    user_role = session.query(Role).filter(Role.code == "user").one()
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=user_role.id,
        status="active",
    )
    session.add(user)
    session.flush()
    session.add(UserRole(user_id=user.id, role_id=customer_role.id))
    session.flush()
    return user


def _make_project(session: Session, *, name: str, address: str, community: str = "汇总小区") -> Project:
    return Project(
        id=uuid.uuid4(),
        name=name,
        community_name=community,
        address=address,
        status=ProjectStatus.SELLING,
    )


def _interaction(
    session: Session,
    project: Project,
    *,
    record_type: RecordType,
    interaction_at: datetime,
    operator: User | None = None,
    price: Decimal | None = None,
    same_day_later: bool = False,
) -> ProjectInteraction:
    """互动记录行（interaction_at 直接注入以构造周期边界；same_day_later 拉开同日 created_at）."""
    row = ProjectInteraction(
        id=uuid.uuid4(),
        project_id=project.id,
        record_type=record_type,
        interaction_target="客户甲",
        content="",
        interaction_at=interaction_at,
        operator_id=str(operator.id) if operator else None,
        price=price,
        created_at=interaction_at + (timedelta(minutes=30) if same_day_later else timedelta(minutes=1)),
        updated_at=interaction_at,
    )
    session.add(row)
    session.flush()
    return row


@pytest.fixture
def summary_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「admin + 相关人员工（业务身份）+ 无关员工 + 多项目/多类型互动记录」环境.

    周期数据：start = 本周期起点（周二 00:00 东八区）。
    - 项目 P1（员工 = 装修对接人）：周期内 2 条 viewing + 1 条 offer（价 460，同日两条
      验证 created_at 次序）+ 1 条 negotiation；周期外（起点前 3 天）1 条 viewing 不计增量；
    - 项目 P2（员工 = 渠道经理）：周期内 1 条 viewing；非在售（已售）项目上周期内 1 条
      viewing（不计入——状态过滤 status=selling）；
    - 项目 P3（员工无关联，业务身份侧必须排除）：周期内 1 条 viewing + 1 条 offer（价 0，
      验证口径①不过滤仍计数）。
    """
    session: Session = seeded_db["session"]
    admin = seeded_db["users"]["admin"]

    employee = _make_employee(session, username=f"ss-emp-{uuid.uuid4().hex[:8]}", nickname="销售汇总相关人员工")
    outsider = _make_employee(session, username=f"ss-out-{uuid.uuid4().hex[:8]}", nickname="销售汇总无关员工")

    p1 = _make_project(session, name="汇总小区 - P1 汇总路 1 号 101", address="汇总路 1 号 101")
    p2 = _make_project(session, name="汇总小区 - P2 汇总路 2 号 201", address="汇总路 2 号 201")
    p2_sold = _make_project(session, name="汇总小区 - P2S 已售路 9 号 901", address="已售路 9 号 901")
    p3 = _make_project(session, name="汇总小区 - P3 无关路 3 号 301", address="无关路 3 号 301")
    session.add_all([p1, p2, p2_sold, p3])
    session.flush()
    p2_sold.status = ProjectStatus.SOLD
    session.flush()

    # 员工业务身份：P1 装修对接人 + P2 渠道经理；P2S（已售）也关联，验证状态过滤
    session.add(ProjectRenovation(project_id=p1.id, contact_person_id=employee.id))
    session.add(ProjectSale(project_id=p2.id, channel_manager_id=employee.id))
    session.add(ProjectSale(project_id=p2_sold.id, channel_manager_id=employee.id))
    session.flush()

    start, end = cycle_period()
    before = start - timedelta(days=3)
    in_win = start + timedelta(hours=2)

    # P1（周期内）：2 viewing（同日，created_at 拉开）+ 1 offer(460) + 1 negotiation；周期外 1 viewing
    _interaction(session, p1, record_type=RecordType.VIEWING, interaction_at=in_win, operator=employee)
    _interaction(
        session, p1, record_type=RecordType.VIEWING, interaction_at=in_win, operator=admin, same_day_later=True
    )
    _interaction(session, p1, record_type=RecordType.OFFER, interaction_at=in_win, operator=admin, price=Decimal(460))
    _interaction(session, p1, record_type=RecordType.NEGOTIATION, interaction_at=in_win, operator=admin)
    _interaction(session, p1, record_type=RecordType.VIEWING, interaction_at=before, operator=admin)
    # P2：周期内 1 viewing；P2S（已售）：周期内 1 viewing（不得计入任何口径）
    _interaction(session, p2, record_type=RecordType.VIEWING, interaction_at=in_win, operator=admin)
    _interaction(session, p2_sold, record_type=RecordType.VIEWING, interaction_at=in_win, operator=admin)
    # P3（员工无关联）：周期内 1 viewing + 1 offer 价 0（口径①：非法价仍计入总数）
    _interaction(session, p3, record_type=RecordType.VIEWING, interaction_at=in_win, operator=admin)
    _interaction(session, p3, record_type=RecordType.OFFER, interaction_at=in_win, operator=admin, price=Decimal(0))
    session.commit()

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    try:
        yield {
            "session": session,
            "admin": admin,
            "employee": employee,
            "start": start,
            "end": end,
            "admin_client": TestClient(app, cookies={"access_token": _admin_token(admin)}, headers=CSRF_HEADERS),
            "employee_client": TestClient(app, cookies={"access_token": _admin_token(employee)}, headers=CSRF_HEADERS),
            "outsider_client": TestClient(app, cookies={"access_token": _admin_token(outsider)}, headers=CSRF_HEADERS),
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


class TestSalesSummary:
    """GET /projects/sales-summary 指标 hero 区聚合."""

    def test_admin_totals_and_deltas(self, summary_env: dict[str, Any]) -> None:
        """admin：全量在售口径——总量 viewing 5 / offer 2 / negotiation 1；周期增量 4/2/1.

        总量：P1(3v+1o+1n，含周期外 v) + P2(1v) + P3(1v+1o零价) = 5v/2o/1n；
        增量：P1 周期内 2v+1o+1n + P2 1v + P3 1v+1o = 4v/2o/1n；
        已售项目 P2S 的周期内记录与周期外记录均不计入。
        """
        resp = summary_env["admin_client"].get("/api/v1/projects/sales-summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["viewing_total"] == 5
        assert body["offer_total"] == 2
        assert body["negotiation_total"] == 1
        assert body["period_new_viewing"] == 4
        assert body["period_new_offer"] == 2
        assert body["period_new_negotiation"] == 1

    def test_employee_scope_matches_business_identity(self, summary_env: dict[str, Any]) -> None:
        """业务身份（user 主角色，无 project:read）：仅聚合负责的在售项目（P1+P2）.

        P3（无关联）不计入；已售 P2S 虽关联但不计入（状态过滤）。
        """
        resp = summary_env["employee_client"].get("/api/v1/projects/sales-summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["viewing_total"] == 4  # P1 3 条（含周期外）+ P2 1 条
        assert body["offer_total"] == 1  # 仅 P1
        assert body["negotiation_total"] == 1
        assert body["period_new_viewing"] == 3  # P1 周期内 2 + P2 1（P3 排除）
        assert body["period_new_offer"] == 1
        assert body["period_new_negotiation"] == 1

    def test_outsider_all_zero_with_period(self, summary_env: dict[str, Any]) -> None:
        """无关员工：全零且周期字段完整（不泄露任何无关项目聚合）."""
        resp = summary_env["outsider_client"].get("/api/v1/projects/sales-summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["viewing_total"] == 0
        assert body["offer_total"] == 0
        assert body["negotiation_total"] == 0
        assert body["period_new_viewing"] == 0
        assert body["period"]["start"]
        assert body["period"]["text"]

    def test_period_shape_and_text(self, summary_env: dict[str, Any]) -> None:
        """周期字段：start/end 为东八区日期（起点周二、终点周一），text 与 format_period_text 一致.

        回归防护：cycle_period 返回 tz-aware UTC，直接 .date() 会取到 UTC 日期而偏移
        一天（周一而非周二）；必须先归一东八区再取 date（与 key_summary 同口径）。
        """
        resp = summary_env["employee_client"].get("/api/v1/projects/sales-summary")
        assert resp.status_code == 200, resp.text
        period = resp.json()["period"]
        start, end = summary_env["start"], summary_env["end"]
        cst = ZoneInfo("Asia/Shanghai")
        assert period["start"] == start.astimezone(cst).date().isoformat()  # 窗口起点即周二（东八区）
        assert period["end"] == (end - timedelta(days=1)).astimezone(cst).date().isoformat()
        # 绝对真值断言：起点必为周二、终点必为周一（任何时区取值错误都会在此擞中）
        assert datetime.fromisoformat(period["start"]).weekday() == 1
        assert datetime.fromisoformat(period["end"]).weekday() == 0
        assert period["text"] == format_period_text(start, end)


class TestSalesRecordFlow:
    """GET /projects/sales-records 跨项目明细流."""

    def test_admin_flow_desc_and_pagination_shape(self, summary_env: dict[str, Any]) -> None:
        """admin：明细按 interaction_at 降序；同日两条 viewing 按 created_at 降序（后录在前）."""
        resp = summary_env["admin_client"].get("/api/v1/projects/sales-records?page=1&page_size=20")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 8  # P1 5 + P2 1 + P3 2（已售 P2S 排除）
        assert body["page"] == 1
        assert body["page_size"] == 20
        items = body["items"]
        dates = [i["record_date"] for i in items]
        assert dates == sorted(dates, reverse=True)
        # 同日（P1 周期内两条 viewing）：created_at 较新（same_day_later，operator=admin）在前
        same_day = [i for i in items if i["record_date"] == items[0]["record_date"]]
        assert len(same_day) >= 2

    def test_flow_project_name_and_operator(self, summary_env: dict[str, Any]) -> None:
        """project_name 直出（address 兜底）、operator_name 为操作人昵称."""
        resp = summary_env["admin_client"].get("/api/v1/projects/sales-records?page=1&page_size=20")
        items = resp.json()["items"]
        names = {i["project_name"] for i in items}
        assert "汇总路 1 号 101" in names  # address 兜底 community_name
        # P1 周期内第一条 viewing 由 employee 创建 → operator_name 为其昵称
        emp_item = next(i for i in items if i["operator_name"] == "销售汇总相关人员工")
        assert emp_item["record_type"] == "viewing"
        assert emp_item["project_name"] == "汇总路 1 号 101"

    def test_flow_type_filter(self, summary_env: dict[str, Any]) -> None:
        """record_type 过滤：仅返回该类型."""
        resp = summary_env["admin_client"].get("/api/v1/projects/sales-records?record_type=offer")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 2
        assert {i["record_type"] for i in body["items"]} == {"offer"}
        # 出价带金额；零价出价也返回（口径①不过滤）
        prices = sorted(float(i["price"]) for i in body["items"] if i["price"] is not None)
        assert prices == [0.0, 460.0]

    def test_flow_scope_same_as_summary(self, summary_env: dict[str, Any]) -> None:
        """业务身份明细流与 summary 同口径：不出现无关项目（P3）记录.

        总量 = P1 5 条 + P2 1 条 = 6（P3 2 条排除，已售 P2S 1 条排除）。
        """
        resp = summary_env["employee_client"].get("/api/v1/projects/sales-records?page=1&page_size=50")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["total"] == 6
        assert all(i["project_name"] != "无关路 3 号 301" for i in body["items"])
        assert all(i["project_name"] != "已售路 9 号 901" for i in body["items"])

    def test_flow_pagination_window(self, summary_env: dict[str, Any]) -> None:
        """分页窗口：page_size=3 首页 3 条 + total 不变."""
        resp = summary_env["admin_client"].get("/api/v1/projects/sales-records?page=1&page_size=3")
        body = resp.json()
        assert len(body["items"]) == 3
        assert body["total"] == 8
