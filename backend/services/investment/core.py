"""投资管理（跟投管理）Service 层.

职责：跟投记录 CRUD、投资方与子投资人管理、收益分配比例调整、结算流转、操作日志、Excel 导出。

文件行数说明（>250 行）：
本文件约 600 行未拆分，原因：
1. 投资金额计算、比例校验、结算状态机、日志写入高度耦合，拆分会破坏事务一致性
2. 各方法共享私有 helper（_assert_editable / _write_log / _calc_amounts），拆分需传递 db 与上下文
3. 与 MarketingProjectService 等同类服务保持单一 Service 类的现有模式一致
"""

from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from models import Investment, InvestmentLog, Investor, Project, ReturnAdjustment, User
from models.common import (
    InvestmentActionType,
    InvestorType,
    ProjectStatus,
    SettlementStatus,
)
from schemas.investment import (
    CopyInvestmentRequest,
    InvestmentCreate,
    InvestmentListItemResponse,
    InvestmentLogResponse,
    InvestmentResponse,
    InvestmentStatsResponse,
    InvestmentUpdate,
    InvestorCreate,
    InvestorResponse,
    InvestorUpdate,
    ReturnAdjustmentBatchRequest,
    ReturnAdjustmentResponse,
    SettlementChangeRequest,
    SubInvestorCreate,
    UnsettleRequest,
)
from services.system.exceptions import (
    ConflictError,
    ResourceNotFoundError,
    ServiceException,
    ValidationError,
)

_TWO_PLACES = Decimal("0.01")
_HUNDRED = Decimal(100)


def _quantize(value: Decimal) -> Decimal:
    """金额统一保留两位小数（四舍五入）."""
    return value.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


