"""签约合同模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ProjectContract(BaseModel):
    """签约合同表."""

    __tablename__ = "project_contracts"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, unique=True, comment="项目ID")

    contract_no: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="合同编号")
    signing_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="签约价格(万)")
    signing_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="签约日期")
    signing_period: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="合同周期(天)")
    extension_period: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="顺延期(天)")
    extension_rent: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="顺延期租金(元/月)")
    cost_assumption_type: Mapped[str | None] = mapped_column(
        String(20), nullable=True, comment="税费及佣金承担方类型: meifangbao/owner/respective/other",
    )
    cost_assumption_other: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="税费及佣金承担方其他说明")
    planned_handover_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="业主交房时间")
    other_agreements: Mapped[str | None] = mapped_column(Text, nullable=True, comment="其他约定条款")
    signing_materials: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="合同附件URLs")

    contract_status: Mapped[str] = mapped_column(String(20), nullable=False, default="生效", comment="合同状态")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_contract_project", "project_id"),
        Index("idx_contract_status", "contract_status"),
        Index("idx_contract_no", "contract_no", unique=True),
    )
