"""房源/评估/招募分享统计（今日 + 累计）测试（Task 4 + Task 5）.

覆盖：
1. today_window 窗口语义（Asia/Shanghai 自然日，左闭右开）
2. 房源：visit-events 免登录可写 / share-events 需登录 / share-stats 累计与今日口径
3. 评估：visit/share 埋点与 share-stats；lead_count 仅分享归因（不含 creator_id 本人录入）
4. 招募：share-stats 新增 today_* 四字段口径（时间列 shared_at/entered_at/created_at）

「今日」「明日」数据时间均基于 today_window() 返回值偏移，避免硬编码时区。
"""

from collections.abc import Generator
from contextlib import contextmanager
from datetime import timedelta
from typing import Any
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import (
    L4MarketingProject,
    Lead,
    MarketingProjectStatus,
    ProjectBooking,
    ProjectShareEvent,
    ProjectVisit,
    PublishStatus,
    RecruitLead,
    RecruitLeadStatus,
    RecruitShareEvent,
    RecruitShareType,
    RecruitVisit,
    User,
    ValuationShareEvent,
    ValuationVisit,
)
from utils.crypto import hash_phone
from utils.time_windows import today_window

_PROJECTS_URL = "/api/v1/public/projects"
_VALUATIONS_URL = "/api/v1/public/valuations"
_RECRUIT_URL = "/api/v1/public/recruit"


@contextmanager
def _no_auth_client(session: Session) -> Generator[TestClient, None, None]:
    """无认证客户端（游客，免登录埋点用）."""

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


