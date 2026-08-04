"""投资管理服务基础设施：db 会话 + 共享校验/响应构建方法.

跟投记录 CRUD / 投资方 CRUD / 结算 / 导出等逻辑拆分至各 Mixin：
- records._RecordMixin: 跟投记录 CRUD/列表/统计/详情/复制
- investors._InvestorMixin: 投资方 CRUD
- settlement._SettlementMixin: 结算/反结算/分配比例调整
- exporter._ExporterMixin: Excel 导出
- service.InvestmentService: 多继承聚合
"""

import uuid
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy.orm import Session, selectinload

from models import Investment, InvestmentLog, Investor, Project, User
from models.common import InvestmentActionType, SettlementStatus
from schemas.investment import (
    InvestmentLogResponse,
    InvestmentResponse,
    InvestorResponse,
    ReturnAdjustmentResponse,
    SubInvestorCreate,
)
from services.system.exceptions import (
    ResourceNotFoundError,
    ServiceException,
    ValidationError,
)

_TWO_PLACES = Decimal("0.01")
_HUNDRED = Decimal(100)


def _quantize(value: Decimal) -> Decimal:
    """金额统一保留两位小数（四舍五入）."""
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


class _InvestmentServiceBase:
    """投资管理服务基类：持有 db 会话，提供共享校验/响应构建方法."""

    def __init__(self, db: Session) -> None:
        """初始化服务.

        Args:
            db: SQLAlchemy 数据库会话

        """
        self.db: Session = db

    # ==================== 私有 helper ====================

    def _get_investment_or_404(self, investment_id: str, *, for_update: bool = False) -> Investment:
        """获取跟投记录，不存在或已软删抛 404.

        Args:
            investment_id: 跟投记录 ID
            for_update: 是否加行级锁（用于结算/反结算等需要并发控制的场景）

        """
        query = self.db.query(Investment).filter(
            Investment.id == investment_id,
            Investment.deleted_at.is_(None),
        )
        if for_update:
            query = query.with_for_update()
        inv = query.first()
        if inv is None:
            msg = "跟投记录不存在"
            raise ResourceNotFoundError(msg)
        return inv

    def _assert_editable(self, investment: Investment) -> None:
        """已结算项目拒绝写操作."""
        if investment.settlement_status == SettlementStatus.SETTLED:
            msg = "已结算项目不可编辑，请先反结算"
            raise ServiceException(msg, status_code=400)

    def _write_log(
        self,
        investment_id: str,
        action_type: InvestmentActionType,
        detail: dict[str, Any],
        operator_id: str,
    ) -> None:
        """写入操作日志（不单独 commit，由调用方控制事务）."""
        log = InvestmentLog(
            investment_id=investment_id,
            action_type=action_type,
            detail=detail,
            operator=operator_id,
        )
        self.db.add(log)

    def _calc_parent_amount(self, total_investment: Decimal, share_ratio: Decimal) -> Decimal:
        """母投资方金额 = total_investment × share_ratio / 100."""
        return _quantize(total_investment * share_ratio / _HUNDRED)

    def _calc_sub_amount(self, parent_amount: Decimal, share_ratio: Decimal) -> Decimal:
        """子投资人金额 = 母投资方金额 × 内部占比 / 100."""
        return _quantize(parent_amount * share_ratio / _HUNDRED)

    def _build_investor_tree(self, investors: list[Investor]) -> list[InvestorResponse]:
        """将平铺的投资方列表构建为母投资方 + 嵌套子投资人的树."""
        parents = [i for i in investors if i.parent_id is None]
        children_map: dict[str, list[Investor]] = {}
        for i in investors:
            if i.parent_id is not None:
                children_map.setdefault(i.parent_id, []).append(i)

        result: list[InvestorResponse] = []
        for p in sorted(parents, key=lambda x: (x.sort_order is None, x.sort_order, x.created_at)):
            subs = sorted(
                children_map.get(p.id, []),
                key=lambda x: (x.sort_order is None, x.sort_order, x.created_at),
            )
            result.append(
                InvestorResponse(
                    id=p.id,
                    investment_id=p.investment_id,
                    name=p.name,
                    type=p.type,
                    share_ratio=p.share_ratio,
                    invest_amount=p.invest_amount,
                    parent_id=None,
                    sort_order=p.sort_order,
                    remark=p.remark,
                    sub_investors=[
                        InvestorResponse(
                            id=s.id,
                            investment_id=s.investment_id,
                            name=s.name,
                            type=s.type,
                            share_ratio=s.share_ratio,
                            invest_amount=s.invest_amount,
                            parent_id=s.parent_id,
                            sort_order=s.sort_order,
                            remark=s.remark,
                            sub_investors=[],
                        )
                        for s in subs
                    ],
                ),
            )
        return result

    def _build_logs_response(self, logs: list[InvestmentLog]) -> list[InvestmentLogResponse]:
        """构建日志响应，批量填充 operator_name."""
        operator_ids = {log.operator for log in logs}
        name_map: dict[str, str] = {}
        if operator_ids:
            users = self.db.query(User).filter(User.id.in_(operator_ids)).all()
            name_map = {u.id: (u.nickname or u.username or u.id) for u in users}
        return [
            InvestmentLogResponse(
                id=log.id,
                investment_id=log.investment_id,
                action_type=log.action_type,
                detail=log.detail or {},
                operator_id=log.operator,
                operator_name=name_map.get(log.operator, log.operator),
                created_at=log.created_at,
            )
            for log in sorted(logs, key=lambda x: x.created_at, reverse=True)
        ]

    def _build_adjustments_response(self, inv: Investment) -> list[ReturnAdjustmentResponse]:
        """构建分配比例调整记录响应（按时间倒序取最新一批）."""
        all_adj = list(inv.return_adjustments) if inv.return_adjustments else []
        if not all_adj:
            return []
        latest_at = max(a.adjusted_at for a in all_adj)
        latest_batch = [a for a in all_adj if a.adjusted_at == latest_at]
        return [
            ReturnAdjustmentResponse(
                id=a.id,
                investment_id=a.investment_id,
                investor_id=a.investor_id,
                default_distribution_ratio=a.default_distribution_ratio,
                adjusted_distribution_ratio=a.adjusted_distribution_ratio,
                adjusted_amount=a.adjusted_amount,
                adjusted_by=a.adjusted_by,
                adjusted_at=a.adjusted_at,
                remark=a.remark,
            )
            for a in sorted(latest_batch, key=lambda x: x.adjusted_at, reverse=True)
        ]

    def _to_response(self, inv: Investment, include_logs: bool = True) -> InvestmentResponse:
        """将 ORM Investment 转为 InvestmentResponse."""
        investors = list(inv.investors) if inv.investors else []
        investor_tree = self._build_investor_tree(investors)
        logs_resp = self._build_logs_response(list(inv.logs)) if (include_logs and inv.logs) else None
        adjustments = self._build_adjustments_response(inv)
        return InvestmentResponse(
            id=inv.id,
            project_id=inv.project_id,
            project_code=inv.project_code,
            project_name=inv.project_name,
            total_investment=inv.total_investment,
            total_return=inv.total_return,
            settlement_status=inv.settlement_status,
            settled_date=inv.settled_date,
            settled_note=inv.settled_note,
            remark=inv.remark,
            created_by=inv.created_by,
            created_at=inv.created_at,
            updated_at=inv.updated_at,
            investors=investor_tree,
            return_adjustments=adjustments,
            logs=logs_resp,
        )

    def _validate_investor_ratios(
        self,
        investment: Investment,
        new_ratio: Decimal,
        exclude_investor_id: str | None = None,
    ) -> None:
        """校验母投资方比例合计 ≤ 100%（排除当前编辑的投资方）."""
        existing = (
            self.db.query(Investor)
            .filter(
                Investor.investment_id == investment.id,
                Investor.parent_id.is_(None),
            )
            .all()
        )
        total = Decimal(0)
        for inv in existing:
            if exclude_investor_id and inv.id == exclude_investor_id:
                continue
            total += inv.share_ratio
        total += new_ratio
        if total > _HUNDRED:
            msg = f"所有投资方比例之和不能超过100%（当前合计 {total}%）"
            raise ValidationError(msg)

    def _validate_sub_ratios(self, sub_investors: list[SubInvestorCreate]) -> None:
        """校验子投资人内部占比合计 = 100%."""
        if not sub_investors:
            return
        total = sum((s.share_ratio for s in sub_investors), Decimal(0))
        if total != _HUNDRED:
            msg = f"子投资人内部占比之和必须等于100%（当前合计 {total}%）"
            raise ValidationError(msg)

    def _validate_name_unique(
        self,
        investment_id: str,
        name: str,
        parent_id: str | None,
        exclude_investor_id: str | None = None,
    ) -> None:
        """校验投资方名称在同一投资记录下不重复（母投资方间/同一母投资方子投资人间）."""
        query = self.db.query(Investor).filter(
            Investor.investment_id == investment_id,
            Investor.name == name,
        )
        if parent_id is None:
            query = query.filter(Investor.parent_id.is_(None))
        else:
            query = query.filter(Investor.parent_id == parent_id)
        if exclude_investor_id:
            query = query.filter(Investor.id != exclude_investor_id)
        if query.first() is not None:
            msg = "该投资方名称已存在"
            raise ValidationError(msg)

    def _recalc_all_investor_amounts(self, investment: Investment) -> None:
        """按现有比例重算所有投资方及子投资人金额."""
        investors = (
            self.db.query(Investor)
            .filter(
                Investor.investment_id == investment.id,
                Investor.parent_id.is_(None),
            )
            .all()
        )
        for parent in investors:
            parent.invest_amount = self._calc_parent_amount(investment.total_investment, parent.share_ratio)
            for sub in parent.sub_investors:
                sub.invest_amount = self._calc_sub_amount(parent.invest_amount, sub.share_ratio)

    def _get_project_or_404(self, project_id: uuid.UUID) -> Project:
        """获取项目，不存在或已软删抛 404."""
        proj = (
            self.db.query(Project)
            .options(selectinload(Project.contract))
            .filter(
                Project.id == project_id,
                Project.is_deleted.is_(False),
            )
            .first()
        )
        if proj is None:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)
        return proj

    def _get_project_code(self, project: Project) -> str:
        """获取项目编号：优先使用合同编号，否则回退到项目 ID."""
        if project.contract is not None and not project.contract.is_deleted and project.contract.contract_no:
            return project.contract.contract_no
        return project.id
