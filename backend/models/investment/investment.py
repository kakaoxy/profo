"""投资管理（跟投管理）核心模型.

定义跟投记录、投资方、回报率调整、操作日志四张表。
关联使用逻辑外键，级联由 Service 层处理。
"""

from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    Date,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.common.base import (
    BaseModel,
    InvestmentActionType,
    InvestorType,
    SettlementStatus,
)


class Investment(BaseModel):
    """跟投记录表 - 每个项目一条跟投记录.

    冗余存储 project_code / project_name 便于列表展示，
    通过 project_id 逻辑外键关联 Project 表。
    """

    __tablename__ = "investments"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联项目ID(逻辑外键)")
    project_code: Mapped[str] = mapped_column(String(100), nullable=False, comment="项目编号(冗余)")
    project_name: Mapped[str] = mapped_column(String(700), nullable=False, comment="项目名称(冗余)")

    total_investment: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="投资总额(元)")
    total_return: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, comment="收益总额(元)")

    settlement_status: Mapped[SettlementStatus] = mapped_column(
        SQLEnum(SettlementStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=SettlementStatus.UNSETTLED,
        comment="结算状态: unsettled/settled",
    )
    settled_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="结算日期")
    settled_note: Mapped[str | None] = mapped_column(Text, nullable=True, comment="结算说明")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")

    created_by: Mapped[str] = mapped_column(String(36), nullable=False, comment="创建人ID(逻辑外键)")

    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="软删除时间")

    # 关联关系（逻辑外键，级联由 Service 处理）
    investors = relationship(
        "Investor",
        back_populates="investment",
        primaryjoin="Investment.id == foreign(Investor.investment_id)",
        foreign_keys="Investor.investment_id",
        cascade="all, delete-orphan",
    )
    return_adjustments = relationship(
        "ReturnAdjustment",
        back_populates="investment",
        primaryjoin="Investment.id == foreign(ReturnAdjustment.investment_id)",
        foreign_keys="ReturnAdjustment.investment_id",
        cascade="all, delete-orphan",
    )
    logs = relationship(
        "InvestmentLog",
        back_populates="investment",
        primaryjoin="Investment.id == foreign(InvestmentLog.investment_id)",
        foreign_keys="InvestmentLog.investment_id",
        cascade="all, delete-orphan",
    )

    __table_args__ = (
        Index("idx_investment_project", "project_id"),
        Index("idx_investment_settlement", "settlement_status"),
        Index("idx_investment_deleted", "deleted_at"),
        Index("idx_investment_created_by", "created_by"),
    )


class Investor(BaseModel):
    """投资方表 - 母投资方与子投资人通过 parent_id 自关联.

    母投资方 parent_id=NULL，share_ratio 为占项目总投资额比例；
    子投资人 parent_id=母投资方.id，share_ratio 为占母投资方份额的内部占比。
    invest_amount 由业务层计算（母: total_investment × share_ratio；子: 母金额 × 内部占比）。
    """

    __tablename__ = "investors"

    investment_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联跟投记录ID(逻辑外键)")
    name: Mapped[str] = mapped_column(String(200), nullable=False, comment="投资方名称")
    type: Mapped[InvestorType] = mapped_column(
        SQLEnum(InvestorType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="投资方类型: enterprise/individual",
    )
    share_ratio: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, comment="占比(母:占项目比例; 子:内部占比)"
    )
    invest_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="投资金额(元)")
    parent_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="母投资方ID(自关联)")
    sort_order: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="排序序号")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")

    # 关联关系
    investment = relationship(
        "Investment",
        back_populates="investors",
        foreign_keys=[investment_id],
        primaryjoin="foreign(Investor.investment_id) == Investment.id",
    )
    # 母投资方 -> 子投资人（one-to-many）：local=id, remote=parent_id
    sub_investors = relationship(
        "Investor",
        back_populates="parent",
        primaryjoin="foreign(Investor.parent_id) == Investor.id",
        remote_side="Investor.parent_id",
        cascade="all, delete-orphan",
    )
    # 子投资人 -> 母投资方（many-to-one）：local=parent_id, remote=id
    parent = relationship(
        "Investor",
        back_populates="sub_investors",
        foreign_keys=[parent_id],
        primaryjoin="foreign(Investor.parent_id) == Investor.id",
        remote_side="Investor.id",
    )

    __table_args__ = (
        Index("idx_investor_investment", "investment_id"),
        Index("idx_investor_parent", "parent_id"),
    )


class ReturnAdjustment(BaseModel):
    """收益分配比例调整记录表 - 每次批量调整按母投资方各存一条.

    分配比例 = 该投资方占 total_return 的百分比。默认等于投资占比 share_ratio，
    可调整以适应优先资金等场景（如投70%只分配30%收益）。
    """

    __tablename__ = "return_adjustments"

    investment_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联跟投记录ID(逻辑外键)")
    investor_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联投资方ID(逻辑外键)")
    default_distribution_ratio: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, comment="默认分配比例(%)=投资占比"
    )
    adjusted_distribution_ratio: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, comment="调整后分配比例(%)"
    )
    adjusted_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="调整后收益金额(元)")
    adjusted_by: Mapped[str] = mapped_column(String(36), nullable=False, comment="调整人ID(逻辑外键)")
    adjusted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="调整时间")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="调整备注")

    investment = relationship(
        "Investment",
        back_populates="return_adjustments",
        foreign_keys=[investment_id],
        primaryjoin="foreign(ReturnAdjustment.investment_id) == Investment.id",
    )

    __table_args__ = (
        Index("idx_return_adj_investment", "investment_id"),
        Index("idx_return_adj_investor", "investor_id"),
    )


class InvestmentLog(BaseModel):
    """操作日志表 - 每次写操作记录一条.

    detail 使用 JSON 列存储变更前后对比，变更时需 flag_modified 触发更新。
    """

    __tablename__ = "investment_logs"

    investment_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联跟投记录ID(逻辑外键)")
    action_type: Mapped[InvestmentActionType] = mapped_column(
        SQLEnum(InvestmentActionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="操作类型",
    )
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, comment="操作详情(JSON)")
    operator: Mapped[str] = mapped_column(String(36), nullable=False, comment="操作人ID(逻辑外键)")

    investment = relationship(
        "Investment",
        back_populates="logs",
        foreign_keys=[investment_id],
        primaryjoin="foreign(InvestmentLog.investment_id) == Investment.id",
    )

    __table_args__ = (
        Index("idx_investment_log_investment", "investment_id"),
        Index("idx_investment_log_action", "action_type"),
    )
