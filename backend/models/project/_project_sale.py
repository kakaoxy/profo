"""销售交易模型."""

import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Index, Numeric, String, Uuid, text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ProjectSale(BaseModel):
    """销售交易表."""

    __tablename__ = "project_sales"

    # H-3：project_id 的唯一性由下方「部分唯一索引（WHERE is_deleted=false）」保证，
    # 不再用列级 unique=True（普通 UNIQUE 会禁止同一 project 存在软删行，与迁移 v89 漂移）。
    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="项目ID(逻辑外键)")

    listing_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="上架日期")
    list_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="挂牌价(万)")
    sold_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="成交时间")
    sold_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="成交价(万)")

    channel_manager_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="渠道负责人ID(软引用users.id)",
    )
    property_agent_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="房源维护人ID(软引用users.id)",
    )
    negotiator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="联卖谈判人ID(软引用users.id)")

    transaction_status: Mapped[str] = mapped_column(String(20), nullable=False, default="在售", comment="交易状态")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_sale_project", "project_id"),
        Index("idx_sale_status", "transaction_status"),
        # H-3：部分唯一索引，仅对活跃（未软删）销售行强制「每项目一行」，与迁移 v89 对齐。
        # 消除模型（旧 unique=True）/迁移（部分索引）漂移，也让 create_all 建的测试库形态一致。
        # ⚠️ postgresql_where 为 PostgreSQL 方言专属：其他数据库（MySQL/SQLite）不报错但会
        # 静默忽略该参数，建成全量唯一索引导致软删行违反唯一约束。本项目仅支持 PostgreSQL
        # （db.py/settings.py 仅接受 postgresql+psycopg），此索引不可跨数据库移植。
        Index(
            "uq_sale_project_active",
            "project_id",
            unique=True,
            postgresql_where=text("is_deleted = false"),
        ),
    )
