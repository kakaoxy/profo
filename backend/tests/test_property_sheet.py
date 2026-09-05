"""房源单（多房源分享）C 端接口测试.

覆盖创建校验（1~10/去重保序/发布+在售拦截）、mine 列表隔离、软删全链路拦截、
详情过滤与已售标注、短码解析归因、小程序码、联系卡、visit/share 埋点与分享统计.
"""

from __future__ import annotations

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import User
from models.lead.lead import Lead
from models.marketing.l4_marketing import (
    L4MarketingProject,
    MarketingProjectStatus,
    PublishStatus,
)
from models.marketing.property_sheet import (
    PropertyShareSheet,
    PropertyShareSheetItem,
    PropertySheetShareEvent,
    PropertySheetVisit,
)
from settings import settings
from utils.auth import get_password_hash


def _make_project(db: Session, **kwargs: Any) -> L4MarketingProject:
    """创建 L4 营销房源（默认已发布在售）."""
    project = L4MarketingProject(
        community_id=kwargs.get("community_id", "community-1"),
        community_name=kwargs.get("community_name", "测试小区"),
        layout=kwargs.get("layout", "三室两厅"),
        orientation=kwargs.get("orientation", "南北通透"),
        floor_info=kwargs.get("floor_info", "15/28层"),
        area=Decimal(str(kwargs.get("area", "89.00"))),
        total_price=Decimal(str(kwargs.get("total_price", "300.00"))),
        title=kwargs.get("title", "测试房源"),
        tags=kwargs.get("tags", ["南北通透", "近地铁"]),
        publish_status=PublishStatus(kwargs.get("publish_status", "发布")),
        project_status=MarketingProjectStatus(kwargs.get("project_status", "在售")),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def _make_sheet(
    db: Session,
    employee_id: str,
    code: str | None = None,
    status: str = "active",
    project_ids: list[int] | None = None,
) -> PropertyShareSheet:
    """直接构造房源单主表 + 明细（绕过路由）."""
    sheet = PropertyShareSheet(
        employee_id=employee_id,
        code=code or uuid.uuid4().hex[:8],
        status=status,
    )
    db.add(sheet)
    db.flush()
    for sort_order, pid in enumerate(project_ids or []):
        db.add(PropertyShareSheetItem(sheet_id=sheet.id, marketing_project_id=pid, sort_order=sort_order))
    db.commit()
    db.refresh(sheet)
    return sheet


def _make_employee(db: Session, employee_id: str, **kwargs: Any) -> User:
    """创建内部员工（默认 admin 角色 + active，具备后台身份）."""
    user = User(
        id=employee_id,
        username=kwargs.get("username", f"emp_{employee_id}"),
        password=get_password_hash("Emp123!.."),
        nickname=kwargs.get("nickname", "员工"),
        phone=kwargs.get("phone"),
        avatar=kwargs.get("avatar"),
        role_id=kwargs.get("role_id", "admin-role"),
        status=kwargs.get("status", "active"),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@pytest.fixture
def no_auth_client(seeded_db: dict[str, Any]) -> Generator[TestClient, None, None]:
    """无认证客户端（游客）."""
    session = seeded_db["session"]

    def _override_get_db() -> Generator[Session, None, None]:
        yield session

    app.dependency_overrides[db.get_db] = _override_get_db
    yield TestClient(app)
    app.dependency_overrides.clear()


BASE = "/api/v1/public/property-sheets"


# ==================== 创建房源单 ====================


class TestCreatePropertySheet:
    def test_create_success(self, c_end_client: TestClient, db_session: Session):
        """正常创建：code 8 位、items 顺序与入参一致."""
        p1 = _make_project(db_session, title="房源A")
        p2 = _make_project(db_session, title="房源B")
        resp = c_end_client.post(BASE, json={"project_ids": [p1.id, p2.id]})
        assert resp.status_code == 200
        body = resp.json()
        assert len(body["code"]) == 8
        assert [i["marketing_project_id"] for i in body["items"]] == [p1.id, p2.id]
        assert [i["sort_order"] for i in body["items"]] == [0, 1]

    def test_create_over_10_rejected(self, c_end_client: TestClient, db_session: Session):
        """超过 10 套拒绝（请求校验 422）."""
        p = _make_project(db_session)
        resp = c_end_client.post(BASE, json={"project_ids": [p.id] * 11})
        assert resp.status_code == 422

    def test_create_with_non_for_sale_rejected(self, c_end_client: TestClient, db_session: Session):
        """含非在售房源拒绝，主表与明细均不落库."""
        p_ok = _make_project(db_session, title="在售房")
        p_in_progress = _make_project(db_session, title="在途房", project_status="在途")
        resp = c_end_client.post(BASE, json={"project_ids": [p_ok.id, p_in_progress.id]})
        assert resp.status_code == 400
        assert resp.json()["code"] != 0
        assert db_session.query(PropertyShareSheet).count() == 0
        assert db_session.query(PropertyShareSheetItem).count() == 0

    def test_create_with_unpublished_rejected(self, c_end_client: TestClient, db_session: Session):
        """含未发布房源拒绝."""
        p_ok = _make_project(db_session, title="在售房")
        p_draft = _make_project(db_session, title="草稿房", publish_status="草稿")
        resp = c_end_client.post(BASE, json={"project_ids": [p_ok.id, p_draft.id]})
        assert resp.status_code == 400
        assert db_session.query(PropertyShareSheet).count() == 0

    def test_create_dedup_keeps_order(self, c_end_client: TestClient, db_session: Session):
        """重复房源ID去重且保序."""
        p1 = _make_project(db_session, title="房源A")
        p2 = _make_project(db_session, title="房源B")
        resp = c_end_client.post(BASE, json={"project_ids": [p1.id, p2.id, p1.id]})
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert [i["marketing_project_id"] for i in items] == [p1.id, p2.id]
        assert db_session.query(PropertyShareSheetItem).count() == 2

    def test_create_unauthorized_401(self, no_auth_client: TestClient):
        """未登录返回 401."""
        resp = no_auth_client.post(BASE, json={"project_ids": [1]})
        assert resp.status_code == 401


# ==================== 我的房源单列表 ====================


class TestMine:
    def test_mine_only_own_active(self, c_end_client: TestClient, db_session: Session):
        """仅本人且未删除的房源单可见，item_count 正确，创建时间倒序."""
        p1 = _make_project(db_session)
        p2 = _make_project(db_session)
        now = datetime.now(timezone.utc)
        older = _make_sheet(db_session, "customer-user", project_ids=[p1.id, p2.id])
        older.created_at = now - timedelta(hours=1)
        newer = _make_sheet(db_session, "customer-user", project_ids=[p1.id])
        newer.created_at = now
        # 他人房源单与本人已删除房源单
        _make_sheet(db_session, "other-customer", project_ids=[p1.id])
        _make_sheet(db_session, "customer-user", status="archived", project_ids=[p1.id])
        db_session.commit()

        resp = c_end_client.get(f"{BASE}/mine")
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert [i["id"] for i in items] == [newer.id, older.id]
        assert items[1]["item_count"] == 2
        assert items[0]["item_count"] == 1


# ==================== 删除（软删归档） ====================


class TestDeleteSheet:
    def test_delete_soft_and_full_block(
        self, c_end_client: TestClient, no_auth_client: TestClient, db_session: Session, monkeypatch
    ):
        """删除后 mine 不返回；detail/qrcode/consultant/visit/share 均 404；qr 返回失效业务错误."""
        monkeypatch.setattr(
            "services.property_sheet.core.WeChatAuthService.fetch_miniapp_unlimited_qrcode",
            lambda scene, page=None: b"img",
        )
        sheet = _make_sheet(db_session, "customer-user", project_ids=[])
        resp = c_end_client.delete(f"{BASE}/{sheet.id}")
        assert resp.status_code == 204

        reloaded = db_session.query(PropertyShareSheet).filter(PropertyShareSheet.id == sheet.id).first()
        assert reloaded is not None  # 软删非物理删除
        assert reloaded.status == "archived"

        resp = c_end_client.get(f"{BASE}/mine")
        assert all(i["id"] != sheet.id for i in resp.json()["items"])
        assert no_auth_client.get(f"{BASE}/{sheet.id}").status_code == 404
        assert c_end_client.get(f"{BASE}/{sheet.id}/qrcode").status_code == 404
        assert no_auth_client.get(f"{BASE}/{sheet.id}/consultant").status_code == 404
        assert no_auth_client.post(f"{BASE}/{sheet.id}/visit-events", json={"visitor_id": "v1"}).status_code == 404
        assert c_end_client.post(f"{BASE}/{sheet.id}/share-events", json={"share_type": "poster"}).status_code == 404

        # 短码解析返回「房源单已失效」业务错误
        resp = no_auth_client.get(f"{BASE}/qr/{sheet.code}")
        assert resp.status_code == 400
        assert resp.json()["code"] != 0
        assert "房源单已失效" in resp.json()["message"]

    def test_delete_not_owner_404(self, c_end_client: TestClient, db_session: Session):
        """非本人删除统一 404（不泄露存在性）."""
        sheet = _make_sheet(db_session, "other-customer", project_ids=[])
        resp = c_end_client.delete(f"{BASE}/{sheet.id}")
        assert resp.status_code == 404
        reloaded = db_session.query(PropertyShareSheet).filter(PropertyShareSheet.id == sheet.id).first()
        assert reloaded is not None
        assert reloaded.status == "active"

    def test_delete_unauthorized_401(self, no_auth_client: TestClient, db_session: Session):
        """未登录删除返回 401."""
        sheet = _make_sheet(db_session, "customer-user", project_ids=[])
        resp = no_auth_client.delete(f"{BASE}/{sheet.id}")
        assert resp.status_code == 401


# ==================== 房源单详情 ====================


class TestDetail:
    def test_detail_guest_visible_and_filtered(self, no_auth_client: TestClient, db_session: Session):
        """免登录可访问；在途/未发布隐藏；已售返回 display_status=已售；tags NULL 转 []."""
        p_on_sale = _make_project(db_session, title="在售房")
        p_sold = _make_project(db_session, title="已售房", project_status="已售")
        p_in_progress = _make_project(db_session, title="在途房", project_status="在途")
        p_draft = _make_project(db_session, title="草稿房", publish_status="草稿")
        p_no_tags = _make_project(db_session, title="无标签房")
        p_no_tags.tags = None
        db_session.commit()

        sheet = _make_sheet(
            db_session,
            "customer-user",
            project_ids=[p_on_sale.id, p_sold.id, p_in_progress.id, p_draft.id, p_no_tags.id],
        )

        resp = no_auth_client.get(f"{BASE}/{sheet.id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == sheet.code
        by_pid = {i["marketing_project_id"]: i for i in body["items"]}
        assert set(by_pid) == {p_on_sale.id, p_sold.id, p_no_tags.id}  # 在途/未发布隐藏
        assert by_pid[p_on_sale.id]["display_status"] == "在售"
        assert by_pid[p_sold.id]["display_status"] == "已售"
        assert by_pid[p_no_tags.id]["tags"] == []
        # 明细按 sort_order 升序
        orders = [i["sort_order"] for i in body["items"]]
        assert orders == sorted(orders)

    def test_detail_not_found_404(self, no_auth_client: TestClient):
        """不存在返回 404."""
        resp = no_auth_client.get(f"{BASE}/999999")
        assert resp.status_code == 404


# ==================== 短码解析 ====================


class TestResolveQR:
    def test_resolve_valid_code_with_referrer(self, no_auth_client: TestClient, db_session: Session):
        """有效码返回 sheet_id 与 referrer（有效内部员工）."""
        emp = _make_employee(db_session, "emp-qr", phone="13900000001")
        sheet = _make_sheet(db_session, emp.id, code="abcd1234")
        resp = no_auth_client.get(f"{BASE}/qr/abcd1234")
        assert resp.status_code == 200
        assert resp.json() == {"sheet_id": sheet.id, "referrer": "emp-qr"}

    def test_resolve_invalid_code_404(self, no_auth_client: TestClient):
        """无效短码返回 404."""
        resp = no_auth_client.get(f"{BASE}/qr/zzzzzzzz")
        assert resp.status_code == 404

    def test_resolve_inactive_employee_referrer_null(self, no_auth_client: TestClient, db_session: Session):
        """员工停用后 referrer=null，房源单仍可解析访问."""
        emp = _make_employee(db_session, "emp-off")
        sheet = _make_sheet(db_session, emp.id, code="effe1234")
        emp.status = "inactive"
        db_session.commit()

        resp = no_auth_client.get(f"{BASE}/qr/effe1234")
        assert resp.status_code == 200
        body = resp.json()
        assert body["sheet_id"] == sheet.id
        assert body["referrer"] is None

    def test_resolve_non_backend_identity_referrer_null(self, no_auth_client: TestClient, db_session: Session):
        """创建者无后台身份（纯 C 端角色）时 referrer=null."""
        sheet = _make_sheet(db_session, "customer-user", code="cust1234")
        resp = no_auth_client.get(f"{BASE}/qr/cust1234")
        assert resp.status_code == 200
        assert resp.json() == {"sheet_id": sheet.id, "referrer": None}


# ==================== 小程序码 ====================


class TestQRCode:
    def _patch_wechat(self, monkeypatch, captured: dict[str, str | None]) -> None:
        def fake_fetch(scene: str, page: str | None = None) -> bytes:
            captured["scene"] = scene
            captured["page"] = page
            return b"img"

        monkeypatch.setattr("services.property_sheet.core.WeChatAuthService.fetch_miniapp_unlimited_qrcode", fake_fetch)

    def test_qrcode_generate(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """正常生成：scene 含 code=、page 为落地页路径、返回 image_base64."""
        captured: dict[str, str | None] = {}
        self._patch_wechat(monkeypatch, captured)
        sheet = _make_sheet(db_session, "customer-user", code="qr000001")
        resp = c_end_client.get(f"{BASE}/{sheet.id}/qrcode")
        assert resp.status_code == 200
        body = resp.json()
        assert body["code"] == "qr000001"
        assert body["image_base64"]
        assert captured["scene"] == "code=qr000001"
        assert captured["page"] == "pages/property-sheet/landing/index"

    def test_qrcode_code_reused(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """重复调用短码不变（复用主表 code）."""
        captured: dict[str, str | None] = {}
        self._patch_wechat(monkeypatch, captured)
        sheet = _make_sheet(db_session, "customer-user", code="qr000002")
        r1 = c_end_client.get(f"{BASE}/{sheet.id}/qrcode")
        r2 = c_end_client.get(f"{BASE}/{sheet.id}/qrcode")
        assert r1.status_code == r2.status_code == 200
        assert r1.json()["code"] == r2.json()["code"] == "qr000002"

    def test_qrcode_not_owner_404(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """非本人请求统一 404."""
        captured: dict[str, str | None] = {}
        self._patch_wechat(monkeypatch, captured)
        sheet = _make_sheet(db_session, "other-customer", code="qr000003")
        resp = c_end_client.get(f"{BASE}/{sheet.id}/qrcode")
        assert resp.status_code == 404
        assert captured == {}

    def test_qrcode_deleted_404(self, c_end_client: TestClient, db_session: Session, monkeypatch):
        """已删除房源单请求 404."""
        captured: dict[str, str | None] = {}
        self._patch_wechat(monkeypatch, captured)
        sheet = _make_sheet(db_session, "customer-user", status="archived", code="qr000004")
        resp = c_end_client.get(f"{BASE}/{sheet.id}/qrcode")
        assert resp.status_code == 404
        assert captured == {}

    def test_qrcode_unauthorized_401(self, no_auth_client: TestClient, db_session: Session):
        """未登录返回 401."""
        sheet = _make_sheet(db_session, "customer-user", code="qr000005")
        resp = no_auth_client.get(f"{BASE}/{sheet.id}/qrcode")
        assert resp.status_code == 401


# ==================== 分享人联系卡 ====================


class TestConsultant:
    def test_consultant_referrer_hit(self, no_auth_client: TestClient, db_session: Session):
        """有效 referrer 命中：返回其联系方式且 is_referrer=true."""
        emp = _make_employee(db_session, "emp-consult", phone="13900000001", nickname="顾问小张")
        sheet = _make_sheet(db_session, "customer-user", code="cons0001")
        resp = no_auth_client.get(f"{BASE}/{sheet.id}/consultant", params={"referrer": emp.id})
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_referrer"] is True
        assert body["phone"] == "13900000001"
        assert body["wechat_number"] == "13900000001"
        assert body["nickname"] == "顾问小张"

    def test_consultant_invalid_referrer_fallback_default(self, no_auth_client: TestClient, db_session: Session):
        """无效 referrer 回退默认顾问 is_referrer=false."""
        sheet = _make_sheet(db_session, "customer-user", code="cons0002")
        resp = no_auth_client.get(f"{BASE}/{sheet.id}/consultant", params={"referrer": "ghost-emp"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_referrer"] is False
        assert body["phone"] == settings.default_consultant_phone
        assert body["nickname"] == settings.default_consultant_nickname

    def test_consultant_referrer_without_phone_fallback_default(self, no_auth_client: TestClient, db_session: Session):
        """Referrer 为有效后台员工但未绑定手机号：回退默认顾问（对齐单房源 contact 口径）."""
        _make_employee(db_session, "emp-nophone", nickname="无号顾问")
        sheet = _make_sheet(db_session, "customer-user", code="cons0004")
        resp = no_auth_client.get(f"{BASE}/{sheet.id}/consultant", params={"referrer": "emp-nophone"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_referrer"] is False
        assert body["phone"] == settings.default_consultant_phone
        assert body["wechat_number"] == settings.default_consultant_wechat
        assert body["nickname"] == settings.default_consultant_nickname

    def test_consultant_no_referrer_default(self, no_auth_client: TestClient, db_session: Session):
        """未传 referrer 时返回默认顾问."""
        sheet = _make_sheet(db_session, "customer-user", code="cons0003")
        resp = no_auth_client.get(f"{BASE}/{sheet.id}/consultant")
        assert resp.status_code == 200
        assert resp.json()["is_referrer"] is False

    def test_consultant_sheet_not_found_404(self, no_auth_client: TestClient):
        """房源单不存在返回 404."""
        resp = no_auth_client.get(f"{BASE}/999999/consultant")
        assert resp.status_code == 404


# ==================== 访问埋点 ====================


class TestVisitEvent:
    def test_visit_event_saved_as_is(self, no_auth_client: TestClient, db_session: Session):
        """免登录成功落库；有效员工 referrer 原样保存，无效 referrer 置空防伪造归属."""
        emp = _make_employee(db_session, "emp-visit")
        sheet = _make_sheet(db_session, "customer-user", code="visit001")
        resp = no_auth_client.post(
            f"{BASE}/{sheet.id}/visit-events",
            json={"visitor_id": "visitor-1", "referrer": emp.id, "source": "poster"},
        )
        assert resp.status_code == 200
        assert resp.json()["id"]

        visit = db_session.query(PropertySheetVisit).filter(PropertySheetVisit.sheet_id == sheet.id).first()
        assert visit is not None
        assert visit.visitor_id == "visitor-1"
        assert visit.referrer_employee_id == emp.id  # 有效员工 referrer 原样落库
        assert visit.source == "poster"

        # 无效 referrer（不存在员工）：静默置空，不阻断埋点落库
        resp_ghost = no_auth_client.post(
            f"{BASE}/{sheet.id}/visit-events",
            json={"visitor_id": "visitor-2", "referrer": "emp-raw", "source": "poster"},
        )
        assert resp_ghost.status_code == 200
        visit_ghost = db_session.query(PropertySheetVisit).filter(PropertySheetVisit.visitor_id == "visitor-2").one()
        assert visit_ghost.referrer_employee_id is None

    def test_visit_event_deleted_sheet_404(self, no_auth_client: TestClient, db_session: Session):
        """已删除房源单返回 404."""
        sheet = _make_sheet(db_session, "customer-user", status="archived", code="visit002")
        resp = no_auth_client.post(f"{BASE}/{sheet.id}/visit-events", json={"visitor_id": "v1"})
        assert resp.status_code == 404


# ==================== 分享事件 ====================


class TestShareEvent:
    def test_share_event_saved_with_current_user(self, c_end_client: TestClient, db_session: Session):
        """登录上报成功，employee_id 服务端取当前用户；card/poster 均可写入."""
        sheet = _make_sheet(db_session, "customer-user", code="share001")
        resp = c_end_client.post(f"{BASE}/{sheet.id}/share-events", json={"share_type": "poster"})
        assert resp.status_code == 200
        assert resp.json()["id"]

        resp_card = c_end_client.post(f"{BASE}/{sheet.id}/share-events", json={"share_type": "card"})
        assert resp_card.status_code == 200
        assert resp_card.json()["id"]

        events = db_session.query(PropertySheetShareEvent).filter(PropertySheetShareEvent.sheet_id == sheet.id).all()
        assert len(events) == 2
        assert {event.share_type for event in events} == {"poster", "card"}
        assert all(event.employee_id == "customer-user" for event in events)

    def test_share_event_invalid_share_type_422(self, c_end_client: TestClient, db_session: Session):
        """share_type 仅允许 poster/card（Literal 校验 422）."""
        sheet = _make_sheet(db_session, "customer-user", code="share002")
        resp = c_end_client.post(f"{BASE}/{sheet.id}/share-events", json={"share_type": "timeline"})
        assert resp.status_code == 422

    def test_share_event_unauthorized_401(self, no_auth_client: TestClient, db_session: Session):
        """未登录返回 401."""
        sheet = _make_sheet(db_session, "customer-user", code="share003")
        resp = no_auth_client.post(f"{BASE}/{sheet.id}/share-events", json={"share_type": "poster"})
        assert resp.status_code == 401


# ==================== 我的分享统计 ====================


class TestMyShareStats:
    def test_stats_metrics(self, c_end_client: TestClient, db_session: Session):
        """统计口径：share 按 employee_id、pv/uv 按 referrer（uv 去重）、lead 按 referrer_id."""
        for _ in range(2):
            db_session.add(PropertySheetShareEvent(sheet_id=1, employee_id="customer-user", share_type="poster"))
        db_session.add(PropertySheetShareEvent(sheet_id=1, employee_id="emp-other", share_type="poster"))
        # customer-user 名下 3 次 PV（2 个去重访客），他人名下 1 次
        for visitor_id in ["v1", "v2", "v1"]:
            db_session.add(PropertySheetVisit(sheet_id=1, visitor_id=visitor_id, referrer_employee_id="customer-user"))
        db_session.add(PropertySheetVisit(sheet_id=1, visitor_id="v1", referrer_employee_id="emp-other"))
        # 归属线索：customer-user 1 条 + 他人 1 条
        db_session.add(Lead(community_name="小区A", referrer_id="customer-user"))
        db_session.add(Lead(community_name="小区B", referrer_id="emp-other"))
        db_session.commit()

        resp = c_end_client.get(f"{BASE}/my/share-stats")
        assert resp.status_code == 200
        # 本用例数据均为当前时刻（今日），today_* 与累计一致
        assert resp.json() == {
            "share_count": 2,
            "pv": 3,
            "uv": 2,
            "lead_count": 1,
            "today_share_count": 2,
            "today_pv": 3,
            "today_uv": 2,
            "today_lead_count": 1,
        }

    def test_stats_unauthorized_401(self, no_auth_client: TestClient):
        """未登录返回 401."""
        resp = no_auth_client.get(f"{BASE}/my/share-stats")
        assert resp.status_code == 401
