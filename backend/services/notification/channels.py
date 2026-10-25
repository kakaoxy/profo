"""渠道适配器（迭代二 SPEC §7.3）.

两类渠道：
- ``in_app``：站内信落库（在 ``NotificationService.emit`` 内完成，不走本模块）；
- ``wechat``：微信订阅消息，**best-effort**（K1）——任何失败都不得回滚业务、
  不得让 API 失败，只写 ``notification_delivery_logs`` 并在收件行上留状态快照。
"""

import logging
from dataclasses import dataclass
from typing import Literal

from sqlalchemy.orm import Session

from services.notification.events import EventSpec
from services.system import subscribe_templates
from services.system.openid import resolve_user_openids
from services.system.wechat import WeChatAuthService

logger = logging.getLogger(__name__)

DeliveryStatus = Literal["success", "skipped", "failed"]

# 错误码（与前端投递状态点的 tooltip 一一对应）
ERR_TEMPLATE_MISSING = "TEMPLATE_MISSING"
ERR_NO_OPENID = "NO_OPENID"
ERR_WECHAT_ERROR = "WECHAT_ERROR"

# 分类 → 模板 key（None = 该分类无独立模板，微信渠道直接跳过）
_CATEGORY_TEMPLATE_KEY: dict[str, str | None] = {
    "lead": "valuation_price",
    "growth": "customer_lead",
    "project": None,
    "key": None,
    "marketing": "project_new",
    "finance": None,
    "system": None,
    "security": None,
}

# 小程序跳转页（按分类区分；route 类型走 H5 地址，不适用）
_MINIAPP_PAGE: dict[str, str] = {
    "lead": "pages/valuation/detail/index",
    "growth": "pages/customers/mine/index",
    "marketing": "pages/project/detail/index",
}

# 微信 thing 字段长度上限（超长触发 47003）
_THING_MAX_LEN = 20


@dataclass(frozen=True, slots=True)
class ChannelResult:
    """单次渠道投递结果."""

    status: DeliveryStatus
    error_code: str | None = None
    error_message: str | None = None


def send_wechat(
    db: Session,
    *,
    user_id: str,
    spec: EventSpec,
    title: str,
    body: str | None,
    dedupe_fields: dict[str, str],
) -> ChannelResult:
    """向单个用户发送微信订阅消息（**绝不抛异常**）.

    Args:
        db: 数据库会话
        user_id: 收件人
        spec: 事件规格（决定模板与跳转页）
        title: 已渲染的标题
        body: 已渲染的正文
        dedupe_fields: 去重字段（用于拼小程序页 query）

    Returns:
        渠道结果（success / skipped / failed + 错误码）。

    """
    template_key = _CATEGORY_TEMPLATE_KEY.get(spec.category)
    if template_key is None:
        # 该分类无独立模板（project/key/finance/system/security）→ 明确跳过
        return ChannelResult(status="skipped", error_code=ERR_TEMPLATE_MISSING)

    try:
        template_id = subscribe_templates.resolve_template_id(db, template_key)
    except Exception:
        logger.exception("解析微信模板失败：category=%s", spec.category)
        return ChannelResult(status="failed", error_code=ERR_WECHAT_ERROR)

    if not template_id:
        return ChannelResult(status="skipped", error_code=ERR_TEMPLATE_MISSING)

    try:
        openids = resolve_user_openids(db, user_id)
    except Exception:
        logger.exception("解析 openid 失败：user_id=%s", user_id)
        return ChannelResult(status="failed", error_code=ERR_WECHAT_ERROR)

    if not openids:
        return ChannelResult(status="skipped", error_code=ERR_NO_OPENID)

    data = _build_wechat_data(title=title, body=body)
    page = _build_miniapp_page(spec=spec, dedupe_fields=dedupe_fields)

    last_error: str | None = None
    for openid in openids:
        try:
            errcode, errmsg = WeChatAuthService.send_subscribe_message(openid, template_id, data, page=page)
        except Exception as exc:
            logger.exception("微信订阅消息发送异常：user_id=%s", user_id)
            last_error = str(exc)[:200]
            continue
        if errcode == 0:
            return ChannelResult(status="success")
        last_error = f"{errcode}:{errmsg or ''}"[:500]
        logger.warning("微信订阅消息返回非 0：user_id=%s errcode=%s", user_id, errcode)

    return ChannelResult(status="failed", error_code=ERR_WECHAT_ERROR, error_message=last_error)


def _build_wechat_data(*, title: str, body: str | None) -> dict[str, dict[str, str]]:
    """构造订阅消息 data（字段名对齐各模板的实际配置）.

    各模板字段结构不同：这里按模板常用的 ``thing1``（摘要）+ ``time2``（时间），
    与 ``services/growth_center/customer_notify.py`` 的既有口径保持一致。
    """
    from datetime import datetime
    from zoneinfo import ZoneInfo

    now = datetime.now(ZoneInfo("Asia/Shanghai"))
    summary = (title or "")[:_THING_MAX_LEN]
    detail = (body or "")[:_THING_MAX_LEN]
    return {
        "thing1": {"value": summary},
        "thing2": {"value": detail or summary},
        "time3": {"value": f"{now.year}年{now.month}月{now.day}日 {now.hour:02d}:{now.minute:02d}"},
    }


def _build_miniapp_page(*, spec: EventSpec, dedupe_fields: dict[str, str]) -> str | None:
    """构造小程序跳转页（含 query）；无对应页返回 None."""
    if spec.action_type != "miniapp":
        return None
    base = _MINIAPP_PAGE.get(spec.category)
    if base is None:
        return None
    target_id = dedupe_fields.get("id") or dedupe_fields.get("lead_id")
    if target_id:
        return f"{base}?id={target_id}"
    return base


__all__ = [
    "ERR_NO_OPENID",
    "ERR_TEMPLATE_MISSING",
    "ERR_WECHAT_ERROR",
    "ChannelResult",
    "DeliveryStatus",
    "send_wechat",
]
