"""
销售交易模型
"""
from sqlalchemy import Column, String, Numeric, DateTime, Boolean, ForeignKey, Index
from sqlalchemy.orm import relationship

from .base import BaseModel


class ProjectSale(BaseModel):
    """销售交易表"""
    __tablename__ = "project_sales"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, comment="项目ID")

    listing_date = Column(DateTime, nullable=True, comment="上架日期")
    list_price = Column(Numeric(15, 2), nullable=True, comment="挂牌价(万)")
    sold_date = Column(DateTime, nullable=True, comment="成交时间")
    sold_price = Column(Numeric(15, 2), nullable=True, comment="成交价(万)")

    channel_manager_id = Column(String(36), nullable=True, comment="渠道负责人ID(软引用users.id)")
    property_agent_id = Column(String(36), nullable=True, comment="房源维护人ID(软引用users.id)")
    negotiator_id = Column(String(36), nullable=True, comment="联卖谈判人ID(软引用users.id)")

    transaction_status = Column(String(20), nullable=False, default="在售", comment="交易状态")

    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_sale_project", "project_id"),
        Index("idx_sale_status", "transaction_status"),
    )

    def validate_user_references(self, db) -> None:
        """验证软引用的用户ID是否存在且有效"""
        from .user import User
        user_id_fields = [
            ("channel_manager_id", "渠道负责人ID"),
            ("property_agent_id", "房源维护人ID"),
            ("negotiator_id", "联卖谈判人ID"),
        ]

        for field_name, field_desc in user_id_fields:
            user_id = getattr(self, field_name)
            if user_id:
                user = db.query(User).filter(
                    User.id == user_id,
                    User.status == "active"
                ).first()
                if not user:
                    raise ValueError(f"无效的{field_desc}: {user_id}")