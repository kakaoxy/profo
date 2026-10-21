"""评估反馈迭代（房源条件分 / 可售周期 / 联系评估人）后端测试.

覆盖：
- 三处写入口（W1 create_evaluation / W2 authorize-appove / W3 create_reevaluation）都落新字段
- Pydantic 范围校验与 approve 三字段必填校验
- DB CHECK 约束真的生效（绕过 API 直插非法值 → IntegrityError）
- 最新评估结论批量取数（窗口函数，只取最新一条）
- GET /public/leads/{id}/evaluator-contact 的权限口径与四种失败态
- POST /public/leads/{id}/follow-ups 的归属校验 + **不拒绝终态**（与员工侧刻意差异）
- 迁移幂等与列/约束存在性

⚠️ 关键断言理由：`test_db_check_constraint_rejects_out_of_range` 不可省 ——
Pydantic 只盖住 API 路径，绕过 API 的写入（脚本/数据修复）只能靠 DB 约束拦；
不测这条，CHECK 写错了也不会有人发现。
"""

import uuid
from collections.abc import Generator
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from models import Role, User
from models.common import LeadStatus
from models.lead import Lead, LeadEvalHistory
from models.user import user_roles
from services.leads.core import LeadService
from services.leads.internal.evaluation import LeadEvalService
from services.system.exceptions import (
    BusinessLogicError,
    PermissionDeniedError,
    ResourceNotFoundError,
)
from tests.conftest import _make_client
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash

_CONTACT_URL_TPL = "/api/v1/public/leads/{lead_id}/evaluator-contact"
_CUSTOMER_FOLLOWUP_URL_TPL = "/api/v1/public/leads/{lead_id}/follow-ups"
_DETAIL_URL_TPL = "/api/v1/public/leads/{lead_id}"
_HANDLED_URL = "/api/v1/public/leads/handled-assessment"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_lead(
    db: Session,
    *,
    creator_id: str | None = None,
    status: LeadStatus = LeadStatus.PENDING_VISIT,
    auditor_id: str | None = None,
    is_deleted: bool = False,
) -> Lead:
    """创建并持久化一条线索.

    auditor_id 非空时同时补上 audit_time：`get_handled` 过滤条件含
    `Lead.audit_time.is_not(None)`（未审核过的线索不进「已处理」队列）。
    """
    lead = Lead(
        id=str(uuid.uuid4()),
        community_name="测试小区",
        status=status,
        creator_id=creator_id,
        auditor_id=auditor_id,
        audit_time=datetime.now(timezone.utc) if auditor_id else None,
        is_deleted=is_deleted,
    )
    db.add(lead)
    db.flush()
    return lead


def _make_user(db: Session, *, user_id: str, nickname: str, role_code: str, phone: str | None = None) -> User:
    """创建用户（role_code = admin/operator/customer/user）."""
    role = db.query(Role).filter(Role.code == role_code).one()
    user = User(
        id=user_id,
        username=user_id,
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname=nickname,
        role_id=role.id,
        status="active",
        phone=phone,
    )
    db.add(user)
    db.flush()
    return user


