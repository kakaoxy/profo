"""指标 hero 区聚合 GET /keys/summary E2E（设计稿 docs/2026-10-10 口径①②⑤⑥ + 周二周期）.

覆盖：
- 空权限（无关员工）：200 全零 + 周期字段完整（不泄露无关数据）；
- 总量与周期新增：admin 全量口径下，房源 / 分享 / 查看三指标与构造数据一致，
  周期边界外的数据不计入 +N；
- 「首次取得钥匙」口径：同房源跨周期两次录入只计 1 次；管理密码本周期录入计 1；
  待录入（pending_entry）不计；
- 权限口径：相关人员工（user 主角色 + customer 附加角色）hero 只聚合其关联房源，
  与 /keys/properties 同范围；
- cycle_period 边界：周六/周一同窗（周一展示上周二起窗口）、周二 00:00 翻窗。
"""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import (
    KeyShare,
    KeyShareView,
    KeyStatus,
    Project,
    ProjectKey,
    ProjectNormalKey,
    ProjectSale,
    ProjectStatus,
    Role,
    User,
    UserRole,
)
from services.projects.key_access import cycle_period, format_period_text
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash

# 测试密码明文（断言 share 前置数据用，非真实账号口令）
_PASSWORD = "123456"

CSRF_HEADERS = {"X-Requested-With": "XMLHttpRequest"}


def _make_employee(session: Session, *, username: str, nickname: str) -> User:
    """创建「user 主角色 + customer 附加角色」的真实员工组合."""
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


def _c_token(user: User) -> str:
    """签发 C 端令牌（aud=c，与小程序登录内部员工分支同口径）."""
    return create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )


def _make_project(session: Session, *, name: str, address: str) -> Project:
    return Project(
        id=uuid.uuid4(),
        name=name,
        community_name=name.split(" - ", maxsplit=1)[0],
        address=address,
        status=ProjectStatus.SELLING,
    )


def _active_key(
    session: Session,
    project_id: uuid.UUID,
    *,
    created_at: datetime,
    confirmed_at: datetime | None = None,
    status: KeyStatus = KeyStatus.ACTIVE,
    seq: int = 1,
) -> ProjectNormalKey:
    """有效普通密码组（created_at/confirmed_at 可注入以构造周期边界）."""
    row = ProjectNormalKey(
        project_id=project_id,
        seq=seq,
        password_encrypted=_PASSWORD,
        status=status,
        confirmed_at=confirmed_at,
    )
    session.add(row)
    session.flush()
    # 直接写 created_at（BaseModel default 仅在 flush 时填充）
    session.execute(
        ProjectNormalKey.__table__.update().where(ProjectNormalKey.id == row.id).values(created_at=created_at)
    )
    session.flush()
    session.refresh(row)
    return row


def _make_share(session: Session, project: Project, key: ProjectNormalKey, *, created_at: datetime) -> KeyShare:
    """分享行（直接指定 created_at 构造周期内外数据；created_at 列由 ORM update 注入）."""
    share = KeyShare(
        token=f"tok-{uuid.uuid4().hex}",
        sharer_id=str(uuid.uuid4()),
        items=[{"project_id": str(project.id), "key_id": str(key.id)}],
        expires_at=created_at + timedelta(days=7),
    )
    session.add(share)
    session.flush()
    session.execute(KeyShare.__table__.update().where(KeyShare.id == share.id).values(created_at=created_at))
    session.flush()
    session.refresh(share)
    return share


def _make_view(share: KeyShare, *, created_at: datetime) -> KeyShareView:
    return KeyShareView(
        share_id=share.id,
        project_id=share.items and uuid.UUID(share.items[0]["project_id"]),
        key_id=uuid.UUID(share.items[0]["key_id"]),
        viewer_name="经纪人甲",
        viewed_at=created_at,
        created_at=created_at,
    )