def _create_project(session: Session, *, project_id: int) -> L4MarketingProject:
    """创建已发布房源."""
    project = L4MarketingProject(
        id=project_id,
        community_id=f"comm-{project_id}",
        community_name=f"阳光花园{project_id}号院",
        layout="三室两厅",
        orientation="南北通透",
        floor_info="15/28层",
        area=120,
        total_price=500,
        title=f"分享统计房源{project_id}",
        publish_status=PublishStatus.PUBLISHED.value,
        project_status=MarketingProjectStatus.FOR_SALE.value,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


class TestTodayWindow:
    """共享时间窗口工具."""

    def test_window_bounds(self) -> None:
        """窗口为 [今日00:00, 明日00:00)，Asia/Shanghai 时区，间隔恰好一天."""
        start, end = today_window()
        cst = ZoneInfo("Asia/Shanghai")
        assert end - start == timedelta(days=1)
        assert start.tzinfo is not None
        assert end.tzinfo is not None
        assert start.utcoffset() == end.utcoffset() == cst.utcoffset(start)
        assert (start.hour, start.minute, start.second, start.microsecond) == (0, 0, 0, 0)
        assert (end.hour, end.minute, end.second, end.microsecond) == (0, 0, 0, 0)


class TestProjectShareStats:
    """房源埋点与 GET /public/projects/my/share-stats."""

    def test_stats_total_and_today(self, c_end_client: TestClient, customer_user: User, db_session: Session) -> None:
        """累计与今日口径：share 按员工、pv/uv 按来源员工（uv 去重）、lead 按预约归因."""
        me = customer_user.id
        project = _create_project(db_session, project_id=9301)
        t_start, t_end = today_window()
        today_at = t_start + timedelta(hours=1)
        tomorrow_at = t_end + timedelta(hours=1)

        # 今日：1 分享 + 2 次访问（2 个 visitor）+ 1 预约归因
        db_session.add(
            ProjectShareEvent(employee_id=me, marketing_project_id=project.id, share_type="card", created_at=today_at)
        )
        for visitor in ["pv-v1", "pv-v2"]:
            db_session.add(
                ProjectVisit(
                    visitor_id=visitor,
                    referrer_employee_id=me,
                    marketing_project_id=project.id,
                    created_at=today_at,
                )
            )
        db_session.add(
            ProjectBooking(
                marketing_project_id=project.id,
                user_id="booking-user-1",
                phone="13800138001",
                phone_hash=hash_phone("13800138001"),
                referrer_user_id=me,
                created_at=today_at,
            )
        )
        # 明日：2 分享 + 1 次访问（visitor 复用，uv 不增）+ 1 预约归因
        db_session.add(
            ProjectShareEvent(
                employee_id=me, marketing_project_id=project.id, share_type="card", created_at=tomorrow_at
            )
        )
        db_session.add(
            ProjectShareEvent(
                employee_id=me, marketing_project_id=project.id, share_type="timeline", created_at=tomorrow_at
            )
        )
        db_session.add(
            ProjectVisit(
                visitor_id="pv-v1",
                referrer_employee_id=me,
                marketing_project_id=project.id,
                created_at=tomorrow_at,
            )
        )
        db_session.add(
            ProjectBooking(
                marketing_project_id=project.id,
                user_id="booking-user-2",
                phone="13800138002",
                phone_hash=hash_phone("13800138002"),
                referrer_user_id=me,
                created_at=tomorrow_at,
            )
        )
        # 他人数据（今日）：不计入
        db_session.add(
            ProjectShareEvent(
                employee_id="emp-other", marketing_project_id=project.id, share_type="card", created_at=today_at
            )
        )
        db_session.add(
            ProjectVisit(
                visitor_id="pv-v3",
                referrer_employee_id="emp-other",
                marketing_project_id=project.id,
                created_at=today_at,
            )
        )
        db_session.commit()

        resp = c_end_client.get(f"{_PROJECTS_URL}/my/share-stats")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "share_count": 3,
            "pv": 3,
            "uv": 2,
            "lead_count": 2,
            "today_share_count": 1,
            "today_pv": 2,
            "today_uv": 2,
            "today_lead_count": 1,
        }

    def test_visit_event_anonymous_writes(self, seeded_db: dict[str, Any]) -> None:
        """visit-events 免登录可写；有效员工 referrer 原样落库，无效 referrer 置空."""
        session: Session = seeded_db["session"]
        project = _create_project(session, project_id=9302)
        employee_id = seeded_db["users"]["admin"].id

        with _no_auth_client(session) as client:
            resp = client.post(
                f"{_PROJECTS_URL}/{project.id}/visit-events",
                json={"visitor_id": "guest-visitor-1", "referrer": employee_id, "source": "card"},
            )
            # 无效 referrer（不存在员工）：静默置空，不阻断埋点落库
            resp_invalid = client.post(
                f"{_PROJECTS_URL}/{project.id}/visit-events",
                json={"visitor_id": "guest-visitor-2", "referrer": "emp-share", "source": "card"},
            )

        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json()["id"], int)
        visit = session.query(ProjectVisit).filter(ProjectVisit.visitor_id == "guest-visitor-1").one()
        assert visit.referrer_employee_id == employee_id
        assert visit.source == "card"
        assert visit.marketing_project_id == project.id

        assert resp_invalid.status_code == 200, resp_invalid.text
        visit_invalid = session.query(ProjectVisit).filter(ProjectVisit.visitor_id == "guest-visitor-2").one()
        assert visit_invalid.referrer_employee_id is None

    def test_visit_event_project_not_found(self, seeded_db: dict[str, Any]) -> None:
        """房源不存在 → 404 + {"code":≠0,"message":...}."""
        session: Session = seeded_db["session"]
        with _no_auth_client(session) as client:
            resp = client.post(f"{_PROJECTS_URL}/999999/visit-events", json={"visitor_id": "guest-visitor-2"})

        assert resp.status_code == 404, resp.text
        assert resp.json()["code"] != 0

    def test_share_event_requires_login(self, seeded_db: dict[str, Any]) -> None:
        """share-events 未登录 → 401."""
        session: Session = seeded_db["session"]
        project = _create_project(session, project_id=9303)
        with _no_auth_client(session) as client:
            resp = client.post(f"{_PROJECTS_URL}/{project.id}/share-events", json={"share_type": "card"})

        assert resp.status_code == 401, resp.text

    def test_share_event_writes_current_employee(
        self, c_end_client: TestClient, customer_user: User, db_session: Session
    ) -> None:
        """share-events 登录后写入，employee_id 服务端取当前用户."""
        project = _create_project(db_session, project_id=9304)

        resp = c_end_client.post(f"{_PROJECTS_URL}/{project.id}/share-events", json={"share_type": "timeline"})

        assert resp.status_code == 200, resp.text
        event = db_session.query(ProjectShareEvent).filter(ProjectShareEvent.marketing_project_id == project.id).one()
        assert event.employee_id == customer_user.id
        assert event.share_type == "timeline"


