"""房源上新/调价订阅通知 —— 迭代后审查修复的回归用例.

覆盖审查报告中的高危/中低危修复项（用例编号对应报告分级）：

- H1 微信凭据泄露：`redact_url_credentials` 纯函数脱敏；日志出口过滤器同时脱敏
  「消息本体」与「exc_info 堆栈」；`fetch_wechat_miniapp_access_token` 对上游 5xx
  抛固定文案（`str(exc)` 不含 secret → 不会流入留痕表 / 失败记录表 / HTTP 响应体）；
  `_log_send` 入库前脱敏 error_msg
- H2 取消提醒后仍被推送：`cancelled_at` 为显式取消事实源，调价收件人从
  频道级 ∪ 房源级**两轨同时排除**；「额度=0 但未取消」不得被误伤；accept 续订清回 NULL
- H4 草稿转发布同次改价：仅产出上新信号，不写调价历史、不产出调价信号（防同房源双推）
- H5 静默漏推：`_fetch_subscribers` / 调价收件人 keyset 分页覆盖 >单页上限 的全部订阅者
- M1 取消丢失更新：取消走原子条件 UPDATE（一次写清零额度 + 取消标记）；未订阅取消不建行
- M7 openid 不入日志：发送异常日志仅带 openid 前缀摘要

⚠️ 只调用 `db` 形参化的内部函数 / Service 方法，**绝不调用 notify_* 系列入口包装函数**：
入口内部 `with SessionLocal()` 绑定主库 `profo`（非 conftest 的 savepoint 隔离会话），
且会真实调用微信接口。

⚠️ 收件人/分页类用例不造 `User` 行：两张订阅表均为逻辑外键（无物理 FK），
且 openid 非空时不触发 User 反查；避免数百次 bcrypt 哈希拖慢测试。

⚠️ 本文件超 500 行不拆分理由（AGENTS §1）：全部用例同属「上新/调价订阅通知」单一
功能域，共用同一组造数 helper（_make_project/_make_channel_sub/_make_project_sub）
与 send/template 桩；按缺陷编号拆成多文件会导致 helper 重复或反向依赖，
故保持单文件、以注释分区组织。
"""

import logging
from datetime import datetime, timezone
from typing import Any

import httpx
import pytest
from redis.exceptions import RedisError
from sqlalchemy import event, func
from sqlalchemy.orm import Session

import services.system.wechat as wechat_mod
from models import (
    L4MarketingNotifyLog,
    L4MarketingPriceChange,
    L4MarketingProject,
    L4MarketingProjectSubscription,
    L4MarketingSubscription,
    MarketingProjectStatus,
    PublishStatus,
    Role,
    SendStatus,
    User,
)
from schemas.l4_marketing import L4MarketingProjectUpdate
from services.marketing import MarketingProjectService
from services.marketing import notify as notify_mod
from services.marketing.notify import (
    _MAX_BATCH,
    _fetch_price_change_recipients,
    _fetch_subscribers,
    _log_send,
    _notify_project_price_changed,
    _notify_projects_published,
)
from services.marketing.subscription import MarketingSubscriptionService
from services.system.exceptions import ResourceNotFoundError
from settings import settings
from utils.auth import get_password_hash
from utils.security_logger import WechatCredentialScrubFilter, redact_url_credentials

_NEW_TMPL = "TMPL-NEW-001"
_PRICE_TMPL = "TMPL-PRICE-001"
_SECRET = "sup***/content"
_FULL_OPENID = "oylV63bROPS7N8v1MeLRXHQwGH-I"
# 本用例要模拟的就是上游异常，raise 的消息先取变量（EM101）
_UPSTREAM_MSG = "upstream failed"


# ---------------------------------------------------------------------------
# helpers
# ---------------------------------------------------------------------------


def _seed_template_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """模板 ID 经 env 兜底生效（resolve_template_id：DB 无配置 → 回退 env）."""
    monkeypatch.setattr(settings, "wechat_project_new_template_id", _NEW_TMPL, raising=False)
    monkeypatch.setattr(settings, "wechat_project_price_change_template_id", _PRICE_TMPL, raising=False)


def _make_project(
    session: Session,
    *,
    project_id: int,
    publish_status: PublishStatus = PublishStatus.PUBLISHED,
    total_price: float = 300,
    published_at: datetime | None = None,
) -> L4MarketingProject:
    """营销房源（community_id 用固定字面量，无需真实小区）."""
    project = L4MarketingProject(
        id=project_id,
        community_id="comm-notify",
        community_name="通知测试小区",
        layout="三室两厅",
        orientation="南北通透",
        floor_info="15/28层",
        area=120,
        total_price=total_price,
        unit_price=total_price / 120,
        title=f"通知测试房源{project_id}",
        publish_status=publish_status.value,
        project_status=MarketingProjectStatus.FOR_SALE.value,
        published_at=published_at,
        is_deleted=False,
    )
    session.add(project)
    session.flush()
    return project


def _make_channel_sub(
    session: Session,
    *,
    user_id: str,
    openid: str,
    new_quota: int = 0,
    price_quota: int = 0,
) -> L4MarketingSubscription:
    row = L4MarketingSubscription(
        user_id=user_id,
        openid=openid,
        new_listing_quota=new_quota,
        price_change_quota=price_quota,
    )
    session.add(row)
    session.flush()
    return row


def _make_project_sub(
    session: Session,
    *,
    user_id: str,
    project_id: int,
    openid: str,
    price_quota: int = 1,
    cancelled_at: datetime | None = None,
) -> L4MarketingProjectSubscription:
    row = L4MarketingProjectSubscription(
        user_id=user_id,
        marketing_project_id=project_id,
        openid=openid,
        price_change_quota=price_quota,
        cancelled_at=cancelled_at,
    )
    session.add(row)
    session.flush()
    return row


