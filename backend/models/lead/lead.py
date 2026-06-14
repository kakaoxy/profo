"""Leads Management Models."""

from datetime import datetime, timezone

from decimal import Decimal

from sqlalchemy import (
    JSON,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, foreign, mapped_column, relationship

from models.common.base import Base, FollowUpMethod, LeadStatus


class Lead(Base):
    """线索主表."""

    __tablename__ = "leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, comment="UUID")

    # Core Info
    community_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="小区名称")
    community_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="关联小区ID(软引用)")
    is_hot: Mapped[int] = mapped_column(Integer, default=0, comment="是否热门/关注(0/1)")

    # Property Physical Attributes
    layout: Mapped[str | None] = mapped_column(String(50), comment="户型(e.g. 2室1厅)")
    orientation: Mapped[str | None] = mapped_column(String(50), comment="朝向")
    floor_info: Mapped[str | None] = mapped_column(String(50), comment="楼层信息")
    area: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), comment="面积(㎡)")

    # Price Info
    total_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), comment="当前授权总价(万)")
    unit_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), comment="单价(万/㎡)")
    eval_price: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), comment="评估价格(万)")

    # Status & Workflow
    status: Mapped[LeadStatus] = mapped_column(SQLEnum(LeadStatus), default=LeadStatus.PENDING_ASSESSMENT, nullable=False, comment="状态")
    audit_reason: Mapped[str | None] = mapped_column(Text, comment="审核/驳回理由")
    auditor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="审核人ID")
    audit_time: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="审核时间")

    # Metadata
    images: Mapped[list | None] = mapped_column(JSON, default=list, comment="图片列表")
    district: Mapped[str | None] = mapped_column(String(50), comment="行政区")
    business_area: Mapped[str | None] = mapped_column(String(50), comment="商圈")
    remarks: Mapped[str | None] = mapped_column(Text, comment="备注")

    # Linkage
    creator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="创建人ID")
    source_property_id: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="关联房源ID(软引用)")

    # Timestamps
    last_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="最后跟进时间")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="创建时间")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="更新时间",
    )

    # Relationships
    creator = relationship("User", foreign_keys=[creator_id], primaryjoin="foreign(Lead.creator_id) == User.id")
    auditor = relationship("User", foreign_keys=[auditor_id], primaryjoin="foreign(Lead.auditor_id) == User.id")
    follow_ups = relationship("LeadFollowUp", back_populates="lead", cascade="all, delete-orphan", primaryjoin="Lead.id == foreign(LeadFollowUp.lead_id)")
    price_history = relationship("LeadPriceHistory", back_populates="lead", cascade="all, delete-orphan", primaryjoin="Lead.id == foreign(LeadPriceHistory.lead_id)")

    @property
    def creator_name(self) -> str | None:
        """获取创建人名称."""
        return self.creator.nickname if self.creator else None

    __table_args__ = (
        Index("idx_lead_status", "status"),
        Index("idx_lead_community", "community_name"),
        Index("idx_lead_creator", "creator_id"),
    )


class LeadFollowUp(Base):
    """线索跟进记录."""

    __tablename__ = "lead_followups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, comment="UUID")
    lead_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="线索ID")

    method: Mapped[FollowUpMethod] = mapped_column(SQLEnum(FollowUpMethod), nullable=False, comment="跟进方式")
    content: Mapped[str] = mapped_column(Text, nullable=False, comment="跟进内容")
    followed_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="跟进时间")

    created_by_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="跟进人ID")

    # Relationships
    lead = relationship("Lead", back_populates="follow_ups", foreign_keys=[lead_id], primaryjoin="foreign(LeadFollowUp.lead_id) == Lead.id")
    created_by = relationship("User", foreign_keys=[created_by_id], primaryjoin="foreign(LeadFollowUp.created_by_id) == User.id")

    @property
    def created_by_name(self) -> str | None:
        """获取跟进人名称."""
        return self.created_by.nickname if self.created_by else None


class LeadPriceHistory(Base):
    """线索价格历史记录."""

    __tablename__ = "lead_price_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, comment="UUID")
    lead_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="线索ID")

    price: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="授权价格(万)")
    remark: Mapped[str | None] = mapped_column(Text, comment="调整备注/原因")
    recorded_at: Mapped[datetime] = mapped_column(DateTime, default=lambda: datetime.now(timezone.utc), comment="记录时间")

    created_by_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="记录人ID")

    # Relationships
    lead = relationship("Lead", back_populates="price_history", foreign_keys=[lead_id], primaryjoin="foreign(LeadPriceHistory.lead_id) == Lead.id")
    created_by = relationship("User", foreign_keys=[created_by_id], primaryjoin="foreign(LeadPriceHistory.created_by_id) == User.id")

    @property
    def created_by_name(self) -> str | None:
        """获取记录人名称."""
        return self.created_by.nickname if self.created_by else None
