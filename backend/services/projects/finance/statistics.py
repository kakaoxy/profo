"""资金账本统计页面聚合(五层法 + 阶段现金流重算).

按 finance_subjects.level 聚合五层法，按 finance_subjects.stage 聚合阶段现金流，
计算 8 项 KPI。subject_id 为 NULL 的旧记录不计入五层法/阶段/breakdown，
但计入 KPI 的现金流合计。
"""

import logging
import uuid
from decimal import Decimal

from sqlalchemy import func

from models import FinanceRecord, FinanceSubject, Project
from models.common import BusinessForm
from schemas.project.ledger_statistics import (
    LedgerStatisticsFiveLayer,
    LedgerStatisticsKPI,
    LedgerStatisticsStageFlow,
    ProjectLedgerStatisticsResponse,
)
from services.system.exceptions import ResourceNotFoundError

from .statistics_builder import CalcBreakdownContext, SubjectDetail, build_calc_breakdown

logger = logging.getLogger(__name__)

# 业务模式 → 阶段顺序(agent 4阶段 / acquire 5阶段)
_STAGES_BY_MODE: dict[str, list[str]] = {
    "agent": ["signing", "renovation", "listing", "sold"],
    "acquire": ["signing", "holding", "renovation", "listing", "sold"],
}

# 阶段中文名
_STAGE_LABELS: dict[str, str] = {
    "signing": "签约",
    "holding": "持有期",
    "renovation": "装修",
    "listing": "在售",
    "sold": "已售",
    # P2-15: 未匹配 stage 的兜底归类，仅在有未识别 stage 记录时追加
    "other": "其他",
}


