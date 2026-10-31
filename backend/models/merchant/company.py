"""商户（公司）主数据模型."""

from datetime import datetime

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from constants.merchant import MerchantCompanyStatus
from models.common.base import Base
from models.common.encrypted import EncryptedString
from models.merchant.base import new_id, utc_now


class MerchantCompany(Base):
    """公司主数据表（D1-A：公司 1:N 门店，门店必属公司）."""

    __tablename__ = "merchant_companies"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    company_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="公司名称")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantCompanyStatus.NORMAL.value,
        comment="状态：normal/disabled",
    )
    contact_name: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="联系人")
    contact_phone: Mapped[str | None] = mapped_column(EncryptedString(20), nullable=True, comment="联系电话(加密)")
    remark: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="备注")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("idx_merchant_companies_name", "company_name"),
        Index("idx_merchant_companies_status", "status"),
    )


__all__ = ["MerchantCompany"]
