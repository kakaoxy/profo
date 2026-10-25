"""统一通知服务（迭代二 SPEC §7.3）.

**调用约定（K2）**：``emit`` 必须在业务事务 ``commit`` **之后**调用；
调用方必须把 ``emit`` 包在 ``try/except Exception`` 内——站内信与微信都是
best-effort，任何失败都不得影响业务主流程。

**用户隔离（K7）**：所有查询在 SQL 层强制 ``user_id = 当前用户``；
按 ``notification_id`` 单条操作时先校验收件关系，非收件人返回 404（不用 403，
避免探测存在性）。
"""

import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import and_, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from models import Notification, NotificationDeliveryLog, NotificationRecipient
from services.notification.channels import ChannelResult, send_wechat
from services.notification.events import EventSpec, EventType, get_spec
from services.notification.preferences import allow, load_preferences_batch
from services.notification.recipients import Audience, resolve_recipients
from settings import settings

logger = logging.getLogger(__name__)

# 标题/正文最大长度（与模型列长度一致，超出截断而非报错）
_TITLE_MAX = 200
_BODY_MAX = 500


@dataclass(frozen=True, slots=True)
class NotificationEvent:
    """一次待投递事件.

    Attributes:
        type: 事件类型
        audience: 收件人范围（K3 必须非空）
        fields: 模板渲染字段（title/body 用）
        dedupe_fields: 去重键字段（dedupe_template 用）
        action_url: 覆盖默认跳转地址（可选）
        payload: 结构化附加数据（可选，落库到 notifications.payload）
        source_module: 来源模块（可选）
        source_id: 来源业务ID（可选）
        created_by: 触发人用户ID（可选）

    """

    type: EventType
    audience: Audience
    fields: dict[str, Any] = field(default_factory=dict)
    dedupe_fields: dict[str, Any] = field(default_factory=dict)
    action_url: str | None = None
    payload: dict[str, Any] | None = None
    source_module: str | None = None
    source_id: str | None = None
    created_by: str | None = None
    #: 微信渠道覆盖位：None = 按 EVENT_SPECS；False = 本次 emit **不发微信**。
    #: 双写场景必须传 False——原微信发送链路保持不动（K17 零回归），
    #: 若 emit 再发一次会对同一事件**重复推送**（微信一条 + 站内信一条变两条微信）。
    wechat: bool | None = None


@dataclass(frozen=True, slots=True)
class EmitResult:
    """一次事件投递结果."""

    notification_id: uuid.UUID
    created: bool
    recipients: int
    skipped: int
    audit_only: bool = False


@dataclass(frozen=True, slots=True)
class NotificationFilter:
    """列表筛选条件."""

    unread_only: bool = False
    category: str | None = None
    priority: str | None = None
    days: int | None = None


@dataclass(frozen=True, slots=True)
class NotificationRecord:
    """列表项（Service 层数据载体；与 schemas.notification.NotificationListItem 区分）."""

    id: uuid.UUID
    category: str
    type: str
    title: str
    body: str | None
    action_type: str | None
    action_url: str | None
    priority: str
    read_at: datetime | None
    created_at: datetime
    payload: dict[str, Any] | None
    delivery: dict[str, Any] | None


