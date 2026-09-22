"""小程序员工侧评估工作台接口测试.

覆盖 GET /api/v1/public/leads/pending-assessment、
GET /api/v1/public/leads/handled-assessment、
POST /api/v1/public/leads/my/acquired/{lead_id}/authorize-assessment、
POST/GET /api/v1/public/leads/my/acquired/{lead_id}/evaluations 与
GET /api/v1/public/leads/my/acquired/{lead_id}/follow-ups：
- 待评估段分页队列（search 过滤、今日新增计数、响应不含已处理字段）
- 已处理段分页接口（audit_time 倒序、search 按小区名过滤、仅本人经手、
  含 pending_visit/visited/rejected/lost_to_competitor、全量计数 + 分页）
- approve 单事务编排副作用（评估历史 + eval_price 刷写 + status→pending_visit + auditor 字段）
- reject / lost 副作用断言（不写评估历史、audit_reason 选填可为空）
- 再次评估副作用（追加评估历史 + 刷 eval_price，不改状态/audit 字段）与评估历史查询
- 权限卡口 403（无内部角色）、幂等防护 409（重复处理/状态不可调整）、参数校验 422
"""

import uuid
from collections.abc import Generator
from datetime import datetime, timedelta, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Role, User
from models.common import FollowUpMethod, LeadStatus
from models.lead import Lead, LeadEvalHistory, LeadFollowUp
from tests.conftest import _make_client
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash
from utils.image_processing import derive_thumbnail_url
from utils.time_windows import cst_today_start

_PENDING_URL = "/api/v1/public/leads/pending-assessment"
_HANDLED_URL = "/api/v1/public/leads/handled-assessment"
_AUTHORIZE_URL_TPL = "/api/v1/public/leads/my/acquired/{lead_id}/authorize-assessment"
_EVALUATIONS_URL_TPL = "/api/v1/public/leads/my/acquired/{lead_id}/evaluations"
_FOLLOWUPS_URL_TPL = "/api/v1/public/leads/my/acquired/{lead_id}/follow-ups"
_MINE_URL = "/api/v1/public/leads/mine"


# ---------------------------------------------------------------------------
# Helpers & fixtures
# ---------------------------------------------------------------------------


def _make_lead(
    db: Session,
    *,
    status: LeadStatus = LeadStatus.PENDING_ASSESSMENT,
    community_name: str = "测试小区",
    district: str | None = None,
    floor_info: str | None = None,
    orientation: str | None = None,
    is_deleted: bool = False,
    expected_price: float | None = None,
    total_price: float | None = None,
    images: list[str] | None = None,
    auditor_id: str | None = None,
    audit_time: datetime | None = None,
    last_follow_up_at: datetime | None = None,
    eval_price: float | None = None,
    referrer_id: str | None = None,
    creator_id: str | None = None,
    created_at: datetime | None = None,
) -> Lead:
    """创建并持久化一条线索."""
    lead = Lead(
        id=str(uuid.uuid4()),
        community_name=community_name,
        district=district,
        floor_info=floor_info,
        orientation=orientation,
        status=status,
        is_deleted=is_deleted,
        expected_price=expected_price,
        total_price=total_price,
        images=images or [],
        auditor_id=auditor_id,
        audit_time=audit_time,
        last_follow_up_at=last_follow_up_at,
        eval_price=eval_price,
        referrer_id=referrer_id,
        creator_id=creator_id,
        created_at=created_at,
    )
    db.add(lead)
    db.flush()
    return lead


def _make_eval_history(
    db: Session,
    *,
    lead_id: str,
    evaluator_id: str,
    eval_price: float,
    evaluated_at: datetime,
    remark: str | None = None,
) -> LeadEvalHistory:
    """创建并持久化一条评估历史记录."""
    rec = LeadEvalHistory(
        id=str(uuid.uuid4()),
        lead_id=lead_id,
        eval_price=eval_price,
        remark=remark,
        evaluator_id=evaluator_id,
        evaluated_at=evaluated_at,
    )
    db.add(rec)
    db.flush()
    return rec


