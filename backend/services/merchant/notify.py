"""商户通知消费与投递（V09 REQ-M14-002/003/004）.

职责边界（BR-M14-024）：V05 负责扫描协议并生产到期事件，本模块只负责
「消费事件 → 解析收件人 → 调用统一通知中心投递」。拜访超期由本模块扫描
门店数据后投递。

收件人规则（R-V09-01/03/04 按建议口径）：
- 门店主体协议：门店归属员工 ``owner_employee_id``；
- 公司主体协议：公司联系人手机号匹配到的系统用户；
- 拜访超期：门店归属员工；
- 归属员工缺失/停用/无后台身份 → 转运营角色兜底；
- 无有效收件人 → 记录失败，由下一轮任务重试。

微信渠道本期关闭（R-V09-02：模板待确认）；全部只发站内信。
"""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from models.merchant import MerchantAgreement, MerchantCompany, MerchantStore, MerchantVisit
from models.user.user import User
from schemas.merchant.agreement import AgreementExpiringEvent
from schemas.merchant.notify import MerchantNotifyTypeStats
from services.notification.events import EventType
from services.notification.recipients import Audience, resolve_recipients
from services.notification.service import EmitResult, NotificationEvent, NotificationService
from utils.crypto import hash_phone

logger = logging.getLogger(__name__)

AGREEMENT_SIGNED = "signed"
STORE_STATUS_NORMAL = "normal"
OPERATOR_ROLE_CODE = "operator"
AGREEMENT_WINDOW_DAYS = 30
VISIT_OVERDUE_DAYS = 30
_MAX_ERRORS = 20
_ERROR_MAX_LEN = 200
_SHANGHAI = ZoneInfo("Asia/Shanghai")


def notify_agreement_expiring(
    db: Session,
    events: list[AgreementExpiringEvent],
    *,
    now: datetime | None = None,
) -> MerchantNotifyTypeStats:
    """消费 V05 协议到期事件并投递站内信（单条失败不中断整批）.

    Args:
        db: 数据库会话
        events: V05 ``scan_expiring`` 产生的事件
        now: 当前时间（测试注入；缺省 UTC now）

    Returns:
        扫描/生成/去重/跳过/失败统计。

    """
    current = _aware(now or datetime.now(timezone.utc))
    stats = MerchantNotifyTypeStats(scanned=len(events))
    service = NotificationService(db)
    router = _RecipientRouter(db)

    for event in events:
        try:
            agreement = db.query(MerchantAgreement).filter(MerchantAgreement.id == event.agreement_id).first()
            if not _agreement_still_expiring(agreement, current):
                stats.skipped += 1
                continue

            expire_date = run_date_of(agreement.expire_at)
            subject_name, audience = _agreement_subject(db, agreement, event, router)
            if not _has_recipient(db, audience):
                stats.failed += 1
                _append_error(stats, "NO_RECIPIENT: 无有效收件人（agreement_id=" + event.agreement_id + "）")
                continue
            result = service.emit(
                NotificationEvent(
                    type=EventType.MERCHANT_AGREEMENT_EXPIRING,
                    audience=audience,
                    fields={
                        "agreement_id": event.agreement_id,
                        "subject_name": subject_name,
                        "expire_date": expire_date,
                    },
                    dedupe_fields={"agreement_id": event.agreement_id, "expire_date": expire_date},
                    payload={
                        "agreement_id": event.agreement_id,
                        "subject_type": agreement.subject_type,
                        "store_id": event.store_id,
                        "company_id": event.company_id,
                    },
                    source_module="merchant",
                    source_id=event.agreement_id,
                ),
            )
            _count_result(stats, result, "agreement_id=" + event.agreement_id)
        except Exception as exc:
            # 单条失败必须隔离，整批继续（BR-M14-023）
            db.rollback()
            _record_failure(stats, exc, "agreement_id=" + event.agreement_id)
            logger.exception("协议到期通知投递失败 agreement_id=%s", event.agreement_id)

    return stats


def notify_visit_overdue(
    db: Session,
    *,
    days: int = VISIT_OVERDUE_DAYS,
    now: datetime | None = None,
) -> MerchantNotifyTypeStats:
    """扫描正常门店，最近拜访超过 N 天时提醒归属员工.

    ``last_visit_at`` 为空时取该门店最早拜访记录时间（R-V09-03）；
    无任何拜访记录的门店不发送。

    Args:
        db: 数据库会话
        days: 超期天数阈值（默认 30）
        now: 当前时间（测试注入）

    Returns:
        扫描/生成/去重/跳过/失败统计。

    """
    current = _aware(now or datetime.now(timezone.utc))
    stores = (
        db.query(MerchantStore)
        .filter(
            MerchantStore.status == STORE_STATUS_NORMAL,
            MerchantStore.is_deleted.is_(False),
        )
        .all()
    )
    stats = MerchantNotifyTypeStats(scanned=len(stores))
    earliest = _earliest_visits(db, [store.id for store in stores if store.last_visit_at is None])
    service = NotificationService(db)
    router = _RecipientRouter(db)

    for store in stores:
        anchor = store.last_visit_at or earliest.get(store.id)
        if anchor is None:
            stats.skipped += 1
            continue
        if current - _aware(anchor) <= timedelta(days=days):
            stats.skipped += 1
            continue

        last_visit_date = run_date_of(anchor)
        try:
            audience = router.for_user(store.owner_employee_id)
            if not _has_recipient(db, audience):
                stats.failed += 1
                _append_error(stats, "NO_RECIPIENT: 无有效收件人（store_id=" + store.id + "）")
                continue
            result = service.emit(
                NotificationEvent(
                    type=EventType.MERCHANT_VISIT_OVERDUE,
                    audience=audience,
                    fields={
                        "store_id": store.id,
                        "store_name": store.store_name,
                        "last_visit_date": last_visit_date,
                    },
                    dedupe_fields={"store_id": store.id, "last_visit_date": last_visit_date},
                    payload={
                        "store_id": store.id,
                        "owner_employee_id": store.owner_employee_id,
                    },
                    source_module="merchant",
                    source_id=store.id,
                ),
            )
            _count_result(stats, result, "store_id=" + store.id)
        except Exception as exc:
            # 单条失败必须隔离，整批继续（BR-M14-023）
            db.rollback()
            _record_failure(stats, exc, "store_id=" + store.id)
            logger.exception("门店拜访超期通知投递失败 store_id=%s", store.id)

    return stats


