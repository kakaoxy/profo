"""资金账户服务（账户 CRUD + 余额推导 + 对账调整 + 账户流水）.

余额口径（SPEC §3.4，前后端同式）：

    balance = opening_balance
            + Σ(inflow  where account_id = X and is_deleted = false)
            − Σ(outflow where account_id = X and is_deleted = false)
            + Σ(adjustment.amount where account_id = X)

余额**不落库**：任何「余额副本」都会在漏记一笔时与流水长期不一致，而账户余额的唯一
可用价值就是「和银行卡对得上」。故本服务每次现算，并用 SQL 聚合一次算完全部账户，
避免 N+1（列表页最多几十个账户，1 条聚合 SQL + 1 条调整聚合 SQL）。

对账调整只增不改不删：调错了就再调一笔冲回，历史全程留痕（设计稿硬要求）。
"""

import logging
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any

from fastapi import Request
from sqlalchemy import (
    Date,
    Numeric,
    String,
    Text,
    case,
    cast,
    false,
    func,
    literal,
    or_,
)
from sqlalchemy.orm import Query, Session
from sqlalchemy.sql.selectable import Subquery

from models import (
    FinanceRecord,
    FinanceSubject,
    FundAccount,
    FundAccountAdjustment,
    Project,
    ProjectContract,
    User,
)
from models.common import FundAccountStatus
from schemas.finance import (
    FundAccountCreate,
    FundAccountFilter,
    FundAccountListResponse,
    FundAccountOption,
    FundAccountResponse,
    FundAccountSummaryResponse,
    FundAccountUpdate,
    FundAdjustmentCreateRequest,
    FundAdjustmentResponse,
    FundFlowItem,
    FundFlowListResponse,
)
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError
from services.system.operation_log import operation_log_service
from utils.formatters import escape_like

logger = logging.getLogger(__name__)


def _coerce_url_list(raw: Any) -> list[str]:
    """把 json 列读出的值规整成 URL 字符串列表.

    `finance_records.receipt_urls` 与 `fund_account_adjustments.receipt_urls` 都是 json 列，
    历史数据里出现过 json `null`、单值字符串等非列表形态（此前 `json_array_length` 就因此
    报过 "cannot get array length of a scalar"）。此处统一兜底为列表，避免前端拿到脏类型。
    """
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw if item]
    return [str(raw)]


def _account_audit_snapshot(account: FundAccount) -> dict[str, Any]:
    """账户关键字段快照（审计日志用）."""
    return {
        "name": account.name,
        "type": getattr(account.type, "value", account.type),
        "account_no": account.account_no,
        "holder": account.holder,
        "opening_balance": str(account.opening_balance),
        "opening_date": account.opening_date.isoformat() if account.opening_date else None,
        "status": getattr(account.status, "value", account.status),
        "note": account.note,
    }