class TestValuationShareStats:
    """评估埋点与 GET /public/valuations/my/share-stats."""

    def test_stats_total_today_and_creator_excluded(
        self, c_end_client: TestClient, customer_user: User, db_session: Session, seeded_db: dict[str, Any]
    ) -> None:
        """lead_count 仅计 referrer_id 分享归因的估价线索.

        排除：creator_id 本人录入、已删除、房源单承接（source_property_id 非空，
        归房源单链路）、内部员工提交（creator 命中后台角色）——与 admin 漏斗
        VALUATION lead_filters 口径一致。
        """
        me = customer_user.id
        admin_id: str = seeded_db["users"]["admin"].id
        t_start, t_end = today_window()
        today_at = t_start + timedelta(hours=1)
        tomorrow_at = t_end + timedelta(hours=1)

        # 今日：1 分享 + 2 访问（2 visitor）+ 1 条分享归因线索
        db_session.add(ValuationShareEvent(employee_id=me, share_type="card", created_at=today_at))
        for visitor in ["vv-1", "vv-2"]:
            db_session.add(
                ValuationVisit(visitor_id=visitor, referrer_employee_id=me, source="card", created_at=today_at)
            )
        db_session.add(Lead(community_name="今日线索小区", referrer_id=me, created_at=today_at))
        # 明日：1 分享 + 1 访问（visitor 复用）+ 1 条分享归因线索 + 1 条本人录入线索（不计入）
        db_session.add(ValuationShareEvent(employee_id=me, share_type="timeline", created_at=tomorrow_at))
        db_session.add(
            ValuationVisit(visitor_id="vv-1", referrer_employee_id=me, source="card", created_at=tomorrow_at)
        )
        db_session.add(Lead(community_name="明日线索小区", referrer_id=me, created_at=tomorrow_at))
        db_session.add(Lead(community_name="本人录入小区", creator_id=me, created_at=tomorrow_at))
        # 不计入：已删除归因线索 / 房源单承接线索 / 内部员工（admin）创建但归属 me 的线索
        db_session.add(Lead(community_name="已删除小区", referrer_id=me, created_at=today_at, is_deleted=True))
        db_session.add(Lead(community_name="承接小区", referrer_id=me, source_property_id=42, created_at=today_at))
        db_session.add(Lead(community_name="内部提交小区", referrer_id=me, creator_id=admin_id, created_at=today_at))
        # 他人数据（今日）：不计入
        db_session.add(ValuationVisit(visitor_id="vv-3", referrer_employee_id="emp-other", created_at=today_at))
        db_session.commit()

        resp = c_end_client.get(f"{_VALUATIONS_URL}/my/share-stats")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "share_count": 2,
            "pv": 3,
            "uv": 2,
            "lead_count": 2,
            "today_share_count": 1,
            "today_pv": 2,
            "today_uv": 2,
            "today_lead_count": 1,
        }

    def test_visit_event_anonymous_writes(self, seeded_db: dict[str, Any]) -> None:
        """visit-events 免登录可写；有效员工 referrer 原样落库，无效 referrer 置空."""
        session: Session = seeded_db["session"]
        employee_id = seeded_db["users"]["admin"].id
        with _no_auth_client(session) as client:
            resp = client.post(
                f"{_VALUATIONS_URL}/visit-events", json={"visitor_id": "val-guest-1", "referrer": employee_id}
            )
            # 无效 referrer（不存在员工）：静默置空
            resp_invalid = client.post(
                f"{_VALUATIONS_URL}/visit-events", json={"visitor_id": "val-guest-2", "referrer": "emp-share"}
            )

        assert resp.status_code == 200, resp.text
        visit = session.query(ValuationVisit).filter(ValuationVisit.visitor_id == "val-guest-1").one()
        assert visit.referrer_employee_id == employee_id

        assert resp_invalid.status_code == 200, resp_invalid.text
        visit_invalid = session.query(ValuationVisit).filter(ValuationVisit.visitor_id == "val-guest-2").one()
        assert visit_invalid.referrer_employee_id is None

    def test_share_event_requires_login(self, seeded_db: dict[str, Any]) -> None:
        """share-events 未登录 → 401."""
        session: Session = seeded_db["session"]
        with _no_auth_client(session) as client:
            resp = client.post(f"{_VALUATIONS_URL}/share-events", json={"share_type": "card"})

        assert resp.status_code == 401, resp.text

    def test_share_event_writes_current_employee(
        self, c_end_client: TestClient, customer_user: User, db_session: Session
    ) -> None:
        """share-events 登录后写入，employee_id 服务端取当前用户."""
        resp = c_end_client.post(f"{_VALUATIONS_URL}/share-events", json={"share_type": "card"})

        assert resp.status_code == 200, resp.text
        event = db_session.query(ValuationShareEvent).filter(ValuationShareEvent.employee_id == customer_user.id).one()
        assert event.share_type == "card"


