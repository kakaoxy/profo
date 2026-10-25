"""通知中心数据模型.

三张表构成统一消息中心（SPEC §4.2）：
- ``Notification``：站内信主体，按 ``dedupe_key`` 唯一去重（K4）；
- ``NotificationRecipient``：收件人 + 已读状态，所有查询在 SQL 层按 ``user_id`` 隔离（K7）；
- ``NotificationDeliveryLog``：各渠道投递审计，C 端事件（K6）无对应 ``notifications`` 行。
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base, BaseModel

# 优先级合法值（与 ck_notifications_priority 约束、schemas 的 Literal 三处一致）
NOTIFICATION_PRIORITIES: tuple[str, ...] = ("low", "normal", "high", "urgent")

# 投递状态合法值（recipients.delivery_status 与 delivery_logs.status 共用）
DELIVERY_STATUSES: tuple[str, ...] = ("success", "skipped", "failed")

# 投递渠道
DELIVERY_CHANNELS: tuple[str, ...] = ("in_app", "wechat")


class Notification(BaseModel):
    """站内信主体.

    一行 = 一个事件（按 ``dedupe_key`` 去重），收件人关系在
    ``notification_recipients`` 中展开。``dedupe_key`` 可空：为空表示不去重
    （仅适用于一次性系统告警，K4），PostgreSQL 允许多个 NULL 并存。
    """

    __tablename__ = "notifications"

    category: Mapped[str] = mapped_column(String(30), nullable=False, comment="分类：lead/growth/project/key/...")
    type: Mapped[str] = mapped_column(String(60), nullable=False, comment="事件类型，如 customer.new")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="标题（模板生成，非用户输入拼接）")
    body: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="正文摘要")
    action_type: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="点击行为：route/miniapp/none")
    action_url: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="点击跳转地址")
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True, comment="结构化附加数据（不含敏感字段）")
    priority: Mapped[str] = mapped_column(
        String(10),
        nullable=False,
        default="normal",
        server_default="normal",
        comment="优先级：low/normal/high/urgent",
    )
    dedupe_key: Mapped[str | None] = mapped_column(
        String(200), nullable=True, comment="去重键（唯一；NULL 表示不去重）"
    )
    source_module: Mapped[str | None] = mapped_column(String(30), nullable=True, comment="来源模块标识")
    source_id: Mapped[str | None] = mapped_column(String(64), nullable=True, comment="来源业务对象ID")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="触发人用户ID(逻辑外键)")
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="过期时间（NULL=永不过期）"
    )

    __table_args__ = (
        UniqueConstraint("dedupe_key", name="uq_notifications_dedupe_key"),
        CheckConstraint(
            "priority IN ('low','normal','high','urgent')",
            name="ck_notifications_priority",
        ),
        Index("idx_notifications_created_at", text("created_at DESC")),
        Index("idx_notifications_category_created", "category", text("created_at DESC")),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<Notification(id='{self.id}', type='{self.type}')>"


class NotificationRecipient(Base):
    """通知收件人（含已读状态）.

    用 ``Base`` 而非 ``BaseModel``：主键为 BIGSERIAL 自增整数，且只需 ``created_at``
    ——与 SPEC §4.1 的「``notifications`` 用 BaseModel、另两表用 Base + BIGSERIAL」一致。
    """

    __tablename__ = "notification_recipients"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment="收件记录ID")
    notification_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="通知ID(逻辑外键)")
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="收件人用户ID(逻辑外键)")
    read_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="已读时间（NULL=未读）"
    )
    archived_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="归档时间（本期恒 NULL，预留）"
    )
    delivery_status: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment='最新一次渠道投递结果快照：{"wechat":{"status":"success|skipped|failed","error_code":"..."}}',
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        comment="创建时间",
    )

    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notification_recipients_pair"),
        Index(
            "idx_notification_recipients_user_unread",
            "user_id",
            "read_at",
            postgresql_where=text("read_at IS NULL"),
        ),
        Index("idx_notification_recipients_user_created", "user_id", text("id DESC")),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<NotificationRecipient(id={self.id}, user_id='{self.user_id}')>"


class NotificationDeliveryLog(Base):
    """渠道投递审计日志.

    **逻辑外键例外（SPEC §4.2 硬约束 1）**：C 端事件（K6：marketing.published /
    marketing.price_changed / lead.eval_price_changed）不建 ``notifications`` 行，
    此处的 ``notification_id`` 填 ``uuid4()`` 占位值，仅用于把同一事件的多条渠道
    记录串起来。**任何查询都不得 JOIN ``notifications`` 依赖其存在。**
    """

    __tablename__ = "notification_delivery_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True, comment="日志ID")
    notification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid,
        nullable=False,
        comment="通知ID；C 端审计事件为 uuid4 占位值，无对应 notifications 行",
    )
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="接收用户ID(逻辑外键)")
    channel: Mapped[str] = mapped_column(String(20), nullable=False, comment="渠道：in_app/wechat")
    status: Mapped[str] = mapped_column(String(20), nullable=False, comment="状态：success/skipped/failed")
    error_code: Mapped[str | None] = mapped_column(
        String(50), nullable=True, comment="错误码：TEMPLATE_MISSING/NO_OPENID/WECHAT_ERROR"
    )
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="错误信息（已脱敏截断）")
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1", comment="第几次尝试")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
        comment="创建时间",
    )

    __table_args__ = (
        Index("idx_notification_delivery_logs_notification", "notification_id", "user_id", text("created_at DESC")),
        Index("idx_notification_delivery_logs_created", text("created_at DESC")),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<NotificationDeliveryLog(id={self.id}, channel='{self.channel}', status='{self.status}')>"


__all__ = [
    "DELIVERY_CHANNELS",
    "DELIVERY_STATUSES",
    "NOTIFICATION_PRIORITIES",
    "Notification",
    "NotificationDeliveryLog",
    "NotificationRecipient",
]
