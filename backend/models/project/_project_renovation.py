"""装修信息模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum as SQLEnum,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, RenovationStage


class ProjectRenovation(BaseModel):
    """装修信息表."""

    __tablename__ = "project_renovations"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, comment="项目ID(逻辑外键)")

    renovation_company: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="合作装修公司")

    contract_start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="合同约定进场时间")
    contract_end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="合同约定竣工交房时间")

    actual_start_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="实际开工时间")
    actual_end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="实际竣工时间")

    hard_contract_amount: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="硬装合同总金额")

    payment_node_1: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="第一笔款项支付节点")
    payment_ratio_1: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True, comment="第一笔款项支付比例(支持小数点后4位)")
    payment_node_2: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="第二笔款项支付节点")
    payment_ratio_2: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True, comment="第二笔款项支付比例(支持小数点后4位)")
    payment_node_3: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="第三笔款项支付节点")
    payment_ratio_3: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True, comment="第三笔款项支付比例(支持小数点后4位)")
    payment_node_4: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="第四笔款项支付节点")
    payment_ratio_4: Mapped[Decimal | None] = mapped_column(Numeric(6, 4), nullable=True, comment="第四笔款项支付比例(支持小数点后4位)")

    soft_budget: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="软装预算金额")
    soft_actual_cost: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="软装实际发生成本")
    soft_detail_attachment: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="软装明细附件")

    design_fee: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="设计费用")
    demolition_fee: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="拆旧费用")
    garbage_fee: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="垃圾清运费用")
    other_extra_fee: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="其他额外费用")
    other_fee_reason: Mapped[str | None] = mapped_column(Text, nullable=True, comment="其他费用原因")

    stage_completed_dates: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="各阶段完成日期记录，格式: {stage: date_string}")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (Index("idx_renovation_project", "project_id"),)


class RenovationPhoto(BaseModel):
    """改造阶段照片表."""

    __tablename__ = "renovation_photos"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")
    renovation_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="装修记录ID(逻辑外键)")

    stage: Mapped[RenovationStage] = mapped_column(
        SQLEnum(RenovationStage, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="改造阶段",
    )
    url: Mapped[str] = mapped_column(String(500), nullable=False, comment="图片URL")
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True, comment="缩略图URL")
    filename: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="文件名")
    description: Mapped[str | None] = mapped_column(Text, nullable=True, comment="描述")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_renovation_photo_project", "project_id"),
        Index("idx_renovation_photo_project_stage", "project_id", "stage"),
    )
