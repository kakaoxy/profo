"""门店拜访记录模型（V03）."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from constants.merchant import MerchantLocationStatus, MerchantVisitSource
from models.common.base import Base
from models.common.encrypted import EncryptedString
from models.merchant.base import new_id, utc_now


class MerchantVisit(Base):
    """拜访记录表（V03 6.1 字段表）."""

    __tablename__ = "merchant_visits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=new_id, comment="UUID")
    store_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="门店ID(逻辑外键)")
    employee_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="拜访员工ID(逻辑外键)")
    visited_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="拜访时间")
    contact_name: Mapped[str] = mapped_column(String(50), nullable=False, comment="本次联系人")
    contact_phone: Mapped[str | None] = mapped_column(EncryptedString(20), nullable=True, comment="联系电话(加密)")
    photos: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="拜访照片列表")
    lng: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True, comment="到店经度 GCJ-02")
    lat: Mapped[float | None] = mapped_column(Numeric(10, 6), nullable=True, comment="到店纬度 GCJ-02")
    distance_m: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="与门店坐标距离(米)")
    distance_abnormal_reason: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
        comment="距离超过 500 米的原因",
    )
    location_failure_reason: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
        comment="无法定位的原因（弱网/超时）",
    )
    location_failure_type: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="定位失败类型：auth_denied/timeout/unavailable（AC-V03-007）",
    )
    client_request_id: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        index=True,
        comment="客户端幂等键：同一员工重复提交同一 key 只落一条拜访",
    )
    location_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantLocationStatus.NORMAL.value,
        comment="定位状态：normal/degraded/missing",
    )
    visit_source: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=MerchantVisitSource.REGULAR.value,
        comment="拜访来源：first/regular/backfill/backoffice",
    )
    address: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="定位地址")
    result: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="拜访结果字典 code")
    remark: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="备注")
    is_backfill: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="是否补录")
    is_deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, comment="软删标记")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    __table_args__ = (
        Index("idx_merchant_visits_store_time", "store_id", "visited_at"),
        Index("idx_merchant_visits_employee_time", "employee_id", "visited_at"),
        Index("idx_merchant_visits_deleted", "is_deleted"),
    )


__all__ = ["MerchantVisit"]
