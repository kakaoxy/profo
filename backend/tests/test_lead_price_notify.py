"""估价授权价变更订阅消息通知测试.

覆盖 services/leads/notify.py 及其路由触发链路
（POST /api/v1/public/leads/my/acquired/{lead_id}/authorize-assessment 的 approve 动作与
POST /api/v1/public/leads/my/acquired/{lead_id}/evaluations 再次评估）：
- 触发条件：approve / 再次评估触发，reject / lost 不触发
- 跳过条件：模板未配置、线索无提交人、提交人无可用 openid
- openid 解析：主账号绑定优先，merged 临时账号兜底（多个全发）
- 消息格式：thing 字段截断 20 字符、amount 纯数字两位小数、
  remark 空时显示「无」、page 跳转我的估价列表
- 容错：发送异常不影响授权/调价响应与落库，单个 openid 失败不阻断后续
"""

import re
import uuid
from collections.abc import Generator
from typing import Any
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from models import Role, User
from models.common import LeadStatus
from models.lead import Lead
from settings import settings
from tests.conftest import _make_client
from utils.auth import AUDIENCE_C, create_access_token, get_password_hash

_AUTHORIZE_URL_TPL = "/api/v1/public/leads/my/acquired/{lead_id}/authorize-assessment"
_EVALUATIONS_URL_TPL = "/api/v1/public/leads/my/acquired/{lead_id}/evaluations"
_TMPL_ID = "TMPL-VAL-001"
_NOTIFY_PAGE = "pages/valuation/list/index"
_TIME_PATTERN = r"\d{4}年\d{1,2}月\d{1,2}日 \d{2}:\d{2}"


# ---------------------------------------------------------------------------
# Helpers & fixtures
# ---------------------------------------------------------------------------


def _make_customer(
    db: Session,
    *,
    user_id: str,
    username: str,
    openid: str | None = None,
    status: str = "active",
    merged_to: str | None = None,
) -> User:
    """创建 C 端用户（可选绑定 openid / merged 状态，供通知 openid 解析测试）."""
    customer_role = db.query(Role).filter(Role.code == "customer").first()
    assert customer_role is not None
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash("Customer1!"),
        nickname=username,
        role_id=customer_role.id,
        status=status,
        wechat_openid=openid,
        merged_to_user_id=merged_to,
    )
    db.add(user)
    db.flush()
    return user


def _make_notify_lead(
    db: Session,
    *,
    creator_id: str | None,
    status: LeadStatus = LeadStatus.PENDING_ASSESSMENT,
    community_name: str = "通知小区",
) -> Lead:
    """创建一条用于通知测试的线索（仅设通知链路相关字段）."""
    lead = Lead(
        id=str(uuid.uuid4()),
        community_name=community_name,
        status=status,
        is_deleted=False,
        images=[],
        creator_id=creator_id,
    )
    db.add(lead)
    db.flush()
    return lead


def _patch_notify_env(monkeypatch: pytest.MonkeyPatch, template_id: str) -> MagicMock:
    """统一 patch 模板 ID 配置与订阅消息发送 mock（对齐 test_recruit 通知测试模式）."""
    monkeypatch.setattr(settings, "wechat_valuation_price_template_id", template_id)
    send_mock = MagicMock()
    monkeypatch.setattr("services.leads.notify.WeChatAuthService.send_subscribe_message", send_mock)
    return send_mock


@pytest.fixture
def notify_operator(seeded_db: dict[str, Any]) -> User:
    """评估员工：admin 主角色 + customer 附加角色（可访问 C 端内部接口）."""
    session: Session = seeded_db["session"]
    admin_role = session.query(Role).filter(Role.code == "admin").first()
    customer_role = session.query(Role).filter(Role.code == "customer").first()
    assert admin_role is not None
    assert customer_role is not None
    user = User(
        id="notify-operator",
        username="notify-operator",
        password=get_password_hash("Eval123!"),
        nickname="通知评估员",
        role_id=admin_role.id,
        status="active",
    )
    user.roles.append(customer_role)
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


@pytest.fixture
def notify_operator_client(
    seeded_db: dict[str, Any],
    notify_operator: User,
) -> Generator[TestClient, None, None]:
    """评估员工 C 端客户端（c_access_token cookie + aud=c）."""
    token = create_access_token(
        data={"sub": notify_operator.id, "role": "customer", "ver": notify_operator.token_version},
        audience=AUDIENCE_C,
    )
    yield from _make_client(seeded_db["session"], {"c_access_token": token})


