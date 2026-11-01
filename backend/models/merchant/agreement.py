"""电子合作协议与模板模型（V05；REQ-IT5-03 起取消审核环节）."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    DateTime,
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base
from models.common.encrypted import EncryptedString
from models.merchant.base import new_id, utc_now


class MerchantAgreementTemplate(Base):
    """协议模板（运营按合作类型维护多套）."""

    __tablename__ = "merchant_agreement_templates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    template_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="模板名称")
    cooperation_type: Mapped[str] = mapped_column(String(50), nullable=False, comment="适用合作类型")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="协议正文")
    version: Mapped[str] = mapped_column(String(50), nullable=False, default="v1", comment="模板版本")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="enabled", comment="启用/停用")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (Index("idx_merchant_agreement_templates_type", "cooperation_type", "status"),)


class MerchantAgreement(Base):
    """电子合作协议（门店主体或公司主体二选一）."""

    __tablename__ = "merchant_agreements"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    store_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="门店主体ID")
    company_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="公司主体ID")
    subject_type: Mapped[str] = mapped_column(String(20), nullable=False, default="store", comment="store/company")
    agreement_no: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="协议编号")
    template_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="协议模板ID")
    parent_agreement_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="补充协议关联原协议ID")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="pending_sign",
        comment="协议状态：pending_sign/signed/expired/voided（REQ-IT5-03 起发起即待签署）",
    )
    sign_code: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="商户签署分享码（分享链接凭证，REQ-IT5-03）",
    )
    void_reason: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="作废原因")
    signer_name: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="签署人姓名")
    signer_phone: Mapped[str | None] = mapped_column(EncryptedString(20), nullable=True, comment="签署人手机号(加密)")
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expire_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    file_url: Mapped[str | None] = mapped_column(String(1000), nullable=True, comment="PDF/扫描件地址")
    external_sign_id: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="第三方回执号(本期不用)")
    attachment_urls: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="附件地址列表")
    supplement_agreement_ids: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="补充协议ID列表")
    created_by_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="发起人ID")
    remark: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("idx_merchant_agreements_store_status", "store_id", "status"),
        Index("idx_merchant_agreements_company_status", "company_id", "status"),
        Index("idx_merchant_agreements_expire", "expire_at", "status"),
        Index("idx_merchant_agreements_sign_code", "sign_code"),
        Index("idx_merchant_agreements_parent", "parent_agreement_id"),
    )


__all__ = ["MerchantAgreement", "MerchantAgreementTemplate"]
