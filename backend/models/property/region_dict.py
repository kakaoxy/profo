"""区域 / 商圈字典模型（REQ-IT2-01 / REQ-IT3-01）.

区域与商圈属于**楼盘字典**的一部分：门店建档、后台门店表单、楼盘字典筛选都复用这里的值。
字典是「可维护的系统列表」：候选取自本表启用项；重命名时由 Service 批量同步
``communities`` 与 ``merchant_stores`` 上的同值记录，避免字典与业务数据分叉。
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base


class RegionDictType(str, enum.Enum):
    """区域 / 商圈字典类型."""

    DISTRICT = "district"
    BUSINESS_CIRCLE = "business_circle"


class RegionDictStatus(str, enum.Enum):
    """区域 / 商圈字典项状态."""

    ACTIVE = "active"
    DISABLED = "disabled"


REGION_DICT_TYPE_LABELS: dict[str, str] = {
    RegionDictType.DISTRICT.value: "区域",
    RegionDictType.BUSINESS_CIRCLE.value: "商圈",
}


class RegionDict(Base):
    """区域 / 商圈字典表（楼盘字典的行政区与商圈维度）."""

    __tablename__ = "region_dicts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    dict_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="字典类型：district/business_circle",
    )
    district: Mapped[str | None] = mapped_column(
        String(50),
        nullable=True,
        comment="所属区域（dict_type=business_circle 时用于按区域过滤候选）",
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False, comment="字典值（区域名/商圈名）")
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=RegionDictStatus.ACTIVE.value,
        comment="状态：active/disabled",
    )
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="排序值（升序）")
    remark: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="备注")
    created_by: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="创建人 user_id")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    __table_args__ = (
        UniqueConstraint("dict_type", "name", name="uq_region_dicts_type_name"),
        Index("idx_region_dicts_type_status", "dict_type", "status"),
        Index("idx_region_dicts_district", "district"),
    )


__all__ = [
    "REGION_DICT_TYPE_LABELS",
    "RegionDict",
    "RegionDictStatus",
    "RegionDictType",
]
