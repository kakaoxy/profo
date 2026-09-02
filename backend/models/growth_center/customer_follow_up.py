"""小程序「我的客户」跨模块跟进记录模型."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base


class CustomerFollowUp(Base):
    """跨模块客户跟进记录（表 ``customer_follow_ups``）.

    逻辑外键设计：``module`` + ``lead_id`` 联合定位各业务线线索，不建 FK 约束，
    级联由 Service 层处理。``lead_id`` 统一为 String(36)：估价/房源单（leads）与
    招募（recruit_leads）主键本就是 String(36) UUID；预约（project_bookings）为
    Integer 自增，写入时转字符串，读取时按 module 还原。
    """

    __tablename__ = "customer_follow_ups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()), comment="UUID")
    module: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="获客模块（valuation/booking/sheet/recruit）",
    )
    lead_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="线索ID(各模块主键转字符串,逻辑外键)")
    content: Mapped[str] = mapped_column(String(500), nullable=False, comment="跟进内容(≤500字符)")
    created_by_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="跟进人ID(逻辑外键)")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间",
    )

    __table_args__ = (Index("idx_customer_follow_up_module_lead", "module", "lead_id"),)