class _RecipientRouter:
    """把业务归属人解析成通知收件范围（缺失/停用 → 运营兜底）.

    单次任务内缓存解析结果，避免同一员工/公司被重复查询。
    """

    def __init__(self, db: Session) -> None:
        self.db = db
        self._cache: dict[str | None, Audience] = {}

    def for_user(self, user_id: str | None) -> Audience:
        """归属员工（用户ID）有效则发给本人，否则转运营."""
        if user_id in self._cache:
            return self._cache[user_id]
        valid_ids = resolve_recipients(self.db, Audience(user_ids=(user_id,))) if user_id else []
        audience = Audience(user_ids=(user_id,)) if valid_ids else Audience(role_codes=(OPERATOR_ROLE_CODE,))
        self._cache[user_id] = audience
        return audience

    def for_company(self, company: MerchantCompany | None) -> Audience:
        """公司联系人手机号匹配系统用户；未匹配/无效 → 运营."""
        phone = company.contact_phone if company is not None else None
        if not phone:
            return self.for_user(None)
        matched = self.db.query(User).filter(User.phone_hash == hash_phone(phone)).first()
        return self.for_user(matched.id if matched is not None else None)


def _agreement_still_expiring(agreement: MerchantAgreement | None, current: datetime) -> bool:
    """协议必须仍为已签署且在到期前 30 天窗口内（AC-V09-002/016）."""
    if agreement is None or agreement.status != AGREEMENT_SIGNED or agreement.expire_at is None:
        return False
    expire_at = _aware(agreement.expire_at)
    return current < expire_at <= current + timedelta(days=AGREEMENT_WINDOW_DAYS)


def _agreement_subject(
    db: Session,
    agreement: MerchantAgreement,
    event: AgreementExpiringEvent,
    router: _RecipientRouter,
) -> tuple[str, Audience]:
    """解析协议主体名称与收件人."""
    if agreement.subject_type == "store" and agreement.store_id:
        store = db.query(MerchantStore).filter(MerchantStore.id == agreement.store_id).first()
        if store is not None:
            return store.store_name, router.for_user(store.owner_employee_id)
    company = (
        db.query(MerchantCompany).filter(MerchantCompany.id == agreement.company_id).first()
        if agreement.company_id
        else None
    )
    if company is not None:
        return company.company_name, router.for_company(company)
    return event.subject_name or "未知主体", router.for_user(None)


def _earliest_visits(db: Session, store_ids: list[str]) -> dict[str, datetime]:
    """批量取门店最早拜访时间（仅用于 ``last_visit_at`` 为空的门店）."""
    if not store_ids:
        return {}
    rows = db.execute(
        select(MerchantVisit.store_id, func.min(MerchantVisit.visited_at))
        .where(
            MerchantVisit.store_id.in_(store_ids),
            MerchantVisit.is_deleted.is_(False),
        )
        .group_by(MerchantVisit.store_id)
    ).all()
    return {row[0]: row[1] for row in rows if row[1] is not None}


def _has_recipient(db: Session, audience: Audience) -> bool:
    """投递前预解析收件人：为空即失败（AC「收件人不存在」），可下轮重试."""
    try:
        return bool(resolve_recipients(db, audience))
    except ValueError:
        return False


def _count_result(stats: MerchantNotifyTypeStats, result: EmitResult, context: str) -> None:
    """按投递结果累加统计（dedupe 命中计去重，全部关闭站内信计跳过）."""
    if result.created:
        stats.created += 1
    elif result.recipients:
        stats.deduped += 1
        logger.info("商户通知去重命中，跳过重复发送：%s", context)
    else:
        # 收件人存在但全部关闭 merchant 站内信：按用户偏好跳过，不算失败
        stats.skipped += 1
        logger.info("商户通知因收件人偏好关闭站内信而跳过：%s", context)


def _record_failure(stats: MerchantNotifyTypeStats, exc: Exception, context: str) -> None:
    """记录单条失败明细（脱敏，不含手机号等敏感字段）."""
    stats.failed += 1
    code = "TEMPLATE_MISSING" if isinstance(exc, ValueError) else "EMIT_FAILED"
    _append_error(stats, f"{code}:{type(exc).__name__}:{exc!s} ({context})")


def _append_error(stats: MerchantNotifyTypeStats, message: str) -> None:
    if len(stats.errors) < _MAX_ERRORS:
        stats.errors.append(message[:_ERROR_MAX_LEN])


def _aware(value: datetime) -> datetime:
    """统一为带时区时间（DB 返回值理论上已带时区，防御性兜底）."""
    return value if value.tzinfo is not None else value.replace(tzinfo=timezone.utc)


def run_date_of(current: datetime) -> str:
    """任务日期（业务时区 Asia/Shanghai）."""
    return _aware(current).astimezone(_SHANGHAI).date().isoformat()


__all__ = [
    "AGREEMENT_WINDOW_DAYS",
    "VISIT_OVERDUE_DAYS",
    "notify_agreement_expiring",
    "notify_visit_overdue",
    "run_date_of",
]
