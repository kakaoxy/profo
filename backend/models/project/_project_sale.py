"""销售交易模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import Boolean, DateTime, Index, Numeric, String
from sqlalchemy.orm import Mapped, Session, mapped_column

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

    def validate_user_references(self, db: Session) -> None:
        """验证销售角色用户ID是否有效."""
        from models import User  # noqa: PLC0415

        user_fields = [
            ("channel_manager_id", self.channel_manager_id),
            ("property_agent_id", self.property_agent_id),
            ("negotiator_id", self.negotiator_id),
        ]

        user_ids = [uid for _, uid in user_fields if uid]
        if user_ids:
            existing_users = db.query(User.id).filter(User.id.in_(user_ids)).all()
            existing_ids = {user.id for user in existing_users}
        else:
            existing_ids = set()

        for field_name, user_id in user_fields:
            if user_id and user_id not in existing_ids:
                msg = f"无效的用户ID: {user_id} (字段: {field_name})"
                raise ValueError(msg)
