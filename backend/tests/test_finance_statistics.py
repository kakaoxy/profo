"""资金账本统计页面 FinanceService.get_statistics 单元测试（五层法 + 阶段现金流）.

覆盖：
- 项目不存在 -> 404 (HTTP + Service)
- 项目无流水 -> 各层/各阶段/各 KPI 全 0、HTTP 200
- 按科目 level 聚合五层法 -> income/direct_cost/gross/opex/finance_cost/net 正确
- 按科目 stage 聚合阶段现金流 -> 各阶段金额/笔数正确
- KPI 现金流合计含 subject_id 为 NULL 的旧记录
- 软删除项目 -> 404
- agent(4阶段) / acquire(5阶段) / business_form=None 回退 agent
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from models import FinanceRecord, FinanceSubject, Project
from models.common import BusinessForm, CashFlowCategory, CashFlowType, ProjectStatus
from services.projects import FinanceService
from services.system.exceptions import ResourceNotFoundError

# ==================== 辅助函数 ====================


def _make_project(
    db_session: Session,
    *,
    business_form: BusinessForm | None = None,
) -> Project:
    """创建并持久化一个最小可用项目."""
    project = Project(
        name="统计测试项目",
        community_name="统计测试小区",
        address="统计测试地址",
        status=ProjectStatus.SIGNING.value,
        business_form=business_form,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _make_subject(
    db_session: Session,
    *,
    subject_id: str,
    name: str,
    level: str,
    pnl: bool = True,
    stage: str = "signing",
) -> FinanceSubject:
    """创建并持久化一个科目（五层法由 level 聚合）."""
    subject = FinanceSubject(
        id=subject_id,
        name=name,
        level=level,
        pnl=pnl,
        modes=["agent", "acquire"],
        stage=stage,
        note="测试科目",
        system=True,
        is_deleted=False,
    )
    db_session.add(subject)
    db_session.commit()
    db_session.refresh(subject)
    return subject


def _make_finance_record(
    db_session: Session,
    project: Project,
    *,
    subject_id: str | None,
    inflow: Decimal = Decimal(0),
    outflow: Decimal = Decimal(0),
    record_date: datetime | None = None,
) -> FinanceRecord:
    """创建一条财务流水（Task 5 新字段 inflow/outflow/subject_id）."""
    is_income = inflow > 0
    record = FinanceRecord(
        project_id=project.id,
        type=CashFlowType.INCOME.value if is_income else CashFlowType.EXPENSE.value,
        category=CashFlowCategory.OTHER_INCOME.value if is_income else CashFlowCategory.OTHER_EXPENSE.value,
        amount=inflow if is_income else outflow,
        record_date=record_date or datetime(2026, 1, 1, tzinfo=timezone.utc),
        subject_id=subject_id,
        inflow=inflow,
        outflow=outflow,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(record)
    db_session.commit()
    db_session.refresh(record)
    return record


# ==================== 测试用例 ====================


def test_statistics_project_not_found_service(db_session: Session) -> None:
    """Service 层：项目不存在 -> ResourceNotFoundError."""
    service = FinanceService(db_session)
    with pytest.raises(ResourceNotFoundError):
        service.get_statistics(uuid.uuid4())


def test_statistics_project_not_found_http(backend_client) -> None:  # type: ignore[no-untyped-def]
    """HTTP 层：项目不存在 -> 404."""
    response = backend_client.get(f"/api/v1/admin/ledger/{uuid.uuid4()}/statistics")
    assert response.status_code == 404


def test_statistics_no_records_all_zeros_http(backend_client, seeded_db) -> None:  # type: ignore[no-untyped-def]
    """HTTP 层：项目无流水 -> 各层/各 KPI 全 0、HTTP 200."""
    session = seeded_db["session"]
    project = _make_project(session)

    response = backend_client.get(f"/api/v1/admin/ledger/{project.id}/statistics")
    assert response.status_code == 200
    data = response.json()

    # 五层法全 0
    for key in ("income", "direct_cost", "gross", "opex", "finance_cost", "net"):
        assert data["five_layer"][key] == 0
    # KPI 全 0
    for key in ("project_income", "gross_profit", "net_profit", "total_pnl_outflow"):
        assert data["kpi"][key] == 0
    assert data["kpi"]["record_count"] == 0
    # 阶段现金流存在且全 0
    assert len(data["stage_flows"]) == 4  # 默认 agent 4 阶段
    for sf in data["stage_flows"]:
        assert sf["inflow"] == 0
        assert sf["outflow"] == 0
        assert sf["count"] == 0


def test_statistics_aggregation_by_level(db_session: Session) -> None:
    """按科目 level 聚合五层法 -> 各层金额正确."""
    project = _make_project(db_session)
    _make_subject(db_session, subject_id="S01", name="增值服务费", level="6", stage="sold")
    _make_subject(db_session, subject_id="S02", name="购房定金", level="1", stage="signing")
    _make_subject(db_session, subject_id="S03", name="装修款", level="2", stage="renovation")
    _make_subject(db_session, subject_id="S04", name="收房佣金", level="3", stage="signing")
    _make_subject(db_session, subject_id="S05", name="项目分润", level="4", stage="sold")
    _make_subject(db_session, subject_id="S06", name="贷款发放", level="5", pnl=False, stage="signing")

    _make_finance_record(db_session, project, subject_id="S01", inflow=Decimal(10000))
    _make_finance_record(db_session, project, subject_id="S02", outflow=Decimal(3000))
    _make_finance_record(db_session, project, subject_id="S03", outflow=Decimal(2000))
    _make_finance_record(db_session, project, subject_id="S04", outflow=Decimal(1000))
    _make_finance_record(db_session, project, subject_id="S05", outflow=Decimal(500))
    _make_finance_record(db_session, project, subject_id="S06", outflow=Decimal(2000))

    service = FinanceService(db_session)
    result = service.get_statistics(project.id)

    # 五层法：income=6 层、direct_cost=1/2 层、opex=3 层、finance_cost=4 层；5/7 层不进
    assert result.five_layer.income == Decimal(10000)
    assert result.five_layer.direct_cost == Decimal(-5000)
    assert result.five_layer.gross == Decimal(5000)  # 10000 + (-5000)
    assert result.five_layer.opex == Decimal(-1000)
    assert result.five_layer.finance_cost == Decimal(-500)
    assert result.five_layer.net == Decimal(3500)  # 5000 - 1000 - 500

    # KPI：pnl 支出合计仅统计 pnl=true 的 outflow
    assert result.kpi.project_income == Decimal(10000)
    assert result.kpi.gross_profit == Decimal(5000)
    assert result.kpi.net_profit == Decimal(3500)
    assert result.kpi.total_pnl_outflow == Decimal(6500)  # 3000+2000+1000+500
    assert result.kpi.cash_inflow == Decimal(10000)
    assert result.kpi.cash_outflow == Decimal(8500)  # 含 S06(level5) 的 2000
    assert result.kpi.net_cashflow == Decimal(1500)
    assert result.kpi.record_count == 6

    # 阶段现金流：agent 4 阶段
    stage_by_name = {sf.stage: sf for sf in result.stage_flows}
    assert set(stage_by_name) == {"signing", "renovation", "listing", "sold"}
    assert stage_by_name["signing"].outflow == Decimal(6000)
    assert stage_by_name["signing"].count == 3
    assert stage_by_name["renovation"].outflow == Decimal(2000)
    assert stage_by_name["renovation"].count == 1
    assert stage_by_name["sold"].inflow == Decimal(10000)
    assert stage_by_name["sold"].outflow == Decimal(500)
    assert stage_by_name["sold"].count == 2
    # listing 空
    assert stage_by_name["listing"].count == 0

    # breakdown 存在；business_form=None 项目如实反映 None（阶段仍回退 agent）
    assert result.breakdown.business_form is None


def test_statistics_stage_flow_aggregation(db_session: Session) -> None:
    """按科目 stage 聚合阶段现金流 -> 各阶段金额/笔数正确."""
    project = _make_project(db_session, business_form=BusinessForm.WHOLESALE)
    _make_subject(db_session, subject_id="S01", name="购房定金", level="1", stage="signing")
    _make_subject(db_session, subject_id="S02", name="月供本金", level="5", pnl=False, stage="holding")
    _make_subject(db_session, subject_id="S03", name="装修款", level="2", stage="renovation")
    _make_subject(db_session, subject_id="S04", name="售房差额", level="6", stage="sold")

    _make_finance_record(db_session, project, subject_id="S01", outflow=Decimal(30000))
    _make_finance_record(db_session, project, subject_id="S02", outflow=Decimal(12000))
    _make_finance_record(db_session, project, subject_id="S03", outflow=Decimal(20000))
    _make_finance_record(db_session, project, subject_id="S04", inflow=Decimal(250000))

    service = FinanceService(db_session)
    result = service.get_statistics(project.id)

    # 收购 5 阶段：signing/holding/renovation/listing/sold
    stage_by_name = {sf.stage: sf for sf in result.stage_flows}
    assert set(stage_by_name) == {"signing", "holding", "renovation", "listing", "sold"}
    assert stage_by_name["signing"].outflow == Decimal(30000)
    assert stage_by_name["holding"].outflow == Decimal(12000)
    assert stage_by_name["renovation"].outflow == Decimal(20000)
    assert stage_by_name["sold"].inflow == Decimal(250000)
    assert result.breakdown.business_form == "wholesale"


def test_statistics_kpi_includes_null_subject_records(db_session: Session) -> None:
    """KPI 现金流合计包含 subject_id 为 NULL 的旧记录，但五层/阶段不含."""
    project = _make_project(db_session)
    # 有科目的记录
    _make_subject(db_session, subject_id="S01", name="增值服务费", level="6", stage="sold")
    _make_finance_record(db_session, project, subject_id="S01", inflow=Decimal(10000))
    # subject_id 为 NULL 的旧记录 -> 仅计入 KPI 现金流
    _make_finance_record(db_session, project, subject_id=None, outflow=Decimal(6000))

    service = FinanceService(db_session)
    result = service.get_statistics(project.id)

    # 五层仅统计有科目的记录
    assert result.five_layer.income == Decimal(10000)
    # KPI 现金流含 NULL subject 记录
    assert result.kpi.cash_inflow == Decimal(10000)
    assert result.kpi.cash_outflow == Decimal(6000)
    assert result.kpi.record_count == 2
    # 阶段现金流：old 记录无科目，不进入阶段
    total_stage_count = sum(sf.count for sf in result.stage_flows)
    assert total_stage_count == 1


def test_statistics_soft_deleted_project_404(db_session: Session) -> None:
    """软删除项目 -> 404."""
    project = _make_project(db_session)
    project.is_deleted = True
    db_session.commit()

    service = FinanceService(db_session)
    with pytest.raises(ResourceNotFoundError):
        service.get_statistics(project.id)


def test_statistics_business_form_none_falls_back_to_agent(db_session: Session) -> None:
    """business_form=None -> 回退 agent 阶段统计（4 阶段）."""
    project = _make_project(db_session, business_form=None)
    _make_subject(db_session, subject_id="S01", name="增值服务费", level="6", stage="sold")
    _make_finance_record(db_session, project, subject_id="S01", inflow=Decimal(10000))

    service = FinanceService(db_session)
    result = service.get_statistics(project.id)

    assert len(result.stage_flows) == 4
    assert {sf.stage for sf in result.stage_flows} == {"signing", "renovation", "listing", "sold"}
    # business_form=None 时 breakdown.business_form 如实为 None
    assert result.breakdown.business_form is None