class TestRecruitShareStatsToday:
    """招募 share-stats 今日维度扩展（Task 5）."""

    def test_recruit_stats_today_fields(
        self, c_end_client: TestClient, customer_user: User, db_session: Session
    ) -> None:
        """today_* 按 shared_at/entered_at/created_at 限定今日窗口，累计字段语义不变."""
        me = customer_user.id
        t_start, t_end = today_window()
        today_at = t_start + timedelta(hours=1)
        tomorrow_at = t_end + timedelta(hours=1)

        # 今日：1 分享 + 2 访问（2 个 openid）+ 1 归属线索
        db_session.add(
            RecruitShareEvent(campaign_id=None, employee_id=me, share_type=RecruitShareType.CARD, shared_at=today_at)
        )
        for openid in ["roid-1", "roid-2"]:
            db_session.add(RecruitVisit(openid_hash=openid, referrer_employee_id=me, entered_at=today_at))
        db_session.add(
            RecruitLead(
                phone="13811112201",
                phone_hash=hash_phone("13811112201"),
                main_business_area="商圈",
                referrer_employee_id=me,
                status=RecruitLeadStatus.NEW,
                created_at=today_at,
            )
        )
        # 明日：1 分享 + 1 访问（openid 复用）+ 1 归属线索
        db_session.add(
            RecruitShareEvent(
                campaign_id=None, employee_id=me, share_type=RecruitShareType.POSTER, shared_at=tomorrow_at
            )
        )
        db_session.add(RecruitVisit(openid_hash="roid-1", referrer_employee_id=me, entered_at=tomorrow_at))
        db_session.add(
            RecruitLead(
                phone="13811112202",
                phone_hash=hash_phone("13811112202"),
                main_business_area="商圈",
                referrer_employee_id=me,
                status=RecruitLeadStatus.NEW,
                created_at=tomorrow_at,
            )
        )
        # 他人数据（今日）：不计入
        db_session.add(RecruitVisit(openid_hash="roid-x", referrer_employee_id="emp-other", entered_at=today_at))
        db_session.commit()

        resp = c_end_client.get(f"{_RECRUIT_URL}/my/share-stats")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "share_count": 2,
            "pv": 3,
            "uv": 2,
            "lead_count": 2,
            "today_share_count": 1,
            "today_pv": 2,
            "today_uv": 2,
            "today_lead_count": 1,
        }


class TestMyCustomersAggregateShareStats:
    """四链路聚合 GET /public/customers/my/share-stats（估价/房源单共表防重复计数）."""

    def test_aggregate_no_double_counting(
        self, c_end_client: TestClient, customer_user: User, db_session: Session
    ) -> None:
        """估价与房源单共用 leads 表：各链路按 source_property_id 判别拆分，不重复计数.

        1 条估价线索 + 1 条房源单承接线索（同 referrer）→ 聚合 lead_count == 2
        （修复前两链路均无模块判别，同一线索被计 2 次、聚合为 4）。
        """
        me = customer_user.id
        t_start, _ = today_window()
        today_at = t_start + timedelta(hours=1)
        db_session.add(Lead(community_name="估价小区", referrer_id=me, created_at=today_at))
        db_session.add(Lead(community_name="承接小区", referrer_id=me, source_property_id=42, created_at=today_at))
        db_session.commit()

        resp = c_end_client.get("/api/v1/public/customers/my/share-stats")
        assert resp.status_code == 200, resp.text
        assert resp.json() == {
            "share_count": 0,
            "pv": 0,
            "anon_uv": 0,
            "recruit_uv": 0,
            "uv": 0,
            "lead_count": 2,
            "today_share_count": 0,
            "today_pv": 0,
            "today_anon_uv": 0,
            "today_recruit_uv": 0,
            "today_uv": 0,
            "today_lead_count": 2,
        }

    def test_anonymous_uv_dedup_across_links(
        self, c_end_client: TestClient, customer_user: User, db_session: Session
    ) -> None:
        """匿名三链路共用同一设备 visitor_id：跨表去重，不因链路数重复计数.

        同一 visitor_id 在估价/预约两条链路各留 1 次访问 → anon_uv == 1
        （修复前各链路 UV 相加，同一客户被计 2 次）。
        """
        me = customer_user.id
        t_start, _ = today_window()
        today_at = t_start + timedelta(hours=1)
        same_device = "11111111-2222-4333-8444-555555555555"
        # marketing_project_id 为逻辑外键（库中无 FK 约束），此处用占位值
        db_session.add(ValuationVisit(visitor_id=same_device, referrer_employee_id=me, created_at=today_at))
        db_session.add(
            ProjectVisit(
                visitor_id=same_device,
                referrer_employee_id=me,
                marketing_project_id=1,
                created_at=today_at,
            )
        )
        db_session.commit()

        resp = c_end_client.get("/api/v1/public/customers/my/share-stats")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["pv"] == 2, "两条链路 PV 仍应各计 1（PV 可求和）"
        assert body["anon_uv"] == 1, "同一设备跨链路应去重为 1"
        assert body["today_anon_uv"] == 1
        # 过渡别名与 anon_uv 同值（旧版小程序兼容）
        assert body["uv"] == body["anon_uv"]
        assert body["today_uv"] == body["today_anon_uv"]
        # 招募 UV 单列，不并入匿名 UV
        assert body["recruit_uv"] == 0
