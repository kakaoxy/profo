"""销售交易模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Index, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ProjectSale(BaseModel):
    """销售交易表."""

    __tablename__ = "project_sales"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, comment="项目ID(逻辑外键)")

    listing_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="上架日期")
    list_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="挂牌价(万)")
    sold_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="成交时间")
    sold_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="成交价(万)")

    channel_manager_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="渠道负责人ID(软引用users.id)")
    property_agent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="房源维护人ID(软引用users.id)")
    negotiator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="联卖谈判人ID(软引用users.id)")

    transaction_status: Mapped[str] = mapped_column(String(20), nullable=False, default="在售", comment="交易状态")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_sale_project", "project_id"),
        Index("idx_sale_status", "transaction_status"),
    )