class _StatisticsMixin:
    """资金账本统计页面聚合方法."""

    def get_statistics(self, project_id: uuid.UUID) -> ProjectLedgerStatisticsResponse:
        """资金账本统计页面：按五层法 + 阶段现金流聚合.

        1. 获取项目业务模式，确定阶段列表(agent 4阶段 / acquire 5阶段)。
        2. JOIN finance_subjects 按科目聚合 inflow/outflow，再按 level 聚合五层、
           按 stage 聚合阶段现金流、按 pnl 聚合进损益支出。
        3. 独立查询所有记录(含 subject_id 为 NULL)的现金流合计，用于 KPI。
        """
        project = self.db.query(Project).filter(Project.id == project_id, Project.is_deleted.is_(False)).first()
        if not project:
            msg = "项目不存在"
            raise ResourceNotFoundError(msg)

        # P2-14: business_form 缺失时显式告警，避免静默按 agent 统计导致阶段错位
        if project.business_form is None:
            logger.warning(
                "项目 %s 无 business_form，默认按 agent 阶段统计",
                project_id,
            )
            mode = "agent"
        else:
            mode = "acquire" if project.business_form == BusinessForm.WHOLESALE else "agent"
        stages = _STAGES_BY_MODE[mode]

        # JOIN finance_subjects 按科目聚合(inner join 排除 subject_id 为 NULL 的旧记录)
        subject_rows = (
            self.db.query(
                FinanceSubject.name,
                FinanceSubject.level,
                FinanceSubject.stage,
                FinanceSubject.pnl,
                func.sum(FinanceRecord.inflow).label("inflow"),
                func.sum(FinanceRecord.outflow).label("outflow"),
                func.count(FinanceRecord.id).label("cnt"),
            )
            .join(FinanceSubject, FinanceSubject.id == FinanceRecord.subject_id)
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
                FinanceSubject.is_deleted.is_(False),
            )
            .group_by(
                FinanceSubject.name,
                FinanceSubject.level,
                FinanceSubject.stage,
                FinanceSubject.pnl,
            )
            .all()
        )

        income = Decimal(0)
        direct_cost = Decimal(0)
        opex = Decimal(0)
        finance_cost = Decimal(0)
        pnl_outflow = Decimal(0)
        subject_details: list[SubjectDetail] = []
        stage_inflow: dict[str, Decimal] = {s: Decimal(0) for s in stages}
        stage_outflow: dict[str, Decimal] = {s: Decimal(0) for s in stages}
        stage_count: dict[str, int] = dict.fromkeys(stages, 0)
        # P2-15: 兜底桶，承载 stage 不在当前业务模式阶段表中的记录
        other_inflow = Decimal(0)
        other_outflow = Decimal(0)
        other_count = 0

        for r in subject_rows:
            inflow = r.inflow or Decimal(0)
            outflow = r.outflow or Decimal(0)
            net = inflow - outflow
            subject_details.append(SubjectDetail(name=r.name, level=r.level, net=net))

            # 五层法：level 1/2/3/4/6 进损益，level 5/7 不进
            if r.level == "6":
                income += net
            elif r.level in ("1", "2"):
                direct_cost += net
            elif r.level == "3":
                opex += net
            elif r.level == "4":
                finance_cost += net

            # 进损益支出合计(pnl=true 的 outflow)
            if r.pnl and outflow > 0:
                pnl_outflow += outflow

            # 阶段现金流聚合：未匹配 stage 归入 "other"，不再静默丢弃
            if r.stage in stage_inflow:
                stage_inflow[r.stage] += inflow
                stage_outflow[r.stage] += outflow
                stage_count[r.stage] += int(r.cnt or 0)
            else:
                other_inflow += inflow
                other_outflow += outflow
                other_count += int(r.cnt or 0)
                logger.warning(
                    "项目 %s 科目 %s stage=%r 不在模式 %s 阶段表内，归入其他",
                    project_id,
                    r.name,
                    r.stage,
                    mode,
                )

        # 勾稽：毛利 = 收入 + 直接成本；净利 = 毛利 + 运营费用 + 融资成本
        gross = income + direct_cost
        net = gross + opex + finance_cost

        # KPI 现金流合计：所有记录(含 subject_id 为 NULL)，独立查询
        cash_row = (
            self.db.query(
                func.sum(FinanceRecord.inflow).label("inflow"),
                func.sum(FinanceRecord.outflow).label("outflow"),
                func.count(FinanceRecord.id).label("cnt"),
            )
            .filter(
                FinanceRecord.project_id == project_id,
                FinanceRecord.is_deleted.is_(False),
            )
            .first()
        )
        cash_inflow = cash_row.inflow or Decimal(0)
        cash_outflow = cash_row.outflow or Decimal(0)
        net_cashflow = cash_inflow - cash_outflow
        record_count = int(cash_row.cnt or 0)

        five_layer = LedgerStatisticsFiveLayer(
            income=income,
            direct_cost=direct_cost,
            gross=gross,
            opex=opex,
            finance_cost=finance_cost,
            net=net,
        )

        stage_flows = [
            LedgerStatisticsStageFlow(
                stage=s,
                stage_label=_STAGE_LABELS[s],
                inflow=stage_inflow[s],
                outflow=stage_outflow[s],
                net=stage_inflow[s] - stage_outflow[s],
                count=stage_count[s],
            )
            for s in stages
        ]
        # P2-15: 仅当存在未匹配 stage 的记录时追加"其他"行，避免空桶污染正常输出
        if other_count > 0:
            stage_flows.append(
                LedgerStatisticsStageFlow(
                    stage="other",
                    stage_label=_STAGE_LABELS["other"],
                    inflow=other_inflow,
                    outflow=other_outflow,
                    net=other_inflow - other_outflow,
                    count=other_count,
                ),
            )

        kpi = LedgerStatisticsKPI(
            project_income=income,
            gross_profit=gross,
            net_profit=net,
            total_pnl_outflow=pnl_outflow,
            cash_inflow=cash_inflow,
            cash_outflow=cash_outflow,
            net_cashflow=net_cashflow,
            record_count=record_count,
        )

        breakdown = build_calc_breakdown(
            CalcBreakdownContext(
                business_form=project.business_form,
                income=income,
                direct_cost=direct_cost,
                gross=gross,
                opex=opex,
                finance_cost=finance_cost,
                net=net,
                subject_details=subject_details,
            ),
        )

        return ProjectLedgerStatisticsResponse(
            five_layer=five_layer,
            stage_flows=stage_flows,
            kpi=kpi,
            breakdown=breakdown,
        )
