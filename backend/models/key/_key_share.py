"""钥匙分享与审计模型：KeyShare / KeyShareView / KeyAuditLog."""

import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Index, String, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class KeyShareStatus(str, enum.Enum):
    """分享状态枚举."""

    ACTIVE = "active"  # 进行中
    REVOKED = "revoked"  # 已回收


class KeyActorType(str, enum.Enum):
    """审计日志操作人类型枚举."""

    USER = "user"  # 内部员工（后台/员工端）
    AGENT = "agent"  # 经纪人（C 端）
    SYSTEM = "system"  # 系统（如过期判定）


class KeyShare(BaseModel):
    """钥匙分享 - 员工发起，token 唯一，条目存 JSONB。

    expires_at 为派生过期（active && expires_at < now 视为已过期）；
    回收为硬失效（status=revoked）。
    """

    __tablename__ = "key_shares"

    token: Mapped[str] = mapped_column(String(64), nullable=False, comment="分享令牌(secrets.token_urlsafe)")
    sharer_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="分享人ID(逻辑外键users.id)")
    items: Mapped[list] = mapped_column(
        JSONB,
        nullable=False,
        comment="分享条目 [{project_id, key_id}]",
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="失效时间")
    status: Mapped[KeyShareStatus] = mapped_column(
        SQLEnum(KeyShareStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=KeyShareStatus.ACTIVE,
        comment="状态: active进行中/revoked已回收",
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="回收时间")

    __table_args__ = (
        Index("uq_key_shares_token", "token", unique=True),
        Index("idx_key_shares_sharer", "sharer_id"),
        Index("idx_key_shares_status", "status"),
    )


class KeyShareView(BaseModel):
    """经纪人查看记录 - 经纪人每次查看明文即时写入（含查看人快照）。"""

    __tablename__ = "key_share_views"

    share_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="分享ID(逻辑外键key_shares.id)")
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="项目ID(逻辑外键)")
    key_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="普通密码组ID(逻辑外键)")
    viewer_user_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, comment="查看人用户ID(逻辑外键users.id)"
    )
    viewer_name: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="查看人名称快照")
    viewed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now().astimezone(),
        comment="查看时间",
    )

    __table_args__ = (
        Index("idx_key_share_view_share", "share_id"),
        Index("idx_key_share_view_project", "project_id"),
        Index("idx_key_share_view_key", "key_id"),
    )


class KeyAuditLog(BaseModel):
    """钥匙全量行为日志 - 录入/生成/标记/查看明文/修改/停用/删除/分享/回收/过期等。"""

    __tablename__ = "key_audit_logs"

    project_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, nullable=True, comment="项目ID(逻辑外键,分享级动作为空)")
    action: Mapped[str] = mapped_column(String(32), nullable=False, comment="动作编码(如 create/generate/view/share)")
    actor_type: Mapped[KeyActorType] = mapped_column(
        SQLEnum(KeyActorType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="操作人类型: user/agent/system",
    )
    actor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="操作人ID")
    actor_name: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="操作人名称快照")
    detail: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
        comment="详情 JSON(对象/数量/分享token等)",
    )

    __table_args__ = (
        Index("idx_key_audit_project", "project_id"),
        Index("idx_key_audit_project_created", "project_id", "created_at"),
        Index("idx_key_audit_action", "action"),
    )