@pytest.fixture
def eval_operator(seeded_db: dict[str, Any]) -> User:
    """评估员工：主角色 admin + 附加角色 customer（对齐生产「后台角色 + customer 附加角色」）."""
    session: Session = seeded_db["session"]
    admin_role = session.query(Role).filter(Role.code == "admin").first()
    customer_role = session.query(Role).filter(Role.code == "customer").first()
    assert admin_role is not None
    assert customer_role is not None
    user = User(
        id="eval-operator",
        username="eval-operator",
        password=get_password_hash("Eval123!"),
        nickname="评估员",
        role_id=admin_role.id,
        status="active",
    )
    user.roles.append(customer_role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def eval_operator_client(
    seeded_db: dict[str, Any],
    eval_operator: User,
) -> Generator[TestClient, None, None]:
    """评估员工 C 端客户端（c_access_token cookie + aud=c）."""
    token = create_access_token(
        data={"sub": eval_operator.id, "role": "customer", "ver": eval_operator.token_version},
        audience=AUDIENCE_C,
    )
    yield from _make_client(seeded_db["session"], {"c_access_token": token})


# ---------------------------------------------------------------------------
# 队列端点
# ---------------------------------------------------------------------------


class TestPendingAssessmentQueue:
    """GET /pending-assessment「待评估」段测试."""

    def test_pending_segment_with_today_count(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """待评估段 created_at 倒序 + 今日新增计数，响应不含已处理字段."""
        session: Session = seeded_db["session"]
        today_start = cst_today_start()
        pending_new = _make_lead(
            session,
            community_name="阳光小区",
            expected_price=300.0,
            created_at=today_start + timedelta(minutes=1),
        )
        pending_old = _make_lead(
            session,
            community_name="测试花园",
            total_price=280.0,
            created_at=today_start - timedelta(hours=1),
        )
        # 已处理线索不应出现在待评估段（也不应再随本接口返回）
        now = datetime.now(timezone.utc)
        _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="已批准小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
            eval_price=350.0,
        )
        session.commit()

        resp = eval_operator_client.get(_PENDING_URL)
        assert resp.status_code == 200
        body = resp.json()

        # 待评估段：created_at 倒序
        assert body["pending_total"] == 2
        assert [it["id"] for it in body["items_pending"]] == [pending_new.id, pending_old.id]
        first = body["items_pending"][0]
        assert first["community_name"] == "阳光小区"
        assert first["expected_price"] == 300.0
        # 业主报价回退口径：expected_price 缺失回退 total_price
        assert body["items_pending"][1]["expected_price"] == 280.0
        # 今日新增：仅「阳光小区」为今日（Asia/Shanghai 自然日）创建
        assert body["pending_today"] == 1

        # 已处理段已拆分至 /handled-assessment，响应不再包含
        assert "items_handled" not in body
        assert "handled_total" not in body

    def test_search_filters_pending_segment(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Search 按小区名过滤待评估段."""
        session: Session = seeded_db["session"]
        _make_lead(session, community_name="阳光小区")
        _make_lead(session, community_name="测试花园")
        session.commit()

        resp = eval_operator_client.get(_PENDING_URL, params={"search": "阳光"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["pending_total"] == 1
        assert [it["community_name"] for it in body["items_pending"]] == ["阳光小区"]

    def test_pending_images_full_list(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """待评估队列项返回全量图片 URL（授权页照片区依赖完整列表）."""
        session: Session = seeded_db["session"]
        images = [f"/static/img{i}.jpg" for i in range(5)]
        _make_lead(session, images=images)
        session.commit()

        resp = eval_operator_client.get(_PENDING_URL)
        assert resp.status_code == 200
        items = resp.json()["items_pending"]
        assert items[0]["images"] == images

    def test_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
    ) -> None:
        """纯 C 端用户（无 admin/operator 角色）访问队列返回 403 统一错误体."""
        resp = c_end_client.get(_PENDING_URL)
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] != 0
        assert body["message"]


class TestHandledAssessment:
    """GET /handled-assessment「已处理」段分页测试."""

    def test_own_handled_with_status_scope_and_order(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """本人全部经手（不限时间窗）时效四层排序，含五种场景，排除他人经手.

        分层：即将过期(7<d≤14) → 跟进中(d≤7) → 已过期(d>14) → 终态；
        组内按 created_at 降序（各 fixture 显式传 created_at 保证确定性）。
        """
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        # 即将过期层：最后跟进 10 天前（7<d≤14）
        handled_soon = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="已批准小区",
            district="思明区",
            floor_info="高楼层/28层",
            images=["/static/h1.jpg", "/static/h2.jpg"],
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=12),
            last_follow_up_at=now - timedelta(days=10),
            eval_price=360.0,
            created_at=now - timedelta(days=15),
        )
        # 跟进中层：visited / pending_visit 均入组，created_at 降序（visited 更晚录入在前）
        handled_visit = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="跟进中小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
            eval_price=350.0,
            created_at=now - timedelta(days=2),
        )
        handled_visited = _make_lead(
            session,
            status=LeadStatus.VISITED,
            community_name="已看房小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=3),
            eval_price=320.0,
            created_at=now - timedelta(days=1),
        )
        # 已过期层：20 天前经手仍属授权组，排在终态之前
        handled_over = _make_lead(
            session,
            status=LeadStatus.VISITED,
            community_name="已过期授权",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=20),
            created_at=now - timedelta(days=25),
        )
        # 终态层：lost / rejected，created_at 降序（lost 更晚录入在前）
        handled_lost = _make_lead(
            session,
            status=LeadStatus.LOST_TO_COMPETITOR,
            community_name="他司成交小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=2),
            created_at=now - timedelta(days=3),
        )
        # 多日前驳回：已处理段不限时间窗，应仍在列
        handled_old = _make_lead(
            session,
            status=LeadStatus.REJECTED,
            community_name="多日前经手",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=8),
            created_at=now - timedelta(days=10),
        )
        # 不应出现：他人经手
        _make_lead(
            session,
            status=LeadStatus.REJECTED,
            community_name="他人经手",
            auditor_id="someone-else",
            audit_time=now - timedelta(hours=3),
        )
        # 不应出现：待评估（未经手）与已签约（超出已处理口径）
        _make_lead(session, community_name="仍在待评估")
        _make_lead(
            session,
            status=LeadStatus.SIGNED,
            community_name="已签约不算经手",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
        )
        session.commit()

        resp = eval_operator_client.get(_HANDLED_URL)
        assert resp.status_code == 200
        body = resp.json()

        # 四层排序：即将过期 → 跟进中(created_at 降序) → 已过期 → 终态(created_at 降序)
        assert body["handled_total"] == 6
        assert [it["id"] for it in body["items"]] == [
            handled_soon.id,
            handled_visited.id,
            handled_visit.id,
            handled_over.id,
            handled_lost.id,
            handled_old.id,
        ]
        soon_item = body["items"][0]
        assert soon_item["status"] == "pending_visit"
        assert soon_item["eval_price"] == 360.0
        assert soon_item["status_display"] == "待看房"
        # 展示字段与待评估卡同构：区域 / 楼层 / 图片 / 来源
        assert soon_item["district"] == "思明区"
        assert soon_item["floor_info"] == "高楼层/28层"
        assert soon_item["images"] == ["/static/h1.jpg", "/static/h2.jpg"]
        assert soon_item["source"] == "employee_entry"
        lost_item = body["items"][4]
        assert lost_item["status"] == "lost_to_competitor"
        assert lost_item["eval_price"] is None
        assert body["items"][1]["eval_price"] == 320.0
        assert body["items"][2]["eval_price"] == 350.0
        assert body["page"] == 1

    def test_pagination_with_full_total(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """分页返回且 total 保持过滤后全量计数."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        for i in range(25):
            _make_lead(
                session,
                status=LeadStatus.REJECTED,
                community_name=f"批量经手{i:02d}",
                auditor_id=eval_operator.id,
                audit_time=now - timedelta(hours=i + 1),
            )
        session.commit()

        page1 = eval_operator_client.get(_HANDLED_URL, params={"page": 1, "page_size": 10})
        assert page1.status_code == 200
        body1 = page1.json()
        assert body1["handled_total"] == 25
        assert len(body1["items"]) == 10
        assert body1["page"] == 1
        assert body1["page_size"] == 10

        page3 = eval_operator_client.get(_HANDLED_URL, params={"page": 3, "page_size": 10})
        assert page3.status_code == 200
        body3 = page3.json()
        assert len(body3["items"]) == 5
        # 页间不重叠：第三页为最早的 5 条
        page1_ids = {it["id"] for it in body1["items"]}
        assert page1_ids.isdisjoint({it["id"] for it in body3["items"]})

    def test_search_filters_by_community_name(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """Search 按小区名模糊过滤已处理段，total 同步为过滤后计数."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="通河八村",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
            eval_price=300.0,
        )
        _make_lead(
            session,
            status=LeadStatus.REJECTED,
            community_name="通河八村二号楼",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=2),
        )
        _make_lead(
            session,
            status=LeadStatus.VISITED,
            community_name="别的花园",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=3),
            eval_price=280.0,
        )
        session.commit()

        resp = eval_operator_client.get(_HANDLED_URL, params={"search": "通河八村"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["handled_total"] == 2
        assert {it["community_name"] for it in body["items"]} == {"通河八村", "通河八村二号楼"}

    def test_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
    ) -> None:
        """纯 C 端用户访问已处理列表返回 403 统一错误体."""
        resp = c_end_client.get(_HANDLED_URL)
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] != 0
        assert body["message"]

    def test_followup_stats_filled_and_missing(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """时效字段：有跟进取 max(followed_at) 与条数；无跟进为 null 且 count 为 0."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        followed_at_first = now - timedelta(days=2)
        followed_at_latest = now - timedelta(days=1)
        lead_with = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="有跟进小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=3),
        )
        session.add(
            LeadFollowUp(
                id=str(uuid.uuid4()),
                lead_id=lead_with.id,
                method=FollowUpMethod.PHONE,
                content="第一次电话",
                followed_at=followed_at_first,
                created_by_id=eval_operator.id,
            )
        )
        session.add(
            LeadFollowUp(
                id=str(uuid.uuid4()),
                lead_id=lead_with.id,
                method=FollowUpMethod.WECHAT,
                content="微信沟通",
                followed_at=followed_at_latest,
                created_by_id=eval_operator.id,
            )
        )
        lead_without = _make_lead(
            session,
            status=LeadStatus.VISITED,
            community_name="无跟进小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
        )
        session.commit()

        resp = eval_operator_client.get(_HANDLED_URL)
        assert resp.status_code == 200
        by_id = {it["id"]: it for it in resp.json()["items"]}

        with_item = by_id[lead_with.id]
        assert with_item["follow_up_count"] == 2
        assert with_item["last_follow_up_at"] is not None
        last_at = datetime.fromisoformat(with_item["last_follow_up_at"].replace("Z", "+00:00"))
        # max(followed_at)：取最近一次（非首条）
        assert last_at == followed_at_latest

        without_item = by_id[lead_without.id]
        assert without_item["last_follow_up_at"] is None
        assert without_item["follow_up_count"] == 0


# ---------------------------------------------------------------------------
# 授权端点：approve
# ---------------------------------------------------------------------------


class TestAuthorizeApprove:
    """approve 动作：录价 + 流转单事务编排."""

    def test_approve_side_effects(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """approve：插评估历史 + eval_price 刷写 + status→pending_visit + auditor 字段."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, community_name="批准小区", expected_price=300.0)
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5, "remark": "溢价可控"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == lead.id
        assert body["status"] == "pending_visit"
        assert body["status_display"] == "待看房"
        assert body["eval_price"] == 350.5

        session.refresh(lead)
        assert lead.status == LeadStatus.PENDING_VISIT
        assert float(lead.eval_price) == 350.5  # type: ignore[arg-type]
        assert lead.auditor_id == eval_operator.id
        assert lead.audit_time is not None

        histories = session.query(LeadEvalHistory).filter(LeadEvalHistory.lead_id == lead.id).all()
        assert len(histories) == 1
        assert float(histories[0].eval_price) == 350.5
        assert histories[0].remark == "溢价可控"
        assert histories[0].evaluator_id == eval_operator.id


# ---------------------------------------------------------------------------
# 授权端点：reject / lost
# ---------------------------------------------------------------------------


class TestAuthorizeRejectAndLost:
    """reject / lost 动作：不建评估记录，仅流转."""

    def test_reject_writes_reason_without_eval_history(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """reject：不写评估历史，status→rejected，audit_reason 落库，auditor 字段写入."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, community_name="放弃小区", expected_price=200.0)
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "reject", "remark": "评估不符"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "rejected"
        assert body["eval_price"] is None

        session.refresh(lead)
        assert lead.status == LeadStatus.REJECTED
        assert lead.audit_reason == "评估不符"
        assert lead.eval_price is None
        assert lead.auditor_id == eval_operator.id
        assert lead.audit_time is not None
        assert session.query(LeadEvalHistory).filter(LeadEvalHistory.lead_id == lead.id).all() == []

    def test_reject_without_remark_leaves_reason_empty(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Reject 原因选填：未填时 audit_reason 为空."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, community_name="弃小区二")
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "reject"},
        )
        assert resp.status_code == 200
        session.refresh(lead)
        assert lead.status == LeadStatus.REJECTED
        assert lead.audit_reason is None

    def test_lost_marks_competitor_without_eval(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """lost：不写评估历史、不录价，status→lost_to_competitor，audit_reason 选填."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, community_name="他司小区", expected_price=260.0)
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "lost", "remark": "业主已在别处成交"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "lost_to_competitor"
        assert body["eval_price"] is None

        session.refresh(lead)
        assert lead.status == LeadStatus.LOST_TO_COMPETITOR
        assert lead.eval_price is None
        assert lead.audit_reason == "业主已在别处成交"
        assert lead.auditor_id == eval_operator.id
        assert session.query(LeadEvalHistory).filter(LeadEvalHistory.lead_id == lead.id).all() == []


# ---------------------------------------------------------------------------
# 权限 / 幂等 / 校验
# ---------------------------------------------------------------------------


class TestAuthorizeGuards:
    """403 / 409 / 422 防护测试."""

    def test_authorize_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """纯 C 端用户提交授权返回 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = c_end_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 100.0},
        )
        assert resp.status_code == 403
        body = resp.json()
        assert body["code"] != 0

    def test_authorize_409_for_non_pending_lead(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """对非 pending_assessment 线索（已被他人处理）返回 409."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 100.0},
        )
        assert resp.status_code == 409
        body = resp.json()
        assert body["code"] != 0
        assert "已被处理" in body["message"]

    def test_approve_422_for_missing_eval_price(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Approve 缺少 eval_price 返回 422."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve"},
        )
        assert resp.status_code == 422

    def test_approve_422_for_invalid_eval_price(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Approve eval_price 非法（≤0 / 超过两位小数）返回 422."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        for price in (-10, 0, 1.999):
            resp = eval_operator_client.post(
                _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
                json={"action": "approve", "eval_price": price},
            )
            assert resp.status_code == 422, f"eval_price={price} 应返回 422"

    def test_remark_over_500_chars_returns_422(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Remark 超过 500 字返回 422."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "reject", "remark": "x" * 501},
        )
        assert resp.status_code == 422

    def test_authorize_404_for_missing_lead(
        self,
        eval_operator_client: TestClient,
    ) -> None:
        """线索不存在返回 404."""
        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id="nonexistent-id"),
            json={"action": "reject"},
        )
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# 再次评估端点：POST/GET /my/acquired/{lead_id}/evaluations
# ---------------------------------------------------------------------------


class TestLeadReevaluation:
    """再次评估（调整评估价）与评估历史查询测试."""

    def test_reevaluation_updates_price_without_status_change(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """pending_visit 线索再次评估：追加历史 + 刷 eval_price，状态/audit 字段不变."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="调整小区",
            expected_price=300.0,
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
            eval_price=350.0,
        )
        _make_eval_history(
            session,
            lead_id=lead.id,
            evaluator_id=eval_operator.id,
            eval_price=350.0,
            evaluated_at=now - timedelta(hours=1),
            remark="首次授权",
        )
        session.commit()
        auditor_id_before = lead.auditor_id
        audit_time_before = lead.audit_time

        resp = eval_operator_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
            json={"eval_price": 362.5, "remark": "看房后上调"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["lead_id"] == lead.id
        assert body["eval_price"] == 362.5
        assert body["remark"] == "看房后上调"
        assert body["evaluator_id"] == eval_operator.id
        assert body["evaluator_name"] == "评估员"
        assert body["evaluated_at"]

        session.refresh(lead)
        assert lead.status == LeadStatus.PENDING_VISIT
        assert float(lead.eval_price) == 362.5  # type: ignore[arg-type]
        # 与 admin「调整评估价」口径一致：不写 audit 字段，保留首次授权轨迹
        assert lead.auditor_id == auditor_id_before
        assert lead.audit_time == audit_time_before

        histories = session.query(LeadEvalHistory).filter(LeadEvalHistory.lead_id == lead.id).all()
        assert len(histories) == 2

    def test_reevaluation_for_visited_lead(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """Visited 线索同样可再次评估，状态保持 visited."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.VISITED,
            community_name="已看房调整小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=2),
            eval_price=300.0,
        )
        session.commit()

        resp = eval_operator_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
            json={"eval_price": 315.0},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["eval_price"] == 315.0
        assert body["remark"] is None

        session.refresh(lead)
        assert lead.status == LeadStatus.VISITED
        assert float(lead.eval_price) == 315.0  # type: ignore[arg-type]

    def test_reevaluation_409_for_non_adjustable_statuses(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """非 pending_visit/visited 状态线索再次评估返回 409."""
        session: Session = seeded_db["session"]
        for st in (
            LeadStatus.PENDING_ASSESSMENT,
            LeadStatus.REJECTED,
            LeadStatus.LOST_TO_COMPETITOR,
            LeadStatus.SIGNED,
        ):
            lead = _make_lead(session, status=st, community_name=f"不可调整{st.value}")
            session.commit()
            resp = eval_operator_client.post(
                _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
                json={"eval_price": 100.0},
            )
            assert resp.status_code == 409, f"status={st.value} 应返回 409"
            body = resp.json()
            assert body["code"] != 0
            assert "调整评估价" in body["message"]

    def test_reevaluation_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """纯 C 端用户再次评估返回 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        resp = c_end_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
            json={"eval_price": 100.0},
        )
        assert resp.status_code == 403
        assert resp.json()["code"] != 0

    def test_reevaluation_404_for_missing_lead(
        self,
        eval_operator_client: TestClient,
    ) -> None:
        """线索不存在返回 404."""
        resp = eval_operator_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id="nonexistent-id"),
            json={"eval_price": 100.0},
        )
        assert resp.status_code == 404

    def test_reevaluation_422_for_invalid_eval_price(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """eval_price 非法（≤0 / 超过两位小数 / 缺失）返回 422."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        for payload in ({"eval_price": -10}, {"eval_price": 0}, {"eval_price": 1.999}, {}):
            resp = eval_operator_client.post(
                _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
                json=payload,
            )
            assert resp.status_code == 422, f"payload={payload} 应返回 422"

    def test_reevaluation_422_for_long_remark(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Remark 超过 500 字返回 422."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        resp = eval_operator_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
            json={"eval_price": 100.0, "remark": "x" * 501},
        )
        assert resp.status_code == 422

    def test_evaluations_returns_desc_order_with_latest_current(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """评估历史按评估时间倒序，首条（最新）为当前评估价."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="历史小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=2),
            eval_price=362.5,
        )
        _make_eval_history(
            session,
            lead_id=lead.id,
            evaluator_id=eval_operator.id,
            eval_price=350.0,
            evaluated_at=now - timedelta(hours=2),
            remark="首次授权",
        )
        _make_eval_history(
            session,
            lead_id=lead.id,
            evaluator_id=eval_operator.id,
            eval_price=362.5,
            evaluated_at=now - timedelta(hours=1),
            remark="看房后上调",
        )
        session.commit()

        resp = eval_operator_client.get(_EVALUATIONS_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200
        body = resp.json()
        assert [item["eval_price"] for item in body] == [362.5, 350.0]
        assert body[0]["remark"] == "看房后上调"
        assert body[0]["evaluator_name"] == "评估员"

    def test_evaluations_empty_list_for_lead_without_history(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """无评估历史的线索返回空数组."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        resp = eval_operator_client.get(_EVALUATIONS_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_evaluations_404_for_missing_lead(
        self,
        eval_operator_client: TestClient,
    ) -> None:
        """线索不存在返回 404."""
        resp = eval_operator_client.get(_EVALUATIONS_URL_TPL.format(lead_id="nonexistent-id"))
        assert resp.status_code == 404

    def test_evaluations_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """纯 C 端用户访问评估历史返回 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        resp = c_end_client.get(_EVALUATIONS_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 跟进记录端点
# ---------------------------------------------------------------------------


class TestLeadFollowups:
    """GET /my/acquired/{lead_id}/follow-ups 测试."""

    def test_returns_followups_desc_order(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """已处理线索返回跟进记录，按跟进时间倒序，method 为字符串枚举值."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            auditor_id=eval_operator.id,
            audit_time=now,
        )
        session.add(
            LeadFollowUp(
                id=str(uuid.uuid4()),
                lead_id=lead.id,
                method=FollowUpMethod.PHONE,
                content="电话沟通报价",
                followed_at=now - timedelta(hours=1),
                created_by_id=eval_operator.id,
            )
        )
        session.add(
            LeadFollowUp(
                id=str(uuid.uuid4()),
                lead_id=lead.id,
                method=FollowUpMethod.VISIT,
                content="实地带看完成",
                followed_at=now,
                created_by_id=eval_operator.id,
            )
        )
        session.commit()

        resp = eval_operator_client.get(_FOLLOWUPS_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200
        body = resp.json()
        assert [item["method"] for item in body] == ["visit", "phone"]
        assert body[0]["content"] == "实地带看完成"
        assert body[0]["followed_at"]

    def test_returns_empty_list_for_lead_without_followups(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """无跟进记录的线索返回空数组."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.REJECTED)
        session.commit()

        resp = eval_operator_client.get(_FOLLOWUPS_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200
        assert resp.json() == []

    def test_followups_404_for_missing_lead(
        self,
        eval_operator_client: TestClient,
    ) -> None:
        """线索不存在返回 404."""
        resp = eval_operator_client.get(_FOLLOWUPS_URL_TPL.format(lead_id="nonexistent-id"))
        assert resp.status_code == 404

    def test_followups_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """纯 C 端用户访问返回 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        resp = c_end_client.get(_FOLLOWUPS_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 来源标签（source）
# ---------------------------------------------------------------------------


class TestLeadSourceLabel:
    """工作台来源标签：按创建者身份区分客户分享 / 员工直录."""

    @staticmethod
    def _make_plain_customer(db: Session) -> User:
        """创建纯 C 端用户（主角色 customer，无后台身份）."""
        customer_role = db.query(Role).filter(Role.code == "customer").first()
        assert customer_role is not None
        user = User(
            id="plain-customer",
            username="plain-customer",
            password=get_password_hash("Pass123!"),
            nickname="纯C端用户",
            role_id=customer_role.id,
            status="active",
        )
        db.add(user)
        db.flush()
        return user

    def test_pending_source_by_creator_identity(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """待评估段来源：C 端用户直提 / 分享归因 → customer_share；员工创建 → employee_entry."""
        session: Session = seeded_db["session"]
        customer = self._make_plain_customer(session)
        _make_lead(session, community_name="客户直提小区", creator_id=customer.id)
        _make_lead(
            session,
            community_name="客户分享小区",
            creator_id=customer.id,
            referrer_id=eval_operator.id,
        )
        _make_lead(session, community_name="员工录入小区", creator_id=eval_operator.id)
        session.commit()

        resp = eval_operator_client.get(_PENDING_URL)
        assert resp.status_code == 200
        by_name = {it["community_name"]: it["source"] for it in resp.json()["items_pending"]}
        assert by_name["客户直提小区"] == "customer_share"
        assert by_name["客户分享小区"] == "customer_share"
        assert by_name["员工录入小区"] == "employee_entry"

    def test_handled_source_by_creator_identity(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """已处理段来源：C 端用户创建的经手线索 → customer_share（非员工直录）."""
        session: Session = seeded_db["session"]
        customer = self._make_plain_customer(session)
        now = datetime.now(timezone.utc)
        _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="客户直提已批准",
            creator_id=customer.id,
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(hours=1),
            eval_price=350.0,
        )
        session.commit()

        resp = eval_operator_client.get(_HANDLED_URL)
        assert resp.status_code == 200
        items = resp.json()["items"]
        assert items[0]["community_name"] == "客户直提已批准"
        assert items[0]["source"] == "customer_share"


# ---------------------------------------------------------------------------
# lost 动作放开：pending_visit / visited 可标记他司成交
# ---------------------------------------------------------------------------


class TestAuthorizeLostFromActiveStates:
    """lost 动作放开至 pending_visit/visited（评估流程不可借 approve/reject 绕过）."""

    def test_lost_from_pending_visit_preserves_eval_price(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """pending_visit + lost：状态流转，eval_price 保留，不写评估历史，写 audit 字段."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="已授权他司小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=2),
            eval_price=350.0,
        )
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "lost", "remark": "业主已在别处成交"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["status"] == "lost_to_competitor"
        # eval_price 保留（不清空）
        assert body["eval_price"] == 350.0

        session.refresh(lead)
        assert lead.status == LeadStatus.LOST_TO_COMPETITOR
        assert float(lead.eval_price) == 350.0  # type: ignore[arg-type]
        assert lead.audit_reason == "业主已在别处成交"
        assert lead.auditor_id == eval_operator.id
        assert lead.audit_time is not None
        # 不写评估历史
        assert session.query(LeadEvalHistory).filter(LeadEvalHistory.lead_id == lead.id).all() == []

    def test_lost_from_visited_lead(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """Visited + lost：状态流转为 lost_to_competitor."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.VISITED,
            community_name="已看房他司小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=1),
            eval_price=320.0,
        )
        session.commit()

        resp = eval_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "lost"},
        )
        assert resp.status_code == 200
        session.refresh(lead)
        assert lead.status == LeadStatus.LOST_TO_COMPETITOR
        assert float(lead.eval_price) == 320.0  # type: ignore[arg-type]

    def test_approve_and_reject_still_restricted_to_pending_assessment(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """pending_visit + approve/reject → 409「该线索已被处理」，评估流程不可绕过."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT, community_name="不可绕过小区")
        session.commit()

        for action, payload in (
            ("approve", {"action": "approve", "eval_price": 300.0}),
            ("reject", {"action": "reject"}),
        ):
            resp = eval_operator_client.post(_AUTHORIZE_URL_TPL.format(lead_id=lead.id), json=payload)
            assert resp.status_code == 409, f"action={action} 应返回 409"
            body = resp.json()
            assert body["code"] != 0
            assert "已被处理" in body["message"]

        session.refresh(lead)
        assert lead.status == LeadStatus.PENDING_VISIT

    def test_lost_rejected_for_terminal_states(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """signed/rejected/lost_to_competitor + lost → 409."""
        session: Session = seeded_db["session"]
        for st in (LeadStatus.SIGNED, LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR):
            lead = _make_lead(session, status=st, community_name=f"终态{st.value}")
            session.commit()
            resp = eval_operator_client.post(
                _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
                json={"action": "lost"},
            )
            assert resp.status_code == 409, f"status={st.value} 应返回 409"
            body = resp.json()
            assert body["code"] != 0
            assert "不可标记为他司成交" in body["message"]


# ---------------------------------------------------------------------------
# 员工侧跟进写入端点：POST /my/acquired/{lead_id}/follow-ups
# ---------------------------------------------------------------------------


class TestLeadFollowupCreate:
    """POST /my/acquired/{lead_id}/follow-ups：201/409/403/404/422."""

    def test_create_success_persists_and_refreshes_lead(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """201：lead_followups 落库（created_by_id=当前员工）且 Lead.last_follow_up_at 刷新."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="跟进小区",
            auditor_id=eval_operator.id,
            audit_time=now - timedelta(days=1),
        )
        assert lead.last_follow_up_at is None
        session.commit()

        resp = eval_operator_client.post(
            _FOLLOWUPS_URL_TPL.format(lead_id=lead.id),
            json={"method": "phone", "content": "电话确认看房时间"},
        )
        assert resp.status_code == 201
        body = resp.json()
        assert body["method"] == "phone"
        assert body["content"] == "电话确认看房时间"
        assert body["followed_at"]

        rec = session.query(LeadFollowUp).filter(LeadFollowUp.lead_id == lead.id).one()
        assert rec.created_by_id == eval_operator.id
        assert rec.content == "电话确认看房时间"
        session.refresh(lead)
        assert lead.last_follow_up_at is not None

    def test_content_surrounding_whitespace_trimmed(
        self,
        eval_operator_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """首尾空白由服务端 strip 归一化后落库（直连 API 同样生效）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="空白裁剪小区",
            auditor_id=eval_operator.id,
        )
        session.commit()

        resp = eval_operator_client.post(
            _FOLLOWUPS_URL_TPL.format(lead_id=lead.id),
            json={"method": "wechat", "content": "  已微信确认看房时间  "},
        )
        assert resp.status_code == 201
        assert resp.json()["content"] == "已微信确认看房时间"
        rec = session.query(LeadFollowUp).filter(LeadFollowUp.lead_id == lead.id).one()
        assert rec.content == "已微信确认看房时间"

    def test_409_for_terminal_statuses(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """rejected/lost_to_competitor 线索拒绝登记跟进，返回统一 409 错误体."""
        session: Session = seeded_db["session"]
        for st in (LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR):
            lead = _make_lead(session, status=st, community_name=f"终态不可跟进{st.value}")
            session.commit()
            resp = eval_operator_client.post(
                _FOLLOWUPS_URL_TPL.format(lead_id=lead.id),
                json={"method": "phone", "content": "尝试跟进"},
            )
            assert resp.status_code == 409, f"status={st.value} 应返回 409"
            body = resp.json()
            assert body["code"] == 409
            assert body["message"]
            assert session.query(LeadFollowUp).filter(LeadFollowUp.lead_id == lead.id).all() == []

    def test_403_for_customer_without_internal_role(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """纯 C 端用户（无 admin/operator 角色）登记跟进返回 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT, creator_id="customer-user")
        session.commit()

        resp = c_end_client.post(
            _FOLLOWUPS_URL_TPL.format(lead_id=lead.id),
            json={"method": "phone", "content": "客户自行跟进"},
        )
        assert resp.status_code == 403
        assert resp.json()["code"] != 0
        assert session.query(LeadFollowUp).filter(LeadFollowUp.lead_id == lead.id).all() == []

    def test_404_for_missing_lead(self, eval_operator_client: TestClient) -> None:
        """线索不存在返回 404."""
        resp = eval_operator_client.post(
            _FOLLOWUPS_URL_TPL.format(lead_id="nonexistent-id"),
            json={"method": "phone", "content": "幽灵线索"},
        )
        assert resp.status_code == 404

    def test_422_for_invalid_content_or_method(
        self,
        eval_operator_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """Content 为空 / 纯空白 / 超 500 字 / method 非法 → 422."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT)
        session.commit()

        for payload in (
            {"method": "phone", "content": ""},
            {"method": "phone", "content": "   "},
            {"method": "phone", "content": "x" * 501},
            {"method": "email", "content": "非法方式"},
            {"content": "缺少 method"},
        ):
            resp = eval_operator_client.post(_FOLLOWUPS_URL_TPL.format(lead_id=lead.id), json=payload)
            assert resp.status_code == 422, f"payload={payload} 应返回 422"


# ---------------------------------------------------------------------------
# 我的评估列表新字段 + 详情 can_follow_up 能力位
# ---------------------------------------------------------------------------


class TestMyLeadsFieldsAndCanFollowUp:
    """GET /public/leads/mine 新字段 与 GET /public/leads/{id} can_follow_up."""

    def test_mine_list_returns_new_fields(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """列表项下发 eval_price/district/floor_info/orientation/image_thumbnails/last_follow_up_at/audit_time."""
        session: Session = seeded_db["session"]
        now = datetime.now(timezone.utc)
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="字段齐全小区",
            district="思明区",
            floor_info="高楼层/28层",
            orientation="南北",
            creator_id="customer-user",
            auditor_id="someone-else",
            audit_time=now - timedelta(days=2),
            eval_price=350.0,
            created_at=now - timedelta(days=3),
        )
        followed_at = now - timedelta(days=1)
        session.add(
            LeadFollowUp(
                id=str(uuid.uuid4()),
                lead_id=lead.id,
                method=FollowUpMethod.PHONE,
                content="电话跟进",
                followed_at=followed_at,
                created_by_id="someone-else",
            )
        )
        no_follow = _make_lead(
            session,
            status=LeadStatus.PENDING_ASSESSMENT,
            community_name="待评估无跟进",
            creator_id="customer-user",
            created_at=now - timedelta(hours=2),
        )
        session.commit()

        resp = c_end_client.get(_MINE_URL)
        assert resp.status_code == 200
        by_id = {it["id"]: it for it in resp.json()["items"]}

        item = by_id[lead.id]
        assert item["eval_price"] == 350.0
        assert item["district"] == "思明区"
        assert item["floor_info"] == "高楼层/28层"
        assert item["orientation"] == "南北"
        # 无图 → null（非空数组）
        assert item["image_thumbnails"] is None
        assert item["last_follow_up_at"] is not None
        assert datetime.fromisoformat(item["last_follow_up_at"].replace("Z", "+00:00")) == followed_at
        assert item["audit_time"] is not None

        pending_item = by_id[no_follow.id]
        assert pending_item["last_follow_up_at"] is None
        assert pending_item["eval_price"] is None
        assert pending_item["audit_time"] is None

    def test_mine_list_thumbnail_derivation_matches_helper(
        self,
        c_end_client: TestClient,
        seeded_db: dict[str, Any],
    ) -> None:
        """缩略图派生与 get_lead_detail 同一 helper：期望值按 derive_thumbnail_url 直接计算."""
        session: Session = seeded_db["session"]
        images = ["/static/uploads/no-such-file.jpg", "/static/legacy/img2.jpg"]
        lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="带图小区",
            images=images,
            creator_id="customer-user",
        )
        session.commit()

        resp = c_end_client.get(_MINE_URL)
        assert resp.status_code == 200
        by_id = {it["id"]: it for it in resp.json()["items"]}
        expected = [t for t in (derive_thumbnail_url(u) for u in images) if t] or None
        assert by_id[lead.id]["image_thumbnails"] == expected

    def test_detail_can_follow_up_for_internal_and_customer(
        self,
        eval_operator_client: TestClient,
        c_end_client: TestClient,
        eval_operator: User,
        seeded_db: dict[str, Any],
    ) -> None:
        """内部员工 can_follow_up=true；纯 C 端客户 false."""
        session: Session = seeded_db["session"]
        internal_lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="员工可见跟进入口",
            creator_id=eval_operator.id,
        )
        customer_lead = _make_lead(
            session,
            status=LeadStatus.PENDING_VISIT,
            community_name="客户不可见跟进入口",
            creator_id="customer-user",
        )
        session.commit()

        resp_internal = eval_operator_client.get(f"/api/v1/public/leads/{internal_lead.id}")
        assert resp_internal.status_code == 200
        assert resp_internal.json()["can_follow_up"] is True

        resp_customer = c_end_client.get(f"/api/v1/public/leads/{customer_lead.id}")
        assert resp_customer.status_code == 200
        assert resp_customer.json()["can_follow_up"] is False