@pytest.fixture
def summary_env(seeded_db: dict[str, Any]) -> Generator[dict[str, Any], None, None]:
    """构造「admin + 相关人员工 + 无关员工 + 多房源/密码/分享/查看」环境.

    周期数据：start = 本周期起点（周二 00:00 东八区）。
    - 房源 P1（员工关联）：管理密码 + 有效普通密码（周期起点前 3 天录入，总量计 1、增量不计）；
      本周期内再录第 2 组有效密码（不重复计房源增量）+ 1 条本周期分享 + 1 条本周期查看；
    - 房源 P2（员工关联）：仅管理密码、created_at=本周期起点（首次取得钥匙 → 增量 +1）；
    - 房源 P3（员工关联）：仅 1 组待录入密码（不计有钥匙、不计增量）；
    - 房源 P4（员工无关联）：有效密码 + 本周期分享/查看（员工侧聚合必须排除，admin 计入）；
    - 上周期分享（起点前 8 天）+ 其查看（总量 +1，增量不计）。
    """
    session: Session = seeded_db["session"]

    # /keys/* 走 C 端令牌体系（aud=c + require customer 角色），
    # 既有钥匙 E2E 同口径：admin 主角色 + customer 附加角色的测试专用组合
    admin_role = session.query(Role).filter(Role.code == "admin").one()
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    admin_user = User(
        id=str(uuid.uuid4()),
        username=f"sum-admin-{uuid.uuid4().hex[:8]}",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="汇总管理员",
        role_id=admin_role.id,
        status="active",
    )
    session.add(admin_user)
    session.flush()
    session.add(UserRole(user_id=admin_user.id, role_id=customer_role.id))
    session.flush()

    employee = _make_employee(session, username=f"sum-emp-{uuid.uuid4().hex[:8]}", nickname="汇总相关人员工")
    outsider = _make_employee(session, username=f"sum-out-{uuid.uuid4().hex[:8]}", nickname="汇总无关员工")

    p1 = _make_project(session, name="汇总小区 - P1 相关路 1 号 101", address="相关路 1 号 101")
    p2 = _make_project(session, name="汇总小区 - P2 相关路 2 号 201", address="相关路 2 号 201")
    p3 = _make_project(session, name="汇总小区 - P3 相关路 3 号 301", address="相关路 3 号 301")
    p4 = _make_project(session, name="汇总小区 - P4 无关路 4 号 401", address="无关路 4 号 401")
    session.add_all([p1, p2, p3, p4])
    session.flush()
    session.add(ProjectSale(project_id=p1.id, channel_manager_id=employee.id))
    session.add(ProjectSale(project_id=p2.id, channel_manager_id=employee.id))
    session.add(ProjectSale(project_id=p3.id, channel_manager_id=employee.id))
    session.flush()

    start, end = cycle_period()
    before = start - timedelta(days=3)

    # P1：管理密码（上周期录入）+ 有效普通密码（上周期）→ 上周期首次取得钥匙
    session.add(ProjectKey(project_id=p1.id, password_encrypted=_PASSWORD, created_at=before))
    p1_key_old = _active_key(session, p1.id, created_at=before)
    # P1：本周期内再录第 2 组有效密码（同房源重复录入不重复计房源增量）
    _active_key(session, p1.id, created_at=start + timedelta(hours=1), seq=2)
    # P2：仅管理密码、本周期起点录入 → 房源增量 +1
    session.add(ProjectKey(project_id=p2.id, password_encrypted=_PASSWORD, created_at=start))
    # P3：仅待录入密码 → 不计
    _active_key(session, p3.id, created_at=start + timedelta(hours=2), status=KeyStatus.PENDING_ENTRY)
    # P4：无关房源（对员工）有钥匙 → admin 总量含它，员工不含
    session.add(ProjectKey(project_id=p4.id, password_encrypted=_PASSWORD, created_at=before))
    p4_key = _active_key(session, p4.id, created_at=before)
    session.flush()

    # 分享：上周期 1 条（P1 旧钥匙）+ 本周期 1 条（P1 新钥匙）+ 无关房源 P4 本周期 1 条
    share_old = _make_share(session, p1, p1_key_old, created_at=before - timedelta(days=5))
    share_new = _make_share(session, p1, p1_key_old, created_at=start + timedelta(hours=2))
    share_p4 = _make_share(session, p4, p4_key, created_at=start + timedelta(hours=1))
    # 查看：上周期 1 条 + 本周期 2 条（重复查看按次累计）+ 无关房源 P4 本周期 1 条
    session.add_all(
        [
            _make_view(share_old, created_at=before - timedelta(days=4)),
            _make_view(share_new, created_at=start + timedelta(hours=3)),
            _make_view(share_new, created_at=start + timedelta(hours=4)),
            _make_view(share_p4, created_at=start + timedelta(hours=5)),
        ]
    )
    session.commit()

    previous_overrides = dict(app.dependency_overrides)

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    try:
        yield {
            "session": session,
            "admin": admin_user,
            "employee": employee,
            "start": start,
            "end": end,
            "admin_client": TestClient(app, cookies={"c_access_token": _c_token(admin_user)}, headers=CSRF_HEADERS),
            "employee_c_client": TestClient(app, cookies={"c_access_token": _c_token(employee)}, headers=CSRF_HEADERS),
            "outsider_c_client": TestClient(app, cookies={"c_access_token": _c_token(outsider)}, headers=CSRF_HEADERS),
        }
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(previous_overrides)