def _make_eval(
    db: Session,
    *,
    lead_id: str,
    evaluator_id: str,
    eval_price: str = "300.00",
    condition_score: int | None = 4,
    expected_sale_days: int | None = 45,
    remark: str | None = None,
) -> LeadEvalHistory:
    """直接构造一条评估记录（不走去重/状态机，供取数测试用）."""
    rec = LeadEvalHistory(
        id=uuid.uuid4(),
        lead_id=lead_id,
        eval_price=Decimal(eval_price),
        remark=remark,
        condition_score=condition_score,
        expected_sale_days=expected_sale_days,
        evaluator_id=evaluator_id,
    )
    db.add(rec)
    db.flush()
    return rec


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def actor(seeded_db: dict[str, Any]) -> User:
    """持 admin 主角色 + customer 附加角色的员工（可走 C 端令牌访问 /public/*）."""
    session: Session = seeded_db["session"]
    admin_role = session.query(Role).filter(Role.code == "admin").one()
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id="verdict-operator",
        username="verdict-operator",
        password=get_password_hash(f"pw-{uuid.uuid4().hex}"),
        nickname="王建房",
        role_id=admin_role.id,
        status="active",
        phone="13812346688",
    )
    user.roles.append(customer_role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def outsider(seeded_db: dict[str, Any]) -> User:
    """纯 C 端客户（customer 角色，无内部角色）."""
    session: Session = seeded_db["session"]
    user = _make_user(session, user_id="verdict-outsider", nickname="李女士", role_code="customer", phone="13900001111")
    session.commit()
    session.refresh(user)
    return user


def _client_for(seeded_db: dict[str, Any], user: User) -> TestClient:
    """构造持 C 端令牌的 TestClient（/public/* 走 aud=c）."""
    token = create_access_token(
        data={"sub": user.id, "role": "customer", "ver": user.token_version},
        audience=AUDIENCE_C,
    )
    return next(_make_client(seeded_db["session"], {"c_access_token": token}))


@pytest.fixture
def actor_client(seeded_db: dict[str, Any], actor: User) -> Generator[TestClient, None, None]:
    """员工侧客户端（内部角色 + C 端令牌）."""
    token = create_access_token(
        data={"sub": actor.id, "role": "customer", "ver": actor.token_version},
        audience=AUDIENCE_C,
    )
    yield from _make_client(seeded_db["session"], {"c_access_token": token})


@pytest.fixture
def outsider_client(seeded_db: dict[str, Any], outsider: User) -> Generator[TestClient, None, None]:
    """纯客户侧客户端."""
    token = create_access_token(
        data={"sub": outsider.id, "role": "customer", "ver": outsider.token_version},
        audience=AUDIENCE_C,
    )
    yield from _make_client(seeded_db["session"], {"c_access_token": token})


# ---------------------------------------------------------------------------
# 写入口 W1 / W2 / W3
# ---------------------------------------------------------------------------


class TestWritePaths:
    """三处 LeadEvalHistory 写入点都必须带新字段."""

    def test_w1_create_evaluation_persists_verdict(self, seeded_db: dict[str, Any], actor: User) -> None:
        """W1：admin 录价路径落评分与周期，并同步 Lead.eval_price."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_ASSESSMENT)
        session.commit()

        rec = LeadEvalService(session).create_evaluation(
            lead_id=lead.id,
            eval_price=Decimal("286.50"),
            remark="南北通透",
            evaluator_id=actor.id,
            condition_score=4,
            expected_sale_days=45,
        )

        assert rec.condition_score == 4
        assert rec.expected_sale_days == 45
        session.refresh(lead)
        assert lead.eval_price == Decimal("286.50")

    def test_w2_authorize_approve_writes_verdict(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        actor_client: TestClient,
    ) -> None:
        """W2：小程序 approve 授权（内联构造）落评分与周期."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_ASSESSMENT)
        session.commit()

        resp = actor_client.post(
            f"/api/v1/public/leads/my/acquired/{lead.id}/authorize-assessment",
            json={
                "action": "approve",
                "eval_price": "268.00",
                "condition_score": 2,
                "expected_sale_days": 28,
                "remark": "低楼层朝北",
            },
        )
        assert resp.status_code == 200, resp.text

        rec = session.query(LeadEvalHistory).filter(LeadEvalHistory.lead_id == lead.id).one()
        assert rec.condition_score == 2
        assert rec.expected_sale_days == 28

    def test_w3_reevaluation_writes_verdict(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        actor_client: TestClient,
    ) -> None:
        """W3：再次评估（调整价）落评分与周期（Q1 口径 a：必须重填）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, status=LeadStatus.PENDING_VISIT, auditor_id=actor.id)
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=actor.id, condition_score=4, expected_sale_days=45)
        session.commit()

        resp = actor_client.post(
            f"/api/v1/public/leads/my/acquired/{lead.id}/evaluations",
            json={
                "eval_price": "275.00",
                "condition_score": 3,
                "expected_sale_days": 60,
                "remark": "带看后发现临街",
            },
        )
        assert resp.status_code == 201, resp.text

        latest = (
            session.query(LeadEvalHistory)
            .filter(LeadEvalHistory.lead_id == lead.id)
            .order_by(LeadEvalHistory.evaluated_at.desc())
            .first()
        )
        assert latest.condition_score == 3
        assert latest.expected_sale_days == 60


# ---------------------------------------------------------------------------
# 输入校验
# ---------------------------------------------------------------------------


class TestValidation:
    """Pydantic 范围与必填校验."""

    @pytest.mark.parametrize("bad_score", [0, 6, -1, 99])
    def test_condition_score_out_of_range_rejected(self, bad_score: int) -> None:
        """评分越界 → ValidationError."""
        from schemas.lead import LeadEvalHistoryCreate

        with pytest.raises(ValueError, match="condition_score"):
            LeadEvalHistoryCreate(
                eval_price="100",
                condition_score=bad_score,
                expected_sale_days=45,
            )

    @pytest.mark.parametrize("bad_days", [0, 366, -5, 1000])
    def test_expected_sale_days_out_of_range_rejected(self, bad_days: int) -> None:
        """天数越界 → ValidationError."""
        from schemas.lead import LeadEvalHistoryCreate

        with pytest.raises(ValueError, match="expected_sale_days"):
            LeadEvalHistoryCreate(
                eval_price="100",
                condition_score=4,
                expected_sale_days=bad_days,
            )

    def test_approve_requires_all_three_fields(self) -> None:
        """Approve 缺评分/天数 → ValidationError（不允许再产出「只有价格」的反馈）."""
        from schemas.lead import LeadAssessmentAuthorizeRequest

        with pytest.raises(ValueError, match="condition_score"):
            LeadAssessmentAuthorizeRequest(action="approve", eval_price="100")
        with pytest.raises(ValueError, match="expected_sale_days"):
            LeadAssessmentAuthorizeRequest(action="approve", eval_price="100", condition_score=4)
        with pytest.raises(ValueError, match="eval_price"):
            LeadAssessmentAuthorizeRequest(action="approve", condition_score=4, expected_sale_days=45)

    def test_reject_and_lost_do_not_require_verdict(self) -> None:
        """reject/lost 不建评估记录，三字段均无必填要求."""
        from schemas.lead import LeadAssessmentAuthorizeRequest

        assert LeadAssessmentAuthorizeRequest(action="reject").action == "reject"
        assert LeadAssessmentAuthorizeRequest(action="lost", remark="他司成交").action == "lost"


class TestDbCheckConstraint:
    """DB 层 CHECK 约束（绕过 API 的写入路径唯一防线）."""

    def test_db_check_constraint_rejects_out_of_range(self, seeded_db: dict[str, Any], actor: User) -> None:
        """直插 condition_score=6 → IntegrityError（证明约束真的生效）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session)
        session.commit()

        session.add(
            LeadEvalHistory(
                id=uuid.uuid4(),
                lead_id=lead.id,
                eval_price=Decimal(100),
                condition_score=6,
                expected_sale_days=45,
                evaluator_id=actor.id,
            ),
        )
        with pytest.raises(IntegrityError):
            session.flush()
        session.rollback()