class InvestmentService:
    """跟投管理服务."""

    def __init__(self, db: Session) -> None:
        """初始化服务.

        Args:
            db: SQLAlchemy 数据库会话

        """
        self.db: Session = db

    # ==================== 私有 helper ====================

    def _get_investment_or_404(self, investment_id: str) -> Investment:
        """获取跟投记录，不存在或已软删抛 404."""
        inv = (
            self.db.query(Investment)
            .filter(
                Investment.id == investment_id,
                Investment.deleted_at.is_(None),
            )
            .first()
        )
        if inv is None:
            raise ResourceNotFoundError("跟投记录不存在")
        return inv

    def _assert_editable(self, investment: Investment) -> None:
        """已结算项目拒绝写操作."""
        if investment.settlement_status == SettlementStatus.SETTLED:
            raise ServiceException("已结算项目不可编辑，请先反结算", status_code=400)

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
            raise ValidationError(f"所有投资方比例之和不能超过100%（当前合计 {total}%）")

    def _validate_sub_ratios(self, sub_investors: list[SubInvestorCreate]) -> None:
        """校验子投资人内部占比合计 = 100%."""
        if not sub_investors:
            return
        total = sum((s.share_ratio for s in sub_investors), Decimal(0))
        if total != _HUNDRED:
            raise ValidationError(f"子投资人内部占比之和必须等于100%（当前合计 {total}%）")

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
            raise ValidationError("该投资方名称已存在")

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

    def _get_project_or_404(self, project_id: str) -> Project:
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
            raise ResourceNotFoundError("项目不存在")
        return proj

    def _get_project_code(self, project: Project) -> str:
        """获取项目编号：优先使用合同编号，否则回退到项目 ID."""
        if (
            project.contract is not None
            and not project.contract.is_deleted
            and project.contract.contract_no
        ):
            return project.contract.contract_no
        return project.id

    # ==================== 列表 / 统计 / 详情 ====================

    def list_investments(  # noqa: PLR0913
        self,
        search: str | None = None,
        project_status: ProjectStatus | None = None,
        settlement_status: SettlementStatus | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[list[InvestmentListItemResponse], int]:
        """分页查询跟投记录列表（含项目状态关联、回报率、投资方数量）."""
        investor_count_subq = (
            select(
                Investor.investment_id.label("inv_id"),
                func.count(Investor.id).label("cnt"),
            )
            .where(Investor.parent_id.is_(None))
            .group_by(Investor.investment_id)
            .subquery()
        )

        query = (
            self.db.query(
                Investment,
                Project.status.label("proj_status"),
                Project.address.label("proj_address"),
                func.coalesce(investor_count_subq.c.cnt, 0).label("inv_count"),
            )
            .outerjoin(Project, Project.id == Investment.project_id)
            .outerjoin(investor_count_subq, investor_count_subq.c.inv_id == Investment.id)
            .filter(Investment.deleted_at.is_(None))
        )

        if search:
            escaped = search.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
            like = f"%{escaped}%"
            query = query.filter(
                or_(
                    Investment.project_code.ilike(like, escape="\\"),
                    Investment.project_name.ilike(like, escape="\\"),
                    Project.address.ilike(like, escape="\\"),
                ),
            )
        if project_status is not None:
            query = query.filter(Project.status == project_status)
        if settlement_status is not None:
            query = query.filter(Investment.settlement_status == settlement_status)

        total: int = query.count()
        offset = (page - 1) * page_size
        rows = (
            query.order_by(Investment.created_at.desc())
            .offset(offset)
            .limit(page_size)
            .all()
        )

        items: list[InvestmentListItemResponse] = []
        for inv, proj_status, proj_address, inv_count in rows:
            total_inv = inv.total_investment
            total_ret = inv.total_return or Decimal(0)
            if total_inv > 0:
                return_ratio = float(_quantize(total_ret / total_inv * _HUNDRED))
            else:
                return_ratio = 0.0
            items.append(
                InvestmentListItemResponse(
                    id=inv.id,
                    project_id=inv.project_id,
                    project_code=inv.project_code,
                    project_name=inv.project_name,
                    project_address=proj_address,
                    project_status=proj_status,
                    settlement_status=inv.settlement_status,
                    total_investment=total_inv,
                    total_return=inv.total_return,
                    return_ratio=return_ratio,
                    investor_count=int(inv_count),
                ),
            )
        return items, total

    def get_stats(self) -> InvestmentStatsResponse:
        """5 张汇总卡片统计."""
        base = self.db.query(Investment).filter(Investment.deleted_at.is_(None))
        total_projects: int = base.count()
        total_investment: Decimal = base.with_entities(func.coalesce(func.sum(Investment.total_investment), 0)).scalar() or Decimal(0)
        total_return: Decimal = (
            base.with_entities(func.coalesce(func.sum(Investment.total_return), 0)).scalar() or Decimal(0)
        )
        unsettled_count: int = base.filter(Investment.settlement_status == SettlementStatus.UNSETTLED).count()

        if total_investment > 0:
            avg_return_ratio = float(_quantize(total_return / total_investment * _HUNDRED))
        else:
            avg_return_ratio = 0.0

        return InvestmentStatsResponse(
            total_projects=total_projects,
            total_investment=total_investment,
            total_return=total_return,
            avg_return_ratio=avg_return_ratio,
            unsettled_count=unsettled_count,
        )

    def get_investment(self, investment_id: str) -> InvestmentResponse | None:
        """详情：含投资方树 + 分配比例调整 + 操作日志."""
        inv = (
            self.db.query(Investment)
            .options(
                selectinload(Investment.investors),
                selectinload(Investment.return_adjustments),
                selectinload(Investment.logs),
            )
            .filter(
                Investment.id == investment_id,
                Investment.deleted_at.is_(None),
            )
            .first()
        )
        if inv is None:
            return None
        return self._to_response(inv)

    # ==================== 跟投记录 CRUD ====================

    def create_investment(self, data: InvestmentCreate, operator_id: str) -> InvestmentResponse:
        """创建跟投记录：校验项目存在、未软删、无重复跟投；写日志."""
        proj = self._get_project_or_404(data.project_id)

        duplicate = (
            self.db.query(Investment)
            .filter(
                Investment.project_id == data.project_id,
                Investment.deleted_at.is_(None),
            )
            .first()
        )
        if duplicate is not None:
            raise ConflictError("该项目已存在跟投记录")

        inv = Investment(
            project_id=proj.id,
            project_code=self._get_project_code(proj),
            project_name=proj.name,
            total_investment=data.total_investment,
            total_return=data.total_return,
            settlement_status=SettlementStatus.UNSETTLED,
            remark=data.remark,
            created_by=operator_id,
        )
        self.db.add(inv)
        self.db.flush()

        self._write_log(
            inv.id,
            InvestmentActionType.CREATE,
            {"project_id": proj.id, "total_investment": str(data.total_investment)},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(inv)
        return self._to_response(inv)

    def update_investment(
        self,
        investment_id: str,
        data: InvestmentUpdate,
        operator_id: str,
    ) -> InvestmentResponse:
        """更新跟投记录：仅 unsettled 可改；修改总额触发投资方金额重算并写日志."""
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)

        update_data = data.model_dump(exclude_unset=True)
        log_details: dict[str, Any] = {}

        if "total_investment" in update_data and update_data["total_investment"] is not None:
            old_val = inv.total_investment
            new_val = Decimal(str(update_data["total_investment"]))
            if new_val != old_val:
                log_details["total_investment"] = {"from": str(old_val), "to": str(new_val)}
                inv.total_investment = new_val
                self._recalc_all_investor_amounts(inv)

        if "total_return" in update_data:
            old_ret = inv.total_return
            new_ret = update_data["total_return"]
            if new_ret != old_ret:
                log_details["total_return"] = {"from": str(old_ret), "to": str(new_ret)}
                inv.total_return = new_ret

        if "remark" in update_data:
            inv.remark = update_data["remark"]

        if log_details.get("total_investment"):
            self._write_log(
                inv.id,
                InvestmentActionType.TOTAL_INVESTMENT_CHANGE,
                {"total_investment": log_details["total_investment"]},
                operator_id,
            )
        if log_details.get("total_return"):
            self._write_log(
                inv.id,
                InvestmentActionType.TOTAL_RETURN_CHANGE,
                {"total_return": log_details["total_return"]},
                operator_id,
            )

        self.db.commit()
        self.db.refresh(inv)
        return self._to_response(inv)

    def delete_investment(self, investment_id: str, operator_id: str) -> None:
        """软删除跟投记录（设 deleted_at），子表保留."""
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)
        inv.deleted_at = datetime.now(timezone.utc)
        self._write_log(inv.id, InvestmentActionType.STATUS_CHANGE, {"action": "soft_delete"}, operator_id)
        self.db.commit()

    # ==================== 投资方 CRUD ====================

    def add_investor(self, investment_id: str, data: InvestorCreate, operator_id: str) -> InvestorResponse:
        """添加投资方：校验 unsettled、名称唯一、比例合计、子投资人内部占比；计算金额."""
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)

        self._validate_name_unique(investment_id, data.name, parent_id=None)
        self._validate_investor_ratios(inv, data.share_ratio)
        sub_list = data.sub_investors or []
        self._validate_sub_ratios(sub_list)

        parent_amount = self._calc_parent_amount(inv.total_investment, data.share_ratio)
        parent = Investor(
            investment_id=investment_id,
            name=data.name,
            type=data.type,
            share_ratio=data.share_ratio,
            invest_amount=parent_amount,
            parent_id=None,
            sort_order=None,
            remark=data.remark,
        )
        self.db.add(parent)
        self.db.flush()

        created_subs: list[Investor] = []
        for sub_data in sub_list:
            sub_amount = self._calc_sub_amount(parent_amount, sub_data.share_ratio)
            sub = Investor(
                investment_id=investment_id,
                name=sub_data.name,
                type=data.type,
                share_ratio=sub_data.share_ratio,
                invest_amount=sub_amount,
                parent_id=parent.id,
                sort_order=None,
                remark=sub_data.remark,
            )
            self.db.add(sub)
            created_subs.append(sub)

        self._write_log(
            investment_id,
            InvestmentActionType.INVESTOR_ADD,
            {"name": data.name, "share_ratio": str(data.share_ratio), "sub_count": len(sub_list)},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(parent)
        for s in created_subs:
            self.db.refresh(s)

        return InvestorResponse(
            id=parent.id,
            investment_id=parent.investment_id,
            name=parent.name,
            type=parent.type,
            share_ratio=parent.share_ratio,
            invest_amount=parent.invest_amount,
            parent_id=None,
            sort_order=parent.sort_order,
            remark=parent.remark,
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
                for s in created_subs
            ],
        )

    def update_investor(  # noqa: PLR0912, PLR0915
        self,
        investment_id: str,
        investor_id: str,
        data: InvestorUpdate,
        operator_id: str,
    ) -> InvestorResponse:
        """更新投资方：校验同 add_investor；sub_investors 整体替换."""
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)

        investor = (
            self.db.query(Investor)
            .filter(Investor.id == investor_id, Investor.investment_id == investment_id)
            .first()
        )
        if investor is None:
            raise ResourceNotFoundError("投资方不存在")

        update_data = data.model_dump(exclude_unset=True)

        if "name" in update_data and update_data["name"] is not None:
            self._validate_name_unique(investment_id, update_data["name"], investor.parent_id, exclude_investor_id=investor_id)
            investor.name = update_data["name"]

        if "type" in update_data and update_data["type"] is not None:
            investor.type = update_data["type"]

        if "remark" in update_data:
            investor.remark = update_data["remark"]

        is_parent = investor.parent_id is None
        if "share_ratio" in update_data and update_data["share_ratio"] is not None:
            new_ratio = Decimal(str(update_data["share_ratio"]))
            if is_parent:
                self._validate_investor_ratios(inv, new_ratio, exclude_investor_id=investor_id)
                investor.share_ratio = new_ratio
                investor.invest_amount = self._calc_parent_amount(inv.total_investment, new_ratio)
            else:
                investor.share_ratio = new_ratio
                parent_investor = (
                    self.db.query(Investor).filter(Investor.id == investor.parent_id).first()
                )
                if parent_investor is not None:
                    self._validate_sub_ratios(
                        [
                            SubInvestorCreate(name=s.name, share_ratio=s.share_ratio, remark=None)
                            for s in parent_investor.sub_investors
                            if s.id != investor_id
                        ]
                        + [SubInvestorCreate(name="_new", share_ratio=new_ratio, remark=None)]
                    )
                    investor.invest_amount = self._calc_sub_amount(parent_investor.invest_amount, new_ratio)

        if "sub_investors" in update_data and is_parent:
            for old_sub in list(investor.sub_investors):
                self.db.delete(old_sub)
            new_subs = update_data["sub_investors"] or []
            self._validate_sub_ratios(
                [SubInvestorCreate(name=s["name"], share_ratio=Decimal(str(s["share_ratio"])), remark=None) for s in new_subs]
            )
            created_subs: list[Investor] = []
            for sub_data in new_subs:
                sub_amount = self._calc_sub_amount(investor.invest_amount, Decimal(str(sub_data["share_ratio"])))
                sub = Investor(
                    investment_id=investment_id,
                    name=sub_data["name"],
                    type=investor.type,
                    share_ratio=Decimal(str(sub_data["share_ratio"])),
                    invest_amount=sub_amount,
                    parent_id=investor.id,
                    sort_order=None,
                    remark=sub_data.get("remark"),
                )
                self.db.add(sub)
                created_subs.append(sub)

        self._write_log(
            investment_id,
            InvestmentActionType.INVESTOR_EDIT,
            {"investor_id": investor_id, "name": investor.name},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(investor)

        subs = (
            self.db.query(Investor)
            .filter(Investor.parent_id == investor.id)
            .order_by(Investor.created_at)
            .all()
        ) if is_parent else []
        return InvestorResponse(
            id=investor.id,
            investment_id=investor.investment_id,
            name=investor.name,
            type=investor.type,
            share_ratio=investor.share_ratio,
            invest_amount=investor.invest_amount,
            parent_id=investor.parent_id,
            sort_order=investor.sort_order,
            remark=investor.remark,
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
        )

    def delete_investor(self, investment_id: str, investor_id: str, operator_id: str) -> None:
        """删除投资方：母投资方级联删除子投资人；写日志."""
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)

        investor = (
            self.db.query(Investor)
            .filter(Investor.id == investor_id, Investor.investment_id == investment_id)
            .first()
        )
        if investor is None:
            raise ResourceNotFoundError("投资方不存在")

        is_parent = investor.parent_id is None
        name = investor.name
        for sub in list(investor.sub_investors):
            self.db.delete(sub)
        self.db.delete(investor)

        action = InvestmentActionType.INVESTOR_DELETE if is_parent else InvestmentActionType.SUB_INVESTOR_DELETE
        self._write_log(investment_id, action, {"investor_id": investor_id, "name": name}, operator_id)
        self.db.commit()

    # ==================== 收益分配比例调整 ====================

    def list_distribution_adjustments(self, investment_id: str) -> list[ReturnAdjustmentResponse]:
        """查询分配比例调整记录（最新一批）."""
        inv = self._get_investment_or_404(investment_id)
        return self._build_adjustments_response(inv)

    def adjust_distribution_ratios(
        self,
        investment_id: str,
        data: ReturnAdjustmentBatchRequest,
        operator_id: str,
    ) -> list[ReturnAdjustmentResponse]:
        """批量调整分配比例：校验 unsettled、分配比例合计 = 100%；写记录与日志.

        分配比例 = 该投资方占 total_return 的百分比。默认 = 投资占比 share_ratio。
        调整后收益 = total_return × adjusted_distribution_ratio / 100。
        """
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)

        if inv.total_return is None:
            raise ValidationError("收益总额未设置，无法调整分配比例")

        total_return = inv.total_return

        investors = (
            self.db.query(Investor)
            .filter(
                Investor.investment_id == investment_id,
                Investor.parent_id.is_(None),
            )
            .all()
        )
        investor_map = {i.id: i for i in investors}

        adjustments_map = {a.investor_id: a for a in data.adjustments}
        if set(adjustments_map.keys()) != set(investor_map.keys()):
            raise ValidationError("调整项与投资方列表不一致")

        total_ratio = Decimal(0)
        new_records: list[ReturnAdjustment] = []
        now = datetime.now(timezone.utc)
        for inv_id, item in adjustments_map.items():
            investor = investor_map[inv_id]
            default_ratio = _quantize(investor.share_ratio)
            adjusted_ratio = Decimal(str(item.adjusted_distribution_ratio))
            adjusted_amount = _quantize(total_return * adjusted_ratio / _HUNDRED)
            total_ratio += adjusted_ratio
            record = ReturnAdjustment(
                investment_id=investment_id,
                investor_id=inv_id,
                default_distribution_ratio=default_ratio,
                adjusted_distribution_ratio=adjusted_ratio,
                adjusted_amount=adjusted_amount,
                adjusted_by=operator_id,
                adjusted_at=now,
                remark=item.remark,
            )
            new_records.append(record)

        if _quantize(total_ratio) != _HUNDRED:
            raise ValidationError(
                f"分配比例合计 {total_ratio}% 不等于 100%，请调整",
            )

        for r in new_records:
            self.db.add(r)
        self._write_log(
            investment_id,
            InvestmentActionType.DISTRIBUTION_ADJUST,
            {"count": len(new_records)},
            operator_id,
        )
        self.db.commit()
        for r in new_records:
            self.db.refresh(r)
        return [
            ReturnAdjustmentResponse(
                id=r.id,
                investment_id=r.investment_id,
                investor_id=r.investor_id,
                default_distribution_ratio=r.default_distribution_ratio,
                adjusted_distribution_ratio=r.adjusted_distribution_ratio,
                adjusted_amount=r.adjusted_amount,
                adjusted_by=r.adjusted_by,
                adjusted_at=r.adjusted_at,
                remark=r.remark,
            )
            for r in new_records
        ]

    # ==================== 结算 / 反结算 ====================

    def settle(
        self,
        investment_id: str,
        data: SettlementChangeRequest,
        operator_id: str,
    ) -> InvestmentResponse:
        """结算：unsettled → settled，记录日期与说明，写日志."""
        inv = self._get_investment_or_404(investment_id)
        if inv.settlement_status == SettlementStatus.SETTLED:
            raise ValidationError("该项目已结算，无需重复结算")
        inv.settlement_status = SettlementStatus.SETTLED
        inv.settled_date = data.settled_date
        inv.settled_note = data.settled_note
        self._write_log(
            inv.id,
            InvestmentActionType.SETTLE,
            {"settled_date": str(data.settled_date), "settled_note": data.settled_note or ""},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(inv)
        return self._to_response(inv)

    def unsettle(
        self,
        investment_id: str,
        data: UnsettleRequest,
        operator_id: str,
    ) -> InvestmentResponse:
        """反结算：settled → unsettled，清空结算字段，写日志."""
        inv = self._get_investment_or_404(investment_id)
        if inv.settlement_status != SettlementStatus.SETTLED:
            raise ValidationError("该项目未结算，无需反结算")
        inv.settlement_status = SettlementStatus.UNSETTLED
        inv.settled_date = None
        inv.settled_note = None
        self._write_log(
            inv.id,
            InvestmentActionType.UNSETTLE,
            {"reason": data.reason},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(inv)
        return self._to_response(inv)

    # ==================== 复制跟投配置 ====================

    def copy_investment(
        self,
        investment_id: str,
        data: CopyInvestmentRequest,
        operator_id: str,
    ) -> InvestmentResponse:
        """复制投资方结构到目标项目（仅 name/type/share_ratio/子投资人，金额重算，状态重置）."""
        source = self._get_investment_or_404(investment_id)
        target_proj = self._get_project_or_404(data.target_project_id)

        duplicate = (
            self.db.query(Investment)
            .filter(
                Investment.project_id == data.target_project_id,
                Investment.deleted_at.is_(None),
            )
            .first()
        )
        if duplicate is not None:
            raise ConflictError("目标项目已存在跟投记录")

        new_inv = Investment(
            project_id=target_proj.id,
            project_code=self._get_project_code(target_proj),
            project_name=target_proj.name,
            total_investment=source.total_investment,
            total_return=source.total_return,
            settlement_status=SettlementStatus.UNSETTLED,
            remark=source.remark,
            created_by=operator_id,
        )
        self.db.add(new_inv)
        self.db.flush()

        source_parents = (
            self.db.query(Investor)
            .filter(
                Investor.investment_id == source.id,
                Investor.parent_id.is_(None),
            )
            .all()
        )
        for sp in source_parents:
            parent_amount = self._calc_parent_amount(new_inv.total_investment, sp.share_ratio)
            new_parent = Investor(
                investment_id=new_inv.id,
                name=sp.name,
                type=sp.type,
                share_ratio=sp.share_ratio,
                invest_amount=parent_amount,
                parent_id=None,
                sort_order=sp.sort_order,
                remark=sp.remark,
            )
            self.db.add(new_parent)
            self.db.flush()
            for ss in sp.sub_investors:
                sub_amount = self._calc_sub_amount(parent_amount, ss.share_ratio)
                self.db.add(
                    Investor(
                        investment_id=new_inv.id,
                        name=ss.name,
                        type=sp.type,
                        share_ratio=ss.share_ratio,
                        invest_amount=sub_amount,
                        parent_id=new_parent.id,
                        sort_order=ss.sort_order,
                        remark=ss.remark,
                    ),
                )

        self._write_log(
            new_inv.id,
            InvestmentActionType.CREATE,
            {"copied_from": source.id, "target_project_id": target_proj.id},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(new_inv)
        return self._to_response(new_inv)

    # ==================== Excel 导出 ====================

    def export_excel(
        self,
        search: str | None = None,
        project_status: ProjectStatus | None = None,
        settlement_status: SettlementStatus | None = None,
    ) -> bytes:
        """导出全量跟投列表为 .xlsx（openpyxl）。文件名 跟投列表_YYYYMMDD.xlsx."""
        import io  # noqa: PLC0415

        from openpyxl import Workbook  # noqa: PLC0415

        items, _ = self.list_investments(
            search=search,
            project_status=project_status,
            settlement_status=settlement_status,
            page=1,
            page_size=100000,
        )

        wb = Workbook()
        ws = wb.active
        ws.title = "跟投列表"
        headers = [
            "项目编号",
            "小区",
            "项目状态",
            "跟投状态",
            "投资总额",
            "收益总额",
            "回报率(%)",
            "投资方数量",
        ]
        ws.append(headers)

        status_label = {
            ProjectStatus.SIGNING: "签约",
            ProjectStatus.RENOVATING: "改造",
            ProjectStatus.SELLING: "在售",
            ProjectStatus.SOLD: "已售",
            ProjectStatus.DELETED: "已删除",
        }
        settle_label = {
            SettlementStatus.UNSETTLED: "未结算",
            SettlementStatus.SETTLED: "已结算",
        }

        for it in items:
            ws.append(
                [
                    it.project_code,
                    it.project_name,
                    status_label.get(it.project_status, "-") if it.project_status else "-",
                    settle_label.get(it.settlement_status, "-"),
                    float(it.total_investment),
                    float(it.total_return) if it.total_return is not None else 0,
                    round(it.return_ratio, 2),
                    it.investor_count,
                ],
            )

        for col_idx in range(1, len(headers) + 1):
            ws.column_dimensions[ws.cell(row=1, column=col_idx).column_letter].width = 18

        buffer = io.BytesIO()
        wb.save(buffer)
        return buffer.getvalue()