# ---------------------------------------------------------------------------
# 跳过条件
# ---------------------------------------------------------------------------


class TestNotifySkipConditions:
    """模板未配置 / 无提交人 / 提交人无可用 openid 时跳过发送."""

    def test_skipped_when_template_not_configured(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """模板未配置（空串）不发送."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, "")
        creator = _make_customer(session, user_id="cust-tmpl-off", username="cust_tmpl_off", openid="openid-cust")
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        send_mock.assert_not_called()

    def test_skipped_when_lead_has_no_creator(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """线索无提交人（creator_id 为空）不发送."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        lead = _make_notify_lead(session, creator_id=None)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        send_mock.assert_not_called()

    def test_skipped_when_creator_has_no_openid(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """提交人存在但无 openid 且无 merged 账号不发送."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-no-openid", username="cust_no_openid")
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        send_mock.assert_not_called()


# ---------------------------------------------------------------------------
# openid 解析
# ---------------------------------------------------------------------------


class TestNotifyOpenidResolution:
    """提交人 openid 解析优先级：主账号绑定优先，merged 临时账号兜底."""

    def test_primary_openid_preferred_over_merged(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """主账号直接绑定 openid 时仅发主账号，不查 merged."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-primary", username="cust_primary", openid="openid-primary")
        _make_customer(
            session,
            user_id="cust-merged-shadow",
            username="cust_merged_shadow",
            openid="openid-merged-shadow",
            status="merged",
            merged_to=creator.id,
        )
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        send_mock.assert_called_once()
        assert send_mock.call_args.args[0] == "openid-primary"

    def test_merged_openids_fallback(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """主账号无 openid 时向全部持有 openid 的 merged 账号发送."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-merged-target", username="cust_merged_target")
        _make_customer(
            session,
            user_id="cust-merged-a",
            username="cust_merged_a",
            openid="openid-merged-a",
            status="merged",
            merged_to=creator.id,
        )
        _make_customer(
            session,
            user_id="cust-merged-b",
            username="cust_merged_b",
            openid="openid-merged-b",
            status="merged",
            merged_to=creator.id,
        )
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        assert send_mock.call_count == 2
        assert {call.args[0] for call in send_mock.call_args_list} == {"openid-merged-a", "openid-merged-b"}


# ---------------------------------------------------------------------------
# authorize-assessment 触发条件与消息格式
# ---------------------------------------------------------------------------


class TestAuthorizeNotifyTrigger:
    """approve 触发通知（reject / lost 不触发）与模板字段格式."""

    def test_approve_triggers_notify_with_payload(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """approve：向提交人 openid 发送，data 字段与 page 跳转路径正确."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-notify", username="cust_notify", openid="openid-creator")
        lead = _make_notify_lead(session, creator_id=creator.id, community_name="通知小区")
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5, "remark": "溢价可控"},
        )
        assert resp.status_code == 200
        send_mock.assert_called_once()
        args, kwargs = send_mock.call_args
        openid, template_id, data = args[0], args[1], args[2]
        assert openid == "openid-creator"
        assert template_id == _TMPL_ID
        assert data["thing3"]["value"] == "通知小区"
        assert data["amount2"]["value"] == "350.50"
        assert data["thing1"]["value"] == "溢价可控"
        assert re.fullmatch(_TIME_PATTERN, data["time4"]["value"])
        assert kwargs["page"] == _NOTIFY_PAGE

    def test_approve_truncates_thing_fields_and_defaults_remark(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Thing 字段超长截断 20 字符；remark 空时显示「无」；amount 两位小数纯数字."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-trunc", username="cust_trunc", openid="openid-trunc")
        lead = _make_notify_lead(session, creator_id=creator.id, community_name="超" * 25)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 200, "remark": "评" * 25},
        )
        assert resp.status_code == 200
        send_mock.assert_called_once()
        data = send_mock.call_args.args[2]
        assert data["thing3"]["value"] == "超" * 20
        assert data["thing1"]["value"] == "评" * 20
        assert data["amount2"]["value"] == "200.00"

    def test_reject_does_not_notify(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Reject 不触发通知（无授权价产出）."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-reject", username="cust_reject", openid="openid-reject")
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "reject", "remark": "评估不符"},
        )
        assert resp.status_code == 200
        send_mock.assert_not_called()

    def test_lost_does_not_notify(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Lost 不触发通知（无授权价产出）."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-lost", username="cust_lost", openid="openid-lost")
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "lost"},
        )
        assert resp.status_code == 200
        send_mock.assert_not_called()


