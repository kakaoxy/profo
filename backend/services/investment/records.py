"""跟投记录 CRUD / 列表 / 统计 / 详情 / 复制."""

from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy import func, or_, select
from sqlalchemy.orm import selectinload

from models import Investment, Investor, Project
from models.common import InvestmentActionType, ProjectStatus, SettlementStatus
from schemas.investment import (
    CopyInvestmentRequest,
    InvestmentCreate,
    InvestmentListItemResponse,
    InvestmentResponse,
    InvestmentStatsResponse,
    InvestmentUpdate,
)
from services.system.exceptions import ConflictError

from .base import _HUNDRED, _quantize


class _RecordMixin:
    """跟投记录 CRUD / 列表 / 统计 / 详情 / 复制方法."""

    # ==================== 列表 / 统计 / 详情 ====================

    def list_investments(  # noqa: PLR0913 - 3 过滤 + 2 分页参数，合并需引入 Filter DTO 属过度设计
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
        rows = query.order_by(Investment.created_at.desc()).offset(offset).limit(page_size).all()

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
        total_investment: Decimal = base.with_entities(
            func.coalesce(func.sum(Investment.total_investment), 0)
        ).scalar() or Decimal(0)
        total_return: Decimal = base.with_entities(
            func.coalesce(func.sum(Investment.total_return), 0)
        ).scalar() or Decimal(0)
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

    def get_investment_by_project(self, project_id: str) -> InvestmentResponse | None:
        """按项目ID查询跟投记录（每个项目最多一条）."""
        inv = (
            self.db.query(Investment)
            .options(
                selectinload(Investment.investors),
                selectinload(Investment.return_adjustments),
                selectinload(Investment.logs),
            )
            .filter(
                Investment.project_id == project_id,
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
