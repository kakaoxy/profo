"""区域伙伴招募计划后端测试.

覆盖归因引擎三规则、活动配置、访问埋点、6 级漏斗统计、后台与 C 端接口。
"""

from __future__ import annotations

from collections.abc import Generator
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import Community, Role, User
from models.recruit import (
    RecruitCampaign,
    RecruitCampaignStatus,
    RecruitLead,
    RecruitLeadSource,
    RecruitLeadStatus,
    RecruitShareEvent,
    RecruitShareType,
    RecruitVisit,
)
from schemas.recruit import RecruitCampaignUpdate
from services.recruit import (
    RecruitAttributionService,
    RecruitCampaignService,
    RecruitFunnelService,
)
from services.system.exceptions import ResourceNotFoundError, ValidationError
from utils.auth import get_password_hash
from utils.crypto import hash_phone


def _make_campaign(db: Session, **kwargs: Any) -> RecruitCampaign:
    """创建招募活动."""
    campaign = RecruitCampaign(
        name=kwargs.get("name", "招募活动"),
        title=kwargs.get("title", "招募分享标题"),
        status=kwargs.get("status", RecruitCampaignStatus.ENABLED),
    )
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign


# ==================== 归因引擎 ====================


class TestAttribution:
    def test_first_lead_writes_referrer(self, db_session: Session):
        """首次留资写入归属员工."""
        service = RecruitAttributionService(db_session)
        lead, is_new = service.submit_lead(
            "13800138000",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer="emp-a",
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new is True
        assert lead.referrer_employee_id == "emp-a"
        assert lead.phone_hash == hash_phone("13800138000")
        assert lead.status == RecruitLeadStatus.NEW

    def test_duplicate_lead_does_not_overwrite(self, db_session: Session):
        """重复留资（不同员工）返回原记录且归属永不覆盖."""
        service = RecruitAttributionService(db_session)
        service.submit_lead(
            "13800138001",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer="emp-a",
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )

        lead2, is_new = service.submit_lead(
            "13800138001",
            campaign_id=None,
            main_business_area="越秀商圈",
            referrer="emp-b",
            source=RecruitLeadSource.POSTER,
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new is False
        assert lead2.referrer_employee_id == "emp-a"

    def test_duplicate_lead_backfills_missing_referrer(self, db_session: Session):
        """重复留资：已有线索无归属且本次携带归属员工时补充归属（不新建记录）."""
        service = RecruitAttributionService(db_session)
        # 首次留资未带 referrer（如直接进入页面），线索无归属
        service.submit_lead(
            "13800138003",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer=None,
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )

        # 经员工分享链接进入后重复留资，携带 referrer → 补充归属
        lead2, is_new = service.submit_lead(
            "13800138003",
            campaign_id=None,
            main_business_area="天河商圈",
            source=RecruitLeadSource.CARD,
            referrer="emp-a",
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new is False
        assert lead2.referrer_employee_id == "emp-a"
        assert db_session.query(RecruitLead).count() == 1

        # 已补充归属后，其他员工再留资不覆盖
        lead3, _ = service.submit_lead(
            "13800138003",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer="emp-b",
            source=RecruitLeadSource.POSTER,
            visit_id=None,
            user_id="customer-user",
        )
        assert lead3.referrer_employee_id == "emp-a"

    def test_backfill_referrer_persists_without_visit(self, db_session: Session):
        """补充归属必须真正落库：visit_id 缺失（埋点未创建/失败/不归属）时不得静默丢失.

        回归：原实现依赖 ``_mark_visit_authed`` 的条件提交持久化 backfill，
        visit 缺失/不归属时该函数不提交，会话关闭回滚导致归属补充静默丢失——
        内存对象可见（旧测试通过），但员工「我的线索」与分享统计永远查不到该线索。
        """
        service = RecruitAttributionService(db_session)
        # 首次留资未带 referrer（如直接进入页面），线索无归属
        service.submit_lead(
            "13800138005",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer=None,
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        # 经员工分享链接重复留资：携带 referrer，但 visit_id 缺失
        _, is_new = service.submit_lead(
            "13800138005",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer="emp-a",
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new is False
        # 强制 reload 从 DB 重新读取，验证归属真正落库而非仅内存赋值
        db_session.expire_all()
        reloaded = db_session.query(RecruitLead).filter(RecruitLead.phone_hash == hash_phone("13800138005")).first()
        assert reloaded is not None
        assert reloaded.referrer_employee_id == "emp-a"

    def test_duplicate_lead_without_referrer_keeps_null(self, db_session: Session):
        """重复留资未带 referrer：无归属线索保持无归属，不报错."""
        service = RecruitAttributionService(db_session)
        service.submit_lead(
            "13800138004",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer=None,
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        lead2, is_new = service.submit_lead(
            "13800138004",
            campaign_id=None,
            main_business_area="天河商圈",
            referrer=None,
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new is False
        assert lead2.referrer_employee_id is None

    def test_different_phones_create_separate_leads(self, db_session: Session):
        """不同手机号分别建立线索."""
        service = RecruitAttributionService(db_session)
        _, is_new1 = service.submit_lead(
            "13800138002",
            campaign_id=None,
            main_business_area="商圈",
            referrer="emp-a",
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        _, is_new2 = service.submit_lead(
            "13800138003",
            campaign_id=None,
            main_business_area="商圈",
            referrer="emp-b",
            source=RecruitLeadSource.CARD,
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new1 is True
        assert is_new2 is True
        assert db_session.query(RecruitLead).count() == 2

    def test_phone_hash_unique_constraint(self, db_session: Session):
        """phone_hash 唯一约束在 DB 层阻止重复插入（并发留资去重的最后防线）."""
        from sqlalchemy.exc import IntegrityError

        db_session.add(
            RecruitLead(
                phone="13800138000",
                phone_hash="hash-dup",
                main_business_area="商圈",
            )
        )
        db_session.commit()

        db_session.add(
            RecruitLead(
                phone="13800138000",
                phone_hash="hash-dup",
                main_business_area="商圈",
            )
        )
        with pytest.raises(IntegrityError):
            db_session.commit()
        db_session.rollback()

    def test_concurrent_submit_integrity_error_recovery(self, db_session: Session, monkeypatch):
        """并发留资：竞态导致 INSERT 触发唯一约束，回滚后重查返回已有记录.

        场景：两个并发请求提交同一手机号。请求 A 先 commit 成功（winner），
        请求 B 的查重发生在 A 提交前（竞态窗口，返回 None），B 的 INSERT commit
        触发 phone_hash 唯一约束 IntegrityError，B 回滚后重查命中 A 的记录，
        返回 (winner, is_new=False)，保证「首次留资归属永不覆盖」。
        """
        from unittest.mock import MagicMock

        from sqlalchemy.exc import IntegrityError

        # 预插入「并发赢家」（模拟另一事务先提交）
        winner = RecruitLead(
            phone="13800138000",
            phone_hash=hash_phone("13800138000"),
            main_business_area="天河商圈",
            referrer_employee_id="emp-a",
            source=RecruitLeadSource.CARD,
        )
        db_session.add(winner)
        db_session.commit()

        service = RecruitAttributionService(db_session)

        # 模拟竞态窗口：首次 RecruitLead 查重返回 None（winner 尚未可见）
        real_query = type(db_session).query
        query_count = {"n": 0}

        def patched_query(self_session: Session, *entities: Any, **kwargs: Any) -> Any:
            q = real_query(self_session, *entities, **kwargs)
            if entities and entities[0] is RecruitLead:
                query_count["n"] += 1
                if query_count["n"] == 1:
                    mock_q = MagicMock()
                    mock_q.first.return_value = None
                    mock_q.filter.return_value = mock_q
                    return mock_q
            return q

        monkeypatch.setattr(type(db_session), "query", patched_query)

        # 模拟 INSERT commit 触发唯一约束冲突（真实 commit 未执行，lead 未 flush）
        real_commit = type(db_session).commit
        commit_count = {"n": 0}

        def patched_commit(self_session: Session, *args: Any, **kwargs: Any) -> None:
            commit_count["n"] += 1
            if commit_count["n"] == 1:
                stmt = "simulated unique violation"
                raise IntegrityError(stmt, None, Exception("unique"))
            return real_commit(self_session, *args, **kwargs)

        monkeypatch.setattr(type(db_session), "commit", patched_commit)

        lead, is_new = service.submit_lead(
            "13800138000",
            campaign_id=None,
            main_business_area="越秀商圈",
            referrer="emp-b",
            source=RecruitLeadSource.POSTER,
            visit_id=None,
            user_id="customer-user",
        )
        assert is_new is False
        assert lead.referrer_employee_id == "emp-a"  # 并发赢家归属，永不覆盖


# ==================== 活动配置 ====================


class TestCampaignService:
    def test_get_enabled_disabled_raises(self, db_session: Session):
        """停用活动 get_enabled 抛 ValidationError."""
        campaign = _make_campaign(db_session, status=RecruitCampaignStatus.DISABLED)
        with pytest.raises(ValidationError, match="停用"):
            RecruitCampaignService(db_session).get_enabled(campaign.id)

    def test_get_enabled_not_found_raises(self, db_session: Session):
        """不存在活动 get_enabled 抛 ResourceNotFoundError."""
        with pytest.raises(ResourceNotFoundError):
            RecruitCampaignService(db_session).get_enabled("nonexistent")

    def test_update_partial(self, db_session: Session):
        """更新仅影响显式字段."""
        campaign = _make_campaign(db_session)
        updated = RecruitCampaignService(db_session).update(campaign.id, RecruitCampaignUpdate(title="新标题"))
        assert updated.title == "新标题"
        assert updated.name == "招募活动"

    def test_list_business_areas_sorted(self, db_session: Session):
        """商圈按频次降序，过滤空值."""
        for i in range(3):
            db_session.add(Community(id=f"c{i}", name=f"小区{i}", business_circle="天河商圈"))
        db_session.add(Community(id="c3", name="小区3", business_circle="越秀商圈"))
        db_session.add(Community(id="c4", name="小区4", business_circle=None))
        db_session.commit()

        areas = RecruitCampaignService(db_session).list_business_areas()
        assert areas[0] == ("天河商圈", 3)
        assert areas[1] == ("越秀商圈", 1)
        assert all(name for name, _ in areas)


# ==================== 6 级漏斗统计 ====================


class TestFunnel:
    def test_six_levels(self, db_session: Session):
        """6 级漏斗口径正确."""
        campaign = _make_campaign(db_session)

        for _ in range(2):
            db_session.add(
                RecruitShareEvent(campaign_id=campaign.id, employee_id="emp-a", share_type=RecruitShareType.CARD)
            )
        # 3 次访问，2 个去重 openid，1 深度浏览，1 点击授权
        db_session.add(
            RecruitVisit(
                campaign_id=campaign.id,
                openid_hash="openid-1",
                referrer_employee_id="emp-a",
                is_deep_view=True,
                clicked_auth=True,
            )
        )
        db_session.add(RecruitVisit(campaign_id=campaign.id, openid_hash="openid-2", referrer_employee_id="emp-a"))
        db_session.add(RecruitVisit(campaign_id=campaign.id, openid_hash="openid-2", referrer_employee_id="emp-b"))
        # 2 条线索，1 条内部员工
        db_session.add(
            RecruitLead(
                phone="13800000001",
                phone_hash=hash_phone("13800000001"),
                main_business_area="商圈",
                campaign_id=campaign.id,
                referrer_employee_id="emp-a",
                is_internal=False,
            )
        )
        db_session.add(
            RecruitLead(
                phone="13800000002",
                phone_hash=hash_phone("13800000002"),
                main_business_area="商圈",
                campaign_id=campaign.id,
                referrer_employee_id="emp-a",
                is_internal=True,
            )
        )
        db_session.commit()

        data = RecruitFunnelService(db_session).compute(campaign_id=campaign.id)
        assert data["share_count"] == 2
        assert data["pv"] == 3
        assert data["uv"] == 2
        assert data["deep_view"] == 1
        assert data["clicked_auth"] == 1
        assert data["authed"] == 2
        assert data["valid_leads"] == 1

    def test_employee_dimension(self, db_session: Session):
        """员工维度下钻."""
        campaign = _make_campaign(db_session)
        db_session.add(
            RecruitShareEvent(campaign_id=campaign.id, employee_id="emp-a", share_type=RecruitShareType.CARD)
        )
        db_session.add(
            RecruitShareEvent(campaign_id=campaign.id, employee_id="emp-b", share_type=RecruitShareType.CARD)
        )
        db_session.commit()

        data = RecruitFunnelService(db_session).compute(campaign_id=campaign.id, employee_id="emp-a")
        assert data["share_count"] == 1


# ==================== 后台接口 ====================


class TestAdminRecruitRouter:
    def test_campaign_crud(self, backend_client: TestClient):
        """活动创建/列表/编辑."""
        resp = backend_client.post(
            "/api/v1/admin/recruit/campaigns",
            json={"name": "活动A", "title": "标题A", "status": "enabled"},
        )
        assert resp.status_code == 201
        campaign_id = resp.json()["id"]

        resp = backend_client.get("/api/v1/admin/recruit/campaigns")
        assert resp.status_code == 200
        assert any(c["id"] == campaign_id for c in resp.json())

        resp = backend_client.put(
            f"/api/v1/admin/recruit/campaigns/{campaign_id}",
            json={"title": "标题B"},
        )
        assert resp.status_code == 200
        assert resp.json()["title"] == "标题B"

    def test_leads_list_masks_phone(self, backend_client: TestClient, db_session: Session):
        """线索列表手机号脱敏."""
        campaign = _make_campaign(db_session)
        db_session.add(
            RecruitLead(
                phone="13800138000",
                phone_hash=hash_phone("13800138000"),
                main_business_area="天河商圈",
                campaign_id=campaign.id,
                referrer_employee_id="admin-user",
            )
        )
        db_session.commit()

        resp = backend_client.get("/api/v1/admin/recruit/leads")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items[0]["phone_masked"] == "138****8000"

    def test_update_status(self, backend_client: TestClient, db_session: Session):
        """跟进状态流转."""
        campaign = _make_campaign(db_session)
        lead = RecruitLead(
            phone="13800138001",
            phone_hash=hash_phone("13800138001"),
            main_business_area="商圈",
            campaign_id=campaign.id,
        )
        db_session.add(lead)
        db_session.commit()

        resp = backend_client.put(
            f"/api/v1/admin/recruit/leads/{lead.id}/status",
            json={"status": "contacted", "is_internal": True},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "contacted"
        assert resp.json()["is_internal"] is True

    def test_funnel_endpoint(self, backend_client: TestClient):
        """漏斗接口可用."""
        resp = backend_client.get("/api/v1/admin/recruit/leads/funnel")
        assert resp.status_code == 200
        assert set(resp.json()) >= {
            "share_count",
            "pv",
            "uv",
            "deep_view",
            "clicked_auth",
            "authed",
            "valid_leads",
        }

    def test_permission_denied(self, normal_user_client: TestClient):
        """无 recruit:read 权限返回 403."""
        resp = normal_user_client.get("/api/v1/admin/recruit/campaigns")
        assert resp.status_code == 403


# ==================== C 端接口 ====================


@pytest.fixture
def no_auth_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """无认证客户端（游客）."""
    session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


class TestPublicRecruitRouter:
    def test_campaign_detail_guest(self, no_auth_client: TestClient, db_session: Session):
        """游客可查看活动详情（含海报背景图）."""
        campaign = _make_campaign(db_session)
        campaign.poster_bg_url = "https://cdn.example.com/poster-bg.png"
        db_session.commit()
        resp = no_auth_client.get(f"/api/v1/public/recruit/campaigns/{campaign.id}")
        assert resp.status_code == 200
        assert resp.json()["title"] == "招募分享标题"
        assert resp.json()["poster_bg_url"] == "https://cdn.example.com/poster-bg.png"

    def test_business_areas_guest(self, no_auth_client: TestClient, db_session: Session):
        """游客可获取商圈选项."""
        db_session.add(Community(id="c0", name="小区0", business_circle="天河商圈"))
        db_session.commit()
        resp = no_auth_client.get("/api/v1/public/recruit/business-areas")
        assert resp.status_code == 200
        assert any(item["name"] == "天河商圈" for item in resp.json())

    def test_create_visit(self, c_end_client: TestClient, db_session: Session):
        """C 端登录态创建访问记录."""
        campaign = _make_campaign(db_session)
        resp = c_end_client.post(
            "/api/v1/public/recruit/visits",
            json={"campaign_id": campaign.id, "referrer": "emp-a", "source": "card"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"]

    def test_submit_lead(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """C 端留资并归因（mock 微信解密）."""
        campaign = _make_campaign(db_session)

        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800138002"},
        )

        resp = c_end_client.post(
            "/api/v1/public/recruit/leads",
            json={
                "code": "wx-code",
                "campaign_id": campaign.id,
                "main_business_area": "天河商圈",
                "referrer": "emp-a",
                "source": "card",
            },
        )
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True

        lead = db_session.query(RecruitLead).filter(RecruitLead.phone_hash == hash_phone("13800138002")).first()
        assert lead is not None
        assert lead.referrer_employee_id == "emp-a"

    def test_update_visit_idor_blocked(self, c_end_client: TestClient, seeded_db: dict[str, Any], db_session: Session):
        """IDOR 防护：A 用户创建的 visit，B 用户无法上报离开.

        创建另一名 C 端用户 owner，owner 创建 visit；当前 c_end_client（customer-user）
        尝试上报该 visit 应返回 404（不泄露存在性），且不修改 owner 的 visit 字段。
        """
        owner_role = db_session.query(Role).filter(Role.code == "customer").first()
        owner = User(
            id="owner-user",
            username="owner",
            password=get_password_hash("Owner1!"),
            nickname="owner",
            role_id=owner_role.id,
            status="active",
        )
        db_session.add(owner)
        db_session.commit()

        # owner 创建 visit（直接构造，绕过路由）
        owner_visit = RecruitVisit(
            id="visit-owner",
            campaign_id=None,
            visitor_id=owner.id,
            openid_hash="owner-openid",
            referrer_employee_id=None,
            source=RecruitLeadSource.CARD,
        )
        db_session.add(owner_visit)
        db_session.commit()

        # c_end_client（customer-user）尝试上报 owner 的 visit
        resp = c_end_client.put(
            "/api/v1/public/recruit/visits/visit-owner",
            json={"stayed_ms": 5000, "is_deep_view": True, "clicked_auth": True},
        )
        assert resp.status_code == 404

        # 字段未被修改
        db_session.refresh(owner_visit)
        assert owner_visit.stayed_ms is None
        assert owner_visit.is_deep_view is False
        assert owner_visit.clicked_auth is False

    def test_submit_lead_idor_visit_not_marked(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """IDOR 防护：留资时传他人 visit_id 不应标记其 authed."""
        # owner 创建 visit（visitor_id != customer-user）
        owner_visit = RecruitVisit(
            id="visit-other",
            campaign_id=None,
            visitor_id="someone-else",
            openid_hash="other-openid",
            referrer_employee_id=None,
            source=RecruitLeadSource.CARD,
        )
        db_session.add(owner_visit)
        db_session.commit()

        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800138888"},
        )

        resp = c_end_client.post(
            "/api/v1/public/recruit/leads",
            json={
                "code": "wx-code",
                "main_business_area": "天河商圈",
                "source": "card",
                "visit_id": "visit-other",
            },
        )
        assert resp.status_code == 200

        # 他人 visit 不应被标记 authed
        db_session.refresh(owner_visit)
        assert owner_visit.authed is False


# ==================== 漏斗去重口径 ====================


class TestFunnelDistinctUsers:
    def test_deep_view_dedup_by_openid(self, db_session: Session):
        """同一用户多次深度浏览只计 1 人."""
        campaign = _make_campaign(db_session)
        for _ in range(2):
            db_session.add(
                RecruitVisit(
                    campaign_id=campaign.id,
                    openid_hash="same-openid",
                    referrer_employee_id="emp-a",
                    is_deep_view=True,
                    clicked_auth=True,
                )
            )
        db_session.commit()

        data = RecruitFunnelService(db_session).compute(campaign_id=campaign.id)
        assert data["deep_view"] == 1
        assert data["clicked_auth"] == 1


# ==================== 分享事件（Task 1） ====================


class TestShareEvent:
    def test_create_share_event_success(self, db_session: Session, customer_user: User):
        """登录态上报分享事件成功落库."""
        from schemas.recruit import RecruitShareEventCreate

        user = db_session.query(User).filter(User.id == customer_user.id).first()
        assert user is not None
        service = RecruitAttributionService(db_session)
        event = service.create_share_event(
            user,
            RecruitShareEventCreate(campaign_id=None, share_type="card"),
        )
        assert event.id
        assert event.employee_id == customer_user.id
        assert event.share_type == RecruitShareType.CARD

        # 验证落库
        saved = db_session.query(RecruitShareEvent).filter(RecruitShareEvent.id == event.id).first()
        assert saved is not None

    def test_share_event_create_poster(self, db_session: Session, customer_user: User):
        """Poster 类型正确映射."""
        from schemas.recruit import RecruitShareEventCreate

        user = db_session.query(User).filter(User.id == customer_user.id).first()
        assert user is not None
        service = RecruitAttributionService(db_session)
        event = service.create_share_event(
            user,
            RecruitShareEventCreate(campaign_id=None, share_type="poster"),
        )
        assert event.share_type == RecruitShareType.POSTER

    def test_share_event_public_router_401(self, no_auth_client: TestClient):
        """未登录调 share-events 返回 401."""
        resp = no_auth_client.post(
            "/api/v1/public/recruit/share-events",
            json={"campaign_id": None, "share_type": "card"},
        )
        assert resp.status_code == 401


# ==================== 深度浏览服务端复核（Task 2） ====================


class TestDeepViewServerReview:
    def test_stayed_ms_0_elapsed_ge_3s(self, db_session: Session):
        """前端漏报（stayed_ms=0）但 elapsed>=3s → is_deep_view=True."""
        from datetime import timedelta

        from schemas.recruit import RecruitVisitUpdate

        visit = RecruitVisit(
            id="deep-view-test-1",
            campaign_id=None,
            visitor_id="customer-user",
            openid_hash="hash-customer",
            entered_at=datetime.now(timezone.utc) - timedelta(seconds=5),
        )
        db_session.add(visit)
        db_session.commit()

        service = RecruitAttributionService(db_session)
        updated = service.update_visit(
            "deep-view-test-1",
            RecruitVisitUpdate(stayed_ms=0, is_deep_view=False, clicked_auth=False),
            user_id="customer-user",
        )
        assert updated.is_deep_view is True

    def test_both_below_threshold(self, db_session: Session):
        """前端 stayed_ms 与后端 elapsed 均 <3s → is_deep_view=False."""
        from datetime import timedelta

        from schemas.recruit import RecruitVisitUpdate

        visit = RecruitVisit(
            id="deep-view-test-2",
            campaign_id=None,
            visitor_id="customer-user",
            openid_hash="hash-customer",
            entered_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
        db_session.add(visit)
        db_session.commit()

        service = RecruitAttributionService(db_session)
        updated = service.update_visit(
            "deep-view-test-2",
            RecruitVisitUpdate(stayed_ms=500, is_deep_view=False, clicked_auth=False),
            user_id="customer-user",
        )
        assert updated.is_deep_view is False

    def test_frontend_deep_view_honored(self, db_session: Session):
        """前端上报 is_deep_view=True 即使 elapsed 很短仍保留."""
        from datetime import timedelta

        from schemas.recruit import RecruitVisitUpdate

        visit = RecruitVisit(
            id="deep-view-test-3",
            campaign_id=None,
            visitor_id="customer-user",
            openid_hash="hash-customer",
            entered_at=datetime.now(timezone.utc) - timedelta(seconds=1),
        )
        db_session.add(visit)
        db_session.commit()

        service = RecruitAttributionService(db_session)
        updated = service.update_visit(
            "deep-view-test-3",
            RecruitVisitUpdate(stayed_ms=500, is_deep_view=True, clicked_auth=False),
            user_id="customer-user",
        )
        assert updated.is_deep_view is True


# ==================== 小程序码（Task 9） ====================


class TestQRCode:
    def test_qrcode_generate_disabled_campaign(self, backend_client: TestClient, db_session: Session):
        """停用活动生成小程序码返回 400."""
        campaign = _make_campaign(db_session, status=RecruitCampaignStatus.DISABLED)
        resp = backend_client.post(
            f"/api/v1/admin/recruit/campaigns/{campaign.id}/qrcode",
            json={},
        )
        assert resp.status_code == 400

    def test_qrcode_generate_nonexistent_campaign(self, backend_client: TestClient):
        """不存在活动生成小程序码返回 404."""
        resp = backend_client.post(
            "/api/v1/admin/recruit/campaigns/nonexistent/qrcode",
            json={},
        )
        assert resp.status_code == 404

    def test_qrcode_resolve_invalid_code(self, c_end_client: TestClient):
        """无效短码解析返回 404."""
        resp = c_end_client.get("/api/v1/public/recruit/qr/invalid")
        assert resp.status_code == 404

    def test_qrcode_resolve_nonexistent_code(self, no_auth_client: TestClient):
        """不存在的短码解析返回 404."""
        resp = no_auth_client.get("/api/v1/public/recruit/qr/xxxxxxxx")
        assert resp.status_code == 404

    def test_qrcode_scene_unique_code(self, db_session: Session):
        """同一（campaign_id, employee_id）组合复用短码."""
        from unittest.mock import patch

        from services.recruit.qrcode import RecruitQRCodeService

        campaign = _make_campaign(db_session)

        with (
            patch.object(RecruitQRCodeService, "_generate_unique_code", return_value="testcod1"),
            patch("services.recruit.qrcode.WeChatAuthService.fetch_miniapp_unlimited_qrcode", return_value=b"img"),
        ):
            service = RecruitQRCodeService(db_session)
            r1 = service.generate(campaign.id, "emp-a")
            assert r1["code"] == "testcod1"

            # 第二次同一组合应复用短码
            r2 = service.generate(campaign.id, "emp-a")
            assert r2["code"] == "testcod1"

    def test_qrcode_concurrent_same_pair_reuses_committed_code(self, db_session: Session):
        """并发同组合插入撞唯一索引时，rollback 后复用已提交记录的短码."""
        from unittest.mock import patch

        from models.recruit import RecruitQRScene
        from services.recruit.qrcode import RecruitQRCodeService

        campaign = _make_campaign(db_session)

        def fake_gen(_self):
            # 模拟并发：预检查通过后、插入提交前，另一请求已提交同组合记录
            competing = RecruitQRScene(
                id="competing-scene",
                code="deadbeef",
                campaign_id=campaign.id,
                employee_id="emp-a",
            )
            db_session.add(competing)
            db_session.commit()
            return "cafebabe"

        with (
            patch.object(RecruitQRCodeService, "_generate_unique_code", fake_gen),
            patch("services.recruit.qrcode.WeChatAuthService.fetch_miniapp_unlimited_qrcode", return_value=b"img"),
        ):
            service = RecruitQRCodeService(db_session)
            result = service.generate(campaign.id, "emp-a")

        assert result["code"] == "deadbeef"
        rows = db_session.query(RecruitQRScene).filter_by(campaign_id=campaign.id, employee_id="emp-a").all()
        assert len(rows) == 1
        assert rows[0].code == "deadbeef"

    def test_qrcode_code_collision_retries_with_new_code(self, db_session: Session):
        """随机短码撞码时换码重试，而非向用户抛 409 冲突."""
        from unittest.mock import patch

        from models.recruit import RecruitQRScene
        from services.recruit.qrcode import RecruitQRCodeService

        campaign_a = _make_campaign(db_session, name="活动A")
        campaign_b = _make_campaign(db_session, name="活动B")

        # 其它组合已占用短码 11111111
        occupied = RecruitQRScene(
            id="occupied-scene",
            code="11111111",
            campaign_id=campaign_b.id,
            employee_id="emp-x",
        )
        db_session.add(occupied)
        db_session.commit()

        with (
            patch.object(RecruitQRCodeService, "_generate_unique_code", side_effect=["11111111", "22222222"]),
            patch("services.recruit.qrcode.WeChatAuthService.fetch_miniapp_unlimited_qrcode", return_value=b"img"),
        ):
            service = RecruitQRCodeService(db_session)
            result = service.generate(campaign_a.id, "emp-a")

        assert result["code"] == "22222222"


# ==================== 线索完整手机号（Task 11a） ====================


class TestLeadPhone:
    def test_lead_phone_success(self, backend_client: TestClient, db_session: Session):
        """持写权限可查看完整手机号."""
        campaign = _make_campaign(db_session)
        from models.recruit import RecruitLead

        lead = RecruitLead(
            id="phone-test-lead",
            phone="13800138000",
            phone_hash="hash-test",
            main_business_area="商圈",
            campaign_id=campaign.id,
        )
        db_session.add(lead)
        db_session.commit()

        resp = backend_client.get(f"/api/v1/admin/recruit/leads/{lead.id}/phone")
        assert resp.status_code == 200
        assert resp.json()["phone"] == "13800138000"

    def test_lead_phone_not_found(self, backend_client: TestClient):
        """不存在的线索返回 404."""
        resp = backend_client.get("/api/v1/admin/recruit/leads/nonexistent/phone")
        assert resp.status_code == 404

    def test_lead_phone_permission_denied(self, normal_user_client: TestClient, db_session: Session):
        """只读权限（无 recruit:write）返回 403."""
        campaign = _make_campaign(db_session)
        from models.recruit import RecruitLead

        lead = RecruitLead(
            id="phone-perm-test",
            phone="13800138001",
            phone_hash="hash-perm",
            main_business_area="商圈",
            campaign_id=campaign.id,
        )
        db_session.add(lead)
        db_session.commit()

        resp = normal_user_client.get(f"/api/v1/admin/recruit/leads/{lead.id}/phone")
        assert resp.status_code == 403


# ==================== 员工小程序码 C 端端点（二期 Task 4） ====================


class TestMyCampaignQRCode:
    def test_generate_success_binds_current_user(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """登录生成成功，employee_id 绑定当前登录用户."""
        from models.recruit import RecruitQRScene

        campaign = _make_campaign(db_session)
        monkeypatch.setattr(
            "services.recruit.qrcode.WeChatAuthService.fetch_miniapp_unlimited_qrcode",
            lambda scene, page=None: b"img",
        )

        resp = c_end_client.get(f"/api/v1/public/recruit/campaigns/{campaign.id}/qrcode")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"]
        assert body["image_base64"]

        scene = db_session.query(RecruitQRScene).filter_by(campaign_id=campaign.id).first()
        assert scene is not None
        assert scene.employee_id == "customer-user"

    def test_generate_reuses_code_for_same_pair(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """同（活动,员工）组合复用短码."""
        campaign = _make_campaign(db_session)
        monkeypatch.setattr(
            "services.recruit.qrcode.WeChatAuthService.fetch_miniapp_unlimited_qrcode",
            lambda scene, page=None: b"img",
        )

        r1 = c_end_client.get(f"/api/v1/public/recruit/campaigns/{campaign.id}/qrcode")
        r2 = c_end_client.get(f"/api/v1/public/recruit/campaigns/{campaign.id}/qrcode")
        assert r1.status_code == 200
        assert r2.status_code == 200
        assert r1.json()["code"] == r2.json()["code"]

    def test_generate_unauthorized_401(self, no_auth_client: TestClient, db_session: Session):
        """未登录返回 401."""
        campaign = _make_campaign(db_session)
        resp = no_auth_client.get(f"/api/v1/public/recruit/campaigns/{campaign.id}/qrcode")
        assert resp.status_code == 401

    def test_generate_disabled_campaign_unified_error(self, c_end_client: TestClient, db_session: Session):
        """活动停用返回统一错误格式 {"code":≠0,"message":...}."""
        campaign = _make_campaign(db_session, status=RecruitCampaignStatus.DISABLED)
        resp = c_end_client.get(f"/api/v1/public/recruit/campaigns/{campaign.id}/qrcode")
        assert resp.status_code == 400
        assert resp.json()["code"] != 0
        assert "停用" in resp.json()["message"]


# ==================== 我的线索与分享统计（二期 Task 5） ====================


class TestMyLeads:
    def test_attribution_isolation(self, c_end_client: TestClient, db_session: Session):
        """归属隔离：仅可见归属自己的线索."""
        db_session.add(
            RecruitLead(
                phone="13811110000",
                phone_hash=hash_phone("13811110000"),
                main_business_area="我的商圈",
                referrer_employee_id="customer-user",
            )
        )
        db_session.add(
            RecruitLead(
                phone="13811110001",
                phone_hash=hash_phone("13811110001"),
                main_business_area="他人商圈",
                referrer_employee_id="emp-other",
            )
        )
        db_session.commit()

        resp = c_end_client.get("/api/v1/public/recruit/my/leads")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert len(items) == 1
        assert items[0]["main_business_area"] == "我的商圈"

    def test_phone_masked(self, c_end_client: TestClient, db_session: Session):
        """我的线索手机号脱敏."""
        db_session.add(
            RecruitLead(
                phone="13800138000",
                phone_hash=hash_phone("13800138000"),
                main_business_area="天河商圈",
                referrer_employee_id="customer-user",
            )
        )
        db_session.commit()

        resp = c_end_client.get("/api/v1/public/recruit/my/leads")
        assert resp.status_code == 200
        assert resp.json()["items"][0]["phone_masked"] == "138****8000"

    def test_pagination_and_status_filter(self, c_end_client: TestClient, db_session: Session):
        """分页与状态筛选."""
        for i, status in enumerate(["new", "new", "contacted"]):
            db_session.add(
                RecruitLead(
                    phone=f"1381111220{i}",
                    phone_hash=hash_phone(f"1381111220{i}"),
                    main_business_area=f"商圈{i}",
                    referrer_employee_id="customer-user",
                    status=status,
                )
            )
        db_session.commit()

        # 分页：page_size=2 → total=3, items=2
        resp = c_end_client.get("/api/v1/public/recruit/my/leads", params={"page": 1, "page_size": 2})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 3
        assert len(body["items"]) == 2
        assert body["page"] == 1
        assert body["page_size"] == 2

        # 状态筛选：contacted → 1 条
        resp = c_end_client.get("/api/v1/public/recruit/my/leads", params={"status": "contacted"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] == 1
        assert body["items"][0]["status"] == "contacted"

    def test_unauthorized_401(self, no_auth_client: TestClient):
        """未登录返回 401."""
        resp = no_auth_client.get("/api/v1/public/recruit/my/leads")
        assert resp.status_code == 401


class TestMyLeadPhone:
    def test_owner_views_phone_transitions_new_to_contacted(self, c_end_client: TestClient, db_session: Session):
        """归属员工查看完整号码：返回明文手机号，new 线索自动流转 contacted."""
        lead = RecruitLead(
            phone="13811114400",
            phone_hash=hash_phone("13811114400"),
            main_business_area="天河商圈",
            referrer_employee_id="customer-user",
            status=RecruitLeadStatus.NEW,
        )
        db_session.add(lead)
        db_session.commit()

        resp = c_end_client.get(f"/api/v1/public/recruit/my/leads/{lead.id}/phone")
        assert resp.status_code == 200
        body = resp.json()
        assert body["phone"] == "13811114400"
        assert body["status"] == "contacted"

        # 闭环：列表中该线索状态同步为 contacted
        db_session.expire_all()
        list_resp = c_end_client.get("/api/v1/public/recruit/my/leads", params={"status": "contacted"})
        assert list_resp.status_code == 200
        assert list_resp.json()["total"] == 1

    def test_non_new_status_unchanged(self, c_end_client: TestClient, db_session: Session):
        """非 new 线索查看号码不改状态."""
        lead = RecruitLead(
            phone="13811114401",
            phone_hash=hash_phone("13811114401"),
            main_business_area="天河商圈",
            referrer_employee_id="customer-user",
            status=RecruitLeadStatus.CONVERTED,
        )
        db_session.add(lead)
        db_session.commit()

        resp = c_end_client.get(f"/api/v1/public/recruit/my/leads/{lead.id}/phone")
        assert resp.status_code == 200
        assert resp.json()["status"] == "converted"

    def test_non_owner_404(self, c_end_client: TestClient, db_session: Session):
        """非归属员工查看统一 404（不泄露线索存在性）."""
        lead = RecruitLead(
            phone="13811114402",
            phone_hash=hash_phone("13811114402"),
            main_business_area="天河商圈",
            referrer_employee_id="emp-other",
        )
        db_session.add(lead)
        db_session.commit()

        resp = c_end_client.get(f"/api/v1/public/recruit/my/leads/{lead.id}/phone")
        assert resp.status_code == 404

    def test_not_exist_404(self, c_end_client: TestClient):
        """线索不存在返回 404."""
        resp = c_end_client.get("/api/v1/public/recruit/my/leads/nonexistent/phone")
        assert resp.status_code == 404

    def test_unauthorized_401(self, no_auth_client: TestClient):
        """未登录返回 401."""
        resp = no_auth_client.get("/api/v1/public/recruit/my/leads/some-id/phone")
        assert resp.status_code == 401


class TestMyShareStats:
    def test_stats_metrics(self, c_end_client: TestClient, db_session: Session, customer_user: User):
        """统计口径：share 按 employee_id、pv/uv 按 referrer_employee_id（uv 去重）、lead_count 归属数."""
        # 2 次分享（1 次他人）
        for emp in ["customer-user", "customer-user", "emp-other"]:
            db_session.add(RecruitShareEvent(campaign_id=None, employee_id=emp, share_type=RecruitShareType.CARD))
        # 3 次 PV：customer-user 名下 2 个去重 openid + 1 个重复 openid；他人名下 1 个
        for openid_hash in ["oid-a", "oid-b", "oid-a"]:
            db_session.add(RecruitVisit(openid_hash=openid_hash, referrer_employee_id="customer-user"))
        db_session.add(RecruitVisit(openid_hash="oid-x", referrer_employee_id="emp-other"))
        # 1 条归属线索（1 条他人）
        db_session.add(
            RecruitLead(
                phone="13811113300",
                phone_hash=hash_phone("13811113300"),
                main_business_area="商圈",
                referrer_employee_id="customer-user",
            )
        )
        db_session.add(
            RecruitLead(
                phone="13811113301",
                phone_hash=hash_phone("13811113301"),
                main_business_area="商圈",
                referrer_employee_id="emp-other",
            )
        )
        db_session.commit()

        resp = c_end_client.get("/api/v1/public/recruit/my/share-stats")
        assert resp.status_code == 200
        body = resp.json()
        # 本用例数据未显式指定时间（默认当前时刻=今日），today_* 与累计一致
        assert body == {
            "share_count": 2,
            "pv": 3,
            "uv": 2,
            "lead_count": 1,
            "today_share_count": 2,
            "today_pv": 3,
            "today_uv": 2,
            "today_lead_count": 1,
        }

    def test_stats_empty(self, c_end_client: TestClient):
        """无数据时各项为 0."""
        resp = c_end_client.get("/api/v1/public/recruit/my/share-stats")
        assert resp.status_code == 200
        assert resp.json() == {
            "share_count": 0,
            "pv": 0,
            "uv": 0,
            "lead_count": 0,
            "today_share_count": 0,
            "today_pv": 0,
            "today_uv": 0,
            "today_lead_count": 0,
        }


# ==================== 订阅消息通知（二期 Task 6, B-4） ====================


@pytest.fixture
def employee_with_openid(seeded_db: dict[str, Any]) -> User:
    """创建已绑定微信 openid 的员工用户（线索归属人）."""
    session = seeded_db["session"]
    role = session.query(Role).filter(Role.code == "customer").first()
    employee = User(
        id="emp-notify",
        username="emp_notify",
        password=get_password_hash("Emp123!.."),
        nickname="员工甲",
        role_id=role.id,
        status="active",
        wechat_openid="openid-emp-notify",
    )
    session.add(employee)
    session.commit()
    session.refresh(employee)
    return employee


def _submit_lead_body(campaign: RecruitCampaign, referrer: str) -> dict[str, Any]:
    """构造留资请求体."""
    return {
        "code": "wx-code",
        "campaign_id": campaign.id,
        "main_business_area": "天河商圈",
        "referrer": referrer,
        "source": "card",
    }


class TestLeadSubscribeNotify:
    def test_skipped_when_template_not_configured(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, employee_with_openid: User
    ):
        """模板未配置不发送（默认 settings.wechat_recruit_lead_template_id 为空）."""
        from unittest.mock import MagicMock

        from settings import settings

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139000"},
        )

        campaign = _make_campaign(db_session)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-notify"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True
        send_mock.assert_not_called()

    def test_skipped_when_employee_no_openid(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, seeded_db: dict[str, Any]
    ):
        """模板已配置但归属员工无 openid 不发送."""
        from unittest.mock import MagicMock

        from settings import settings

        session = seeded_db["session"]
        role = session.query(Role).filter(Role.code == "customer").first()
        employee = User(
            id="emp-no-openid",
            username="emp_no_openid",
            password=get_password_hash("Emp123!.."),
            nickname="员工乙",
            role_id=role.id,
            status="active",
        )
        session.add(employee)
        session.commit()

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139001"},
        )

        campaign = _make_campaign(db_session)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-no-openid"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True
        send_mock.assert_not_called()

    def test_send_exception_does_not_affect_response(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, employee_with_openid: User
    ):
        """发送抛异常不影响留资响应."""
        from services.system.exceptions import ValidationError
        from settings import settings

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")

        def _boom(openid, template_id, data, page=None):
            msg = "订阅消息发送失败"
            raise ValidationError(msg)

        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", _boom)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139002"},
        )

        campaign = _make_campaign(db_session)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-notify"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True

        lead = db_session.query(RecruitLead).filter(RecruitLead.phone_hash == hash_phone("13800139002")).first()
        assert lead is not None
        assert lead.referrer_employee_id == "emp-notify"

    def test_sent_with_phone_suffix_and_page(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, employee_with_openid: User
    ):
        """成功发送：data 含活动名称/报名人固定文案/手机号后四位、page 含 campaign_id、openid 为归属员工."""
        from unittest.mock import MagicMock

        from settings import settings

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139003"},
        )

        campaign = _make_campaign(db_session, name="测试招募活动")
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-notify"))
        assert resp.status_code == 200

        send_mock.assert_called_once()
        args, kwargs = send_mock.call_args
        openid, template_id, data = args[0], args[1], args[2]
        assert openid == "openid-emp-notify"
        assert template_id == "TMPL-001"
        assert data["thing1"]["value"] == "测试招募活动"
        # name3 为 name 类型（禁数字/符号），固定中文文案；识别靠手机号后四位
        assert data["name3"]["value"] == "微信客户"
        assert data["phone_number4"]["value"] == "9003"
        assert kwargs.get("page") == f"pages/recruit/detail/index?campaign_id={campaign.id}"

    def test_sent_activity_name_truncated(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, employee_with_openid: User
    ):
        """活动名超 20 字符时 thing1 截断（thing 类型上限，防 47003）."""
        from unittest.mock import MagicMock

        from settings import settings

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139004"},
        )

        long_name = "超长招募活动名称" * 5  # 40 字符
        campaign = _make_campaign(db_session, name=long_name)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-notify"))
        assert resp.status_code == 200

        send_mock.assert_called_once()
        data = send_mock.call_args[0][2]
        assert data["thing1"]["value"] == long_name[:20]

    def test_indirect_openid_resolved(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, seeded_db: dict[str, Any]
    ):
        """间接绑定：主账号无 openid，已合并临时账号持有 openid 时可发送."""
        from unittest.mock import MagicMock

        from settings import settings

        session = seeded_db["session"]
        role = session.query(Role).filter(Role.code == "customer").first()

        # 创建主账号（无 wechat_openid）
        main_user = User(
            id="emp-main",
            username="emp_main",
            password=get_password_hash("Emp123!.."),
            nickname="主账号",
            role_id=role.id,
            status="active",
        )
        session.add(main_user)
        session.commit()

        # 创建已合并临时账号（持有 openid）
        merged_user = User(
            id="temp-merged",
            username="temp_merged",
            password=get_password_hash("Temp123!.."),
            nickname="临时账号",
            role_id=role.id,
            status="merged",
            wechat_openid="openid-merged",
            merged_to_user_id="emp-main",
        )
        session.add(merged_user)
        session.commit()

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139010"},
        )

        campaign = _make_campaign(db_session)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-main"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True

        send_mock.assert_called_once()
        args, _ = send_mock.call_args
        assert args[0] == "openid-merged"

    def test_direct_openid_preferred_over_indirect(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, seeded_db: dict[str, Any]
    ):
        """直接绑定优先：主账号有 openid 时不查间接绑定."""
        from unittest.mock import MagicMock

        from settings import settings

        session = seeded_db["session"]
        role = session.query(Role).filter(Role.code == "customer").first()

        # 创建主账号（有 wechat_openid）
        main_user = User(
            id="emp-direct",
            username="emp_direct",
            password=get_password_hash("Emp123!.."),
            nickname="主账号",
            role_id=role.id,
            status="active",
            wechat_openid="openid-direct",
        )
        session.add(main_user)
        session.commit()

        # 创建已合并临时账号（也有 openid，但不应被使用）
        merged_user = User(
            id="temp-merged2",
            username="temp_merged2",
            password=get_password_hash("Temp123!.."),
            nickname="临时账号",
            role_id=role.id,
            status="merged",
            wechat_openid="openid-merged2",
            merged_to_user_id="emp-direct",
        )
        session.add(merged_user)
        session.commit()

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139011"},
        )

        campaign = _make_campaign(db_session)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-direct"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True

        send_mock.assert_called_once()
        args, _ = send_mock.call_args
        assert args[0] == "openid-direct"

    def test_no_openid_skipped(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, seeded_db: dict[str, Any]
    ):
        """主账号无 openid 且无已合并临时账号持有 openid 时静默跳过."""
        from unittest.mock import MagicMock

        from settings import settings

        session = seeded_db["session"]
        role = session.query(Role).filter(Role.code == "customer").first()

        main_user = User(
            id="emp-no-openid2",
            username="emp_no_openid2",
            password=get_password_hash("Emp123!.."),
            nickname="无 openid 员工",
            role_id=role.id,
            status="active",
        )
        session.add(main_user)
        session.commit()

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")
        send_mock = MagicMock()
        monkeypatch.setattr("services.recruit.attribution.WeChatAuthService.send_subscribe_message", send_mock)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139012"},
        )

        campaign = _make_campaign(db_session)
        resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-no-openid2"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True
        send_mock.assert_not_called()

    def test_43101_logged_warning(
        self, c_end_client: TestClient, db_session: Session, monkeypatch, employee_with_openid: User, caplog
    ):
        """微信返回 43101 记录 warning 级别日志且不抛异常，不影响留资、无 ERROR 噪音."""
        import logging
        import types
        from typing import Self

        from settings import settings

        monkeypatch.setattr(settings, "wechat_recruit_lead_template_id", "TMPL-001")

        # 仅替换 services.system.wechat 命名空间内的 httpx（不影响 TestClient 自身的 httpx）
        class _FakeResponse:
            def raise_for_status(self) -> None: ...

            def json(self) -> dict[str, int | str]:
                return {"errcode": 43101, "errmsg": "user refuse to accept the msg"}

        class _FakeClient:
            def __init__(self, *args: object, **kwargs: object) -> None: ...

            def __enter__(self) -> Self:
                return self

            def __exit__(self, *args: object) -> bool:
                return False

            def post(self, url: str, **kwargs: object) -> _FakeResponse:
                return _FakeResponse()

        fake_httpx = types.SimpleNamespace(Client=_FakeClient, HTTPError=Exception)
        monkeypatch.setattr("services.system.wechat.httpx", fake_httpx)
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_miniapp_access_token",
            lambda: "fake-token",
        )
        monkeypatch.setattr(
            "services.system.wechat.WeChatAuthService.fetch_wechat_phone_number",
            lambda code: {"phoneNumber": "13800139013"},
        )

        campaign = _make_campaign(db_session)
        with caplog.at_level(logging.WARNING):
            resp = c_end_client.post("/api/v1/public/recruit/leads", json=_submit_lead_body(campaign, "emp-notify"))
        assert resp.status_code == 200
        assert resp.json()["is_new"] is True

        # wechat 层留痕 WARNING（含 errcode），不再产生 ERROR/traceback 噪音
        warnings = [r for r in caplog.records if r.levelno == logging.WARNING and "43101" in r.getMessage()]
        assert warnings
        assert not [r for r in caplog.records if r.levelno >= logging.ERROR]