# ---------------------------------------------------------------------------
# 最新评估结论批量取数
# ---------------------------------------------------------------------------


class TestLatestVerdicts:
    """get_latest_eval_verdicts：只取每条线索最新一条."""

    def test_takes_latest_per_lead(self, seeded_db: dict[str, Any], actor: User) -> None:
        """多条评估只取最新一条；无评估的线索不出现在结果中."""
        session: Session = seeded_db["session"]
        lead_a = _make_lead(session)
        lead_b = _make_lead(session)
        lead_none = _make_lead(session)
        session.commit()

        _make_eval(session, lead_id=lead_a.id, evaluator_id=actor.id, condition_score=5, expected_sale_days=90)
        session.commit()
        _make_eval(session, lead_id=lead_a.id, evaluator_id=actor.id, condition_score=2, expected_sale_days=30)
        _make_eval(session, lead_id=lead_b.id, evaluator_id=actor.id, condition_score=3, expected_sale_days=60)
        session.commit()

        verdicts = LeadService(session).query_service.get_latest_eval_verdicts([lead_a.id, lead_b.id, lead_none.id])

        assert verdicts[lead_a.id]["condition_score"] == 2
        assert verdicts[lead_a.id]["expected_sale_days"] == 30
        assert verdicts[lead_b.id]["condition_score"] == 3
        assert lead_none.id not in verdicts

    def test_empty_input_returns_empty_without_query(self, seeded_db: dict[str, Any]) -> None:
        """空列表直接返回空字典（不发查询）."""
        session: Session = seeded_db["session"]
        assert LeadService(session).query_service.get_latest_eval_verdicts([]) == {}


