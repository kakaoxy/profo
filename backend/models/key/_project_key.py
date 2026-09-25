"""钥匙管理模型：管理密码（ProjectKey）与普通密码组（ProjectNormalKey）."""

import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, Index, Integer, String, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel
from models.common.encrypted import EncryptedString


class KeyStatus(str, enum.Enum):
    """普通密码组状态枚举."""

    ACTIVE = "active"  # 有效
    PENDING_ENTRY = "pending_entry"  # 待录入
    DISABLED = "disabled"  # 已停用


class ProjectKey(BaseModel):
    """房源管理密码 - 一房一条（project_id 唯一），密文存储."""

    __tablename__ = "project_keys"

    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, unique=True, comment="项目ID(逻辑外键)")
    password_encrypted: Mapped[str] = mapped_column(EncryptedString(50), nullable=False, comment="管理密码(Fernet密文)")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="录入人ID(逻辑外键users.id)")
    updated_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="最近修改人ID(逻辑外键users.id)")

    __table_args__ = (Index("idx_project_key_updated_by", "updated_by"),)


class ProjectNormalKey(BaseModel):
    """房源普通密码组 - 一房多条，密文存储，删除为物理删除（仅审计日志可追溯）."""

    __tablename__ = "project_normal_keys"

    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="项目ID(逻辑外键)")
    seq: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="房源内序号(创建时递增分配,删除其他组不影响)"
    )
    password_encrypted: Mapped[str] = mapped_column(EncryptedString(50), nullable=False, comment="普通密码(Fernet密文)")
    status: Mapped[KeyStatus] = mapped_column(
        SQLEnum(KeyStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=KeyStatus.PENDING_ENTRY,
        comment="状态: active有效/pending_entry待录入/disabled已停用",
    )
    effective_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="生效日期")
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="标记已录入时间"
    )
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="停用时间")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="录入人ID(逻辑外键users.id)")

    __table_args__ = (
        Index("idx_normal_key_project", "project_id"),
        Index("idx_normal_key_project_status", "project_id", "status"),
    )
