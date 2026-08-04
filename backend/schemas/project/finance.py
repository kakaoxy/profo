"""项目财务相关Schema.

包含：
1. 现金流记录 (CashFlowRecordCreate, CashFlowRecordResponse)
2. 财务摘要和报表 (CashFlowSummary, CashFlowResponse, ProjectReportResponse)
3. 规范化财务表 (FinanceCreate, FinanceUpdate, FinanceResponse).
"""

from datetime import date, datetime
from decimal import Decimal

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, computed_field, field_serializer, field_validator

from models.common import (
    CashFlowCategory,
    CashFlowType,
    CounterpartyType,
    FinanceActionType,
    SettlementStatus,
    SubjectLevel,
    SubjectStage,
)

# ========== 现金流记录 (来自 project_finance.py) ==========


class CashFlowRecordCreate(BaseModel):
    """创建现金流."""

    type: CashFlowType
    category: CashFlowCategory
    amount: Decimal = Field(gt=0, description="金额(元)")
    date: datetime
    description: str | None = None
    related_stage: str | None = None
    counterparty: str = Field(..., description="交易方(必填)")
    counterparty_type: CounterpartyType | None = Field(None, description="支付方类型: company/individual")
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
    counterparty_type: CounterpartyType | None = Field(None, description="支付方类型")
    receipt_urls: list[str] = Field(default_factory=list, description="票据图片URL列表")
    # Task 5 新增字段
    subject_id: str | None = Field(None, description="科目ID(关联 finance_subjects.id)")
    outflow: Decimal = Field(default=Decimal(0), description="流出金额(元)")
    inflow: Decimal = Field(default=Decimal(0), description="流入金额(元)")
    payer: str | None = Field(None, description="付款方")
    payee: str | None = Field(None, description="收款方")
    subject: "FinanceSubjectResponse | None" = Field(None, description="科目信息(联表填充)")
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

    @field_serializer("amount", "outflow", "inflow")
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
        "total_investment",
        "total_income",
        "net_profit",
        "sale_price",
        "list_price",
        "signing_price",
    )
    def serialize_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


# ========== 规范化财务表 (来自 finance.py) ==========


class FinanceBase(BaseModel):
    """财务记录基础字段."""

    type: CashFlowType = Field(description="流水类型：income/expense")
    category: CashFlowCategory = Field(description="费用类别")
    amount: Decimal = Field(gt=0, description="金额(元)")
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
    """资金账本创建流水请求（含 project_id，不通过 URL path 传递）.

    新字段（主字段，Task 5）：
    - subject_id: 科目ID（必填，关联 finance_subjects.id）
    - outflow/inflow: 流出/流入金额（互斥，不能同时 > 0；Service 层校验）
    - payer/payee: 付款方/收款方

    兼容字段（旧客户端可选，新字段优先；Service 层会用新字段回填这些旧字段）：
    - type/category/amount/counterparty: 由 inflow/outflow/payer 推导
    """

    project_id: str = Field(description="项目ID")
    date: datetime = Field(description="发生日期")
    description: str | None = Field(None, description="备注")
    receipt_urls: list[str] | None = Field(None, description="票据图片URL列表")
    counterparty_type: CounterpartyType | None = Field(None, description="支付方类型: company/individual")

    # 新字段（主字段）
    subject_id: str = Field(..., description="科目ID(必填，关联 finance_subjects.id)")
    outflow: Decimal = Field(default=Decimal(0), ge=0, description="流出金额(元)")
    inflow: Decimal = Field(default=Decimal(0), ge=0, description="流入金额(元)")
    payer: str | None = Field(None, max_length=100, description="付款方")
    payee: str | None = Field(None, max_length=100, description="收款方")

    # 兼容字段（旧客户端可选，新字段优先）
    type: CashFlowType | None = Field(None, description="兼容字段: 流水类型(由 inflow/outflow 推导)")
    category: CashFlowCategory | None = Field(None, description="兼容字段: 费用类别(新字段体系下由 subject 替代)")
    amount: Decimal | None = Field(None, description="兼容字段: 金额(由 outflow/inflow 推导)")
    related_stage: str | None = Field(None, description="关联阶段(兼容字段)")
    counterparty: str | None = Field(None, max_length=100, description="兼容字段: 交易方(由 payer 推导)")

    model_config = ConfigDict(from_attributes=True)