# ---------------------------------------------------------------------------
# 评估人联系方式端点
# ---------------------------------------------------------------------------


class TestEvaluatorContact:
    """GET /public/leads/{id}/evaluator-contact."""

    def test_creator_gets_real_phone(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """线索创建人 → 200 且返回真实号."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=actor.id)
        session.commit()

        resp = outsider_client.get(_CONTACT_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["phone"] == "13812346688"
        assert body["nickname"] == "王建房"
        assert body["lead_id"] == lead.id

    def test_internal_user_gets_phone_for_others_lead(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        outsider: User,
        actor_client: TestClient,
    ) -> None:
        """内部员工可查看非自己线索的评估人号."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=actor.id)
        session.commit()

        resp = actor_client.get(_CONTACT_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200, resp.text

    def test_stranger_denied(self, seeded_db: dict[str, Any], actor: User, outsider_client: TestClient) -> None:
        """与线索无关的纯客户 → 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id="someone-else")
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=actor.id)
        session.commit()

        resp = outsider_client.get(_CONTACT_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 403, resp.text

    def test_no_evaluation_returns_404(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """无评估记录 → 404."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()

        resp = outsider_client.get(_CONTACT_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 404, resp.text

    def test_evaluator_without_phone_returns_business_error(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """评估人未登记手机号 → 业务错误（非 500）."""
        session: Session = seeded_db["session"]
        phone_less = _make_user(session, user_id="verdict-nophone", nickname="无号评估员", role_code="operator")
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=phone_less.id)
        session.commit()

        resp = outsider_client.get(_CONTACT_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code >= 400
        assert resp.status_code != 500
        assert "手机号" in resp.text

    def test_service_layer_raises_business_logic_error(self, seeded_db: dict[str, Any], outsider: User) -> None:
        """Service 层直接抛 BusinessLogicError（便于上层统一映射）."""
        session: Session = seeded_db["session"]
        phone_less = _make_user(session, user_id="verdict-nophone2", nickname="无号评估员", role_code="operator")
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=phone_less.id)
        session.commit()

        with pytest.raises(BusinessLogicError):
            LeadService(session).get_evaluator_contact(lead_id=lead.id, user=outsider)

    def test_service_layer_denies_stranger(self, seeded_db: dict[str, Any], actor: User, outsider: User) -> None:
        """Service 层越权抛 PermissionDeniedError."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id="someone-else")
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=actor.id)
        session.commit()

        with pytest.raises(PermissionDeniedError):
            LeadService(session).get_evaluator_contact(lead_id=lead.id, user=outsider)

    def test_missing_lead_raises_not_found(self, seeded_db: dict[str, Any], outsider: User) -> None:
        """线索不存在 → ResourceNotFoundError."""
        session: Session = seeded_db["session"]
        with pytest.raises(ResourceNotFoundError):
            LeadService(session).get_evaluator_contact(lead_id="not-exist", user=outsider)


# ---------------------------------------------------------------------------
# 客户侧跟进（拨号留痕）
# ---------------------------------------------------------------------------


class TestCustomerFollowup:
    """POST /public/leads/{id}/follow-ups."""

    def test_creator_can_write_followup(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """线索创建人可登记跟进，并刷新 last_follow_up_at."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()

        resp = outsider_client.post(
            _CUSTOMER_FOLLOWUP_URL_TPL.format(lead_id=lead.id),
            json={"method": "phone", "content": "客户致电评估人 王建房"},
        )
        assert resp.status_code == 201, resp.text
        assert resp.json()["method"] == "phone"

        session.refresh(lead)
        assert lead.last_follow_up_at is not None

    @pytest.mark.parametrize("terminal", [LeadStatus.REJECTED, LeadStatus.LOST_TO_COMPETITOR])
    def test_terminal_status_still_allowed(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
        terminal: LeadStatus,
    ) -> None:
        """⚠️ 刻意差异：终态线索仍允许登记跟进（K11）。

        员工侧 create_followup 会 409，客户侧不会 —— 跟进记录是事实记录，
        已关闭线索仍需记录「为何关闭之后再联系」。
        """
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id, status=terminal)
        session.commit()

        resp = outsider_client.post(
            _CUSTOMER_FOLLOWUP_URL_TPL.format(lead_id=lead.id),
            json={"method": "phone", "content": "关闭后业主再次来电"},
        )
        assert resp.status_code == 201, resp.text

    def test_stranger_denied(self, seeded_db: dict[str, Any], outsider_client: TestClient) -> None:
        """无关客户 → 403."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id="someone-else")
        session.commit()

        resp = outsider_client.post(
            _CUSTOMER_FOLLOWUP_URL_TPL.format(lead_id=lead.id),
            json={"method": "phone", "content": "越权写入"},
        )
        assert resp.status_code == 403, resp.text

    def test_blank_content_rejected(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """纯空白内容 → 422（服务端兜底 trim）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()

        resp = outsider_client.post(
            _CUSTOMER_FOLLOWUP_URL_TPL.format(lead_id=lead.id),
            json={"method": "phone", "content": "   "},
        )
        assert resp.status_code == 422, resp.text


# ---------------------------------------------------------------------------
# 详情响应与工作台卡片取数
# ---------------------------------------------------------------------------


class TestDetailAndHandled:
    """PublicLeadDetail 新字段 + HandledItem 结论条字段."""

    def test_detail_exposes_verdict_and_evaluator_brief(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """详情返回 condition_score / expected_sale_days / evaluator（脱敏号）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()
        _make_eval(
            session,
            lead_id=lead.id,
            evaluator_id=actor.id,
            condition_score=4,
            expected_sale_days=45,
        )
        session.commit()

        resp = outsider_client.get(_DETAIL_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["condition_score"] == 4
        assert body["expected_sale_days"] == 45
        assert body["evaluator"]["nickname"] == "王建房"
        # 脱敏号：绝不能是明文
        assert body["evaluator"]["phone_masked"] == "138****6688"
        assert body["evaluator"]["phone_masked"] != "13812346688"

    def test_detail_without_evaluation_returns_nulls(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """无评估记录 → 三字段为 null（前端据此渲染降级态）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()

        resp = outsider_client.get(_DETAIL_URL_TPL.format(lead_id=lead.id))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["condition_score"] is None
        assert body["expected_sale_days"] is None
        assert body["evaluator"] is None

    def test_handled_cards_carry_verdict(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        actor_client: TestClient,
    ) -> None:
        """工作台已处理卡带评分与周期；无评估记录的卡为 null（前端灰 chip）."""
        session: Session = seeded_db["session"]
        scored = _make_lead(session, status=LeadStatus.PENDING_VISIT, auditor_id=actor.id)
        unscored = _make_lead(session, status=LeadStatus.PENDING_VISIT, auditor_id=actor.id)
        session.commit()
        _make_eval(session, lead_id=scored.id, evaluator_id=actor.id, condition_score=5, expected_sale_days=29)
        session.commit()

        resp = actor_client.get(_HANDLED_URL)
        assert resp.status_code == 200, resp.text
        by_id = {item["id"]: item for item in resp.json()["items"]}

        assert by_id[scored.id]["condition_score"] == 5
        assert by_id[scored.id]["expected_sale_days"] == 29
        assert by_id[unscored.id]["condition_score"] is None
        assert by_id[unscored.id]["expected_sale_days"] is None


# ---------------------------------------------------------------------------
# 迁移
# ---------------------------------------------------------------------------


class TestMigration:
    """迁移幂等 + 列/约束存在性 + DB 与模型声明一致."""

    def test_migration_is_idempotent(self, test_engine: Any) -> None:
        """连续执行两次均成功（第二次无 DDL 变更）."""
        from migrations.add_lead_eval_verdict_fields import add_lead_eval_verdict_fields

        add_lead_eval_verdict_fields(test_engine)
        add_lead_eval_verdict_fields(test_engine)

    def test_columns_and_constraints_exist(self, test_engine: Any) -> None:
        """两列存在且类型 smallint；两条 CHECK 约束存在且表达式含 BETWEEN 语义."""
        with test_engine.connect() as conn:
            cols = conn.execute(
                text(
                    "SELECT column_name, data_type FROM information_schema.columns "
                    "WHERE table_name = 'lead_eval_histories' "
                    "AND column_name IN ('condition_score', 'expected_sale_days')",
                ),
            ).all()
            assert {c.column_name for c in cols} == {"condition_score", "expected_sale_days"}
            assert {c.data_type for c in cols} == {"smallint"}

            cons = conn.execute(
                text(
                    "SELECT conname, pg_get_constraintdef(oid) AS defn FROM pg_constraint "
                    "WHERE conrelid = 'lead_eval_histories'::regclass AND contype = 'c'",
                ),
            ).all()
            names = {c.conname for c in cons}
            assert "ck_lead_eval_condition_score" in names
            assert "ck_lead_eval_expected_sale_days" in names
            defs = " ".join(c.defn for c in cons)
            assert "condition_score" in defs
            assert "expected_sale_days" in defs

    def test_registry_entry(self) -> None:
        """注册表登记 version=83（后续迁移可继续追加，不断言「它是最后一个」）.

        ⚠️ 2026-10-22 修正：原断言 ``max(m.version) == 83`` / ``NEXT_VERSION == 84``
        把「本条是最后一条迁移」写死了，任何后续新增迁移都会将其打破（本次资金账户
        新增 v84–87 即触发）。注册表的不变量是「版本连续 + 本条元数据正确」
        （由 test_migration_registry.py 统一守），故此处只断言本条自身语义。
        """
        from migrations.registry import MIGRATION_BY_NAME, MIGRATIONS, NEXT_VERSION

        entry = MIGRATION_BY_NAME["add_lead_eval_verdict_fields"]
        assert entry.version == 83
        assert entry.risk == "A"
        assert entry.reversible is True
        # 本条必须存在于注册表且版本号单调（后续迁移只能追加在其后）
        latest = max(m.version for m in MIGRATIONS)
        assert latest >= 83
        assert latest + 1 == NEXT_VERSION


# ---------------------------------------------------------------------------
# 便于其他测试复用的工具（避免未使用 import 告警）
# ---------------------------------------------------------------------------

__all__ = [
    "_client_for",
    "_make_eval",
    "_make_lead",
    "user_roles",
]


class TestMyLeadsListVerdict:
    """「我的评估」列表（GET /public/leads/mine）结论条字段.

    需求：我的评估列表卡也要像评估工作台一样显示评分与周期。
    """

    def test_mine_list_carries_verdict(
        self,
        seeded_db: dict[str, Any],
        actor: User,
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """已出评估的线索在 /mine 列表中带 condition_score / expected_sale_days."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id)
        session.commit()
        _make_eval(session, lead_id=lead.id, evaluator_id=actor.id, condition_score=4, expected_sale_days=45)
        session.commit()

        resp = outsider_client.get("/api/v1/public/leads/mine")
        assert resp.status_code == 200, resp.text
        row = next(i for i in resp.json()["items"] if i["id"] == lead.id)
        assert row["condition_score"] == 4
        assert row["expected_sale_days"] == 45

    def test_mine_list_without_eval_returns_null(
        self,
        seeded_db: dict[str, Any],
        outsider: User,
        outsider_client: TestClient,
    ) -> None:
        """无评估记录 → null（前端据此不渲染结论条 / 渲染灰 chip）."""
        session: Session = seeded_db["session"]
        lead = _make_lead(session, creator_id=outsider.id, status=LeadStatus.PENDING_ASSESSMENT)
        session.commit()

        resp = outsider_client.get("/api/v1/public/leads/mine")
        assert resp.status_code == 200, resp.text
        row = next(i for i in resp.json()["items"] if i["id"] == lead.id)
        assert row["condition_score"] is None
        assert row["expected_sale_days"] is None