class NotificationService:
    """统一通知服务：事件 → 收件人 → 站内信 + 微信（best-effort）."""

    def __init__(self, db: Session) -> None:
        """初始化服务.

        Args:
            db: 数据库会话

        """
        self.db = db

    # ==================== 写入 ====================

    def emit(self, event: NotificationEvent) -> EmitResult:
        """创建通知并投递（调用方必须在业务事务 commit 之后调用）.

        Args:
            event: 事件对象

        Returns:
            EmitResult(notification_id, created, recipients, skipped, audit_only)。

        Raises:
            ValueError: audience 为空 / 未知事件类型 / dedupe 模板占位符未填充。

        """
        spec = get_spec(event.type)
        dedupe_key = self._render_dedupe(spec, event.dedupe_fields)
        title = self._render(spec.title_template, event.fields, _TITLE_MAX)
        body = self._render(spec.body_template, event.fields, _BODY_MAX) if spec.body_template else None
        users = resolve_recipients(self.db, event.audience)
        if not users:
            logger.debug("事件 %s 无有效收件人，跳过", spec.type)
            return EmitResult(notification_id=uuid.uuid4(), created=False, recipients=0, skipped=0)

        # 微信渠道开关：事件规格默认值（spec.wechat）可被 event.wechat 覆盖
        # （双写场景必须传 False —— 微信已由原链路发送，emit 再发一次即重复推送）。
        # 必须在 C 端分支之前定义：两条分支都读它。
        wechat_enabled = spec.wechat if event.wechat is None else event.wechat

        # C 端事件（K6）：不建站内信，只写投递审计
        if not spec.in_app:
            return self._emit_audit_only(
                spec=spec,
                users=users,
                title=title,
                body=body,
                dedupe_fields=event.dedupe_fields,
                wechat_enabled=wechat_enabled,
            )

        prefs_by_user = load_preferences_batch(self.db, users)
        in_app_users = [u for u in users if allow(prefs_by_user[u], spec.category, "in_app")]

        notification: Notification | None = None
        created = False
        if in_app_users:
            notification, created = self._upsert_notification(
                spec=spec,
                dedupe_key=dedupe_key,
                title=title,
                body=body,
                event=event,
            )
            if notification is not None and created:
                self._insert_recipients(notification.id, in_app_users)
            self.db.commit()

        notification_id = notification.id if notification is not None else uuid.uuid4()
        skipped_in_app = len(users) - len(in_app_users)

        # 微信渠道（best-effort）
        wechat_skipped = 0
        if wechat_enabled:
            for user_id in users:
                if not allow(prefs_by_user.get(user_id, {}), spec.category, "wechat"):
                    wechat_skipped += 1
                    continue
                result = send_wechat(
                    self.db,
                    user_id=user_id,
                    spec=spec,
                    title=title,
                    body=body,
                    dedupe_fields=event.dedupe_fields,
                )
                self._record_delivery(
                    notification_id=notification_id,
                    user_id=user_id,
                    result=result,
                    recipient_exists=bool(notification is not None and user_id in in_app_users),
                )
            self.db.commit()

        return EmitResult(
            notification_id=notification_id,
            created=created,
            recipients=len(in_app_users),
            skipped=skipped_in_app + wechat_skipped,
        )

    def _emit_audit_only(
        self,
        *,
        spec: EventSpec,
        users: list[str],
        title: str,
        body: str | None,
        dedupe_fields: dict[str, Any],
        wechat_enabled: bool,
    ) -> EmitResult:
        """C 端事件：只写 delivery_logs，不建 notifications / recipients（K6）."""
        audit_notification_id = uuid.uuid4()
        prefs_by_user = load_preferences_batch(self.db, users)
        for user_id in users:
            if not wechat_enabled or not allow(prefs_by_user.get(user_id, {}), spec.category, "wechat"):
                continue
            result = send_wechat(
                self.db,
                user_id=user_id,
                spec=spec,
                title=title,
                body=body,
                dedupe_fields=dedupe_fields,
            )
            self._record_delivery(
                notification_id=audit_notification_id,
                user_id=user_id,
                result=result,
                recipient_exists=False,
            )
        self.db.commit()
        return EmitResult(
            notification_id=audit_notification_id,
            created=False,
            recipients=0,
            skipped=0,
            audit_only=True,
        )

    def _upsert_notification(
        self,
        *,
        spec: EventSpec,
        dedupe_key: str | None,
        title: str,
        body: str | None,
        event: NotificationEvent,
    ) -> tuple[Notification | None, bool]:
        """按 dedupe_key 幂等插入通知（K4）.

        Returns:
            (通知对象, 是否新建)。dedupe 命中时返回既有通知且 created=False。

        """
        values = {
            "id": uuid.uuid4(),
            "category": spec.category,
            "type": str(spec.type),
            "title": title,
            "body": body,
            "action_type": spec.action_type,
            "action_url": event.action_url or self._render_optional(spec.action_template, event.fields),
            "payload": event.payload,
            "priority": spec.priority,
            "dedupe_key": dedupe_key,
            "source_module": event.source_module,
            "source_id": event.source_id,
            "created_by": event.created_by,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }

        if dedupe_key is None:
            notification = Notification(**values)
            self.db.add(notification)
            self.db.flush()
            return notification, True

        stmt = (
            pg_insert(Notification.__table__)
            .values(**values)
            .on_conflict_do_nothing(index_elements=["dedupe_key"])
            .returning(Notification.__table__.c.id)
        )
        inserted_id = self.db.execute(stmt).scalar()
        if inserted_id is not None:
            return self.db.get(Notification, inserted_id), True

        # 冲突：返回既有通知，不重复插收件人
        existing = self.db.query(Notification).filter(Notification.dedupe_key == dedupe_key).first()
        return existing, False

    def _insert_recipients(self, notification_id: uuid.UUID, user_ids: list[str]) -> None:
        """批量插入收件行（ON CONFLICT DO NOTHING，K4）."""
        if not user_ids:
            return
        now = datetime.now(timezone.utc)
        stmt = (
            pg_insert(NotificationRecipient.__table__)
            .values(
                [
                    {
                        "notification_id": notification_id,
                        "user_id": uid,
                        "created_at": now,
                    }
                    for uid in user_ids
                ]
            )
            .on_conflict_do_nothing(index_elements=["notification_id", "user_id"])
        )
        self.db.execute(stmt)

    def _record_delivery(
        self,
        *,
        notification_id: uuid.UUID,
        user_id: str,
        result: ChannelResult,
        recipient_exists: bool,
    ) -> None:
        """写投递日志 + 回写收件行状态快照（供列表直接读，避免 N+1）."""
        self.db.add(
            NotificationDeliveryLog(
                notification_id=notification_id,
                user_id=user_id,
                channel="wechat",
                status=result.status,
                error_code=result.error_code,
                error_message=result.error_message,
                attempt=1,
                created_at=datetime.now(timezone.utc),
            )
        )
        if not recipient_exists:
            return
        snapshot = {
            "wechat": {
                "status": result.status,
                "error_code": result.error_code,
            }
        }
        self.db.execute(
            update(NotificationRecipient)
            .where(
                and_(
                    NotificationRecipient.notification_id == notification_id,
                    NotificationRecipient.user_id == user_id,
                )
            )
            .values(delivery_status=snapshot)
        )

    # ==================== 读取 ====================

    def list_for_user(
        self,
        user_id: str,
        *,
        filter_spec: NotificationFilter,
        page: int,
        page_size: int,
    ) -> tuple[list[NotificationRecord], int, int]:
        """分页查询当前用户的通知（K7：SQL 层强制 user_id）.

        Args:
            user_id: 当前用户ID
            filter_spec: 筛选条件
            page: 页码（1 起）
            page_size: 每页数量（上限 100）

        Returns:
            (列表项, 筛选后总数, 筛选条件下未读数)。

        """
        # 上限来自配置（环境变量可调），缺省回退常量
        # 上限取配置（settings validator 已保证 >= 1）；路由层 le= 已先行 422，
        # 这里是内部调用方的兜底。call-time 读取便于测试翻转配置。
        page_size = max(1, min(page_size, settings.notification_page_size_max))
        base = (
            self.db.query(Notification, NotificationRecipient)
            .join(NotificationRecipient, NotificationRecipient.notification_id == Notification.id)
            .filter(NotificationRecipient.user_id == user_id)
        )
        base = self._apply_filter(base, filter_spec)

        total = base.count()
        # 筛选条件下未读数（供 tabs 角标）
        unread_in_filter = base.filter(NotificationRecipient.read_at.is_(None)).count()

        rows = (
            base.order_by(Notification.created_at.desc(), Notification.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )
        items = [self._to_item(notification, recipient) for notification, recipient in rows]
        return items, total, unread_in_filter

    def unread_count(self, user_id: str) -> dict[str, Any]:
        """未读统计（总数 + 按分类未读 + 按分类总数）.

        Args:
            user_id: 当前用户ID

        Returns:
            ``{"total": int, "by_category": {...}, "total_by_category": {...}}``

        """
        rows = self.db.execute(
            select(
                Notification.category,
                func.count().label("total"),
                func.count().filter(NotificationRecipient.read_at.is_(None)).label("unread"),
            )
            .join(NotificationRecipient, NotificationRecipient.notification_id == Notification.id)
            .where(NotificationRecipient.user_id == user_id)
            .group_by(Notification.category)
        ).all()
        by_category: dict[str, int] = {}
        total_by_category: dict[str, int] = {}
        for category, total_count, unread in rows:
            by_category[category] = int(unread or 0)
            total_by_category[category] = int(total_count or 0)
        return {
            "total": sum(by_category.values()),
            "by_category": by_category,
            "total_by_category": total_by_category,
        }

    def mark_read(self, user_id: str, notification_id: uuid.UUID) -> datetime:
        """标记单条已读（幂等，K8）.

        Args:
            user_id: 当前用户ID
            notification_id: 通知ID

        Returns:
            已读时间（首次写入的时间；重复调用返回同一时间）。

        Raises:
            LookupError: 该通知不存在或不属于当前用户（Router 转 404）。

        """
        recipient = (
            self.db.query(NotificationRecipient)
            .filter(
                NotificationRecipient.notification_id == notification_id,
                NotificationRecipient.user_id == user_id,
            )
            .first()
        )
        if recipient is None:
            msg = "通知不存在"
            raise LookupError(msg)

        if recipient.read_at is None:
            now = datetime.now(timezone.utc)
            updated = self.db.execute(
                update(NotificationRecipient)
                .where(
                    and_(
                        NotificationRecipient.id == recipient.id,
                        NotificationRecipient.read_at.is_(None),
                    )
                )
                .values(read_at=now)
            ).rowcount
            self.db.commit()
            if updated:
                return now
            # 并发：另一请求已写入，回读首次时间
            self.db.refresh(recipient)
        return recipient.read_at or datetime.now(timezone.utc)

    def mark_all_read(self, user_id: str, *, category: str | None = None) -> int:
        """全部标记已读（可按分类收敛，K8）.

        Args:
            user_id: 当前用户ID
            category: 仅该分类（None = 全部）

        Returns:
            实际更新条数。

        """
        query = (
            self.db.query(NotificationRecipient)
            .join(Notification, Notification.id == NotificationRecipient.notification_id)
            .filter(
                NotificationRecipient.user_id == user_id,
                NotificationRecipient.read_at.is_(None),
            )
        )
        if category:
            query = query.filter(Notification.category == category)
        ids = [r.id for r in query.all()]
        if not ids:
            return 0
        now = datetime.now(timezone.utc)
        updated = self.db.execute(
            update(NotificationRecipient)
            .where(
                and_(
                    NotificationRecipient.id.in_(ids),
                    NotificationRecipient.read_at.is_(None),
                )
            )
            .values(read_at=now)
        ).rowcount
        self.db.commit()
        return int(updated or 0)

    # ==================== 内部 ====================

    def _apply_filter(self, query: Any, filter_spec: NotificationFilter) -> Any:
        """应用筛选条件（unread/category/priority/days）."""
        if filter_spec.unread_only:
            query = query.filter(NotificationRecipient.read_at.is_(None))
        if filter_spec.category:
            query = query.filter(Notification.category == filter_spec.category)
        if filter_spec.priority:
            query = query.filter(Notification.priority == filter_spec.priority)
        if filter_spec.days is not None:
            from datetime import timedelta

            cutoff = datetime.now(timezone.utc) - timedelta(days=filter_spec.days)
            query = query.filter(Notification.created_at >= cutoff)
        return query

    def _to_item(self, notification: Notification, recipient: NotificationRecipient) -> NotificationRecord:
        """ORM → 列表项."""
        return NotificationRecord(
            id=notification.id,
            category=notification.category,
            type=notification.type,
            title=notification.title,
            body=notification.body,
            action_type=notification.action_type,
            action_url=notification.action_url,
            priority=notification.priority,
            read_at=recipient.read_at,
            created_at=notification.created_at,
            payload=notification.payload,
            delivery=recipient.delivery_status,
        )

    def _render(self, template: str, fields: dict[str, Any], max_len: int) -> str:
        """渲染模板并截断（占位符缺失 → ValueError，Fail Loud）."""
        try:
            rendered = template.format(**fields)
        except KeyError as exc:
            msg = f"模板 {template!r} 缺少字段 {exc}"
            raise ValueError(msg) from exc
        return rendered[:max_len]

    def _render_optional(self, template: str | None, fields: dict[str, Any]) -> str | None:
        """渲染可选模板（None 或占位符缺失 → None，不抛错）."""
        if template is None:
            return None
        try:
            return template.format(**fields)[:500]
        except KeyError:
            return None

    def _render_dedupe(self, spec: EventSpec, dedupe_fields: dict[str, Any]) -> str | None:
        """渲染去重键.

        Raises:
            ValueError: 模板占位符未填充（K4：禁止空占位）。

        """
        if not spec.dedupe_template:
            return None
        try:
            return spec.dedupe_template.format(**dedupe_fields)[:200]
        except KeyError as exc:
            msg = f"去重模板 {spec.dedupe_template!r} 缺少字段 {exc}"
            raise ValueError(msg) from exc


__all__ = [
    "EmitResult",
    "NotificationEvent",
    "NotificationFilter",
    "NotificationRecord",
    "NotificationService",
]
