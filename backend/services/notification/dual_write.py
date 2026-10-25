"""双写接线（迭代二 SPEC §5.2 / K17）.

**唯一收口点**：现有 4 条微信链路的旁路站内信双写全部经本模块，
保证「原逻辑一行不改、失败绝不影响主流程、单一开关可关闭」。

约定（K17 + SPEC §5.2）：
- 每个函数内部捕获全部异常，只 ``logger.exception``，**绝不外抛**；
- ``settings.notification_dual_write = False`` 时整体跳过（读能力保留）；
- 招募留资**只发** ``recruit.new_lead``，**不发** ``customer.new``
  （否则同一线索产生 2 条站内信，违反 G4/验收 A3）。
- 所有双写 emit 一律传 ``wechat=False``：微信仍由**原链路**发送，emit 若再发一次
  会对同一事件重复推送（冒烟脚本 ④ 断言这条不变量）。
"""

import logging
import uuid
from dataclasses import dataclass

from sqlalchemy.orm import Session

from services.notification import Audience, EventType
from services.notification.service import NotificationEvent, NotificationService
from settings import settings

logger = logging.getLogger(__name__)

# 获客模块 → 中文名（与 services/growth_center/customer_notify.py::_MODULE_LABELS 同值；
# 该符号为私有，故在双写层复制一份，避免跨模块依赖私有实现）
MODULE_LABELS: dict[str, str] = {
    "valuation": "估价",
    "booking": "预约",
    "sheet": "房源单",
    "recruit": "招募",
}


def _enabled() -> bool:
    """双写开关（每次调用读取，便于测试与热配置）."""
    return bool(settings.notification_dual_write)


def emit_customer_new(
    db: Session,
    *,
    module: str,
    lead_id: int | str,
    referrer_user_id: str | None,
    community: str,
    module_label: str,
) -> None:
    """#3 ``customer.new``：新客户线索（估价/房源单/预约三处留资）.

    Args:
        db: 数据库会话（调用方业务事务已 commit）
        module: 获客模块（valuation/booking/sheet）
        lead_id: 线索ID
        referrer_user_id: 归属员工ID（为空则跳过）
        community: 小区/标题摘要
        module_label: 模块中文名

    """
    if not _enabled() or not referrer_user_id:
        return
    try:
        NotificationService(db).emit(
            NotificationEvent(
                type=EventType.CUSTOMER_NEW,
                audience=Audience(user_ids=(referrer_user_id,)),
                fields={"module_label": module_label, "community": community or "未命名房源"},
                dedupe_fields={"module": module, "id": lead_id, "user_id": referrer_user_id},
                payload={"module": module, "lead_id": str(lead_id)},
                source_module=module,
                source_id=str(lead_id),
                wechat=False,
            )
        )
    except Exception:
        logger.exception("站内信双写失败（不影响微信与业务主流程）：customer.new lead_id=%s", lead_id)


def emit_customer_status_changed(
    db: Session,
    *,
    module: str,
    lead_id: int | str,
    referrer_user_id: str | None,
    status: str,
    status_label: str,
    community: str,
    module_label: str,
) -> None:
    """#4 ``customer.status_changed``：客户状态变更."""
    if not _enabled() or not referrer_user_id:
        return
    try:
        NotificationService(db).emit(
            NotificationEvent(
                type=EventType.CUSTOMER_STATUS_CHANGED,
                audience=Audience(user_ids=(referrer_user_id,)),
                fields={
                    "community": community or "未命名房源",
                    "status_label": status_label,
                    "module_label": module_label,
                },
                dedupe_fields={"module": module, "id": lead_id, "status": status},
                payload={"module": module, "lead_id": str(lead_id), "status": status},
                source_module=module,
                source_id=str(lead_id),
                wechat=False,
            )
        )
    except Exception:
        logger.exception("站内信双写失败：customer.status_changed lead_id=%s", lead_id)


def emit_recruit_new_lead(
    db: Session,
    *,
    lead_id: str,
    referrer_employee_id: str | None,
    summary: str,
) -> None:
    """#5 ``recruit.new_lead``：招募新线索（**招募链路唯一站内信来源**）."""
    if not _enabled() or not referrer_employee_id:
        return
    try:
        NotificationService(db).emit(
            NotificationEvent(
                type=EventType.RECRUIT_NEW_LEAD,
                audience=Audience(user_ids=(referrer_employee_id,)),
                fields={"summary": summary or "新推荐线索"},
                dedupe_fields={"lead_id": lead_id, "user_id": referrer_employee_id},
                payload={"lead_id": str(lead_id)},
                source_module="recruit",
                source_id=str(lead_id),
                wechat=False,
            )
        )
    except Exception:
        logger.exception("站内信双写失败：recruit.new_lead lead_id=%s", lead_id)


