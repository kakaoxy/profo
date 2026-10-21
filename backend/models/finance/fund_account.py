"""资金账户模型（账户 + 对账调整）.

设计要点（见 docs/To-Do/2026-10-21-资金账户管理-落地SPEC.md §3）：
- 账户余额**不落库**：balance = 期初 + Σ流入 − Σ流出 + Σ对账调整，
  推导在 Service 层现算，避免出现「余额与流水两份数」长期不一致。
- 对账调整只增不改不删：调错就再调一笔冲回，历史全部留痕。
- 账户软删除：有流水的账户拒绝删除，只能停用（status=off）；
  `is_deleted` 仅用于「从未记过账」的账户做软删除。
- `finance_records.account_id` 为逻辑外键，NULL 表示显式「没走账户」
  （不是忘填），故存量数据不做事后猜测性回填。
"""

import uuid
from datetime import date
from decimal import Decimal

from sqlalchemy import JSON, Boolean, Date, Index, Numeric, String, Text, Uuid
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, FundAccountStatus, FundAccountType


class FundAccount(BaseModel):
    """资金账户表."""

    __tablename__ = "fund_accounts"

    name: Mapped[str] = mapped_column(String(24), nullable=False, comment="账户名称(未删除时唯一)")
    type: Mapped[FundAccountType] = mapped_column(
        SQLEnum(FundAccountType, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        comment="账户类型: bank/corp/wechat/alipay/cash",
    )
    account_no: Mapped[str | None] = mapped_column(String(40), nullable=True, comment="卡号/账户号(掩码)")
    holder: Mapped[str | None] = mapped_column(String(50), nullable=True, comment="开户人(公司名或个人姓名)")
    opening_balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal(0), comment="期初余额(元)"
    )
    opening_date: Mapped[date] = mapped_column(Date, nullable=False, comment="期初余额起算日期")
    status: Mapped[FundAccountStatus] = mapped_column(
        SQLEnum(FundAccountStatus, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        default=FundAccountStatus.ACTIVE,
        comment="状态: active=在用 / off=停用",
    )
    note: Mapped[str | None] = mapped_column(String(120), nullable=True, comment="备注")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_fund_accounts_status", "status"),
        Index("idx_fund_accounts_deleted_status", "is_deleted", "status"),
    )


class FundAccountAdjustment(BaseModel):
    """账户对账调整记录表（只能新增，无更新/删除接口）.

    amount 为「实际余额 − 系统余额」的差额，可正可负；调用方须保证 ≠ 0
    （差额为 0 表示对上了，无需留痕），校验在 Service 层完成。
    """

    __tablename__ = "fund_account_adjustments"

    account_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, comment="账户ID(逻辑外键→fund_accounts.id)")
    adjust_date: Mapped[date] = mapped_column(Date, nullable=False, comment="调整计入日期")
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False, comment="差额(元,可正可负)")
    reason: Mapped[str] = mapped_column(Text, nullable=False, comment="差额原因(必填)")
    operator_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="操作人ID(逻辑外键)")
    receipt_urls: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, comment="对账凭证截图URL列表")

    __table_args__ = (Index("idx_fund_adjust_account_date", "account_id", "adjust_date"),)
