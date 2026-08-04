"""财务流水模型."""

from datetime import datetime
from decimal import Decimal

from sqlalchemy import JSON, Boolean, DateTime, Index, Numeric, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.common.base import BaseModel, CashFlowCategory, CashFlowType, CounterpartyType, FinanceActionType


class FinanceRecord(BaseModel):
    """财务流水明细表（替换cashflow_records）."""

    __tablename__ = "finance_records"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="项目ID(逻辑外键)")

    type: Mapped[CashFlowType] = mapped_column(
        SQLEnum(CashFlowType, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="流水类型：income/expense",
    )
    category: Mapped[CashFlowCategory] = mapped_column(
        SQLEnum(CashFlowCategory, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="费用类别",
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="金额(元)")
    record_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, comment="发生日期")
    operator_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="经办人ID")
    remark: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")
    counterparty: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="交易方")
    counterparty_type: Mapped[CounterpartyType | None] = mapped_column(
        SQLEnum(CounterpartyType, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        comment="支付方类型: company/individual",
    )
    receipt_urls: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="票据图片URL列表")

    subject_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, comment="科目ID(逻辑外键→finance_subjects.id)"
    )
    outflow: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=0, comment="流出金额(元)")
    inflow: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, default=0, comment="流入金额(元)")
    payer: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="付款方")
    payee: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="收款方")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 逻辑外键关联（无数据库 FK 约束，由 Service 层维护）
    # lazy="joined" 确保响应序列化时 subject 字段被填充（CashFlowRecordResponse.subject）
    subject: Mapped["FinanceSubject | None"] = relationship(
        primaryjoin="FinanceRecord.subject_id == FinanceSubject.id",
        foreign_keys="FinanceRecord.subject_id",
        lazy="joined",
    )

    __table_args__ = (
        Index("idx_finance_project_date", "project_id", "record_date"),
        Index("idx_finance_type_category", "type", "category"),
        Index("idx_finance_deleted", "is_deleted"),
    )


class FinanceRecordLog(BaseModel):
    """资金账本操作日志表 - 每次写操作记录一条.

    detail 使用 JSON 列存储操作详情（category/amount/type/counterparty/date）。
    operator 为逻辑外键，关联 users.id，级联由 Service 层处理。
    """

    __tablename__ = "finance_record_logs"

    project_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联项目ID(逻辑外键)")
    action_type: Mapped[FinanceActionType] = mapped_column(
        SQLEnum(FinanceActionType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="操作类型",
    )
    detail: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, comment="操作详情(JSON)")
    operator: Mapped[str] = mapped_column(String(36), nullable=False, comment="操作人ID(逻辑外键)")

    __table_args__ = (
        Index("idx_finance_log_project", "project_id"),
        Index("idx_finance_log_created", "created_at"),
    )


class FinanceSubject(BaseModel):
    """科目管理表 - 资金账本科目（系统预置 + 用户自定义）.

    替代原 CashFlowCategory 硬编码枚举，支持用户自定义科目 CRUD。
    name 唯一约束确保科目名称不重复；system=True 为系统预置科目，不可删除。
    id/created_at/updated_at 继承自 BaseModel，与 FinanceRecord 一致。
    """

    __tablename__ = "finance_subjects"

    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, comment="科目名称(唯一)")
    level: Mapped[str] = mapped_column(
        String(1),
        nullable=False,
        comment="成本层级1-7: ①取得成本/②直接改造成本/③交易费用/④资金成本/⑤现金流专属/⑥收入项/⑦配对项",
    )
    pnl: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, comment="是否进损益")
    # P2-11: PostgreSQL 使用 JSONB（支持 @> 包含查询与 GIN 索引），SQLite 测试回退到 JSON
    modes: Mapped[list[str]] = mapped_column(
        JSONB().with_variant(JSON, "sqlite"),
        nullable=False,
        comment="适用业务模式: ['agent']/['acquire']/两者",
    )
    stage: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="业务阶段: signing/renovation/holding/listing/sold",
    )
    note: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="备注")
    system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, comment="系统预置true/自定义false")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (Index("idx_subject_stage", "stage"),)
