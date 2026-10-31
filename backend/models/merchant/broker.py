"""经纪人档案、绑定历史与门店邀请二维码模型（V04）."""

from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from constants.merchant import (
    MerchantBindingRecordStatus,
    MerchantBindSource,
    MerchantBindStatus,
)
from models.common.base import Base
from models.common.encrypted import EncryptedString
from models.merchant.base import new_id, utc_now


class MerchantBroker(Base):
    """经纪人档案表（独立于 users，可选关联 users.id）."""

    __tablename__ = "merchant_brokers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    user_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="关联 users.id(逻辑外键)")
    name: Mapped[str] = mapped_column(String(50), nullable=False, comment="姓名")
    phone: Mapped[str] = mapped_column(EncryptedString(20), nullable=False, comment="手机号(加密)")
    phone_hash: Mapped[str] = mapped_column(String(64), nullable=False, comment="手机号 HMAC 哈希(唯一)")
    store_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="当前绑定门店")
    bind_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantBindStatus.UNBOUND.value,
        comment="绑定状态：unbound/bound/unbound_after/disabled；pending 仅历史兼容",
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="self_apply", comment="来源")
    inviter_employee_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="邀请员工ID")
    bind_source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantBindSource.NONE.value,
        comment="绑定来源：qrcode/share/manual/backoffice/none",
    )
    recruit_lead_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="招募线索只读引用")
    bound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="绑定时间")
    unbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="解绑时间")
    remark: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="备注")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("uq_merchant_brokers_phone_hash", "phone_hash", unique=True),
        Index("idx_merchant_brokers_user", "user_id"),
        Index("idx_merchant_brokers_store", "store_id"),
        Index("idx_merchant_brokers_inviter", "inviter_employee_id"),
        Index("idx_merchant_brokers_status", "bind_status"),
    )


class MerchantBrokerBinding(Base):
    """经纪人与门店绑定历史（永久保留，解绑不删除）."""

    __tablename__ = "merchant_broker_bindings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    broker_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="经纪人ID")
    store_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="门店ID")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantBindingRecordStatus.ACTIVE.value,
        comment="绑定记录状态：pending/active/rejected/unbound",
    )
    applied_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="审核时间")
    approved_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="审核人ID")
    unbound_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="解绑时间")
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="申请/解绑原因")
    bind_source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantBindSource.MANUAL.value,
        comment="绑定来源",
    )
    inviter_employee_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="邀请员工快照")
    store_name_snapshot: Mapped[str] = mapped_column(String(200), nullable=False, comment="门店名称快照")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("idx_merchant_bindings_broker_time", "broker_id", "applied_at"),
        Index("idx_merchant_bindings_store", "store_id"),
        Index("idx_merchant_bindings_status", "status"),
    )


class MerchantStoreQRCode(Base):
    """门店经纪人邀请二维码（短码场景值 + 服务端校验签名/有效期）."""

    __tablename__ = "merchant_store_qrcodes"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    code: Mapped[str] = mapped_column(String(32), nullable=False, comment="二维码场景短码")
    store_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="门店ID")
    inviter_employee_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="邀请员工ID")
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="过期时间")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("uq_merchant_store_qrcodes_code", "code", unique=True),
        Index("idx_merchant_store_qrcodes_store", "store_id"),
        Index("idx_merchant_store_qrcodes_expires", "expires_at"),
    )


__all__ = ["MerchantBroker", "MerchantBrokerBinding", "MerchantStoreQRCode"]
