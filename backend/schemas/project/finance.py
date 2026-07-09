"""项目财务相关Schema.

包含：
1. 现金流记录 (CashFlowRecordCreate, CashFlowRecordResponse)
2. 财务摘要和报表 (CashFlowSummary, CashFlowResponse, ProjectReportResponse)
3. 规范化财务表 (FinanceCreate, FinanceUpdate, FinanceResponse).
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_serializer, field_validator

from models.common import CashFlowCategory, CashFlowType, FinanceActionType, SettlementStatus

# ========== 现金流记录 (来自 project_finance.py) ==========


class CashFlowRecordCreate(BaseModel):
    """创建现金流."""

    type: CashFlowType
    category: CashFlowCategory
    amount: Decimal
    date: datetime
    description: str | None = None
    related_stage: str | None = None
    counterparty: str = Field(..., description="交易方(必填)")
    receipt_urls: list[str] | None = None

    model_config = ConfigDict(from_attributes=True)


class CashFlowRecordResponse(BaseModel):
    """现金流记录响应 - 适配新的FinanceRecord表."""

    id: str
    project_id: str
    type: CashFlowType
    category: CashFlowCategory
    amount: Decimal
    record_date: datetime = Field(description="发生日期")  # 新字段名
    remark: str | None = Field(None, description="备注")  # 新字段名
    operator_id: str | None = Field(None, description="经办人ID")  # 新字段
    counterparty: str | None = Field(None, description="交易方")
    receipt_urls: list[str] = Field(default_factory=list, description="票据图片URL列表")
    created_at: datetime
    updated_at: datetime

    @field_validator("receipt_urls", mode="before")
    @classmethod
    def _coerce_receipt_urls(cls, v: object) -> list[str]:
        """数据库中旧记录 receipt_urls 可能为 NULL，统一转为空数组."""
        if v is None:
            return []
        if isinstance(v, list):
            return v
        # 兼容残留的字符串类型（如未迁移的 receipt_url 单值）
        return [str(v)]

    # 兼容旧字段（用于响应）- 使用 computed_field 确保序列化
    @computed_field
    @property
    def date(self) -> datetime:
        """兼容旧字段 date（返回 record_date）."""
        return self.record_date

    @computed_field
    @property
    def description(self) -> str | None:
        """兼容旧字段 description（返回 remark）."""
        return self.remark

    @computed_field
    @property
    def related_stage(self) -> str | None:
        """兼容旧字段 related_stage（始终返回 None）."""
        return None

    @computed_field
    @property
    def receipt_url(self) -> str | None:
        """兼容旧字段 receipt_url（返回 receipt_urls 首项，空则 None）."""
        return self.receipt_urls[0] if self.receipt_urls else None

    @field_serializer("amount")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class CashFlowSummary(BaseModel):
    """现金流摘要."""

    total_income: Decimal
    total_expense: Decimal
    net_cash_flow: Decimal
    roi: float
    annualized_return: float = 0.0
    holding_days: int = 0

    @field_serializer("total_income", "total_expense", "net_cash_flow")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class CashFlowResponse(BaseModel):
    """现金流响应."""

    records: list[CashFlowRecordResponse]
    summary: CashFlowSummary
    model_config = ConfigDict(from_attributes=True)


class ProjectReportResponse(BaseModel):
    """财务报表 - 适配新的规范化表结构."""

    project_id: str
    project_name: str | None = None
    community_name: str | None = None
    status: str

    signing_date: datetime | None
    renovation_start_date: datetime | None
    renovation_end_date: datetime | None = None
    listing_date: datetime | None
    sold_date: datetime | None

    total_investment: Decimal
    total_income: Decimal
    net_profit: Decimal
    roi: float

    address: str | None = None
    sale_price: Decimal | None = None
    list_price: Decimal | None = None
    signing_price: Decimal | None = None

    @field_serializer(
        "total_investment", "total_income", "net_profit",
        "sale_price", "list_price", "signing_price",
    )
    def serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


# ========== 规范化财务表 (来自 finance.py) ==========


class FinanceBase(BaseModel):
    """财务记录基础字段."""

    type: CashFlowType = Field(description="流水类型：income/expense")
    category: CashFlowCategory = Field(description="费用类别")
    amount: Decimal = Field(description="金额(元)")
    record_date: datetime = Field(description="发生日期")
    operator_id: str | None = Field(None, description="经办人ID")
    remark: str | None = Field(None, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FinanceCreate(FinanceBase):
    """创建财务记录请求."""

    project_id: str = Field(description="项目ID")


class FinanceUpdate(BaseModel):
    """更新财务记录请求."""

    type: CashFlowType | None = None
    category: CashFlowCategory | None = None
    amount: Decimal | None = None
    record_date: datetime | None = None
    operator_id: str | None = None
    remark: str | None = None


class FinanceResponse(FinanceBase):
    """财务记录响应."""

    id: str = Field(description="财务记录ID")
    project_id: str = Field(description="项目ID")
    created_at: datetime
    updated_at: datetime


class FinanceListResponse(BaseModel):
    """财务记录列表响应."""

    items: list[FinanceResponse]
    total: int


# ========== 资金账本 (Ledger) ==========


class LedgerRecordCreate(BaseModel):
    """资金账本创建流水请求（含 project_id，不通过 URL path 传递）."""

    project_id: str = Field(description="项目ID")
    type: CashFlowType
    category: CashFlowCategory
    amount: Decimal = Field(description="金额(元)")
    date: datetime = Field(description="发生日期")
    description: str | None = Field(None, description="备注")
    related_stage: str | None = Field(None, description="关联阶段(兼容字段)")
    counterparty: str = Field(..., description="交易方(必填)")
    receipt_urls: list[str] | None = Field(None, description="票据图片URL列表")

    model_config = ConfigDict(from_attributes=True)


class LedgerProjectListItem(BaseModel):
    """资金账本项目列表项（含聚合统计）."""

    project_id: str
    project_code: str | None = None
    project_name: str | None = None
    project_address: str | None = None
    project_status: str | None = None
    total_income: Decimal
    total_expense: Decimal
    net_cash_flow: Decimal
    roi: float
    record_count: int

    @field_serializer("total_income", "total_expense", "net_cash_flow")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class LedgerListResponse(BaseModel):
    """资金账本列表响应."""

    items: list[LedgerProjectListItem]
    total: int
    page: int
    page_size: int


class LedgerStatsResponse(BaseModel):
    """资金账本全局汇总."""

    total_projects: int
    total_income: Decimal
    total_expense: Decimal
    net_cash_flow: Decimal
    total_records: int

    @field_serializer("total_income", "total_expense", "net_cash_flow")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


# ========== 操作日志 ==========


class FinanceLogResponse(BaseModel):
    """资金账本操作日志响应.

    operator_id / operator_name 为冗余字段，由 Service 层联表 User 填充。
    """

    id: str = Field(description="日志ID")
    project_id: str = Field(description="关联项目ID")
    action_type: FinanceActionType = Field(description="操作类型")
    detail: dict = Field(default_factory=dict, description="操作详情(JSON)")
    operator_id: str = Field(
        description="操作人ID",
        validation_alias=AliasChoices("operator_id", "operator"),
    )
    operator_name: str | None = Field(None, description="操作人名称(冗余)")
    created_at: datetime = Field(description="操作时间")


# ========== 结算 / 反结算 ==========
# 命名说明：以下 *Request 后缀表示"触发动作"（状态流转），非实体 CRUD，
# 故不使用 *Create/*Update；与 ProjectCompleteRequest 等保持一致。


class FinanceSettlementChangeRequest(BaseModel):
    """资金账本结算请求（unsettled → settled）."""

    settled_date: date = Field(description="结算日期")
    settled_note: str | None = Field(None, max_length=500, description="结算说明")

    model_config = ConfigDict(from_attributes=True)


class FinanceUnsettleRequest(BaseModel):
    """资金账本反结算请求（settled → unsettled）."""

    reason: str = Field(min_length=1, max_length=500, description="反结算原因")

    model_config = ConfigDict(from_attributes=True)


class FinanceSettlementResponse(BaseModel):
    """资金账本结算状态响应."""

    finance_settlement_status: SettlementStatus = Field(description="结算状态")
    finance_settled_date: date | None = Field(None, description="结算日期")
    finance_settled_note: str | None = Field(None, description="结算说明")

    model_config = ConfigDict(from_attributes=True)


# ========== 资金账本统计页面 ==========


class LedgerStatisticsProjectBase(BaseModel):
    """统计页面 - 项目基础信息."""

    community_name: str | None = None
    address: str | None = None
    area: Decimal | None = Decimal(0)
    status: str | None = None
    delivery_date: datetime | None = None
    deal_date: datetime | None = None
    project_days: int = 0

    @field_serializer("area")
    def _serialize_area(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsInvestor(BaseModel):
    """统计页面 - 跟投人项."""

    name: str | None = None
    share_ratio: Decimal | None = Decimal(0)
    invest_amount: Decimal | None = Decimal(0)
    paid_amount: Decimal | None = Decimal(0)

    @field_serializer("share_ratio", "invest_amount", "paid_amount")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsInvestment(BaseModel):
    """统计页面 - 投资情况."""

    investors: list[LedgerStatisticsInvestor] = Field(default_factory=list)
    total_investment: Decimal | None = Decimal(0)
    total_paid: Decimal | None = Decimal(0)
    total_unpaid: Decimal | None = Decimal(0)
    pay_progress: float = 0.0

    @field_serializer("total_investment", "total_paid", "total_unpaid")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsRenovation(BaseModel):
    """统计页面 - 装修预算."""

    company: str | None = None
    total_fee: Decimal | None = Decimal(0)
    hard_amount: Decimal | None = Decimal(0)
    hard_unit_price: Decimal | None = Decimal(0)
    soft_actual: Decimal | None = Decimal(0)
    custom_cabinet: Decimal | None = Decimal(0)
    window: Decimal | None = Decimal(0)
    wall_treatment: Decimal | None = Decimal(0)
    other_fee: Decimal | None = Decimal(0)
    days: int = 0

    @field_serializer(
        "total_fee", "hard_amount", "hard_unit_price", "soft_actual",
        "custom_cabinet", "window", "wall_treatment", "other_fee",
    )
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsDeposit(BaseModel):
    """统计页面 - 履约保证金."""

    amount: Decimal | None = Decimal(0)
    pay_date: datetime | None = None
    recovery: Decimal | None = Decimal(0)
    receive_date: datetime | None = None
    is_refunded: str | None = None
    diff: Decimal | None = Decimal(0)

    @field_serializer("amount", "recovery", "diff")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsCommission(BaseModel):
    """统计页面 - 渠道佣金及税费."""

    channel_commission: Decimal | None = Decimal(0)
    agent_commission: Decimal | None = Decimal(0)
    owner_commission: Decimal | None = Decimal(0)
    tax_diff: Decimal | None = Decimal(0)
    total: Decimal | None = Decimal(0)

    @field_serializer("channel_commission", "agent_commission", "owner_commission", "tax_diff", "total")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsMarketing(BaseModel):
    """统计页面 - 营销推广费."""

    marketing_fee: Decimal | None = Decimal(0)
    advance: Decimal | None = Decimal(0)
    deduction: Decimal | None = Decimal(0)
    total: Decimal | None = Decimal(0)

    @field_serializer("marketing_fee", "advance", "deduction", "total")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsOperation(BaseModel):
    """统计页面 - 运营成本."""

    operation_fee: Decimal | None = Decimal(0)
    maintenance_reserve: Decimal | None = Decimal(0)
    tax_cost: Decimal | None = Decimal(0)
    total: Decimal | None = Decimal(0)

    @field_serializer("operation_fee", "maintenance_reserve", "tax_cost", "total")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class LedgerStatisticsSummary(BaseModel):
    """统计页面 - 资金汇总 KPI."""

    total_expense: Decimal | None = Decimal(0)
    initial_investment: Decimal | None = Decimal(0)
    gross_profit: Decimal | None = Decimal(0)
    net_profit: Decimal | None = Decimal(0)
    occupy_days: int = 0
    roi: float = 0.0
    annual_roi: float = 0.0
    project_income: Decimal | None = Decimal(0)

    @field_serializer("total_expense", "initial_investment", "gross_profit", "net_profit", "project_income")
    def _serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class ProjectLedgerStatisticsResponse(BaseModel):
    """资金账本统计页面聚合响应（8 分组）."""

    project_base: LedgerStatisticsProjectBase
    investment: LedgerStatisticsInvestment
    renovation: LedgerStatisticsRenovation
    deposit: LedgerStatisticsDeposit
    commission: LedgerStatisticsCommission
    marketing: LedgerStatisticsMarketing
    operation: LedgerStatisticsOperation
    summary: LedgerStatisticsSummary

    model_config = ConfigDict(from_attributes=True)