class TestKeysSummary:
    """GET /keys/summary 指标 hero 区聚合."""

    def test_admin_totals_and_deltas(self, summary_env: dict[str, Any]) -> None:
        """admin：总量含全部 4 套有钥匙房源；周期新增房源=1（P2）、分享=2（P1+P4）、查看=3+1."""
        resp = summary_env["admin_client"].get("/api/v1/keys/summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["properties_with_keys"] == 3  # P1/P2/P4 有钥匙；P3 仅待录入不计
        assert body["shares_total"] == 3  # P1 两条 + P4 一条
        assert body["views_total"] == 4  # 上周期 1 + 本周期 2 + P4 1
        assert body["period_new_properties"] == 1  # P2 首次取得钥匙在本周期
        assert body["period_new_shares"] == 2  # 本周期 P1 + P4
        assert body["period_new_views"] == 3  # 本周期 P1 两条 + P4 一条

    def test_employee_scope_matches_properties(self, summary_env: dict[str, Any]) -> None:
        """相关人员工：hero 只聚合关联房源（P1/P2/P3），且与 /keys/properties 同范围.

        分享/查看计数同样只算关联房源：P4（员工无关联）上的分享/查看不得计入。
        """
        resp = summary_env["employee_c_client"].get("/api/v1/keys/summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["properties_with_keys"] == 2  # P1 P2（P3 仅待录入）
        assert body["shares_total"] == 2  # 两条分享都挂在 P1（P4 分享不可见）
        assert body["views_total"] == 3  # P1 三次查看（P4 查看不可见）
        assert body["period_new_properties"] == 1
        assert body["period_new_shares"] == 1  # 仅 P1 本周期那条
        assert body["period_new_views"] == 2  # 仅 P1 本周期两条

        props = summary_env["employee_c_client"].get("/api/v1/keys/properties").json()["items"]
        session: Session = summary_env["session"]
        related_ids = {str(p.id) for p in session.query(Project).filter(Project.address.like("相关路 %")).all()}
        assert {p["project_id"] for p in props} == related_ids  # P1/P2/P3 三套关联房源

    def test_outsider_all_zero_with_period(self, summary_env: dict[str, Any]) -> None:
        """无关员工：全零且周期字段完整（不泄露任何无关房源聚合）."""
        resp = summary_env["outsider_c_client"].get("/api/v1/keys/summary")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["properties_with_keys"] == 0
        assert body["shares_total"] == 0
        assert body["views_total"] == 0
        assert body["period_new_properties"] == 0
        assert body["period_new_shares"] == 0
        assert body["period_new_views"] == 0
        assert body["period"]["start"]
        assert body["period"]["text"]

    def test_period_shape_and_text(self, summary_env: dict[str, Any]) -> None:
        """周期字段：起点周二、终点周一、窗口 7 天，text 与 format_period_text 一致."""
        resp = summary_env["employee_c_client"].get("/api/v1/keys/summary")
        assert resp.status_code == 200, resp.text
        period = resp.json()["period"]
        start, end = summary_env["start"], summary_env["end"]
        from zoneinfo import ZoneInfo

        cst = ZoneInfo("Asia/Shanghai")
        assert period["start"] == start.astimezone(cst).date().isoformat()
        assert period["end"] == (end - timedelta(days=1)).astimezone(cst).date().isoformat()
        assert period["text"] == format_period_text(start, end)


class TestCyclePeriod:
    """cycle_period「周二周期」窗口边界（与小程序 sales-cycle 同口径）."""

    def test_monday_uses_last_tuesday(self) -> None:
        """周一 00:05（东八区）→ 窗口为上周二 00:00 起."""
        monday = datetime(2026, 10, 12, 0, 5, tzinfo=timezone.utc)  # 东八区周一 08:05
        start, end = cycle_period(monday)
        assert start == datetime(2026, 10, 5, 16, 0, tzinfo=timezone.utc)  # 东八区 10-06 周二 00:00
        assert end == datetime(2026, 10, 12, 16, 0, tzinfo=timezone.utc)  # 东八区 10-12 周一 24:00

    def test_tuesday_midnight_flips_window(self) -> None:
        """周二 00:00 整点起窗口翻到本周."""
        tue = datetime(2026, 10, 12, 16, 0, tzinfo=timezone.utc)  # 东八区周二 00:00
        start, end = cycle_period(tue)
        assert start == tue
        assert end == datetime(2026, 10, 19, 16, 0, tzinfo=timezone.utc)

    def test_saturday_same_window_as_monday(self) -> None:
        """周六与随后的周一处于同一窗口（周六 10-10 与周一 10-12 均属 10-06 起）."""
        sat_start, sat_end = cycle_period(datetime(2026, 10, 10, 4, 0, tzinfo=timezone.utc))
        mon_start, mon_end = cycle_period(datetime(2026, 10, 11, 17, 0, tzinfo=timezone.utc))
        assert (sat_start, sat_end) == (mon_start, mon_end)

    def test_new_year_cross(self) -> None:
        """跨年：2026-12-31（周四）窗口为 2026-12-29 周二 → 2027-01-04 周一（东八区）."""
        start, end = cycle_period(datetime(2026, 12, 30, 16, 30, tzinfo=timezone.utc))  # 东八区 12-31 周四
        assert start == datetime(2026, 12, 28, 16, 0, tzinfo=timezone.utc)
        assert end == datetime(2027, 1, 4, 16, 0, tzinfo=timezone.utc)
