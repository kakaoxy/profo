"""资金账户 Pydantic Schema.

命名约定（AGENTS.md §2）：
- 实体 CRUD 用 ``*Create`` / ``*Update`` / ``*Response`` / ``*Filter``；
- 触发动作（解锁、对账调整、设密码）用 ``*Request`` 后缀。

金额一律用 ``Decimal`` 参与计算，出参用 ``field_serializer`` 转 ``float``——
与 ``CashFlowRecordResponse`` 现有做法一致，避免前端出现字符串数字。
"""

from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_serializer

from models.common import FundAccountStatus, FundAccountType

# ========== 账户 ==========

_ACCOUNT_NAME_MAX = 24
_ACCOUNT_NO_MAX = 40
_ACCOUNT_HOLDER_MAX = 50
_ACCOUNT_NOTE_MAX = 120


class FundAccountCreate(BaseModel):
    """新建资金账户请求."""

    name: str = Field(..., min_length=1, max_length=_ACCOUNT_NAME_MAX, description="账户名称(未删除时唯一)")
    type: FundAccountType = Field(..., description="账户类型")
    account_no: str | None = Field(None, max_length=_ACCOUNT_NO_MAX, description="卡号/账户号(掩码)")
    holder: str | None = Field(None, max_length=_ACCOUNT_HOLDER_MAX, description="开户人或持有公司")
    opening_balance: Decimal = Field(Decimal(0), ge=0, decimal_places=2, description="期初余额(元,最多 2 位小数)")
    opening_date: date = Field(..., description="期初余额起算日期")
    status: FundAccountStatus = Field(FundAccountStatus.ACTIVE, description="状态: active/off")
    note: str | None = Field(None, max_length=_ACCOUNT_NOTE_MAX, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FundAccountUpdate(BaseModel):
    """更新资金账户请求（所有字段可选，仅传需要改的）.

    允许修改期初余额与起算日期：改后期初变动会直接改变推导余额，
    响应体回传新 ``balance`` 供前端提示「改完变成 ¥X」。
    """

    name: str | None = Field(None, min_length=1, max_length=_ACCOUNT_NAME_MAX, description="账户名称")
    type: FundAccountType | None = Field(None, description="账户类型")
    account_no: str | None = Field(None, max_length=_ACCOUNT_NO_MAX, description="卡号/账户号")
    holder: str | None = Field(None, max_length=_ACCOUNT_HOLDER_MAX, description="开户人")
    opening_balance: Decimal | None = Field(None, ge=0, decimal_places=2, description="期初余额(元,最多 2 位小数)")
    opening_date: date | None = Field(None, description="期初余额起算日期")
    status: FundAccountStatus | None = Field(None, description="状态: active/off")
    note: str | None = Field(None, max_length=_ACCOUNT_NOTE_MAX, description="备注")

    model_config = ConfigDict(from_attributes=True)


class FundAccountFilter(BaseModel):
    """资金账户列表筛选条件."""

    search: str | None = Field(None, max_length=50, description="模糊搜索: 名称/卡号/开户人/备注")
    type: FundAccountType | None = Field(None, description="账户类型")
    status: FundAccountStatus | None = Field(None, description="账户状态")
    sort: str = Field("balance", description="排序: balance/last/name")

    model_config = ConfigDict(from_attributes=True)


class FundAccountResponse(BaseModel):
    """资金账户响应（含由流水推导的余额与进出合计）.

    余额口径：``opening_balance + inflow_total − outflow_total + adjust_total``，
    **不落库**，每次按未删除流水现算。
    """

    id: str = Field(description="账户ID")
    name: str = Field(description="账户名称")
    type: FundAccountType = Field(description="账户类型")
    account_no: str | None = Field(None, description="卡号/账户号")
    holder: str | None = Field(None, description="开户人")
    opening_balance: Decimal = Field(description="期初余额(元)")
    opening_date: date = Field(description="期初余额起算日期")
    status: FundAccountStatus = Field(description="状态")
    note: str | None = Field(None, description="备注")

    balance: Decimal = Field(description="当前余额(推导值)")
    inflow_total: Decimal = Field(Decimal(0), description="累计流入")
    outflow_total: Decimal = Field(Decimal(0), description="累计流出")
    adjust_total: Decimal = Field(Decimal(0), description="累计对账调整")
    flow_count: int = Field(0, description="流水笔数")
    last_flow_date: date | None = Field(None, description="最后一笔流水日期")

    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    @field_serializer(
        "opening_balance",
        "balance",
        "inflow_total",
        "outflow_total",
        "adjust_total",
    )
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class FundAccountListResponse(BaseModel):
    """资金账户列表响应."""

    items: list[FundAccountResponse]
    total: int
    total_balance: Decimal = Field(Decimal(0), description="全部账户余额合计")

    @field_serializer("total_balance")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class FundAccountOption(BaseModel):
    """资金账户「选项」响应（供记账选账户，**不含任何余额/金额字段**）.

    为什么单独一个模型：记账弹窗需要在**未解锁**资金账户模块时也能列出账户名，
    但余额属于敏感信息，必须由解锁后的接口提供。用独立模型而不是把余额字段
    置空，可以从类型层面保证「这个接口永远不会返回钱」。
    """

    id: str = Field(description="账户ID")
    name: str = Field(description="账户名称")
    type: FundAccountType = Field(description="账户类型")
    account_no: str | None = Field(None, description="卡号/账户号")
    status: FundAccountStatus = Field(description="状态")
    is_locked: bool = Field(default=False, description="当前会话是否未解锁该账户模块（true 时余额一律不下发）")

    model_config = ConfigDict(from_attributes=True)


class FundAccountOptionListResponse(BaseModel):
    """资金账户选项列表响应."""

    items: list[FundAccountOption]
    total: int

    model_config = ConfigDict(from_attributes=True)


class FundAccountSummaryResponse(BaseModel):
    """资金账户总览 KPI."""

    active_count: int = Field(0, description="在用账户数")
    total_balance: Decimal = Field(Decimal(0), description="在用账户余额合计")
    month_inflow: Decimal = Field(Decimal(0), description="本月流入合计")
    month_outflow: Decimal = Field(Decimal(0), description="本月流出合计")
    adjust_total: Decimal = Field(Decimal(0), description="累计对账调整合计(带符号)")
    last_adjust_date: date | None = Field(None, description="最近一次对账调整日期")
    untracked_count: int = Field(0, description="未挂账户的流水笔数")
    untracked_amount: Decimal = Field(Decimal(0), description="未挂账户流水金额合计")

    @field_serializer("total_balance", "month_inflow", "month_outflow", "adjust_total", "untracked_amount")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


# ========== 对账调整 ==========


class FundAdjustmentCreateRequest(BaseModel):
    """对账调整请求（仅新增，无更新/删除接口）.

    ``amount`` = 实际余额 − 系统余额，可正可负但**不能为 0**（0 表示对上了，无需留痕），
    校验在 Service 层完成以便返回统一业务错误。
    """

    adjust_date: date = Field(..., description="调整计入日期")
    # ⚠️ decimal_places=2（2026-10-22 缺陷修复）：入参此前无精度约束，而落库列是
    # NUMERIC(15,2)，PostgreSQL 会**静默四舍五入**。实测 actual_balance=1000.005、
    # 系统余额 1000 时算出「差额 0.005」，落库被四舍五入为 0.01，账户余额成了
    # 1000.01——用户填 1000.005、系统显示 1000.01，且差额列已无法反推原值。
    # 现在超过 2 位小数直接 422 拒绝，把「元角分」这一精度边界显式告知调用方。
    actual_balance: Decimal = Field(..., decimal_places=2, description="对账后的实际余额(元,最多 2 位小数)")
    reason: str = Field(..., min_length=1, max_length=500, description="差额原因(必填)")
    receipt_urls: list[str] | None = Field(None, description="对账凭证截图URL列表")

    model_config = ConfigDict(from_attributes=True)


class FundAdjustmentResponse(BaseModel):
    """对账调整记录响应."""

    id: str = Field(description="调整记录ID")
    account_id: str = Field(description="账户ID")
    account_name: str | None = Field(None, description="账户名称(冗余)")
    adjust_date: date = Field(description="调整计入日期")
    amount: Decimal = Field(description="差额(元,可正可负)")
    reason: str = Field(description="差额原因")
    operator_id: str = Field(description="操作人ID")
    operator_name: str | None = Field(None, description="操作人名称(冗余)")
    receipt_urls: list[str] = Field(default_factory=list, description="对账凭证截图URL列表")
    created_at: datetime = Field(description="创建时间")

    @field_serializer("amount")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


class FundAdjustmentReceiptsRequest(BaseModel):
    """补传核对调整凭证请求（**仅追加 receipt_urls**）.

    设计约束：调整记录「只加不改不删」——金额/原因/日期一经写入不可变（会计留痕）。
    唯一允许的后续修改是**补充凭证**（与「记一笔后补票据」同一性质，不改任何金额语义）。
    因此本请求刻意只有一个字段：任何试图改金额/原因的字段都不会被接受。
    """

    receipt_urls: list[str] = Field(..., min_length=1, description="要追加的凭证URL列表")

    model_config = ConfigDict(from_attributes=True)


# ========== 账户流水 ==========


class FundFlowItem(BaseModel):
    """账户流水行（两种来源合并，见 ``source`` 字段）.

    为什么合并：账户余额口径是「期初 + Σ流入 − Σ流出 **± Σ核对调整**」。若流水页只列
    ``finance_records``，则「利息入账 / 银行卡年费」这类**与项目无关**的账户资金变动
    完全不可见，且页面上的进出合计无论怎么加都推不出余额——流水页与余额公式对不上。

    ``source`` 取值：
    - ``record``：来自项目记账（``finance_records``），必有项目；
    - ``adjustment``：来自余额核对（``fund_account_adjustments``），**无项目**，
      带 ``reason``/已折算好的 ``inflow``/``outflow``。
    """

    source: Literal["record", "adjustment"] = Field(
        "record", description="行来源: record=项目记账 / adjustment=余额核对调整"
    )
    record_id: str = Field(description="流水ID（调整行为 fund_account_adjustments.id）")
    # 调整记录与项目无关，故项目字段可空（前端显示「非项目收支」）
    project_id: str | None = Field(None, description="项目ID(NULL=非项目收支，或未走账户)")
    project_name: str | None = Field(None, description="项目名称")
    project_code: str | None = Field(None, description="项目编号")
    subject_name: str | None = Field(None, description="科目名称(调整行为空)")
    record_date: date = Field(description="发生日期")
    outflow: Decimal = Field(Decimal(0), description="流出金额")
    inflow: Decimal = Field(Decimal(0), description="流入金额")
    payer: str | None = Field(None, description="付款方")
    payee: str | None = Field(None, description="收款方")
    account_id: str | None = Field(None, description="资金账户ID(NULL=未走账户)")
    account_name: str | None = Field(None, description="资金账户名称(冗余)")
    operator_name: str | None = Field(None, description="记账人名称(冗余)")
    receipt_count: int = Field(0, description="票据张数")
    receipt_urls: list[str] = Field(default_factory=list, description="凭证URL列表(供前端缩略图预览与补传判断)")
    remark: str | None = Field(None, description="备注")
    # 调整行专用
    reason: str | None = Field(None, description="调整原因(仅 source=adjustment)")
    adjust_amount: Decimal | None = Field(
        None, description="调整差额(带符号,仅 source=adjustment)，可直接用于核对余额公式"
    )

    @field_serializer("outflow", "inflow")
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    @field_serializer("adjust_amount")
    def serialize_optional_decimal(self, v: Decimal | None) -> float | None:
        return float(v) if v is not None else None

    model_config = ConfigDict(from_attributes=True)


class FundFlowListResponse(BaseModel):
    """账户流水列表响应（含筛选范围内进出合计与来源明细）."""

    items: list[FundFlowItem]
    total: int
    page: int
    page_size: int
    total_inflow: Decimal = Field(Decimal(0), description="筛选范围流入合计(项目记账流入 + 调整正数)")
    total_outflow: Decimal = Field(Decimal(0), description="筛选范围流出合计(项目记账流出 + 调整负数绝对值)")
    record_inflow: Decimal = Field(Decimal(0), description="其中：项目记账流入")
    record_outflow: Decimal = Field(Decimal(0), description="其中：项目记账流出")
    adjustment_inflow: Decimal = Field(Decimal(0), description="其中：核对调整(正)计入流入")
    adjustment_outflow: Decimal = Field(Decimal(0), description="其中：核对调整(负)计入流出")

    @field_serializer(
        "total_inflow",
        "total_outflow",
        "record_inflow",
        "record_outflow",
        "adjustment_inflow",
        "adjustment_outflow",
    )
    def serialize_decimal(self, v: Decimal) -> float:
        return float(v)

    model_config = ConfigDict(from_attributes=True)


# ========== 入口锁 ==========


class FundAccountUnlockRequest(BaseModel):
    """模块解锁请求."""

    password: str = Field(..., min_length=6, max_length=6, description="6 位数字模块密码")

    model_config = ConfigDict(from_attributes=True)


class FundAccountUnlockResponse(BaseModel):
    """模块解锁响应.

    ``token`` 仅在成功时返回，前端存 sessionStorage 并以 ``X-Accounts-Unlock`` 头携带；
    ``seconds_left`` 为令牌剩余有效期（滑动过期，每次受保护请求会重置）。
    """

    unlocked: bool = Field(description="是否已解锁")
    token: str | None = Field(None, description="解锁令牌(仅成功时返回)")
    seconds_left: int = Field(0, description="令牌剩余秒数")
    attempts_left: int = Field(0, description="剩余尝试次数")
    retry_after_seconds: int | None = Field(None, description="锁定剩余秒数(仅锁定时返回)")

    model_config = ConfigDict(from_attributes=True)


class FundAccountLockStateResponse(BaseModel):
    """模块锁状态响应（未解锁也可调用，供锁屏渲染）."""

    has_password: bool = Field(description="是否已设置模块密码")
    unlocked: bool = Field(description="当前令牌是否有效")
    seconds_left: int = Field(0, description="令牌剩余秒数")
    attempts_left: int = Field(0, description="剩余尝试次数")
    retry_after_seconds: int | None = Field(None, description="锁定剩余秒数")

    model_config = ConfigDict(from_attributes=True)


class FundAccountPasswordSetRequest(BaseModel):
    """设置/重设模块密码请求.

    ``old_password`` 仅在「已设过密码」时必填；首次设置可为空。
    """

    new_password: str = Field(..., min_length=6, max_length=6, description="新密码(6 位数字)")
    old_password: str | None = Field(None, min_length=6, max_length=6, description="原密码(重设时必填)")

    model_config = ConfigDict(from_attributes=True)
