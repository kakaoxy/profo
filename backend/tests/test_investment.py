"""投资管理（跟投管理）Service 层关键缺陷回归测试.

覆盖：
- 创建/复制跟投记录时 project_code 应使用项目合同编号
- 收益总额为负（亏损）时仍可调整分配比例
"""

from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from models import Project, ProjectContract, User
from models.common import InvestorType, ProjectStatus
from schemas.investment import (
    CopyInvestmentRequest,
    InvestmentCreate,
    InvestorCreate,
    ReturnAdjustmentBatchRequest,
    ReturnAdjustmentItem,
)
from services.investment import InvestmentService
from services.system.exceptions import ValidationError


def _make_project(
    db_session: Session,
    *,
    contract_no: str | None = None,
    contract_is_deleted: bool = False,
) -> Project:
    """创建并持久化一个最小可用项目，可选附带合同编号.

    Args:
        db_session: 数据库会话
        contract_no: 合同编号；为 None 表示无合同
        contract_is_deleted: 合同软删除标记，用于回归软删除合同场景

    """
    project = Project(
        name="测试项目",
        community_name="测试小区",
        address="测试地址",
        status=ProjectStatus.SIGNING.value,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)

    if contract_no is not None:
        contract = ProjectContract(
            project_id=project.id,
            contract_no=contract_no,
            signing_price=Decimal(1000000),
            signing_date=datetime.now(timezone.utc).date(),
            signing_period=12,
            is_deleted=contract_is_deleted,
        )
        db_session.add(contract)
        db_session.commit()
        db_session.refresh(project)

    return project


def _make_operator(db_session: Session) -> User:
    """创建并持久化一个操作人用户."""
    user = User(
        id="investment-operator",
        username="investment_operator",
        password="hashed",
        nickname="操作人",
        role_id="operator-role",
        status="active",
    )
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def test_create_investment_uses_contract_no_as_project_code(db_session: Session) -> None:
    """创建跟投记录时，project_code 应优先取项目合同编号."""
    project = _make_project(db_session, contract_no="C-2026-0001")
    operator = _make_operator(db_session)
    service = InvestmentService(db_session)

    response = service.create_investment(
        InvestmentCreate(
            project_id=project.id,
            total_investment=Decimal(100000),
            total_return=Decimal(5000),
        ),
        operator_id=operator.id,
    )

    assert response.project_code == "C-2026-0001"
    assert response.project_name == project.name


def test_create_investment_falls_back_to_project_id_without_contract(db_session: Session) -> None:
    """无合同时，project_code 回退到项目 ID."""
    project = _make_project(db_session)
    operator = _make_operator(db_session)
    service = InvestmentService(db_session)

    response = service.create_investment(
        InvestmentCreate(
            project_id=project.id,
            total_investment=Decimal(100000),
        ),
        operator_id=operator.id,
    )

    assert response.project_code == str(project.id)


def test_create_investment_ignores_soft_deleted_contract(db_session: Session) -> None:
    """合同已软删除时，project_code 应回退到项目 ID（回归 7309f2d）.

    缺陷：_get_project_code 曾仅判断 contract_no 非空即采用，未校验 is_deleted，
    导致已删除合同的编号仍被用作项目编号，与业务预期不符。
    """
    project = _make_project(db_session, contract_no="C-DELETED-2026", contract_is_deleted=True)
    operator = _make_operator(db_session)
    service = InvestmentService(db_session)

    response = service.create_investment(
        InvestmentCreate(
            project_id=project.id,
            total_investment=Decimal(100000),
        ),
        operator_id=operator.id,
    )

    assert response.project_code == str(project.id)


def test_copy_investment_uses_target_contract_no_as_project_code(db_session: Session) -> None:
    """复制跟投配置到目标项目时，目标项目的 project_code 应使用其合同编号."""
    source_project = _make_project(db_session, contract_no="C-2026-SOURCE")
    target_project = _make_project(db_session, contract_no="C-2026-TARGET")
    operator = _make_operator(db_session)
    service = InvestmentService(db_session)

    source = service.create_investment(
        InvestmentCreate(
            project_id=source_project.id,
            total_investment=Decimal(200000),
        ),
        operator_id=operator.id,
    )
    service.add_investor(
        source.id,
        InvestorCreate(
            name="投资方A",
            type=InvestorType.ENTERPRISE,
            share_ratio=Decimal(100),
        ),
        operator_id=operator.id,
    )

    response = service.copy_investment(
        source.id,
        CopyInvestmentRequest(target_project_id=target_project.id),
        operator_id=operator.id,
    )

    assert response.project_code == "C-2026-TARGET"


def test_adjust_distribution_ratios_allows_negative_total_return(db_session: Session) -> None:
    """收益总额为负（记录亏损）时，仍可调整分配比例."""
    project = _make_project(db_session, contract_no="C-2026-LOSS")
    operator = _make_operator(db_session)
    service = InvestmentService(db_session)

    investment = service.create_investment(
        InvestmentCreate(
            project_id=project.id,
            total_investment=Decimal(100000),
            total_return=Decimal(-5000),
        ),
        operator_id=operator.id,
    )
    investor_a = service.add_investor(
        investment.id,
        InvestorCreate(
            name="投资方A",
            type=InvestorType.ENTERPRISE,
            share_ratio=Decimal(60),
        ),
        operator_id=operator.id,
    )
    investor_b = service.add_investor(
        investment.id,
        InvestorCreate(
            name="投资方B",
            type=InvestorType.INDIVIDUAL,
            share_ratio=Decimal(40),
        ),
        operator_id=operator.id,
    )

    response = service.adjust_distribution_ratios(
        investment.id,
        ReturnAdjustmentBatchRequest(
            adjustments=[
                ReturnAdjustmentItem(
                    investor_id=str(investor_a.id),
                    adjusted_distribution_ratio=Decimal(60),
                ),
                ReturnAdjustmentItem(
                    investor_id=str(investor_b.id),
                    adjusted_distribution_ratio=Decimal(40),
                ),
            ],
        ),
        operator_id=operator.id,
    )

    assert len(response) == 2
    amounts = {r.investor_id: r.adjusted_amount for r in response}
    assert amounts[investor_a.id] == Decimal("-3000.00")
    assert amounts[investor_b.id] == Decimal("-2000.00")


def test_adjust_distribution_ratios_rejects_missing_total_return(db_session: Session) -> None:
    """收益总额为 None 时，调整分配比例应被拒绝."""
    project = _make_project(db_session)
    operator = _make_operator(db_session)
    service = InvestmentService(db_session)

    investment = service.create_investment(
        InvestmentCreate(
            project_id=project.id,
            total_investment=Decimal(100000),
        ),
        operator_id=operator.id,
    )
    investor = service.add_investor(
        investment.id,
        InvestorCreate(
            name="投资方A",
            type=InvestorType.ENTERPRISE,
            share_ratio=Decimal(100),
        ),
        operator_id=operator.id,
    )

    with pytest.raises(ValidationError, match="收益总额未设置"):
        service.adjust_distribution_ratios(
            investment.id,
            ReturnAdjustmentBatchRequest(
                adjustments=[
                    ReturnAdjustmentItem(
                        investor_id=str(investor.id),
                        adjusted_distribution_ratio=Decimal(100),
                    ),
                ],
            ),
            operator_id=operator.id,
        )