def _make_customer(session: Session, *, user_id: str, openid: str | None = None) -> User:
    """C 端用户（仅上报/续订类用例需要，避免不必要的 bcrypt 开销）."""
    customer_role = session.query(Role).filter(Role.code == "customer").one()
    user = User(
        id=user_id,
        username=f"u_{user_id}",
        password=get_password_hash(f"pw-{user_id}"),
        nickname=user_id,
        role_id=customer_role.id,
        status="active",
        wechat_openid=openid,
    )
    session.add(user)
    session.flush()
    return user


def _project_sub_row(session: Session, user_id: str, project_id: int) -> L4MarketingProjectSubscription:
    return (
        session.query(L4MarketingProjectSubscription)
        .filter(
            L4MarketingProjectSubscription.user_id == user_id,
            L4MarketingProjectSubscription.marketing_project_id == project_id,
        )
        .one()
    )


class _StubClient:
    """替换 httpx.Client：按预设状态码返回响应（不发真实网络请求）."""

    status_code = 500

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._args = args
        self._kwargs = kwargs

    def __enter__(self) -> Any:
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def get(self, url: str, params: dict | None = None, **kw: Any) -> httpx.Response:
        request = httpx.Request("GET", url, params=params or {})
        return httpx.Response(self.status_code, request=request, text="boom")

    def post(self, url: str, params: dict | None = None, json: dict | None = None, **kw: Any) -> httpx.Response:
        request = httpx.Request("POST", url, params=params or {})
        return httpx.Response(self.status_code, request=request, text="boom")