# ---------------------------------------------------------------------------
# 再次评估触发
# ---------------------------------------------------------------------------


class TestReevaluationNotifyTrigger:
    """再次评估（调整评估价）触发通知."""

    def test_reevaluation_triggers_notify_with_new_price(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """调整评估价成功后按新价格发送通知."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        creator = _make_customer(session, user_id="cust-reeval", username="cust_reeval", openid="openid-reeval")
        lead = _make_notify_lead(
            session,
            creator_id=creator.id,
            status=LeadStatus.PENDING_VISIT,
            community_name="调整小区",
        )
        session.commit()

        resp = notify_operator_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
            json={"eval_price": 362.5, "remark": "看房后上调"},
        )
        assert resp.status_code == 201
        send_mock.assert_called_once()
        args, kwargs = send_mock.call_args
        assert args[0] == "openid-reeval"
        assert args[1] == _TMPL_ID
        data = args[2]
        assert data["thing3"]["value"] == "调整小区"
        assert data["amount2"]["value"] == "362.50"
        assert data["thing1"]["value"] == "看房后上调"
        assert kwargs["page"] == _NOTIFY_PAGE


# ---------------------------------------------------------------------------
# 容错：通知异常不影响主流程
# ---------------------------------------------------------------------------


class TestNotifyResilience:
    """发送异常不影响授权/调价结果；单个 openid 失败不阻断后续."""

    def test_send_exception_does_not_affect_authorize(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Approve 后发送抛异常：响应与落库均不受影响."""
        session: Session = seeded_db["session"]
        _patch_notify_env(monkeypatch, _TMPL_ID)

        def _boom(openid: str, template_id: str, data: dict, page: str | None = None) -> None:
            msg = "订阅消息发送失败"
            raise RuntimeError(msg)

        monkeypatch.setattr("services.leads.notify.WeChatAuthService.send_subscribe_message", _boom)
        creator = _make_customer(session, user_id="cust-boom", username="cust_boom", openid="openid-boom")
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        assert resp.json()["eval_price"] == 350.5
        session.refresh(lead)
        assert lead.status == LeadStatus.PENDING_VISIT
        assert float(lead.eval_price) == 350.5  # type: ignore[arg-type]

    def test_send_exception_does_not_affect_reevaluation(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """再次评估后发送抛异常：响应与 eval_price 落库不受影响."""
        session: Session = seeded_db["session"]
        _patch_notify_env(monkeypatch, _TMPL_ID)

        def _boom(openid: str, template_id: str, data: dict, page: str | None = None) -> None:
            msg = "订阅消息发送失败"
            raise RuntimeError(msg)

        monkeypatch.setattr("services.leads.notify.WeChatAuthService.send_subscribe_message", _boom)
        creator = _make_customer(session, user_id="cust-boom2", username="cust_boom2", openid="openid-boom2")
        lead = _make_notify_lead(session, creator_id=creator.id, status=LeadStatus.PENDING_VISIT)
        session.commit()

        resp = notify_operator_client.post(
            _EVALUATIONS_URL_TPL.format(lead_id=lead.id),
            json={"eval_price": 362.5},
        )
        assert resp.status_code == 201
        session.refresh(lead)
        assert float(lead.eval_price) == 362.5  # type: ignore[arg-type]

    def test_single_openid_failure_does_not_block_remaining(
        self, notify_operator_client: TestClient, seeded_db: dict[str, Any], monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """多 openid 场景：第一个发送失败后第二个仍被发送，授权响应不受影响."""
        session: Session = seeded_db["session"]
        send_mock = _patch_notify_env(monkeypatch, _TMPL_ID)
        send_mock.side_effect = [RuntimeError("首个 openid 发送失败"), None]
        creator = _make_customer(session, user_id="cust-multi", username="cust_multi")
        _make_customer(
            session,
            user_id="cust-multi-a",
            username="cust_multi_a",
            openid="openid-multi-a",
            status="merged",
            merged_to=creator.id,
        )
        _make_customer(
            session,
            user_id="cust-multi-b",
            username="cust_multi_b",
            openid="openid-multi-b",
            status="merged",
            merged_to=creator.id,
        )
        lead = _make_notify_lead(session, creator_id=creator.id)
        session.commit()

        resp = notify_operator_client.post(
            _AUTHORIZE_URL_TPL.format(lead_id=lead.id),
            json={"action": "approve", "eval_price": 350.5},
        )
        assert resp.status_code == 200
        assert send_mock.call_count == 2
