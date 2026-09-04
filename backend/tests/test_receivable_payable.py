"""应收应付参考表 FinanceService.get_receivable_payable 单元测试.

覆盖：
- 项目不存在 -> 404 (HTTP + Service)
- 正常返回 34 个 items
- signing_price_pct 计算（渠道佣金 = 签约价格 × 0.01 × 10000）
- sold_price_pct 计算（营销推广费 = 成交总价 × 0.005 × 10000）
- vas_pct / vas 计算（财税成本 / 增值服务费收入）
- renovation / investment / fixed / bond / none 计算类型
- 数据缺失时 expected_amount 为 None
- 实际金额聚合与差额计算（difference = expected - actual）
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from models import (
    FinanceRecord,
    Investment,
    Investor,
    Project,
    ProjectContract,
    ProjectRenovation,
    ProjectSale,
)
from models.common import CashFlowCategory, CashFlowType, InvestorType, ProjectStatus
from services.projects import FinanceService
from services.system.exceptions import ResourceNotFoundError

# ==================== 辅助函数 ====================


def _make_project(db_session: Session) -> Project:
    """创建并持久化一个最小可用项目."""
    project = Project(
        name="应收应付测试项目",
        community_name="应收应付测试小区",
        address="应收应付测试地址",
        status=ProjectStatus.SIGNING.value,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


def _make_contract(
    db_session: Session,
    project: Project,
    *,
    signing_price: Decimal | None = None,
) -> ProjectContract:
    """创建合同记录，支持传入 signing_price（单位：万）."""
    contract = ProjectContract(
        project_id=project.id,
        contract_no=None,
        signing_price=signing_price,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(contract)
    db_session.commit()
    return contract


def _make_sale(
    db_session: Session,
    project: Project,
    *,
    sold_price: Decimal | None = None,
    sold_date: datetime | None = None,
) -> ProjectSale:
    """创建销售记录，支持传入 sold_price（单位：万）."""
    sale = ProjectSale(
        project_id=project.id,
        sold_date=sold_date,
        sold_price=sold_price,
        transaction_status="在售",
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(sale)
    db_session.commit()
    return sale


def _make_renovation(
    db_session: Session,
    project: Project,
    *,
    hard_contract_amount: Decimal | None = None,
    soft_budget: Decimal | None = None,
    custom_cabinet_amount: Decimal | None = None,
    window_amount: Decimal | None = None,
    wall_treatment_amount: Decimal | None = None,
    design_fee: Decimal | None = None,
    demolition_fee: Decimal | None = None,
    garbage_fee: Decimal | None = None,
    other_extra_fee: Decimal | None = None,
) -> ProjectRenovation:
    """创建装修记录，支持全部装修金额字段."""
    renovation = ProjectRenovation(
        project_id=project.id,
        renovation_company="测试装修公司",
        hard_contract_amount=hard_contract_amount,
        soft_budget=soft_budget,
        custom_cabinet_amount=custom_cabinet_amount,
        window_amount=window_amount,
        wall_treatment_amount=wall_treatment_amount,
        design_fee=design_fee,
        demolition_fee=demolition_fee,
        garbage_fee=garbage_fee,
        other_extra_fee=other_extra_fee,
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(renovation)
    db_session.commit()
    return renovation


def _make_finance_record(
    db_session: Session,
    project: Project,
    *,
    type_: CashFlowType,
    category: CashFlowCategory,
    amount: Decimal,
    record_date: datetime | None = None,
    counterparty: str | None = None,
    is_deleted: bool = False,
) -> FinanceRecord:
    """创建一条财务流水，支持标记 is_deleted 用于聚合排除验证."""
    record = FinanceRecord(
        project_id=project.id,
        type=type_.value,
        category=category.value,
        amount=amount,
        record_date=record_date or datetime(2026, 1, 1, tzinfo=timezone.utc),
        counterparty=counterparty,
        is_deleted=is_deleted,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(record)
    db_session.commit()
    return record


def _make_investment(
    db_session: Session,
    project: Project,
    investors: list[dict],
) -> Investment:
    """创建跟投记录 + 顶级投资方.

    Args:
        db_session: 数据库会话.
        project: 关联项目.
        investors: list of dict with keys: name, share_ratio, invest_amount.

    """
    investment = Investment(
        project_id=project.id,
        project_code="TEST-RP-001",
        project_name=project.name,
        total_investment=sum(Decimal(str(i["invest_amount"])) for i in investors),
        created_by="admin-user",
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(investment)
    db_session.commit()
    db_session.refresh(investment)

    for idx, inv in enumerate(investors):
        investor = Investor(
            investment_id=investment.id,
            name=inv["name"],
            type=InvestorType.INDIVIDUAL.value,
            share_ratio=Decimal(str(inv["share_ratio"])),
            invest_amount=Decimal(str(inv["invest_amount"])),
            parent_id=None,
            sort_order=idx + 1,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db_session.add(investor)
    db_session.commit()
    return investment


def _find_item(
    items: list,
    category: CashFlowCategory,
    *,
    business_type: str | None = None,
) -> object:
    """从 items 中查找指定 category 的项目，可选按 business_type 过滤."""
    for it in items:
        if it.category == category and (business_type is None or it.business_type == business_type):
            return it
    msg = f"未找到 category={category}, business_type={business_type} 的 item"
    raise AssertionError(msg)


# ==================== 测试用例 ====================


def test_receivable_payable_project_not_found_service(db_session: Session) -> None:
    """Service 层：项目不存在 -> ResourceNotFoundError."""
    service = FinanceService(db_session)
    with pytest.raises(ResourceNotFoundError):
        service.get_receivable_payable(str(uuid.uuid4()))


def test_receivable_payable_project_not_found_http(backend_client) -> None:  # type: ignore[no-untyped-def]
    """HTTP 层：项目不存在 -> 404."""
    response = backend_client.get(f"/api/v1/admin/ledger/{uuid.uuid4()}/receivable-payable")
    assert response.status_code == 404


def test_receivable_payable_returns_34_items(backend_client, seeded_db) -> None:  # type: ignore[no-untyped-def]
    """HTTP 层：正常返回 34 个 items."""
    session = seeded_db["session"]
    project = _make_project(session)

    response = backend_client.get(f"/api/v1/admin/ledger/{project.id}/receivable-payable")
    assert response.status_code == 200
    data = response.json()
    assert len(data["items"]) == 34


def test_receivable_payable_signing_price_pct(db_session: Session) -> None:
    """渠道佣金 = 签约价格(万) × 0.01 × 10000."""
    project = _make_project(db_session)
    _make_contract(db_session, project, signing_price=Decimal(100))  # 100万

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # CHANNEL_COMMISSION (general): 100 × 0.01 × 10000 = 10000 元
    item = _find_item(result.items, CashFlowCategory.CHANNEL_COMMISSION, business_type="general")
    assert item.expected_amount == Decimal(10000)
    # 同样使用 signing_price_pct 的还有 PROPERTY_TAX (wholesale)
    property_tax = _find_item(result.items, CashFlowCategory.PROPERTY_TAX, business_type="wholesale")
    assert property_tax.expected_amount == Decimal(10000)


def test_receivable_payable_channel_commission_cap(db_session: Session) -> None:
    """渠道佣金上限 40000：签约价 ≥ 400万时按 40000 计."""
    project = _make_project(db_session)
    # 600万 × 0.01 × 10000 = 60000，超过 cap 40000
    _make_contract(db_session, project, signing_price=Decimal(600))

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    item = _find_item(result.items, CashFlowCategory.CHANNEL_COMMISSION, business_type="general")
    assert item.expected_amount == Decimal(40000)

    # PROPERTY_TAX 不受 cap 约束：600 × 0.01 × 10000 = 60000
    property_tax = _find_item(result.items, CashFlowCategory.PROPERTY_TAX, business_type="wholesale")
    assert property_tax.expected_amount == Decimal(60000)


def test_receivable_payable_sold_price_pct(db_session: Session) -> None:
    """营销推广费 = 成交总价(万) × 0.005 × 10000."""
    project = _make_project(db_session)
    _make_sale(db_session, project, sold_price=Decimal(200))  # 200万

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # MARKETING_PROMOTION: 200 × 0.005 × 10000 = 10000 元
    item = _find_item(result.items, CashFlowCategory.MARKETING_PROMOTION)
    assert item.expected_amount == Decimal(10000)
    # OPERATION_FEE (sold_price_pct, param=0.01): 200 × 0.01 × 10000 = 20000 元
    operation = _find_item(result.items, CashFlowCategory.OPERATION_FEE)
    assert operation.expected_amount == Decimal(20000)


def test_receivable_payable_operation_fee_cap(db_session: Session) -> None:
    """运营费上限 40000：成交总价 ≥ 400万时按 40000 计."""
    project = _make_project(db_session)
    # 600万 × 0.01 × 10000 = 60000，超过 cap 40000
    _make_sale(db_session, project, sold_price=Decimal(600))

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    operation = _find_item(result.items, CashFlowCategory.OPERATION_FEE)
    assert operation.expected_amount == Decimal(40000)

    # MARKETING_PROMOTION 不受 cap 约束：600 × 0.005 × 10000 = 30000
    marketing = _find_item(result.items, CashFlowCategory.MARKETING_PROMOTION)
    assert marketing.expected_amount == Decimal(30000)


def test_receivable_payable_vas_pct(db_session: Session) -> None:
    """财税成本 = (成交总价-签约价格)(万) × 10000 × 0.01."""
    project = _make_project(db_session)
    _make_contract(db_session, project, signing_price=Decimal(100))
    _make_sale(db_session, project, sold_price=Decimal(200))

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # FINANCE_TAX_COST (vas_pct, 0.01): (200-100) × 10000 × 0.01 = 10000 元
    item = _find_item(result.items, CashFlowCategory.FINANCE_TAX_COST)
    assert item.expected_amount == Decimal(10000)
    # TAX_COMMISSION_DIFF (agent, vas_pct, 0.01): 同样 10000 元
    tax_diff = _find_item(result.items, CashFlowCategory.TAX_COMMISSION_DIFF, business_type="agent")
    assert tax_diff.expected_amount == Decimal(10000)


def test_receivable_payable_vas(db_session: Session) -> None:
    """增值服务费收入 = (成交总价-签约价格)(万) × 10000."""
    project = _make_project(db_session)
    _make_contract(db_session, project, signing_price=Decimal(100))
    _make_sale(db_session, project, sold_price=Decimal(200))

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # VALUE_ADDED_SERVICE (vas): (200-100) × 10000 = 1000000 元
    item = _find_item(result.items, CashFlowCategory.VALUE_ADDED_SERVICE)
    assert item.expected_amount == Decimal(1000000)


def test_receivable_payable_renovation(db_session: Session) -> None:
    """装修类科目取 renovation 对应字段."""
    project = _make_project(db_session)
    _make_renovation(
        db_session,
        project,
        hard_contract_amount=Decimal(80000),
        soft_budget=Decimal(30000),
        custom_cabinet_amount=Decimal(15000),
        window_amount=Decimal(8000),
        wall_treatment_amount=Decimal(5000),
        design_fee=Decimal(1000),
        demolition_fee=Decimal(500),
        garbage_fee=Decimal(300),
        other_extra_fee=Decimal(200),
    )

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    assert _find_item(result.items, CashFlowCategory.HARD_DECORATION).expected_amount == Decimal(80000)
    assert _find_item(result.items, CashFlowCategory.SOFT_DECORATION).expected_amount == Decimal(30000)
    assert _find_item(result.items, CashFlowCategory.CUSTOM_CABINET_DECORATION).expected_amount == Decimal(15000)
    assert _find_item(result.items, CashFlowCategory.WINDOW_DECORATION).expected_amount == Decimal(8000)
    assert _find_item(result.items, CashFlowCategory.WALL_DECORATION).expected_amount == Decimal(5000)
    # 其他装修 = 设计费 1000 + 拆旧费 500 + 清运费 300 + 其他 200 = 2000
    assert _find_item(result.items, CashFlowCategory.OTHER_DECORATION).expected_amount == Decimal(2000)


def test_receivable_payable_investment(db_session: Session) -> None:
    """跟投本金退还 = investment.total_investment."""
    project = _make_project(db_session)
    _make_investment(
        db_session,
        project,
        [
            {"name": "张三", "share_ratio": 60, "invest_amount": 300000},
            {"name": "李四", "share_ratio": 40, "invest_amount": 200000},
        ],
    )

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # 跟投本金退还，预期金额等于 total_investment 共 500000 元
    item = _find_item(result.items, CashFlowCategory.INVESTMENT_PRINCIPAL_RETURN)
    assert item.expected_amount == Decimal(500000)


def test_receivable_payable_fixed(db_session: Session) -> None:
    """履约保证金=20000，名额费=10000."""
    project = _make_project(db_session)

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # 履约保证金：agent 业务，固定值 20000 元
    bond = _find_item(result.items, CashFlowCategory.PERFORMANCE_BOND, business_type="agent")
    assert bond.expected_amount == Decimal(20000)
    # 名额费：wholesale 业务，固定值 10000 元
    quota = _find_item(result.items, CashFlowCategory.QUOTA_FEE, business_type="wholesale")
    assert quota.expected_amount == Decimal(10000)


def test_receivable_payable_bond(db_session: Session) -> None:
    """保证金回收=20000."""
    project = _make_project(db_session)

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # 保证金回收：agent 业务收入，固定值 20000 元
    item = _find_item(result.items, CashFlowCategory.BOND_RECOVERY, business_type="agent")
    assert item.expected_amount == Decimal(20000)


def test_receivable_payable_none_returns_null_expected(db_session: Session) -> None:
    """None 类型科目 expected_amount 为 None，difference 也为 None."""
    project = _make_project(db_session)

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    none_categories = [
        CashFlowCategory.MARKETING_ADVANCE,
        CashFlowCategory.INVESTOR_PROFIT_DISTRIBUTION,
        CashFlowCategory.PROJECT_INCENTIVE,
        CashFlowCategory.PROJECT_RESERVE,
        CashFlowCategory.OTHER_EXPENSE,
        CashFlowCategory.PAID_COMMISSION,
        CashFlowCategory.PURCHASE_DEPOSIT,
        CashFlowCategory.PURCHASE_DOWNPAYMENT,
        CashFlowCategory.HOLDING_COST_MONTHLY,
        CashFlowCategory.SELLING_TAX,
        CashFlowCategory.PROJECT_INVESTMENT,
        CashFlowCategory.MARKETING_PROMOTION_DEDUCTION,
        CashFlowCategory.OTHER_INCOME,
        CashFlowCategory.RESERVE_RECOVERY,
        CashFlowCategory.OWNER_COMMISSION,
        CashFlowCategory.SALE_PRICE,
    ]
    for cat in none_categories:
        item = _find_item(result.items, cat)
        assert item.expected_amount is None, f"{cat!r} expected_amount 应为 None"
        assert item.difference is None, f"{cat!r} difference 应为 None"


def test_receivable_payable_missing_data_returns_null_expected(db_session: Session) -> None:
    """数据缺失（无合同/销售/装修/跟投）时依赖类科目 expected 为 None，固定值类仍正常."""
    project = _make_project(db_session)
    # 不创建合同/销售/装修/跟投

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # signing_price_pct (依赖 contract.signing_price)
    assert _find_item(result.items, CashFlowCategory.CHANNEL_COMMISSION).expected_amount is None
    assert _find_item(result.items, CashFlowCategory.PROPERTY_TAX).expected_amount is None
    # sold_price_pct (依赖 sale.sold_price)
    assert _find_item(result.items, CashFlowCategory.MARKETING_PROMOTION).expected_amount is None
    assert _find_item(result.items, CashFlowCategory.OPERATION_FEE).expected_amount is None
    # vas_pct (依赖 signing_price + sold_price)
    assert _find_item(result.items, CashFlowCategory.FINANCE_TAX_COST).expected_amount is None
    assert _find_item(result.items, CashFlowCategory.TAX_COMMISSION_DIFF).expected_amount is None
    # vas (依赖 signing_price + sold_price)
    assert _find_item(result.items, CashFlowCategory.VALUE_ADDED_SERVICE).expected_amount is None
    # renovation (依赖 renovation)
    assert _find_item(result.items, CashFlowCategory.HARD_DECORATION).expected_amount is None
    assert _find_item(result.items, CashFlowCategory.SOFT_DECORATION).expected_amount is None
    # investment (依赖 investment)
    assert _find_item(result.items, CashFlowCategory.INVESTMENT_PRINCIPAL_RETURN).expected_amount is None
    # 固定值类仍正常
    assert _find_item(result.items, CashFlowCategory.PERFORMANCE_BOND).expected_amount == Decimal(20000)
    assert _find_item(result.items, CashFlowCategory.QUOTA_FEE).expected_amount == Decimal(10000)
    assert _find_item(result.items, CashFlowCategory.BOND_RECOVERY).expected_amount == Decimal(20000)


def test_receivable_payable_actual_aggregation_and_difference(db_session: Session) -> None:
    """实际金额聚合（多条同类流水求和）+ 差额计算 + 软删除排除."""
    project = _make_project(db_session)
    # 签约价 100 万 -> 渠道佣金 expected = 100 × 0.01 × 10000 = 10000
    _make_contract(db_session, project, signing_price=Decimal(100))

    # 实际两条流水：3000 + 5000 = 8000
    _make_finance_record(
        db_session,
        project,
        type_=CashFlowType.EXPENSE,
        category=CashFlowCategory.CHANNEL_COMMISSION,
        amount=Decimal(3000),
    )
    _make_finance_record(
        db_session,
        project,
        type_=CashFlowType.EXPENSE,
        category=CashFlowCategory.CHANNEL_COMMISSION,
        amount=Decimal(5000),
    )
    # 软删除的流水应被聚合排除
    _make_finance_record(
        db_session,
        project,
        type_=CashFlowType.EXPENSE,
        category=CashFlowCategory.CHANNEL_COMMISSION,
        amount=Decimal(999999),
        is_deleted=True,
    )
    # 无流水的科目 actual_amount 默认 0
    # PERFORMANCE_BOND expected=20000，actual=0，difference=20000
    _make_finance_record(
        db_session,
        project,
        type_=CashFlowType.EXPENSE,
        category=CashFlowCategory.PERFORMANCE_BOND,
        amount=Decimal(5000),
    )
    _make_finance_record(
        db_session,
        project,
        type_=CashFlowType.EXPENSE,
        category=CashFlowCategory.PERFORMANCE_BOND,
        amount=Decimal(7000),
    )

    service = FinanceService(db_session)
    result = service.get_receivable_payable(project.id)

    # CHANNEL_COMMISSION: expected=10000, actual=8000, difference=2000
    channel = _find_item(result.items, CashFlowCategory.CHANNEL_COMMISSION)
    assert channel.expected_amount == Decimal(10000)
    assert channel.actual_amount == Decimal(8000)
    assert channel.difference == Decimal(2000)

    # PERFORMANCE_BOND: expected=20000, actual=12000, difference=8000
    bond = _find_item(result.items, CashFlowCategory.PERFORMANCE_BOND, business_type="agent")
    assert bond.expected_amount == Decimal(20000)
    assert bond.actual_amount == Decimal(12000)
    assert bond.difference == Decimal(8000)

    # 无流水科目 actual_amount = 0, difference = expected - 0 = expected
    quota = _find_item(result.items, CashFlowCategory.QUOTA_FEE, business_type="wholesale")
    assert quota.expected_amount == Decimal(10000)
    assert quota.actual_amount == Decimal(0)
    assert quota.difference == Decimal(10000)

    # none 类型科目 expected=None -> actual=0, difference=None
    marketing_advance = _find_item(result.items, CashFlowCategory.MARKETING_ADVANCE)
    assert marketing_advance.expected_amount is None
    assert marketing_advance.actual_amount == Decimal(0)
    assert marketing_advance.difference is None