@pytest.fixture
def send_mock(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """替换微信订阅消息发送（errcode=0 = 受理成功）并记录调用参数."""
    calls: list[dict[str, Any]] = []

    def fake_send(openid: str, template_id: str, data: dict, page: str | None = None) -> tuple[int, str | None]:
        calls.append({"openid": openid, "template_id": template_id, "data": data, "page": page})
        return 0, None

    monkeypatch.setattr(notify_mod.WeChatAuthService, "send_subscribe_message", staticmethod(fake_send))
    return calls


# =========================================================================
# H1 微信凭据泄露
# =========================================================================


def test_h1_redact_masks_credential_query_params() -> None:
    """Secret / access_token / js_code / appsecret 值被替换；appid 与路径保留以便排障."""
    raw = (
        f"Server error '500' for url 'https://api.weixin.qq.com/cgi-bin/token?grant_type=x&appid=wx1&secret={_SECRET}'"
    )
    out = redact_url_credentials(raw)

    assert _SECRET not in out
    assert "secret=***" in out
    assert "appid=wx1" in out
    assert "cgi-bin/token" in out

    for key, value in (("access_token", "AT-V"), ("js_code", "CODE-V"), ("appsecret", "AS-V")):
        redacted = redact_url_credentials(f"https://h/p?{key}={value}&other=keep")
        assert f"{key}=***" in redacted
        assert value not in redacted
        assert "other=keep" in redacted


def test_h1_scrub_filter_scrubs_message_and_traceback() -> None:
    """日志出口过滤器同时拦「消息本体」与「exc_info 堆栈」（httpx INFO 成功路径也拦）."""
    import io

    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(logging.Formatter("%(name)s - %(levelname)s - %(message)s"))
    handler.addFilter(WechatCredentialScrubFilter())

    logger = logging.getLogger("h1-scrub-probe")
    previous = (logger.level, list(logger.handlers), logger.propagate)
    logger.setLevel(logging.DEBUG)
    logger.handlers = [handler]
    logger.propagate = False
    try:
        # ① 消息本体含凭据 URL（模拟 httpx INFO 日志与 traceback.format_exc 当消息传入）
        url_with_secret = f"https://api.weixin.qq.com/cgi-bin/token?appid=wx1&secret={_SECRET}"
        logger.info("HTTP Request: GET %s", url_with_secret)
        # ② exc_info 堆栈含凭据（模拟 logger.exception 格式化 HTTPStatusError）
        request = httpx.Request("GET", f"https://api.weixin.qq.com/x?secret={_SECRET}")
        upstream_error = httpx.HTTPStatusError(
            _UPSTREAM_MSG,
            request=request,
            response=httpx.Response(500, request=request),
        )
        try:
            raise upstream_error
        except httpx.HTTPStatusError:
            logger.exception("发送订阅消息请求异常")
    finally:
        logger.level, logger.handlers, logger.propagate = previous

    text = stream.getvalue()
    assert _SECRET not in text, f"日志出口仍含凭据：{text[:200]}"
    assert "secret=***" in text
    # 堆栈仍保留（修复没有以牺牲可排障性为代价）
    assert "Traceback" in text
    assert "HTTPStatusError" in text


def test_h1_fetch_access_token_upstream_5xx_message_has_no_secret(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """上游 5xx：抛给调用方的异常文本为固定文案（调用方 str(exc) 会写进留痕表）."""
    from services.system.exceptions import ValidationError

    monkeypatch.setattr(settings, "wechat_appid", "wxappid", raising=False)
    monkeypatch.setattr(settings, "wechat_secret", _SECRET, raising=False)
    # Redis 不可达 → 走直接获取分支（否则命中缓存不发请求）
    monkeypatch.setattr(wechat_mod, "get_redis_client", lambda: (_ for _ in ()).throw(RedisError("down")))
    monkeypatch.setattr(wechat_mod.httpx, "Client", _StubClient)

    with pytest.raises(ValidationError) as excinfo:
        wechat_mod.WeChatAuthService.fetch_wechat_miniapp_access_token()

    assert _SECRET not in str(excinfo.value)
    assert str(excinfo.value) == "微信服务暂不可用，请稍后重试"


def test_h1_send_subscribe_message_error_text_is_credential_free(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """通知循环直接 `error_msg=str(exc)` 入库：异常文本必须无凭据（H1 的入库口径）."""
    from services.system.exceptions import ValidationError

    monkeypatch.setattr(settings, "wechat_appid", "wxappid", raising=False)
    monkeypatch.setattr(settings, "wechat_secret", _SECRET, raising=False)
    monkeypatch.setattr(
        wechat_mod.WeChatAuthService,
        "fetch_wechat_miniapp_access_token",
        staticmethod(lambda: "AT" + _SECRET[-6:]),
    )

    class _Post500(_StubClient):
        status_code = 500

    monkeypatch.setattr(wechat_mod.httpx, "Client", _Post500)

    with pytest.raises(ValidationError) as excinfo:
        wechat_mod.WeChatAuthService.send_subscribe_message("op", _PRICE_TMPL, {"thing1": {"value": "x"}})

    # 通知侧入库口径：str(exc)[:200]
    assert _SECRET not in str(excinfo.value)
    assert "AT" not in str(excinfo.value)[:200] or _SECRET[-6:] not in str(excinfo.value)


def test_h1_log_send_redacts_error_msg_before_db(seeded_db: dict[str, Any]) -> None:
    """`_log_send` 入库的 error_msg 已脱敏（留痕表不再是凭据落盘面）."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9101)

    raw = f"Server error '500' for url 'https://api.weixin.qq.com/cgi-bin/token?appid=wx1&secret={_SECRET}'"
    _log_send(
        session,
        user_id="h1-user",
        project_id=project.id,
        notify_type="price_change",
        template_id=_PRICE_TMPL,
        status=SendStatus.FAILED.value,
        error_msg=raw,
    )

    row = session.query(L4MarketingNotifyLog).filter(L4MarketingNotifyLog.user_id == "h1-user").one()
    assert row.error_msg is not None
    assert _SECRET not in row.error_msg
    assert "secret=***" in row.error_msg


# =========================================================================
# H2 取消提醒后仍被推送（服务端尊重取消）
# =========================================================================


def test_h2_cancelled_user_excluded_from_channel_track(seeded_db: dict[str, Any]) -> None:
    """频道额度 >0 + 该房源已显式取消 → 排除；未取消用户不受影响."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9201)
    now = datetime.now(timezone.utc)

    # 两用户均有频道级调价额度（修复前两者都会被推进收件人）
    _make_channel_sub(session, user_id="cancelled-user", openid="op-cancelled", price_quota=3)
    _make_channel_sub(session, user_id="active-user", openid="op-active", price_quota=2)
    _make_project_sub(
        session,
        user_id="cancelled-user",
        project_id=project.id,
        openid="op-cancelled",
        price_quota=0,
        cancelled_at=now,
    )
    _make_project_sub(session, user_id="active-user", project_id=project.id, openid="op-active", price_quota=1)

    recipients = {r.user_id: r for r in _fetch_price_change_recipients(session, project.id)}

    assert "cancelled-user" not in recipients, "已显式取消的用户不得经频道级轨道收到该房源推送"
    assert "active-user" in recipients
    assert recipients["active-user"].channel == "project", "双轨命中同一用户时优先房源级"


def test_h2_cancelled_user_excluded_even_via_project_track_only(seeded_db: dict[str, Any]) -> None:
    """仅有房源级订阅行且已取消 → 完全排除（不因去重优先规则被放回）."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9205)

    _make_project_sub(
        session,
        user_id="only-proj-cancelled",
        project_id=project.id,
        openid="op-x",
        price_quota=0,
        cancelled_at=datetime.now(timezone.utc),
    )

    assert _fetch_price_change_recipients(session, project.id) == []


def test_h2_quota_zero_without_cancel_is_not_optout(seeded_db: dict[str, Any]) -> None:
    """额度=0 但未取消（一次性额度被推送消耗）→ 仍按频道级接收，不得误伤."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9202)

    _make_channel_sub(session, user_id="spent-user", openid="op-spent", price_quota=5)
    _make_project_sub(session, user_id="spent-user", project_id=project.id, openid="op-spent", price_quota=0)

    recipients = {r.user_id: r for r in _fetch_price_change_recipients(session, project.id)}

    assert "spent-user" in recipients, "额度耗尽 ≠ 已取消，不得排除"
    assert recipients["spent-user"].channel == "channel"


def test_h2_resubscribe_clears_cancelled_at(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """取消后再次 accept 上报 → cancelled_at 置 NULL，恢复接收."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    project = _make_project(session, project_id=9203)
    user = _make_customer(session, user_id="resub-user", openid="op-resub")
    svc = MarketingSubscriptionService(session)

    report = svc.report_project_result(user.id, project.id, [(_PRICE_TMPL, "accept")])
    assert report["price_change_quota"] == 1

    svc.cancel_project_subscription(user.id, project.id)
    row = _project_sub_row(session, user.id, project.id)
    assert row.cancelled_at is not None
    assert row.price_change_quota == 0
    assert _fetch_price_change_recipients(session, project.id) == []

    again = svc.report_project_result(user.id, project.id, [(_PRICE_TMPL, "accept")])
    assert again["price_change_quota"] == 1
    session.refresh(row)
    assert row.cancelled_at is None
    assert [r.user_id for r in _fetch_price_change_recipients(session, project.id)] == [user.id]


# =========================================================================
# M1 取消：原子条件更新 + 幂等
# =========================================================================


def test_m1_cancel_is_idempotent_without_creating_row(seeded_db: dict[str, Any]) -> None:
    """未订阅用户取消 → 返回未订阅态且不新建行（不污染订阅统计）."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9301)

    status = MarketingSubscriptionService(session).cancel_project_subscription("never-subbed", project.id)

    assert status["subscribed"] is False
    assert status["price_change_quota"] == 0
    assert (
        session.query(L4MarketingProjectSubscription)
        .filter(L4MarketingProjectSubscription.user_id == "never-subbed")
        .count()
        == 0
    )

    # 重复取消仍幂等
    again = MarketingSubscriptionService(session).cancel_project_subscription("never-subbed", project.id)
    assert again["subscribed"] is False


def test_m1_cancel_clears_quota_and_marks_cancelled_in_one_update(seeded_db: dict[str, Any]) -> None:
    """取消一次完成「清零额度 + 写取消标记」；房源不存在 → 404 语义异常."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9302)
    svc = MarketingSubscriptionService(session)
    _make_project_sub(session, user_id="cancel-atomic", project_id=project.id, openid="op-atomic", price_quota=4)

    status = svc.cancel_project_subscription("cancel-atomic", project.id)
    assert status["price_change_quota"] == 0
    assert status["subscribed"] is True, "订阅行保留（admin 累计口径不变）"

    row = _project_sub_row(session, "cancel-atomic", project.id)
    assert row.price_change_quota == 0
    assert row.cancelled_at is not None

    with pytest.raises(ResourceNotFoundError):
        svc.cancel_project_subscription("cancel-atomic", 999999)


# =========================================================================
# H4 草稿转发布同次改价
# =========================================================================


def test_h4_first_publish_with_price_change_is_new_listing_only(seeded_db: dict[str, Any]) -> None:
    """同一次 PUT「草稿→发布 + 改价」→ 仅上新信号：无调价历史、无调价信号."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9401, publish_status=PublishStatus.DRAFT, total_price=268)

    result = MarketingProjectService(session).update_project(
        project.id,
        L4MarketingProjectUpdate(publish_status=PublishStatus.PUBLISHED, total_price=269),
    )

    assert result is not None
    updated, signal = result
    assert updated.publish_status == PublishStatus.PUBLISHED
    assert signal.is_new_listing is True, "首次发布应产出上新信号"
    assert signal.price_signal is None, "首次发布同次改价不得产出调价信号（否则同一房源上新+调价双推）"
    assert updated.published_at is not None

    # 从未对外公开过的草稿价不得成为「调价前价格」
    changes = (
        session.query(L4MarketingPriceChange).filter(L4MarketingPriceChange.marketing_project_id == project.id).all()
    )
    assert changes == [], "不得写入伪调价历史"


def test_h4_first_publish_without_price_change_still_new_listing(seeded_db: dict[str, Any]) -> None:
    """纯草稿转发布（不改价）→ 仅上新（防修过头把上新也一起关掉）."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9404, publish_status=PublishStatus.DRAFT, total_price=268)

    result = MarketingProjectService(session).update_project(
        project.id,
        L4MarketingProjectUpdate(publish_status=PublishStatus.PUBLISHED),
    )
    assert result is not None
    _, signal = result
    assert signal.is_new_listing is True
    assert signal.price_signal is None


def test_h4_price_change_still_recorded_for_published_project(seeded_db: dict[str, Any]) -> None:
    """已发布房源后续改价：仍写调价历史并产出调价信号（正常路径未被禁掉）."""
    session: Session = seeded_db["session"]
    project = _make_project(
        session,
        project_id=9402,
        publish_status=PublishStatus.PUBLISHED,
        total_price=300,
        published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )

    result = MarketingProjectService(session).update_project(project.id, L4MarketingProjectUpdate(total_price=290))
    assert result is not None
    _, signal = result

    assert signal.is_new_listing is False, "已发布且 published_at 已存在 → 不再算上新"
    assert signal.price_signal is not None
    assert signal.price_signal["old_price"] == pytest.approx(300)
    assert signal.price_signal["new_price"] == pytest.approx(290)
    assert signal.price_signal["price_change_id"] is not None

    change = (
        session.query(L4MarketingPriceChange).filter(L4MarketingPriceChange.marketing_project_id == project.id).one()
    )
    assert change.direction == "down"
    assert float(change.old_price) == pytest.approx(300)
    assert float(change.new_price) == pytest.approx(290)


def test_h4_same_price_update_produces_no_signal(seeded_db: dict[str, Any]) -> None:
    """同值 PUT：既不上新也不调价（回归既有语义）."""
    session: Session = seeded_db["session"]
    project = _make_project(
        session,
        project_id=9403,
        publish_status=PublishStatus.PUBLISHED,
        total_price=300,
        published_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )

    result = MarketingProjectService(session).update_project(project.id, L4MarketingProjectUpdate(total_price=300))
    assert result is not None
    _, signal = result
    assert signal.price_signal is None
    assert signal.is_new_listing is False


# =========================================================================
# H5 keyset 分页全量覆盖（不再静默截断）
# =========================================================================


def test_h5_fetch_subscribers_covers_more_than_one_page(seeded_db: dict[str, Any]) -> None:
    """订阅者数 > 单页上限 → 分页取完，不静默丢弃尾部（修复前 limit 截断）."""
    session: Session = seeded_db["session"]
    total = _MAX_BATCH + 7
    expected: set[str] = set()
    for i in range(total):
        uid = f"batch-user-{i}"
        _make_channel_sub(session, user_id=uid, openid=f"op-{i}", new_quota=1)
        expected.add(uid)
    session.flush()

    rows = _fetch_subscribers(session, L4MarketingSubscription.new_listing_quota)

    assert len(rows) == total, f"应覆盖全部 {total} 个订阅者，实际 {len(rows)}（尾部被截断=静默漏推）"
    assert {r.user_id for r in rows} == expected


def test_h5_price_change_recipients_cover_all_channel_users(seeded_db: dict[str, Any]) -> None:
    """调价收件人同样分页覆盖频道级全部命中行（含取消者被排除后的计数校验）."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9502)
    total = _MAX_BATCH + 3
    for i in range(total):
        _make_channel_sub(session, user_id=f"pc-user-{i}", openid=f"pc-op-{i}", price_quota=1)
    # 其中 2 人显式取消该房源
    for uid in ("pc-user-0", "pc-user-1"):
        _make_project_sub(
            session,
            user_id=uid,
            project_id=project.id,
            openid="pc-op-x",
            price_quota=0,
            cancelled_at=datetime.now(timezone.utc),
        )
    session.flush()

    recipients = _fetch_price_change_recipients(session, project.id)

    assert len(recipients) == total - 2, "全量覆盖且排除已取消者"
    got = {r.user_id for r in recipients}
    assert "pc-user-0" not in got
    assert "pc-user-1" not in got
    assert len(got) == total - 2


# =========================================================================
# 通知主流程 + M7
# =========================================================================


def test_notify_new_listing_sends_and_decrements(
    seeded_db: dict[str, Any],
    send_mock: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """上新通知：逐订阅者发送、送达后原子扣额度、写 success 留痕."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    project = _make_project(session, project_id=9601, total_price=428.5)
    sub = _make_channel_sub(session, user_id="nl-user", openid="op-nl", new_quota=2)

    _notify_projects_published(session, project.id)

    assert len(send_mock) == 1
    assert send_mock[0]["template_id"] == _NEW_TMPL
    assert send_mock[0]["page"] == f"pages/projects/detail/index?id={project.id}"
    assert send_mock[0]["openid"] == "op-nl"
    session.refresh(sub)
    assert sub.new_listing_quota == 1, "送达成功后应扣 1"

    logs = session.query(L4MarketingNotifyLog).filter(L4MarketingNotifyLog.notify_type == "new_listing").all()
    assert [log_row.send_status for log_row in logs] == [SendStatus.SUCCESS.value]
    assert logs[0].price_change_id is None
    assert logs[0].sub_source is None, "上新通知无来源轨概念"


def test_notify_skipped_does_not_decrement(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """微信 43101（未授权）→ 留痕 skipped 且不扣额度（授权保留）."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    monkeypatch.setattr(
        notify_mod.WeChatAuthService,
        "send_subscribe_message",
        staticmethod(lambda *a, **kw: (43101, None)),
    )
    project = _make_project(session, project_id=9602)
    sub = _make_channel_sub(session, user_id="skip-user", openid="op-skip", new_quota=3)

    _notify_projects_published(session, project.id)

    session.refresh(sub)
    assert sub.new_listing_quota == 3, "未送达不得扣额度"
    log = session.query(L4MarketingNotifyLog).one()
    assert log.send_status == SendStatus.SKIPPED.value
    assert log.error_msg == "errcode=43101"


def test_notify_price_change_routes_decrement_by_source_track(
    seeded_db: dict[str, Any],
    send_mock: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """调价通知：房源级命中只扣房源级额度、频道级命中只扣频道级额度；留痕带 sub_source."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    project = _make_project(session, project_id=9603, total_price=299)
    chan = _make_channel_sub(session, user_id="chan-track", openid="op-chan", price_quota=2)
    proj = _make_project_sub(session, user_id="proj-track", project_id=project.id, openid="op-proj", price_quota=1)

    signal = notify_mod.PriceSignal(old_price=300.0, new_price=299.0, price_change_id=None)
    _notify_project_price_changed(session, project.id, signal)

    assert len(send_mock) == 2
    session.refresh(chan)
    session.refresh(proj)
    assert chan.price_change_quota == 1, "频道级命中扣频道级额度"
    assert proj.price_change_quota == 0, "房源级命中扣房源级额度"

    logs = {log_row.user_id: log_row for log_row in session.query(L4MarketingNotifyLog).all()}
    assert logs["chan-track"].sub_source == "channel"
    assert logs["proj-track"].sub_source == "project"
    assert all(log_row.send_status == SendStatus.SUCCESS.value for log_row in logs.values())

    # 模板字段齐备（漏字段会触发微信 47003）
    assert set(send_mock[0]["data"]) == {"thing1", "phrase7", "thing4", "amount8"}
    assert send_mock[0]["data"]["amount8"]["value"] == "299.0"


def test_notify_price_change_sends_once_when_user_on_both_tracks(
    seeded_db: dict[str, Any],
    send_mock: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """同一用户双轨命中：只发一条、只扣房源级一处额度."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    project = _make_project(session, project_id=9604, total_price=290)
    chan = _make_channel_sub(session, user_id="dual-user", openid="op-dual", price_quota=5)
    proj = _make_project_sub(session, user_id="dual-user", project_id=project.id, openid="op-dual", price_quota=1)

    _notify_project_price_changed(
        session,
        project.id,
        notify_mod.PriceSignal(old_price=295.0, new_price=290.0, price_change_id=7),
    )

    assert len(send_mock) == 1
    session.refresh(chan)
    session.refresh(proj)
    assert chan.price_change_quota == 5, "频道级额度不应被动"
    assert proj.price_change_quota == 0
    log = session.query(L4MarketingNotifyLog).one()
    assert log.price_change_id == 7
    assert log.sub_source == "project"


def test_notify_cancelled_user_not_sent_but_others_are(
    seeded_db: dict[str, Any],
    send_mock: list[dict[str, Any]],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """H2 端到端：已取消用户收不到该房源调价推送，同房源其他频道订阅者照常收到且扣额度."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    project = _make_project(session, project_id=9607, total_price=250)
    cancelled = _make_channel_sub(session, user_id="cancel-e2e", openid="op-cancel-e2e", price_quota=4)
    normal = _make_channel_sub(session, user_id="normal-e2e", openid="op-normal", price_quota=1)
    _make_project_sub(
        session,
        user_id="cancel-e2e",
        project_id=project.id,
        openid="op-cancel-e2e",
        price_quota=0,
        cancelled_at=datetime.now(timezone.utc),
    )

    _notify_project_price_changed(
        session,
        project.id,
        notify_mod.PriceSignal(old_price=260.0, new_price=250.0, price_change_id=None),
    )

    assert [c["openid"] for c in send_mock] == ["op-normal"], "已取消用户不得被发送"
    session.refresh(cancelled)
    session.refresh(normal)
    assert cancelled.price_change_quota == 4, "取消不影响其频道级额度（其他房源仍可推）"
    assert normal.price_change_quota == 0


def test_m7_openid_not_logged_in_full(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """发送异常时日志只带 openid 前缀摘要，不落完整个人标识."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)

    _net_error = "网络异常"

    def boom(*a: Any, **kw: Any) -> tuple[int, str | None]:
        raise RuntimeError(_net_error)

    monkeypatch.setattr(notify_mod.WeChatAuthService, "send_subscribe_message", staticmethod(boom))
    project = _make_project(session, project_id=9605)
    sub = _make_channel_sub(session, user_id="m7-user", openid=_FULL_OPENID, new_quota=1)

    with caplog.at_level(logging.ERROR):
        _notify_projects_published(session, project.id)

    text = caplog.text
    assert _FULL_OPENID not in text, "完整 openid 不得进入日志"
    assert f"{_FULL_OPENID[:8]}***" in text
    # 异常被吞在循环内：留痕 failed、额度不扣
    log = session.query(L4MarketingNotifyLog).one()
    assert log.send_status == SendStatus.FAILED.value
    session.refresh(sub)
    assert sub.new_listing_quota == 1


def test_notify_template_missing_skips_silently(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    send_mock: list[dict[str, Any]],
) -> None:
    """模板未配置：不发送、不留痕（功能关闭态）."""
    session: Session = seeded_db["session"]
    monkeypatch.setattr(settings, "wechat_project_new_template_id", "", raising=False)
    project = _make_project(session, project_id=9606)
    sub = _make_channel_sub(session, user_id="no-tmpl", openid="op-no", new_quota=3)

    _notify_projects_published(session, project.id)

    assert send_mock == []
    assert session.query(L4MarketingNotifyLog).count() == 0
    session.refresh(sub)
    assert sub.new_listing_quota == 3


def test_report_result_dedup_prevents_quota_farm(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """同一请求重复携带同一模板 ID → 按一次授权计（防单请求刷额度）."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    user = _make_customer(session, user_id="dedup-user", openid="op-dedup")

    quotas = MarketingSubscriptionService(session).report_result(
        user.id,
        [(_NEW_TMPL, "accept"), (_NEW_TMPL, "accept"), (_NEW_TMPL, "accept")],
    )
    assert quotas["new_listing_quota"] == 1


def test_report_result_rejects_non_accept_status(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """非 accept（reject/ban/filter）不累计额度；未知模板 ID 静默忽略."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    user = _make_customer(session, user_id="reject-user", openid="op-reject")
    svc = MarketingSubscriptionService(session)

    for status in ("reject", "ban", "filter"):
        quotas = svc.report_result(user.id, [(_NEW_TMPL, status)])
        assert quotas["new_listing_quota"] == 0, f"{status} 不应计额度"

    quotas = svc.report_result(user.id, [("unknown-template-id", "accept")])
    assert quotas["new_listing_quota"] == 0

    # 累计仍只认 accept
    assert svc.report_result(user.id, [(_NEW_TMPL, "accept")])["new_listing_quota"] == 1


def test_notify_logs_price_change_index_and_grouped_counts(seeded_db: dict[str, Any]) -> None:
    """时间线按 price_change_id 分组统计三态计数（回归聚合口径，不含无关留痕）."""
    session: Session = seeded_db["session"]
    project = _make_project(session, project_id=9700)
    change = L4MarketingPriceChange(
        marketing_project_id=project.id,
        old_price=300,
        new_price=290,
        direction="down",
    )
    session.add(change)
    session.flush()

    for i, status in enumerate(("success", "success", "skipped", "failed")):
        session.add(
            L4MarketingNotifyLog(
                user_id=f"tl-user-{i}",
                marketing_project_id=project.id,
                notify_type="price_change",
                template_id=_PRICE_TMPL,
                send_status=status,
                price_change_id=change.id,
            ),
        )
    # 无关留痕：另一条调价记录 + 上新留痕（price_change_id 为 NULL）
    session.add(
        L4MarketingNotifyLog(
            user_id="tl-noise",
            marketing_project_id=project.id,
            notify_type="new_listing",
            template_id=_NEW_TMPL,
            send_status="success",
        ),
    )
    session.flush()

    items, total = MarketingProjectService(session).get_price_change_timeline(project.id)

    assert total == 1
    assert items[0].notify_success == 2
    assert items[0].notify_skipped == 1
    assert items[0].notify_failed == 1
    # 全局统计走同一表：确认 count 未被留痕污染
    stats = MarketingSubscriptionService(session).get_global_stats()
    assert stats.project_level_watches == 0
    assert stats.total_subscribers == int(session.query(func.count(L4MarketingSubscription.id)).scalar() or 0)


# =========================================================================
# M2 通知循环 N+1（自校验设计：同一段测量分别跑"已修入口"与"未修主体"）
# =========================================================================


class _BorrowedSessionCtx:
    """假 SessionLocal：产出传入的会话且**不 close**（保住 conftest 的 savepoint 会话）."""

    def __init__(self, session: Session) -> None:
        self._session = session

    def __call__(self) -> "_BorrowedSessionCtx":
        return self

    def __enter__(self) -> Session:
        return self._session

    def __exit__(self, *exc: object) -> bool:
        return False


def _make_recorder(sink: list[str]):
    """构造记录 openid 并恒返回 errcode=0（受理成功）的假 send_subscribe_message."""

    def _send(openid: str, *args: Any, **kwargs: Any) -> tuple[int, str | None]:
        sink.append(openid)
        return 0, None

    return _send


def _measure_selects(session: Session, *, via_wrapper: bool, base_project_id: int) -> tuple[int, int]:
    """分别在 1 个与 5 个收件人下跑上新通知，返回两次的 SELECT 条数.

    Args:
        session: conftest 提供的 savepoint 隔离会话.
        via_wrapper: 是否经 notify_projects_published 入口（True=修复后行为）.
        base_project_id: 本组两个房源的项目 ID 起点（避开其他用例的 ID 段）.

    说明：
        via_wrapper: True 走 notify_projects_published 入口（专用会话上设
            expire_on_commit=False，即修复后行为）；
            False 直接调 _notify_projects_published 主体并保持会话默认 True，
            等价于修复前行为（作为对照组，证明本用例的测量本身有效）。

    """
    selects: list[str] = []

    def _capture(conn, cursor, statement, params, context, executemany):
        if statement.lstrip().upper().startswith("SELECT"):
            selects.append(statement)

    engine = session.get_bind()
    event.listen(engine, "before_cursor_execute", _capture)
    saved_factory = notify_mod.SessionLocal
    saved_send = notify_mod.WeChatAuthService.send_subscribe_message
    saved_expiry = session.expire_on_commit
    try:
        counts: list[int] = []
        for offset, n in enumerate((1, 5)):
            project_id = base_project_id + offset
            _make_project(session, project_id=project_id, total_price=400)
            for i in range(n):
                _make_channel_sub(session, user_id=f"nplus-{project_id}-{i}", openid=f"op-{i}", new_quota=1)
            session.flush()

            sends: list[str] = []
            notify_mod.WeChatAuthService.send_subscribe_message = staticmethod(_make_recorder(sends))
            session.expire_on_commit = True
            selects.clear()
            if via_wrapper:
                # 入口自建会话：换成借用的测试会话（不 close），由入口设置 expire_on_commit
                notify_mod.SessionLocal = _BorrowedSessionCtx(session)
                try:
                    notify_mod.notify_projects_published(project_id)
                finally:
                    notify_mod.SessionLocal = saved_factory
            else:
                notify_mod._notify_projects_published(session, project_id)

            assert len(sends) == n, f"通知未跑完（期望 {n} 次发送，实际 {len(sends)}）"
            counts.append(len(selects))
        return counts[0], counts[1]
    finally:
        event.remove(engine, "before_cursor_execute", _capture)
        notify_mod.SessionLocal = saved_factory
        notify_mod.WeChatAuthService.send_subscribe_message = saved_send
        session.expire_on_commit = saved_expiry


def test_m2_notify_wrapper_removes_per_recipient_selects(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """经入口路径：SELECT 总数不随收件人数增长（N+1 已消除）.

    自校验设计：同一段测量分别跑"修后入口"与"修前主体"两条路径。若两者斜率相同，
    说明测量本身失效（会得到假绿），因此同时断言「修后平坦」与「修前随人数上升」。
    """
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)

    fixed_small, fixed_large = _measure_selects(session, via_wrapper=True, base_project_id=9801)
    before_small, before_large = _measure_selects(session, via_wrapper=False, base_project_id=9901)

    fixed_delta = fixed_large - fixed_small
    before_delta = before_large - before_small

    # 多 4 个收件人：修复后应几乎不增；修复前每个收件人都因 commit 过期而重载
    assert fixed_delta <= 2, f"入口路径仍有 N+1：+4 收件人导致 +{fixed_delta} 条 SELECT"
    assert before_delta >= 4, f"对照组未体现 N+1（+4 收件人仅 +{before_delta} 条）——测量失效，无法证明修复有效"
    assert before_delta > fixed_delta, "修复后斜率必须低于修复前"


# =========================================================================
# 43101 失同步排障增强（2026-10-09 泗塘五村排查报告 §5）：errmsg 留痕 + 出入口日志 + 失同步统计
# =========================================================================


def test_notify_skipped_errmsg_land_in_notify_log(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """43101 skipped 留痕 error_msg 透传微信 errmsg（含 rid），排障一手证据入库.

    mock 发送器返回 (errcode, errmsg) 元组（对齐真实发送器签名，2026-10-09
    评审修复：errmsg 随返回值传递，非共享快照）。
    """
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    monkeypatch.setattr(
        notify_mod.WeChatAuthService,
        "send_subscribe_message",
        staticmethod(lambda *a, **kw: (43101, "user refuse to accept the msg rid: rid-test-0001")),
    )
    project = _make_project(session, project_id=9604)
    _make_channel_sub(session, user_id="errmsg-user", openid="op-errmsg", new_quota=2)

    _notify_projects_published(session, project.id)

    log = session.query(L4MarketingNotifyLog).one()
    assert log.send_status == SendStatus.SKIPPED.value
    assert "errcode=43101" in log.error_msg
    assert "rid-test-0001" in log.error_msg


def test_notify_skipped_errmsg_no_cross_recipient_mixing(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """多收件人并发发送时 errmsg 按收件人对位，不串档（竞态回归）.

    旧行为（模块级共享快照）：主线程读快照 → 多收件人 skipped 留痕拿到同一条
    最后写入者的 errmsg。新行为：errmsg 随 send 返回值按收件人对位。
    """
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)

    def fake_send_per_openid(
        openid: str,
        template_id: str,
        data: dict,
        page: str | None = None,
    ) -> tuple[int, str | None]:
        # 每个 openid 独立的 errmsg（含 openid 尾椎以区分串档）
        return 43101, f"user refuse rid: for-{openid[-4:]}"

    monkeypatch.setattr(
        notify_mod.WeChatAuthService,
        "send_subscribe_message",
        staticmethod(fake_send_per_openid),
    )
    project = _make_project(session, project_id=9607)
    users = [(f"mix-{i}", f"op-mix-{i:04d}") for i in range(6)]
    for uid, oid in users:
        _make_channel_sub(session, user_id=uid, openid=oid, new_quota=1)

    _notify_projects_published(session, project.id)

    logs = session.query(L4MarketingNotifyLog).all()
    assert len(logs) == 6
    errmsg_by_user = {log.user_id: log.error_msg for log in logs}
    for uid, oid in users:
        # 每条留痕的 errmsg 必须是该收件人自己的（未被他收件人覆盖）
        assert errmsg_by_user[uid] == f"errcode=43101 user refuse rid: for-{oid[-4:]}", uid


def test_notify_skipped_errmsg_fallback_without_snapshot(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """发送器返回 errmsg 为 None 时留痕回退纯 errcode 文案（元组解包兼容）."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    monkeypatch.setattr(
        notify_mod.WeChatAuthService,
        "send_subscribe_message",
        staticmethod(lambda *a, **kw: (43101, None)),
    )
    project = _make_project(session, project_id=9605)
    _make_channel_sub(session, user_id="fallback-user", openid="op-fallback", new_quota=2)

    _notify_projects_published(session, project.id)

    log = session.query(L4MarketingNotifyLog).one()
    assert log.error_msg == "errcode=43101"


def test_notify_task_logs_start_and_summary(
    seeded_db: dict[str, Any],
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """上新通知出入口日志成对出现（排障基准：范围/配置来源/结果汇总）."""
    session: Session = seeded_db["session"]
    _seed_template_env(monkeypatch)
    monkeypatch.setattr(
        notify_mod.WeChatAuthService,
        "send_subscribe_message",
        staticmethod(lambda *a, **kw: (0, None)),
    )
    project = _make_project(session, project_id=9606)
    _make_channel_sub(session, user_id="log-user", openid="op-log", new_quota=1)

    with caplog.at_level(logging.INFO, logger="services.marketing.notify"):
        _notify_projects_published(session, project.id)

    messages = [r.getMessage() for r in caplog.records]
    assert any("上新通知开始推送" in m and "收件人=1人" in m for m in messages)
    assert any("上新通知推送完成" in m and "成功=1" in m for m in messages)


def test_stats_out_of_sync_counts_latest_43101_with_quota(
    seeded_db: dict[str, Any],
) -> None:
    """失同步统计：最近留痕 43101+有额度 计入；success 后消除；额度 0 不计."""
    session: Session = seeded_db["session"]
    base = datetime.now(timezone.utc)

    # A：最新留痕 43101 skipped 且有额度 → 失同步
    _make_channel_sub(session, user_id="oos-a", openid="op-a", new_quota=2)
    session.add(
        L4MarketingNotifyLog(
            user_id="oos-a",
            marketing_project_id=1,
            notify_type="new_listing",
            template_id=_NEW_TMPL,
            send_status=SendStatus.SKIPPED.value,
            error_msg="errcode=43101 user refuse to accept the msg rid: r-a",
            created_at=base,
        ),
    )
    # B：先 43101 后成功（最新一条 success）→ 不计
    _make_channel_sub(session, user_id="oos-b", openid="op-b", price_quota=1)
    session.add(
        L4MarketingNotifyLog(
            user_id="oos-b",
            marketing_project_id=1,
            notify_type="price_change",
            template_id=_PRICE_TMPL,
            send_status=SendStatus.SKIPPED.value,
            error_msg="errcode=43101",
            created_at=base,
        ),
    )
    session.add(
        L4MarketingNotifyLog(
            user_id="oos-b",
            marketing_project_id=1,
            notify_type="price_change",
            template_id=_PRICE_TMPL,
            send_status=SendStatus.SUCCESS.value,
            created_at=base.replace(minute=base.minute + 1),
        ),
    )
    # C：最新留痕 43101 但本地额度已归零（额度被消费/无额度）→ 不计
    _make_channel_sub(session, user_id="oos-c", openid="op-c", new_quota=0)
    session.add(
        L4MarketingNotifyLog(
            user_id="oos-c",
            marketing_project_id=1,
            notify_type="new_listing",
            template_id=_NEW_TMPL,
            send_status=SendStatus.SKIPPED.value,
            error_msg="errcode=43101",
            created_at=base,
        ),
    )
    # D：从未有过留痕的用户（新订阅未经历推送）→ 不计
    _make_channel_sub(session, user_id="oos-d", openid="op-d", new_quota=5)
    session.flush()

    stats = MarketingSubscriptionService(session).get_global_stats()

    assert stats.out_of_sync_subscribers == 1, "仅 A（最新留痕 43101+有额度）应计入"
