"""结算 / 反结算 / 收益分配比例调整."""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from models import Investor, ReturnAdjustment
from models.common import InvestmentActionType, SettlementStatus
from schemas.investment import (
    InvestmentResponse,
    ReturnAdjustmentBatchRequest,
    ReturnAdjustmentResponse,
    SettlementChangeRequest,
    UnsettleRequest,
)
from services.system.exceptions import ValidationError

from .base import _HUNDRED, _quantize


class _SettlementMixin:
    """结算 / 反结算 / 收益分配比例调整方法."""

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
            msg = "收益总额未设置，无法调整分配比例"
            raise ValidationError(msg)

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

        # ReturnAdjustmentItem.investor_id 为 str，需归一化为 UUID 再与 investor_map 比对
        try:
            adjustments_map = {uuid.UUID(a.investor_id): a for a in data.adjustments}
        except ValueError as err:
            msg = "调整项投资方ID格式非法"
            raise ValidationError(msg) from err
        if set(adjustments_map.keys()) != set(investor_map.keys()):
            msg = "调整项与投资方列表不一致"
            raise ValidationError(msg)

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
            msg = f"分配比例合计 {total_ratio}% 不等于 100%，请调整"
            raise ValidationError(
                msg,
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
        inv = self._get_investment_or_404(investment_id, for_update=True)
        if inv.settlement_status == SettlementStatus.SETTLED:
            msg = "该项目已结算，无需重复结算"
            raise ValidationError(msg)
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
        inv = self._get_investment_or_404(investment_id, for_update=True)
        if inv.settlement_status != SettlementStatus.SETTLED:
            msg = "该项目未结算，无需反结算"
            raise ValidationError(msg)
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
