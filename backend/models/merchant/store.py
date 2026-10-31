"""门店主数据与状态变更日志模型."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Index,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from constants.merchant import (
    MerchantCooperationStatus,
    MerchantStoreReviewStatus,
    MerchantStoreStatus,
)
from models.common.base import Base
from models.common.encrypted import EncryptedString
from models.merchant.base import new_id, utc_now


class MerchantStore(Base):
    """门店主数据表（V02 4.2.1 字段表）."""

    __tablename__ = "merchant_stores"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    company_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="所属公司ID(逻辑外键)")
    company_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="公司名称冗余展示")
    store_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="门店名称")
    province: Mapped[str] = mapped_column(String(50), nullable=False, comment="省")
    city: Mapped[str] = mapped_column(String(50), nullable=False, comment="市")
    district: Mapped[str] = mapped_column(String(50), nullable=False, comment="区县")
    business_circle: Mapped[str] = mapped_column(String(100), nullable=False, comment="商圈")
    address: Mapped[str] = mapped_column(String(500), nullable=False, comment="详细地址")
    lng: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True, comment="经度 GCJ-02(存量可空)")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True, comment="纬度 GCJ-02(存量可空)")
    coordinate_system: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="gcj02",
        comment="坐标系：统一 GCJ-02",
    )
    contact_name: Mapped[str] = mapped_column(String(50), nullable=False, comment="联系人")
    contact_phone: Mapped[str] = mapped_column(EncryptedString(20), nullable=False, comment="联系电话(加密)")
    contact_phone_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        comment="联系电话 HMAC 哈希（查重精确匹配，Fernet 随机 IV 无法比较）",
    )
    cooperation_status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default=MerchantCooperationStatus.NOT_COOPERATED.value,
        comment="合作状态字典 code",
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False, comment="来源：employee/backoffice/import/broker")
    owner_employee_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="拓展员工ID(逻辑外键)",
    )
    last_visit_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最近拜访时间",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantStoreStatus.NORMAL.value,
        comment="门店状态：normal/disabled/merged/relocated",
    )
    review_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantStoreReviewStatus.APPROVED.value,
        comment="审核状态：pending/approved/merged",
    )
    created_by_broker_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="经纪人自建门店的创建经纪人ID",
    )
    merged_to_store_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="合并到哪家门店")
    former_store_no: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="曾用门店号")
    relocated_to_store_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="搬迁后新门店ID")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="软删标记")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="删除时间")
    deleted_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="删除人ID")
    photos: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="门店照片列表")
    remark: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="备注")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("idx_merchant_stores_company", "company_id"),
        Index("idx_merchant_stores_owner", "owner_employee_id"),
        Index("idx_merchant_stores_phone_hash", "contact_phone_hash"),
        Index("idx_merchant_stores_cooperation", "cooperation_status"),
        Index("idx_merchant_stores_status_review", "status", "review_status"),
        Index("idx_merchant_stores_last_visit", "last_visit_at"),
        Index("idx_merchant_stores_deleted", "is_deleted"),
    )


class MerchantStoreStatusLog(Base):
    """门店合作状态变更历史（S06 时间线）."""

    __tablename__ = "merchant_store_status_logs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    store_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="门店ID(逻辑外键)")
    from_status: Mapped[str] = mapped_column(String(50), nullable=False, comment="变更前合作状态")
    to_status: Mapped[str] = mapped_column(String(50), nullable=False, comment="变更后合作状态")
    reason: Mapped[str] = mapped_column(String(500), nullable=False, comment="变更原因")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="操作人ID")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (Index("idx_merchant_store_status_logs_store", "store_id", "created_at"),)


__all__ = ["MerchantStore", "MerchantStoreStatusLog"]