class LedgerRecordUpdate(BaseModel):
    """资金账本流水更新请求（支持新字段与兼容字段的部分更新）.

    - 新字段：subject_id/outflow/inflow/payer/payee
    - 兼容字段：type/category/amount/counterparty（由新字段推导回填）
    - 通用字段：receipt_urls(追加)/counterparty_type/description/date
    - 如更新 outflow/inflow，Service 层会重新校验互斥性并回填 type/amount
    """

    # 新字段
    subject_id: str | None = Field(None, description="科目ID")
    outflow: Decimal | None = Field(None, ge=0, description="流出金额(元)")
    inflow: Decimal | None = Field(None, ge=0, description="流入金额(元)")
    payer: str | None = Field(None, max_length=100, description="付款方")
    payee: str | None = Field(None, max_length=100, description="收款方")

    # 兼容字段
    type: CashFlowType | None = Field(None, description="兼容字段: 流水类型")
    category: CashFlowCategory | None = Field(None, description="兼容字段: 费用类别")
    amount: Decimal | None = Field(None, description="兼容字段: 金额")
    counterparty: str | None = Field(None, max_length=100, description="兼容字段: 交易方")
    related_stage: str | None = Field(None, description="关联阶段(兼容字段)")

    # 通用字段
    receipt_urls: list[str] | None = Field(None, description="票据图片URL列表（追加）")
    counterparty_type: CounterpartyType | None = Field(None, description="支付方类型: company/individual")
    description: str | None = Field(None, description="备注")
    date: datetime | None = Field(None, description="发生日期")

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
# 统计页面 Schema 已拆分至 ledger_statistics.py（13 个模型），降低单文件行数。
# 聚合入口 schemas/project/__init__.py 同时从 .finance 与 .ledger_statistics 导出。


# ========== 应收应付参考表 ==========


class ReceivablePayableItem(BaseModel):
    """应收应付参考表单项."""

    type: CashFlowType
    business_type: str  # general/agent/wholesale
    stage: str  # 签约/装修/在售/已售/其他
    category: CashFlowCategory
    category_label: str  # 前端显示名
    calculation_logic: str  # 计算逻辑文本
    expected_amount: Decimal | None = None
    actual_amount: Decimal
    difference: Decimal | None = None

    @field_serializer("expected_amount", "difference")
    def serialize_optional_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    @field_serializer("actual_amount")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class ReceivablePayableResponse(BaseModel):
    """应收应付参考表响应."""

    items: list[ReceivablePayableItem]
    model_config = ConfigDict(from_attributes=True)


# ========== 科目管理 (FinanceSubject) ==========


class FinanceSubjectCreate(BaseModel):
    """创建科目请求.

    level 取值 1-7（SubjectLevel 枚举），stage 取值 signing/renovation/holding/listing/sold
    （SubjectStage 枚举）。system 字段由 Service 层强制为 False（用户自定义）。
    """

    name: str = Field(..., max_length=50, description="科目名称(唯一)")
    level: SubjectLevel = Field(..., description="成本层级1-7")
    pnl: bool = Field(..., description="是否进损益")
    modes: list[str] = Field(..., description="适用业务模式: ['agent']/['acquire']/两者")
    stage: SubjectStage = Field(..., description="业务阶段")
    note: str | None = Field(None, max_length=200, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FinanceSubjectUpdate(BaseModel):
    """更新科目请求.

    所有字段可选；system/is_deleted 不可通过本接口更新（system 为系统预置标记，
    is_deleted 由删除接口管理）。系统预置科目(system=True)的 name/level 不可修改。
    """

    name: str | None = Field(None, max_length=50, description="科目名称(唯一)")
    level: SubjectLevel | None = Field(None, description="成本层级1-7")
    pnl: bool | None = Field(None, description="是否进损益")
    modes: list[str] | None = Field(None, description="适用业务模式")
    stage: SubjectStage | None = Field(None, description="业务阶段")
    note: str | None = Field(None, max_length=200, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FinanceSubjectResponse(BaseModel):
    """科目响应."""

    id: str = Field(description="科目ID")
    name: str = Field(description="科目名称")
    level: SubjectLevel = Field(description="成本层级1-7")
    pnl: bool = Field(description="是否进损益")
    modes: list[str] = Field(description="适用业务模式")
    stage: SubjectStage = Field(description="业务阶段")
    note: str | None = Field(None, description="备注")
    system: bool = Field(description="系统预置true/自定义false")
    is_deleted: bool = Field(description="逻辑删除标记")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class FinanceSubjectFilter(BaseModel):
    """科目筛选条件."""

    mode: str | None = Field(None, description="按业务模式筛选(agent/acquire)")
    stage: SubjectStage | None = Field(None, description="按业务阶段筛选")
    level: SubjectLevel | None = Field(None, description="按成本层级筛选")
    system: bool | None = Field(None, description="按系统预置/自定义筛选")
    is_deleted: bool = Field(False, description="是否包含已删除(默认仅未删除)")  # noqa: FBT003
    search: str | None = Field(None, max_length=50, description="模糊搜索科目名称")

    model_config = ConfigDict(from_attributes=True)


# 前向引用 rebuild：CashFlowRecordResponse.subject 引用了下方定义的 FinanceSubjectResponse。
# Pydantic v2 在所有类定义完成后需 rebuild 才能正确解析前向引用。
CashFlowRecordResponse.model_rebuild()