def emit_lead_assigned(
    db: Session,
    *,
    module: str,
    lead_id: str,
    assignee_id: str,
    assigner_id: str,
    assigner_name: str,
    community: str,
    status: str,
) -> None:
    """#1 ``lead.assigned``：线索被指派（复用获客中心既有指派端点，D-01）.

    Args:
        db: 数据库会话（调用方已 commit）
        module: 获客模块
        lead_id: 线索ID
        assignee_id: 被指派人
        assigner_id: 操作人
        assigner_name: 操作人显示名
        community: 线索摘要
        status: 当前统一状态值

    """
    if not _enabled() or not assignee_id:
        return
    try:
        NotificationService(db).emit(
            NotificationEvent(
                type=EventType.LEAD_ASSIGNED,
                audience=Audience(user_ids=(assignee_id,)),
                fields={
                    "community": community or "未命名线索",
                    "assigner": assigner_name or "同事",
                    "status": status,
                },
                dedupe_fields={"module": module, "id": lead_id, "user_id": assignee_id},
                payload={"module": module, "lead_id": str(lead_id), "assigner_id": assigner_id},
                source_module=module,
                source_id=str(lead_id),
                created_by=assigner_id,
                wechat=False,
            )
        )
    except Exception:
        logger.exception("站内信双写失败：lead.assigned lead_id=%s", lead_id)


def emit_lead_status_changed(
    db: Session,
    *,
    lead_id: str,
    owner_id: str | None,
    status: str,
    status_label: str,
    community: str,
    operator: str,
) -> None:
    """#2 ``lead.status_changed``：线索中心改状态（线索归属员工）."""
    if not _enabled() or not owner_id:
        return
    try:
        NotificationService(db).emit(
            NotificationEvent(
                type=EventType.LEAD_STATUS_CHANGED,
                audience=Audience(user_ids=(owner_id,)),
                fields={"community": community or "未命名线索", "status_label": status_label, "operator": operator},
                dedupe_fields={"id": lead_id, "status": status},
                payload={"lead_id": str(lead_id), "status": status},
                source_module="lead",
                source_id=str(lead_id),
                wechat=False,
            )
        )
    except Exception:
        logger.exception("站内信双写失败：lead.status_changed lead_id=%s", lead_id)


@dataclass(frozen=True, slots=True)
class C2AuditDelivery:
    """单个 C 端收件人的**真实**投递结果（由原发送链路回报，不得凭空写 success）."""

    user_id: str
    status: str  # success / skipped / failed（与 DELIVERY_STATUSES 同域）
    error_code: str | None = None


def _record_c2_audit(db: Session, *, deliveries: list[C2AuditDelivery]) -> None:
    """C 端事件投递审计的直写实现（单次批量 INSERT，一条 SQL）.

    **不走 ``NotificationService.emit``**：微信已由原链路发送完毕，经 emit 会
    再发一次（重复推送）。本函数只把原链路的**实际投递结果**落审计表——
    status 一律由调用方（发送循环）回报，绝不在此写死 success。

    ``notification_id`` 用同一个占位 UUID 串联本次事件的多收件人行，且**不建**
    ``notifications`` / ``notification_recipients`` 行（K6）。批量写同时避免
    逐收件人查询——营销推送一次涉及全部订阅用户，逐人会破坏
    ``test_m2_notify_wrapper_removes_per_recipient_selects`` 的零增长断言。

    Args:
        db: 数据库会话
        deliveries: 逐收件人的真实投递结果

    """
    from datetime import datetime, timezone

    from models import NotificationDeliveryLog

    if not deliveries:
        return
    batch_id = uuid.uuid4()
    now = datetime.now(timezone.utc)
    db.add_all(
        [
            NotificationDeliveryLog(
                notification_id=batch_id,
                user_id=item.user_id,
                channel="wechat",
                status=item.status,
                error_code=item.error_code,
                attempt=1,
                created_at=now,
            )
            for item in deliveries
        ]
    )
    db.commit()


def emit_marketing_audit(db: Session, *, deliveries: list[C2AuditDelivery]) -> None:
    """#10/#11 C 端营销事件：仅写投递审计，不建站内信（K6）.

    Args:
        db: 数据库会话
        deliveries: 本次推送中每个订阅用户的真实投递结果

    """
    if not _enabled():
        return
    try:
        _record_c2_audit(db, deliveries=deliveries)
    except Exception:
        db.rollback()
        logger.exception("C 端营销通知审计写入失败（不影响微信与业务）")


def emit_eval_price_audit(db: Session, *, delivery: C2AuditDelivery) -> None:
    """#12 ``lead.eval_price_changed``：仅写投递审计，不建站内信（K6）.

    与营销审计同一实现：微信已由原链路发送，这里只记录其真实结果。

    Args:
        db: 数据库会话
        delivery: 本次对线索提交人的投递结果

    """
    if not _enabled():
        return
    try:
        _record_c2_audit(db, deliveries=[delivery])
    except Exception:
        db.rollback()
        logger.exception("C 端通知审计写入失败（不影响微信与业务）")


__all__ = [
    "MODULE_LABELS",
    "C2AuditDelivery",
    "emit_customer_new",
    "emit_customer_status_changed",
    "emit_eval_price_audit",
    "emit_lead_assigned",
    "emit_lead_status_changed",
    "emit_marketing_audit",
    "emit_recruit_new_lead",
]
