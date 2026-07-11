"""投资方（母投资方 / 子投资人）CRUD."""

from decimal import Decimal
from typing import Any

from models import Investment, Investor
from models.common import InvestmentActionType
from schemas.investment import (
    InvestorCreate,
    InvestorResponse,
    InvestorUpdate,
    SubInvestorCreate,
)
from services.system.exceptions import ResourceNotFoundError


class _InvestorMixin:
    """投资方 CRUD 方法."""

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

    def _update_investor_share_ratio(
        self,
        inv: Investment,
        investor: Investor,
        new_ratio: Decimal,
    ) -> None:
        """更新投资方分配比例（含母/子投资方校验与金额重算）."""
        is_parent = investor.parent_id is None
        if is_parent:
            self._validate_investor_ratios(inv, new_ratio, exclude_investor_id=investor.id)
            investor.share_ratio = new_ratio
            investor.invest_amount = self._calc_parent_amount(inv.total_investment, new_ratio)
            return

        investor.share_ratio = new_ratio
        parent_investor = self.db.query(Investor).filter(Investor.id == investor.parent_id).first()
        if parent_investor is not None:
            self._validate_sub_ratios(
                [
                    SubInvestorCreate(name=s.name, share_ratio=s.share_ratio, remark=None)
                    for s in parent_investor.sub_investors
                    if s.id != investor.id
                ]
                + [SubInvestorCreate(name="_new", share_ratio=new_ratio, remark=None)],
            )
            investor.invest_amount = self._calc_sub_amount(parent_investor.invest_amount, new_ratio)

    def _replace_investor_sub_investors(
        self,
        investor: Investor,
        new_subs: list[dict[str, Any]],
    ) -> None:
        """整体替换母投资方的子投资人列表（先删后建）."""
        for old_sub in list(investor.sub_investors):
            self.db.delete(old_sub)
        self._validate_sub_ratios(
            [
                SubInvestorCreate(
                    name=s["name"],
                    share_ratio=Decimal(str(s["share_ratio"])),
                    remark=None,
                )
                for s in new_subs
            ],
        )
        for sub_data in new_subs:
            sub_amount = self._calc_sub_amount(investor.invest_amount, Decimal(str(sub_data["share_ratio"])))
            sub = Investor(
                investment_id=investor.investment_id,
                name=sub_data["name"],
                type=investor.type,
                share_ratio=Decimal(str(sub_data["share_ratio"])),
                invest_amount=sub_amount,
                parent_id=investor.id,
                sort_order=None,
                remark=sub_data.get("remark"),
            )
            self.db.add(sub)

    def _build_investor_with_subs_response(
        self,
        investor: Investor,
        include_subs: bool,
    ) -> InvestorResponse:
        """构建投资方响应（母投资方含子投资人列表）."""
        subs = (
            (self.db.query(Investor).filter(Investor.parent_id == investor.id).order_by(Investor.created_at).all())
            if include_subs
            else []
        )
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

    def update_investor(
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
            self.db.query(Investor).filter(Investor.id == investor_id, Investor.investment_id == investment_id).first()
        )
        if investor is None:
            raise ResourceNotFoundError("投资方不存在")

        update_data = data.model_dump(exclude_unset=True)
        is_parent = investor.parent_id is None

        if "name" in update_data and update_data["name"] is not None:
            self._validate_name_unique(
                investment_id,
                update_data["name"],
                investor.parent_id,
                exclude_investor_id=investor_id,
            )
            investor.name = update_data["name"]

        if "type" in update_data and update_data["type"] is not None:
            investor.type = update_data["type"]

        if "remark" in update_data:
            investor.remark = update_data["remark"]

        if "share_ratio" in update_data and update_data["share_ratio"] is not None:
            self._update_investor_share_ratio(inv, investor, Decimal(str(update_data["share_ratio"])))

        if "sub_investors" in update_data and is_parent:
            self._replace_investor_sub_investors(investor, update_data["sub_investors"] or [])

        self._write_log(
            investment_id,
            InvestmentActionType.INVESTOR_EDIT,
            {"investor_id": investor_id, "name": investor.name},
            operator_id,
        )
        self.db.commit()
        self.db.refresh(investor)

        return self._build_investor_with_subs_response(investor, is_parent)

    def delete_investor(self, investment_id: str, investor_id: str, operator_id: str) -> None:
        """删除投资方：母投资方级联删除子投资人；写日志."""
        inv = self._get_investment_or_404(investment_id)
        self._assert_editable(inv)

        investor = (
            self.db.query(Investor).filter(Investor.id == investor_id, Investor.investment_id == investment_id).first()
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