class FundAccountService:
    """资金账户服务."""

    def __init__(self, db: Session) -> None:
        """初始化服务.

        Args:
            db: SQLAlchemy 会话

        """
        self.db = db

    # ==================== 查询辅助 ====================

    def _get_account(self, account_id: uuid.UUID | str) -> FundAccount:
        """按 ID 取未删除账户，不存在抛 404."""
        account = (
            self.db.query(FundAccount).filter(FundAccount.id == account_id, FundAccount.is_deleted.is_(False)).first()
        )
        if account is None:
            msg = "资金账户不存在"
            raise ResourceNotFoundError(msg)
        return account

    def _alive_records_filter(self) -> list[Any]:
        """有效流水过滤条件：流水与所属项目都必须未删除.

        ⚠️ 2026-10-22 缺陷修复（口径不一致）：
        余额聚合（``_flow_totals``）此前只过滤 ``FinanceRecord.is_deleted``，而
        流水列表（``_unified_flow_query``）额外要求项目未删。两者对"孤儿流水"
        （项目已软删、流水未删）判定不同，导致：
          - 账户余额把孤儿流水算进去；
          - 账户流水页却不显示它们。
        实测复现：把一个已挂账户的流水所属项目置 ``is_deleted=true`` 后，
        余额保持 105563.12 不变，而流水页合计从 344536.88 掉到 211536.88
        （差 133000.00，正是被删项目的金额）——页面上的「进出」再也推不出余额。

        现在两处统一走本方法（与 ``services/projects/finance/ledger.py``
        的全局汇总同口径），保证「流水页进 − 出 ± 核对 = 账户余额」恒成立。
        """
        return [
            FinanceRecord.is_deleted.is_(False),
            FinanceRecord.project_id.in_(
                self.db.query(Project.id).filter(Project.is_deleted.is_(False)).subquery().select(),
            ),
        ]

    def _flow_totals(self, account_ids: list[uuid.UUID]) -> dict[uuid.UUID, dict[str, Any]]:
        """一条聚合 SQL 取多个账户的流入/流出/笔数/最后日期."""
        if not account_ids:
            return {}
        rows = (
            self.db.query(
                FinanceRecord.account_id,
                func.coalesce(func.sum(FinanceRecord.inflow), 0).label("inflow_total"),
                func.coalesce(func.sum(FinanceRecord.outflow), 0).label("outflow_total"),
                func.count(FinanceRecord.id).label("flow_count"),
                func.max(FinanceRecord.record_date).label("last_flow_date"),
            )
            .filter(
                FinanceRecord.account_id.in_(account_ids),
                *self._alive_records_filter(),
            )
            .group_by(FinanceRecord.account_id)
            .all()
        )
        return {
            row.account_id: {
                "inflow_total": row.inflow_total or Decimal(0),
                "outflow_total": row.outflow_total or Decimal(0),
                "flow_count": int(row.flow_count or 0),
                "last_flow_date": row.last_flow_date.date() if row.last_flow_date else None,
            }
            for row in rows
        }

    def _adjust_totals(self, account_ids: list[uuid.UUID]) -> dict[uuid.UUID, Decimal]:
        """一条聚合 SQL 取多个账户的对账调整合计."""
        if not account_ids:
            return {}
        rows = (
            self.db.query(
                FundAccountAdjustment.account_id,
                func.coalesce(func.sum(FundAccountAdjustment.amount), 0).label("adjust_total"),
            )
            .filter(FundAccountAdjustment.account_id.in_(account_ids))
            .group_by(FundAccountAdjustment.account_id)
            .all()
        )
        return {row.account_id: (row.adjust_total or Decimal(0)) for row in rows}

    def _to_response(
        self,
        account: FundAccount,
        flows: dict[str, Any] | None,
        adjust_total: Decimal,
    ) -> FundAccountResponse:
        """组装账户响应（含推导余额）."""
        flow = flows or {}
        inflow_total = flow.get("inflow_total", Decimal(0))
        outflow_total = flow.get("outflow_total", Decimal(0))
        balance = account.opening_balance + inflow_total - outflow_total + adjust_total
        return FundAccountResponse(
            id=str(account.id),
            name=account.name,
            type=account.type,
            account_no=account.account_no,
            holder=account.holder,
            opening_balance=account.opening_balance,
            opening_date=account.opening_date,
            status=account.status,
            note=account.note,
            balance=balance,
            inflow_total=inflow_total,
            outflow_total=outflow_total,
            adjust_total=adjust_total,
            flow_count=int(flow.get("flow_count", 0)),
            last_flow_date=flow.get("last_flow_date"),
            created_at=account.created_at,
            updated_at=account.updated_at,
        )

    def _build_responses(self, accounts: list[FundAccount]) -> list[FundAccountResponse]:
        """批量组装响应（避免逐个账户查聚合）."""
        ids = [account.id for account in accounts]
        flows = self._flow_totals(ids)
        adjusts = self._adjust_totals(ids)
        return [
            self._to_response(account, flows.get(account.id), adjusts.get(account.id, Decimal(0)))
            for account in accounts
        ]

    @staticmethod
    def _sort_responses(
        items: list[FundAccountResponse],
        sort: str,
    ) -> list[FundAccountResponse]:
        """按 sort 排序：balance（默认）/ last / name."""
        if sort == "name":
            return sorted(items, key=lambda x: x.name)
        if sort == "last":
            # 最近用过的先；无流水的排最后
            return sorted(
                items,
                key=lambda x: (x.last_flow_date is not None, x.last_flow_date or date.min),
                reverse=True,
            )
        return sorted(items, key=lambda x: x.balance, reverse=True)

    # ==================== 账户 CRUD ====================

    def list_accounts(self, filter_data: FundAccountFilter) -> FundAccountListResponse:
        """查询账户列表（含推导余额与进出合计）."""
        query = self.db.query(FundAccount).filter(FundAccount.is_deleted.is_(False))
        if filter_data.type is not None:
            query = query.filter(FundAccount.type == filter_data.type)
        if filter_data.status is not None:
            query = query.filter(FundAccount.status == filter_data.status)
        if filter_data.search and filter_data.search.strip():
            like = f"%{escape_like(filter_data.search.strip())}%"
            query = query.filter(
                or_(
                    FundAccount.name.ilike(like, escape="\\"),
                    FundAccount.account_no.ilike(like, escape="\\"),
                    FundAccount.holder.ilike(like, escape="\\"),
                    FundAccount.note.ilike(like, escape="\\"),
                )
            )

        accounts = query.all()
        items = self._sort_responses(self._build_responses(accounts), filter_data.sort)
        total_balance = sum(
            (item.balance for item in items if item.status == FundAccountStatus.ACTIVE),
            Decimal(0),
        )
        return FundAccountListResponse(items=items, total=len(items), total_balance=total_balance)

    def get_account(self, account_id: uuid.UUID) -> FundAccountResponse:
        """查询单个账户详情（含推导余额）."""
        account = self._get_account(account_id)
        return self._build_responses([account])[0]

    def create_account(
        self,
        data: FundAccountCreate,
        operator_id: str,
        *,
        request: Request | None = None,
    ) -> FundAccountResponse:
        """新建账户（名称在未删除账户中唯一）.

        Raises:
            ConflictError: 同名账户已存在

        ⚠️ 名称唯一性的竞态（2026-10-22 说明）：``_assert_name_available`` 是
        「先查再插」，两个并发请求都查不到同名时会同时插入——此时由部分唯一索引
        ``uq_fund_accounts_name`` 兜底，第二个请求收到 409「账户名称已存在」
        （``utils/error_formatters`` 已把该约束名翻译成与串行路径一致的中文提示）。
        实测：3 个并发同名创建 → 1 个 201 + 2 个 409，库中只有 1 行。
        之所以不用 FOR UPDATE 串行化：唯一索引已能保证正确性，而给「建账户」加锁
        会引入不必要的争用；这里保留预检查只是为了给出更快的常见路径错误。

        """
        self._assert_name_available(data.name)

        now = datetime.now(timezone.utc)
        account = FundAccount(
            name=data.name.strip(),
            type=data.type,
            account_no=data.account_no,
            holder=data.holder,
            opening_balance=data.opening_balance,
            opening_date=data.opening_date,
            status=data.status,
            note=data.note,
            created_at=now,
            updated_at=now,
        )
        self.db.add(account)
        self.db.flush()
        self.db.commit()
        self.db.refresh(account)

        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="fund_account",
            resource_id=str(account.id),
            after=_account_audit_snapshot(account),
            request=request,
        )
        logger.info("资金账户已创建: %s (%s)", account.name, account.id)
        return self._build_responses([account])[0]

    def update_account(
        self,
        account_id: uuid.UUID,
        data: FundAccountUpdate,
        operator_id: str,
        *,
        request: Request | None = None,
    ) -> FundAccountResponse:
        """更新账户信息（改期初会直接改变推导余额，响应回传新余额）.

        ⚠️ 可清空字段（2026-10-22 缺陷修复）：``account_no`` / ``holder`` / ``note``
        三类选填文本允许显式传 ``null`` 清空。此前用 ``if data.x is not None``
        判断，无法区分「未传」与「传 null」，导致卡号写错、备注要清掉时永远改不掉
        （实测：PATCH ``{"account_no": null}`` 后仍返回原值）。现在改用
        ``model_fields_set`` 区分「显式传了该字段」（含 null）与「压根没传」。

        其余字段（name/type/opening_balance/opening_date/status）保持「非空才改」，
        因为这些是 NOT NULL 语义字段，接受 null 只会变成 500。
        """
        account = self._get_account(account_id)
        before = _account_audit_snapshot(account)
        sent = data.model_fields_set

        if data.name is not None and data.name.strip() != account.name:
            self._assert_name_available(data.name, exclude_id=account.id)
            account.name = data.name.strip()
        if data.type is not None:
            account.type = data.type
        # 可空文本字段：显式传 null 即清空（未传则保持不变）
        if "account_no" in sent:
            account.account_no = data.account_no
        if "holder" in sent:
            account.holder = data.holder
        if data.opening_balance is not None:
            account.opening_balance = data.opening_balance
        if data.opening_date is not None:
            account.opening_date = data.opening_date
        if data.status is not None:
            account.status = data.status
        if "note" in sent:
            account.note = data.note

        account.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(account)

        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="fund_account",
            resource_id=str(account.id),
            before=before,
            after=_account_audit_snapshot(account),
            request=request,
        )
        return self._build_responses([account])[0]

    def delete_account(
        self,
        account_id: uuid.UUID,
        operator_id: str,
        *,
        request: Request | None = None,
    ) -> None:
        """删除账户（软删除）.

        有流水或有对账调整记录时拒绝删除，提示改为停用——历史账目不能因为删账户而失去归属。

        Raises:
            ConflictError: 账户已有流水或对账记录

        """
        account = self._get_account(account_id)
        flow_count = (
            self.db.query(func.count(FinanceRecord.id))
            .filter(FinanceRecord.account_id == account.id, FinanceRecord.is_deleted.is_(False))
            .scalar()
            or 0
        )
        adjust_count = (
            self.db.query(func.count(FundAccountAdjustment.id))
            .filter(FundAccountAdjustment.account_id == account.id)
            .scalar()
            or 0
        )
        if flow_count or adjust_count:
            msg = "该账户已有流水或对账记录，不能删除，请改为停用"
            raise ConflictError(msg)

        before = _account_audit_snapshot(account)
        account.is_deleted = True
        account.updated_at = datetime.now(timezone.utc)
        self.db.commit()

        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="delete",
            resource_type="fund_account",
            resource_id=str(account.id),
            before=before,
            request=request,
        )
        logger.info("资金账户已删除: %s", account_id)

    def _assert_name_available(self, name: str, *, exclude_id: uuid.UUID | None = None) -> None:
        """校验名称合法（非空白）且唯一（仅在未删除账户中比较）.

        ⚠️ 2026-10-22 修复：Pydantic 的 ``min_length=1`` 拦不住纯空白（``"   "`` 长度 3），
        而入库前又统一 ``.strip()``，结果是 ``name="   "`` 能建成一个**名为空字符串**的
        账户（实测已复现），列表里显示为空白卡片、无法识别也无法删除重名。此处
        以 strip 后的结果做非空校验，与入库值同口径。

        Raises:
            ValidationError: 名称 strip 后为空
            ConflictError: 同名账户已存在

        """
        normalized = name.strip()
        if not normalized:
            msg = "账户名称不能为空"
            raise ValidationError(msg)

        query = self.db.query(FundAccount.id).filter(
            FundAccount.name == normalized,
            FundAccount.is_deleted.is_(False),
        )
        if exclude_id is not None:
            query = query.filter(FundAccount.id != exclude_id)
        if query.first() is not None:
            msg = "账户名称已存在"
            raise ConflictError(msg)

    # ==================== 总览 KPI ====================

    def list_options(self) -> list[FundAccountOption]:
        """列出账户选项（供记账选账户，**不含余额**，可在未解锁时调用）.

        与 `list_accounts` 的差别是刻意且必要的：
        - 只返回 id/name/type/account_no/status，**没有任何金额字段**；
        - 不做余额聚合查询（少一次 GROUP BY，也避免「顺手加个 balance」的诱惑）；
        - 只列在用账户（停用账户不能承接新记账）。

        安全边界：记账需要「选哪张卡」，不需要「卡里有多少钱」。把这两件事拆成两个
        接口，可以让记账动线在不暴露余额的前提下可用。
        """
        rows = (
            self.db.query(FundAccount)
            .filter(
                FundAccount.is_deleted.is_(False),
                FundAccount.status == FundAccountStatus.ACTIVE,
            )
            .order_by(FundAccount.name)
            .all()
        )
        return [
            FundAccountOption(
                id=str(account.id),
                name=account.name,
                type=account.type,
                account_no=account.account_no,
                status=account.status,
                is_locked=True,
            )
            for account in rows
        ]

    def get_summary(self) -> FundAccountSummaryResponse:
        """账户总览 KPI（余额合计 / 本月进出 / 对账合计 / 未挂账户计数）."""
        accounts = (
            self.db.query(FundAccount)
            .filter(FundAccount.is_deleted.is_(False), FundAccount.status == FundAccountStatus.ACTIVE)
            .all()
        )
        responses = self._build_responses(accounts)
        total_balance = sum((item.balance for item in responses), Decimal(0))

        now = datetime.now(timezone.utc)
        month_start = datetime(now.year, now.month, 1, tzinfo=timezone.utc)
        next_month = (month_start + timedelta(days=32)).replace(day=1)

        month_row = (
            self.db.query(
                func.coalesce(func.sum(FinanceRecord.inflow), 0),
                func.coalesce(func.sum(FinanceRecord.outflow), 0),
            )
            .filter(
                *self._alive_records_filter(),
                FinanceRecord.account_id.is_not(None),
                FinanceRecord.record_date >= month_start,
                FinanceRecord.record_date < next_month,
            )
            .one()
        )

        adjust_row = self.db.query(
            func.coalesce(func.sum(FundAccountAdjustment.amount), 0),
            func.max(FundAccountAdjustment.adjust_date),
        ).one()

        untracked_row = (
            self.db.query(
                func.count(FinanceRecord.id),
                func.coalesce(func.sum(FinanceRecord.inflow + FinanceRecord.outflow), 0),
            )
            .filter(*self._alive_records_filter(), FinanceRecord.account_id.is_(None))
            .one()
        )

        return FundAccountSummaryResponse(
            active_count=len(responses),
            total_balance=total_balance,
            month_inflow=month_row[0] or Decimal(0),
            month_outflow=month_row[1] or Decimal(0),
            adjust_total=adjust_row[0] or Decimal(0),
            last_adjust_date=adjust_row[1],
            untracked_count=int(untracked_row[0] or 0),
            untracked_amount=untracked_row[1] or Decimal(0),
        )

    # ==================== 对账调整 ====================

    def create_adjustment(
        self,
        account_id: uuid.UUID,
        data: FundAdjustmentCreateRequest,
        operator_id: str,
        *,
        request: Request | None = None,
    ) -> FundAdjustmentResponse:
        """新增对账调整（只加不改不删）.

        ``amount`` = 实际余额 − 系统余额；差额为 0 表示对上了，不写记录。

        ⚠️ 并发保护（2026-10-22 高危缺陷修复）：
        差额是「读当前余额 → 相减 → 落库」的复合操作，中间没有任何锁。两个请求
        同时用同一个 ``actual_balance`` 对账时，**都**读到同一个旧余额、**都**算出
        同一笔差额并各自插入一条调整，余额被记两次。
        实测复现（账户余额 1000，两线程并发提交 actual_balance=1200）：
        两条 201、两条 amount=200，最终余额 1400（应为 1200）——钱凭空多出 200，
        且「只加不改不删」意味着这两条都无法通过接口撤销。

        修复：先对账户行取 ``FOR UPDATE`` 行锁再读余额，把「读-算-写」串行化到
        同一账户维度。锁粒度是单个账户（不是全表），不同账户仍可并发对账。

        Raises:
            ValidationError: 差额为 0

        """
        # 行锁必须先于读余额：锁住账户行后，后到的并发请求会在 commit 前阻塞，
        # 从而读到前一笔调整已提交后的最新余额。
        account = (
            self.db.query(FundAccount)
            .filter(FundAccount.id == account_id, FundAccount.is_deleted.is_(False))
            .with_for_update()
            .first()
        )
        if account is None:
            msg = "资金账户不存在"
            raise ResourceNotFoundError(msg)
        current = self._build_responses([account])[0].balance
        amount = data.actual_balance - current
        if amount == 0:
            # 差额为 0 不是错误路径的数据写入，但仍要显式回滚以立刻释放 FOR UPDATE
            # 行锁（依赖 get_db 的兜底回滚也能释放，但那是响应生成之后的事）。
            self.db.rollback()
            msg = "实际余额与系统一致，无需调整"
            raise ValidationError(msg)

        adjustment = FundAccountAdjustment(
            account_id=account.id,
            adjust_date=data.adjust_date,
            amount=amount,
            reason=data.reason.strip(),
            operator_id=operator_id,
            receipt_urls=data.receipt_urls,
        )
        self.db.add(adjustment)
        self.db.flush()
        self.db.commit()
        self.db.refresh(adjustment)

        operator = self.db.query(User.nickname).filter(User.id == operator_id).scalar()
        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="create",
            resource_type="fund_account_adjustment",
            resource_id=str(adjustment.id),
            after={
                "account_id": str(account.id),
                "account_name": account.name,
                "amount": str(amount),
                "reason": adjustment.reason,
                "adjust_date": adjustment.adjust_date.isoformat(),
                "system_balance_before": str(current),
            },
            request=request,
        )
        logger.info("资金账户对账调整: account=%s amount=%s", account.id, amount)

        return FundAdjustmentResponse(
            id=str(adjustment.id),
            account_id=str(account.id),
            account_name=account.name,
            adjust_date=adjustment.adjust_date,
            amount=adjustment.amount,
            reason=adjustment.reason,
            operator_id=adjustment.operator_id,
            operator_name=operator,
            receipt_urls=adjustment.receipt_urls or [],
            created_at=adjustment.created_at,
        )

    def list_adjustments(self, account_id: uuid.UUID) -> list[FundAdjustmentResponse]:
        """查询账户的对账调整记录（按日期倒序）."""
        account = self._get_account(account_id)
        rows = (
            self.db.query(FundAccountAdjustment)
            .filter(FundAccountAdjustment.account_id == account.id)
            .order_by(FundAccountAdjustment.adjust_date.desc(), FundAccountAdjustment.created_at.desc())
            .all()
        )
        operator_ids = {row.operator_id for row in rows if row.operator_id}
        nicknames: dict[str, str] = {}
        if operator_ids:
            nicknames = {
                str(uid): name
                for uid, name in self.db.query(User.id, User.nickname).filter(User.id.in_(operator_ids)).all()
            }
        return [
            FundAdjustmentResponse(
                id=str(row.id),
                account_id=str(account.id),
                account_name=account.name,
                adjust_date=row.adjust_date,
                amount=row.amount,
                reason=row.reason,
                operator_id=row.operator_id,
                operator_name=nicknames.get(row.operator_id),
                receipt_urls=row.receipt_urls or [],
                created_at=row.created_at,
            )
            for row in rows
        ]

    def append_adjustment_receipts(
        self,
        account_id: uuid.UUID,
        adjustment_id: uuid.UUID,
        receipt_urls: list[str],
        operator_id: str,
        *,
        request: Request | None = None,
    ) -> FundAdjustmentResponse:
        """为核对调整补传凭证（**仅追加，不改金额/原因/日期**）.

        为什么允许这一处修改：调整记录「只加不改不删」的约束目的，是保证
        金额与原因这些**影响余额与审计结论**的字段不可篡改；而凭证是事后才拿到的
        附件，补传不改变任何金额语义（与「记一笔后补票据」性质相同）。

        幂等：按顺序去重后追加，重复提交同一张 URL 不会产生重复项。

        Raises:
            ResourceNotFoundError: 调整记录不存在或不属于该账户

        """
        adjustment = (
            self.db.query(FundAccountAdjustment)
            .filter(
                FundAccountAdjustment.id == adjustment_id,
                FundAccountAdjustment.account_id == account_id,
            )
            .first()
        )
        if adjustment is None:
            msg = "核对记录不存在"
            raise ResourceNotFoundError(msg)

        existing = adjustment.receipt_urls or []
        merged = list(dict.fromkeys([*existing, *receipt_urls]))
        before_count = len(existing)
        adjustment.receipt_urls = merged
        adjustment.updated_at = datetime.now(timezone.utc)
        self.db.commit()
        self.db.refresh(adjustment)

        operation_log_service.log_action(
            self.db,
            user_id=operator_id,
            action="update",
            resource_type="fund_account_adjustment",
            resource_id=str(adjustment.id),
            before={"receipt_count": before_count},
            after={"receipt_count": len(merged), "receipt_urls": merged},
            request=request,
        )
        logger.info(
            "核对调整补传凭证: adjustment=%s (+%d 张, 共 %d)",
            adjustment.id,
            len(merged) - before_count,
            len(merged),
        )

        account = self._get_account(account_id)
        operator = self.db.query(User.nickname).filter(User.id == operator_id).scalar()
        return FundAdjustmentResponse(
            id=str(adjustment.id),
            account_id=str(account.id),
            account_name=account.name,
            adjust_date=adjustment.adjust_date,
            amount=adjustment.amount,
            reason=adjustment.reason,
            operator_id=adjustment.operator_id,
            operator_name=operator,
            receipt_urls=adjustment.receipt_urls or [],
            created_at=adjustment.created_at,
        )

    # ==================== 账户流水 ====================

    def _flow_query(self) -> Query:
        """流水基础查询（联项目 / 科目 / 账户 / 操作人名称）.

        ⚠️ 必须过滤 `Project.is_deleted.is_(False)`（2026-10-21 缺陷修复）：
        删除项目只把 `projects.is_deleted` 置真，`finance_records` 保持未删，
        因此不过滤项目会让**已删项目的流水**照常出现在账户流水页，且点「补上」
        会命中 `update_record` 的「项目不存在」404——列表与操作的能力边界不一致。

        注：本方法是 ``_unified_flow_query`` 的前身，目前已无外部调用（流水页
        统一走 UNION 版本）。保留仅为存量调试脚本兼容，口径已对齐 ``_alive_records_filter``。
        """
        return (
            self.db.query(
                FinanceRecord,
                Project.name.label("project_name"),
                ProjectContract.contract_no.label("project_code"),
                FinanceSubject.name.label("subject_name"),
                FundAccount.name.label("account_name"),
                User.nickname.label("operator_name"),
            )
            .join(Project, Project.id == FinanceRecord.project_id)
            .outerjoin(ProjectContract, ProjectContract.project_id == FinanceRecord.project_id)
            .outerjoin(FinanceSubject, FinanceSubject.id == FinanceRecord.subject_id)
            .outerjoin(FundAccount, FundAccount.id == FinanceRecord.account_id)
            .outerjoin(User, User.id == FinanceRecord.operator_id)
            .filter(*self._alive_records_filter())
        )

    def _unified_flow_query(
        self,
        *,
        account_id: uuid.UUID | None = None,
        untracked_only: bool = False,
        direction: str | None = None,
        search: str | None = None,
    ) -> Subquery:
        """构造「项目记账 + 余额核对」两条来源合并后的统一流水子查询.

        为什么必须在 SQL 层 UNION 而不是各查一遍再在 Python 合并：
        分页、合计、来源计数都必须作用于**合并后的全集**，否则
        - 分页会错位（两段各取 N 条再拼，越翻越乱）；
        - 合计只算到其中一段，页面总额推不出余额。

        统一列（两段按同序对齐）：
        source / record_id / project_id / project_name / project_code / subject_name /
        record_date / outflow / inflow / payer / payee / account_id(文本) / account_name /
        operator_name / receipt_count / remark / reason / adjust_amount / sort_at

        口径细节：
        - 调整记录 ``amount > 0`` 计入 ``inflow``、``< 0`` 计入 ``outflow``，
          另给 ``adjust_amount`` 保留带符号原值。这样「流水页进出合计」与余额公式
          ``期初 + Σ流入 − Σ流出 ± 调整`` 完全一致（正数进流入、负数进流出）。
        - ``untracked_only``（没记账户）只对项目记账有意义：调整记录必然属于某账户，
          故该筛选下不含调整行（否则「去补账户」列表会混入无需补挂的行）。
        - 排序用 ``sort_at``：记录取 record_date 当天 00:00，调整取 created_at，
          保证同一天内调整排在记账之后（调整是基于当日账面对出来的）。
        """
        now_expr = func.now()

        # ── 段一：项目记账 ──
        record_q = (
            self.db.query(
                literal("record").label("source"),
                cast(FinanceRecord.id, String).label("record_id"),
                cast(FinanceRecord.project_id, String).label("project_id"),
                Project.name.label("project_name"),
                ProjectContract.contract_no.label("project_code"),
                FinanceSubject.name.label("subject_name"),
                cast(FinanceRecord.record_date, Date).label("record_date"),
                FinanceRecord.outflow.label("outflow"),
                FinanceRecord.inflow.label("inflow"),
                FinanceRecord.payer.label("payer"),
                FinanceRecord.payee.label("payee"),
                cast(FinanceRecord.account_id, String).label("account_id"),
                FundAccount.name.label("account_name"),
                User.nickname.label("operator_name"),
                # receipt_urls 为 json 列，历史行里存在 json null（非 SQL NULL），
                # 直接 json_array_length 会报 "cannot get array length of a scalar"，
                # 故先判类型再取长度。
                case(
                    (
                        func.json_typeof(FinanceRecord.receipt_urls) == "array",
                        func.json_array_length(FinanceRecord.receipt_urls),
                    ),
                    else_=0,
                ).label("receipt_count"),
                FinanceRecord.receipt_urls.label("receipt_urls"),
                FinanceRecord.remark.label("remark"),
                cast(None, Text).label("reason"),
                cast(None, Numeric(15, 2)).label("adjust_amount"),
                FinanceRecord.record_date.label("sort_at"),
            )
            .join(Project, Project.id == FinanceRecord.project_id)
            .outerjoin(ProjectContract, ProjectContract.project_id == FinanceRecord.project_id)
            .outerjoin(FinanceSubject, FinanceSubject.id == FinanceRecord.subject_id)
            .outerjoin(FundAccount, FundAccount.id == FinanceRecord.account_id)
            .outerjoin(User, User.id == FinanceRecord.operator_id)
            .filter(
                FinanceRecord.is_deleted.is_(False),
                Project.is_deleted.is_(False),
            )
        )

        # ── 段二：余额核对调整（与项目无关的账户资金变动）──
        adjust_q = (
            self.db.query(
                literal("adjustment").label("source"),
                cast(FundAccountAdjustment.id, String).label("record_id"),
                cast(None, String(36)).label("project_id"),
                cast(None, String(700)).label("project_name"),
                cast(None, String(100)).label("project_code"),
                cast(None, String(50)).label("subject_name"),
                FundAccountAdjustment.adjust_date.label("record_date"),
                case(
                    (FundAccountAdjustment.amount < 0, -FundAccountAdjustment.amount),
                    else_=Decimal(0),
                ).label("outflow"),
                case(
                    (FundAccountAdjustment.amount > 0, FundAccountAdjustment.amount),
                    else_=Decimal(0),
                ).label("inflow"),
                cast(None, String(100)).label("payer"),
                cast(None, String(100)).label("payee"),
                cast(FundAccountAdjustment.account_id, String).label("account_id"),
                FundAccount.name.label("account_name"),
                User.nickname.label("operator_name"),
                # 与记账段同口径：按 json 数组长度计，非数组（json null/标量）记 0
                case(
                    (
                        func.json_typeof(FundAccountAdjustment.receipt_urls) == "array",
                        func.json_array_length(FundAccountAdjustment.receipt_urls),
                    ),
                    else_=0,
                ).label("receipt_count"),
                FundAccountAdjustment.receipt_urls.label("receipt_urls"),
                cast(None, Text).label("remark"),
                FundAccountAdjustment.reason.label("reason"),
                FundAccountAdjustment.amount.label("adjust_amount"),
                FundAccountAdjustment.created_at.label("sort_at"),
            )
            .join(FundAccount, FundAccount.id == FundAccountAdjustment.account_id)
            .outerjoin(User, User.id == FundAccountAdjustment.operator_id)
            .filter(FundAccount.is_deleted.is_(False))
        )

        # ── 筛选（两段分别加，语义保持一致）──
        if untracked_only:
            record_q = record_q.filter(FinanceRecord.account_id.is_(None))
            adjust_q = adjust_q.filter(false())
        elif account_id is not None:
            record_q = record_q.filter(FinanceRecord.account_id == account_id)
            adjust_q = adjust_q.filter(FundAccountAdjustment.account_id == account_id)

        if direction == "out":
            record_q = record_q.filter(FinanceRecord.outflow > 0)
            adjust_q = adjust_q.filter(FundAccountAdjustment.amount < 0)
        elif direction == "in":
            record_q = record_q.filter(FinanceRecord.inflow > 0)
            adjust_q = adjust_q.filter(FundAccountAdjustment.amount > 0)

        if search and search.strip():
            like = f"%{escape_like(search.strip())}%"
            record_q = record_q.filter(
                or_(
                    Project.name.ilike(like, escape="\\"),
                    ProjectContract.contract_no.ilike(like, escape="\\"),
                    FinanceSubject.name.ilike(like, escape="\\"),
                    FinanceRecord.payer.ilike(like, escape="\\"),
                    FinanceRecord.payee.ilike(like, escape="\\"),
                )
            )
            # 调整行没有项目/科目，可搜索的只有原因与账户名
            adjust_q = adjust_q.filter(
                or_(
                    FundAccountAdjustment.reason.ilike(like, escape="\\"),
                    FundAccount.name.ilike(like, escape="\\"),
                )
            )

        # 计数器用占位（UNION 里不能出现 now() 这类易变函数以外的差异列顺序）
        _ = now_expr
        return record_q.union_all(adjust_q).subquery("uflow")

    def list_flows(
        self,
        *,
        account_id: uuid.UUID | None = None,
        untracked_only: bool = False,
        direction: str | None = None,
        search: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> FundFlowListResponse:
        """查询账户流水（项目记账 + 余额核对，可跨账户）.

        合并口径见 ``_unified_flow_query`` 的 docstring：这是让「流水页进出合计」
        与余额公式对齐的关键，也与用户诉求一致——利息入账、银行卡年费这类
        **与项目无关**的账户资金变动必须在本页可见。
        """
        u = self._unified_flow_query(
            account_id=account_id,
            untracked_only=untracked_only,
            direction=direction,
            search=search,
        )

        # ── 合计（作用于合并后全集）──
        totals = (
            self.db.query(
                func.coalesce(func.sum(u.c.inflow), 0),
                func.coalesce(func.sum(u.c.outflow), 0),
                func.coalesce(func.sum(case((u.c.source == "record", u.c.inflow), else_=Decimal(0))), 0),
                func.coalesce(func.sum(case((u.c.source == "record", u.c.outflow), else_=Decimal(0))), 0),
                func.coalesce(func.sum(case((u.c.source == "adjustment", u.c.inflow), else_=Decimal(0))), 0),
                func.coalesce(func.sum(case((u.c.source == "adjustment", u.c.outflow), else_=Decimal(0))), 0),
                func.count(),
            )
            .select_from(u)
            .one()
        )

        rows = (
            self.db.query(u)
            .order_by(u.c.sort_at.desc(), u.c.record_id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        items = [
            FundFlowItem(
                source=row.source,
                record_id=row.record_id,
                project_id=row.project_id,
                project_name=row.project_name,
                project_code=row.project_code,
                subject_name=row.subject_name,
                record_date=row.record_date,
                outflow=row.outflow or Decimal(0),
                inflow=row.inflow or Decimal(0),
                payer=row.payer,
                payee=row.payee,
                account_id=row.account_id,
                account_name=row.account_name,
                operator_name=row.operator_name,
                receipt_count=int(row.receipt_count or 0),
                receipt_urls=_coerce_url_list(row.receipt_urls),
                remark=row.remark,
                reason=row.reason,
                adjust_amount=row.adjust_amount,
            )
            for row in rows
        ]

        return FundFlowListResponse(
            items=items,
            total=int(totals[6] or 0),
            page=page,
            page_size=page_size,
            total_inflow=totals[0] or Decimal(0),
            total_outflow=totals[1] or Decimal(0),
            record_inflow=totals[2] or Decimal(0),
            record_outflow=totals[3] or Decimal(0),
            adjustment_inflow=totals[4] or Decimal(0),
            adjustment_outflow=totals[5] or Decimal(0),
        )


def resolve_active_account(db: Session, account_id: uuid.UUID | None) -> FundAccount:
    """校验记账时传入的账户：必须存在、未删除、在用.

    Raises:
        ValidationError: 账户不存在已删除或已停用

    """
    account = db.query(FundAccount).filter(FundAccount.id == account_id, FundAccount.is_deleted.is_(False)).first()
    if account is None:
        msg = "资金账户不存在或已删除"
        raise ValidationError(msg)
    if account.status != FundAccountStatus.ACTIVE:
        msg = "账户已停用，不能用于新记账"
        raise ValidationError(msg)
    return account
