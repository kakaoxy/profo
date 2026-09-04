"""业务形式驱动的现金流分类校验 + days_on_market 计算测试.

覆盖：
- AC-3.2 代理美化项目录入"收购款" -> 400
- AC-3.3 收购美化项目录入"中介佣金" -> 400
- AC-3.4 收购美化项目录入"收购款" -> 成功
- AC-3.5 历史项目(business_form=None)录任意科目不拦截
- AC-6.2 已售项目(listing+sold 均有值)返回正确天数差
- AC-6.3 日期缺失返回 None
- AC-6.4 未售项目返回 None
- 软删除的装修照片不应出现在项目响应中
- 结算编辑锁：已结算项目不可新增/删除流水（覆盖 ledger 与 cashflow 两条删除路径）
"""

from datetime import date, datetime, timezone
from decimal import Decimal
from unittest import mock
from uuid import UUID

import pytest
from sqlalchemy.orm import Session

from models import FinanceRecord, FinanceRecordLog, FinanceSubject, Project, ProjectSale, RenovationPhoto
from models.common import (
    BusinessForm,
    ProjectStatus,
    RenovationStage,
    SettlementStatus,
)
from schemas.project.finance import FinanceSettlementChangeRequest, FinanceUnsettleRequest, LedgerRecordCreate
from services.projects import FinanceService
from services.projects.internal import ProjectResponseBuilder
from services.system.exceptions import ServiceException, ValidationError


def _make_project(
    db_session: Session,
    *,
    business_form: BusinessForm | None,
    status: ProjectStatus = ProjectStatus.SIGNING,
) -> Project:
    """创建并持久化一个最小可用项目."""
    project = Project(
        name="测试项目",
        community_name="测试小区",
        address="测试地址",
        status=status.value,
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
    modes: list[str],
    level: str = "2",
    pnl: bool = True,
    stage: str = "signing",
) -> FinanceSubject:
    """创建并持久化一个科目（替代旧 CashFlowCategory 硬编码枚举）."""
    subject = FinanceSubject(
        id=subject_id,
        name=name,
        level=level,
        pnl=pnl,
        modes=modes,
        stage=stage,
        note="测试科目",
        system=True,
        is_deleted=False,
    )
    db_session.add(subject)
    db_session.commit()
    db_session.refresh(subject)
    return subject


def _make_record_data(project_id: UUID, subject_id: str, *, outflow: Decimal = Decimal(1000)) -> LedgerRecordCreate:
    """构造资金账本流水请求（Task 5 新字段体系）."""
    return LedgerRecordCreate(
        project_id=project_id,
        subject_id=subject_id,
        outflow=outflow,
        date=datetime.now(timezone.utc),
        description="测试",
        payer="测试交易方",
    )


def _add_sale(
    db_session: Session,
    project: Project,
    *,
    listing: datetime | None,
    sold: datetime | None,
) -> None:
    """为项目关联一条销售记录."""
    sale = ProjectSale(
        project_id=project.id,
        listing_date=listing,
        sold_date=sold,
        transaction_status="在售",
        is_deleted=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(sale)
    db_session.commit()


def test_agent_project_reject_purchase_price(db_session: Session) -> None:
    """AC-3.2: 代理美化项目录入收购类科目(仅 acquire) -> ValidationError."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S01", name="购房定金", modes=["acquire"])
    service = FinanceService(db_session)
    with pytest.raises(ValidationError):
        service.create_record(project.id, _make_record_data(project.id, "S01"), operator_id="test-operator")


def test_wholesale_project_reject_agency_commission(db_session: Session) -> None:
    """AC-3.3: 收购美化项目录入代理专有科目(仅 agent) -> ValidationError."""
    project = _make_project(db_session, business_form=BusinessForm.WHOLESALE)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    with pytest.raises(ValidationError):
        service.create_record(project.id, _make_record_data(project.id, "S11"), operator_id="test-operator")


def test_wholesale_project_accept_purchase_price(db_session: Session) -> None:
    """AC-3.4: 收购美化项目录入收购类科目 -> 成功."""
    project = _make_project(db_session, business_form=BusinessForm.WHOLESALE)
    subject = _make_subject(db_session, subject_id="S01", name="购房定金", modes=["acquire"])
    service = FinanceService(db_session)
    record = service.create_record(project.id, _make_record_data(project.id, "S01"), operator_id="test-operator")
    assert record.subject_id == subject.id


def test_legacy_project_no_interception(db_session: Session) -> None:
    """AC-3.5: 历史项目(business_form=None)录任意模式科目不拦截."""
    project = _make_project(db_session, business_form=None)
    _make_subject(db_session, subject_id="S01", name="购房定金", modes=["acquire"])
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    # 代理专有 + 收购专有科目均应放行
    r1 = service.create_record(project.id, _make_record_data(project.id, "S11"), operator_id="test-operator")
    r2 = service.create_record(project.id, _make_record_data(project.id, "S01"), operator_id="test-operator")
    assert r1 is not None
    assert r2 is not None


def test_agent_project_accept_agency_commission(db_session: Session) -> None:
    """代理美化项目录入代理专有科目(收房佣金) -> 成功（反向佐证校验精确性）."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    subject = _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(project.id, _make_record_data(project.id, "S11"), operator_id="test-operator")
    assert record.subject_id == subject.id


def test_days_on_market_sold_with_dates(db_session: Session) -> None:
    """AC-6.2: 已售项目 listing+sold 均有值 -> 正确天数差."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT, status=ProjectStatus.SOLD)
    _add_sale(
        db_session,
        project,
        listing=datetime(2026, 1, 1, tzinfo=timezone.utc),
        sold=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )
    db_session.refresh(project)
    builder = ProjectResponseBuilder(db_session)
    assert builder.build(project)["days_on_market"] == 31


def test_days_on_market_missing_dates(db_session: Session) -> None:
    """AC-6.3: 日期缺失 -> None."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT, status=ProjectStatus.SOLD)
    _add_sale(db_session, project, listing=None, sold=datetime(2026, 2, 1, tzinfo=timezone.utc))
    db_session.refresh(project)
    builder = ProjectResponseBuilder(db_session)
    assert builder.build(project)["days_on_market"] is None


def test_days_on_market_not_sold(db_session: Session) -> None:
    """AC-6.4: 未售项目 -> None."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT, status=ProjectStatus.SELLING)
    _add_sale(
        db_session,
        project,
        listing=datetime(2026, 1, 1, tzinfo=timezone.utc),
        sold=datetime(2026, 2, 1, tzinfo=timezone.utc),
    )
    db_session.refresh(project)
    builder = ProjectResponseBuilder(db_session)
    assert builder.build(project)["days_on_market"] is None


def _add_renovation_photo(
    db_session: Session,
    project: Project,
    *,
    url: str,
    is_deleted: bool = False,
) -> RenovationPhoto:
    """为项目关联一张装修照片."""
    photo = RenovationPhoto(
        project_id=project.id,
        stage=RenovationStage.DEMOLITION,
        url=url,
        is_deleted=is_deleted,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db_session.add(photo)
    db_session.commit()
    db_session.refresh(project)
    return photo


def test_renovation_photos_excludes_soft_deleted(db_session: Session) -> None:
    """软删除的装修照片不应出现在项目响应中."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _add_renovation_photo(db_session, project, url="/static/a.jpg")
    _add_renovation_photo(db_session, project, url="/static/b.jpg", is_deleted=True)

    builder = ProjectResponseBuilder(db_session)
    photos = builder.build(project).get("renovation_photos", [])

    urls = [p["url"] for p in photos]
    assert "/static/a.jpg" in urls
    assert "/static/b.jpg" not in urls


def test_renovation_photos_all_deleted_returns_empty(db_session: Session) -> None:
    """所有装修照片均已软删除时, 响应中不含 renovation_photos 键."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _add_renovation_photo(db_session, project, url="/static/a.jpg", is_deleted=True)

    builder = ProjectResponseBuilder(db_session)
    assert "renovation_photos" not in builder.build(project)


# ========== 结算编辑锁 ==========


def _settle_project(db_session: Session, project: Project) -> None:
    """将项目资金账本置为已结算."""
    service = FinanceService(db_session)
    service.settle_finance(
        project.id,
        FinanceSettlementChangeRequest(settled_date=date(2026, 7, 7), settled_note="结算"),
        operator_id="test-operator",
    )


def test_settled_project_blocks_create_record(db_session: Session) -> None:
    """已结算项目不可新增流水."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    _settle_project(db_session, project)

    service = FinanceService(db_session)
    with pytest.raises(ServiceException):
        service.create_record(
            project.id,
            _make_record_data(project.id, "S11"),
            operator_id="test-operator",
        )


def test_settled_project_blocks_delete_record_cashflow_path(db_session: Session) -> None:
    """已结算项目不可通过 ledger 删除流水（曾存在 cashflow 路由绕过结算锁）."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="test-operator",
    )
    _settle_project(db_session, project)

    with pytest.raises(ServiceException):
        service.delete_record_by_id(record.id, operator_id="test-operator")

    # 记录未被软删除
    db_session.refresh(record)
    assert record.is_deleted is False


def test_settled_project_blocks_delete_record_by_id_ledger_path(db_session: Session) -> None:
    """已结算项目不可通过 ledger 路由删除流水（delete_record_by_id）."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="test-operator",
    )
    _settle_project(db_session, project)

    with pytest.raises(ServiceException):
        service.delete_record_by_id(record.id, operator_id="test-operator")

    db_session.refresh(record)
    assert record.is_deleted is False


def test_unsettled_project_allows_delete_record(db_session: Session) -> None:
    """反结算后恢复可删除（delete_record 放行）."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="test-operator",
    )
    _settle_project(db_session, project)
    service.unsettle_finance(
        project.id,
        FinanceUnsettleRequest(reason="需要补录"),
        operator_id="test-operator",
    )
    assert project.finance_settlement_status == SettlementStatus.UNSETTLED

    # 反结算后删除应成功
    service.delete_record_by_id(record.id, operator_id="test-operator")
    db_session.refresh(record)
    assert record.is_deleted is True


def test_soft_deleted_settled_project_blocks_delete_record(db_session: Session) -> None:
    """软删除的已结算项目不可通过 cashflow 路由删除流水.

    回归测试：commit 933a37c 在 delete_record 中新增 Project.is_deleted.is_(False)
    过滤后，软删除项目的 project 查询返回 None，原 `if project:` 分支跳过
    _assert_finance_editable，使软删除+已结算项目仍可被删除，绕过结算锁。
    期望：抛 ResourceNotFoundError 或 ServiceException，记录不被软删除。
    """
    from services.system.exceptions import ResourceNotFoundError

    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="test-operator",
    )
    _settle_project(db_session, project)
    # 软删除项目
    project.is_deleted = True
    db_session.commit()

    with pytest.raises((ResourceNotFoundError, ServiceException)):
        service.delete_record_by_id(record.id, operator_id="test-operator")

    # 记录未被软删除
    db_session.refresh(record)
    assert record.is_deleted is False


def test_project_response_serializes_settled_date_after_settlement(db_session: Session) -> None:
    """已结算项目通过 ProjectResponseBuilder 构建后应能被 ProjectResponse 序列化.

    回归测试：commit 88c50dc 将 Project.finance_settled_date 模型字段从 String(10)
    改为 Date 类型并迁移 DB 列为 DATE，但 ProjectResponse.finance_settled_date 仍为
    `str | None`。SQLAlchemy 读取时返回 date 对象，Pydantic lax 模式不会把 date 转 str，
    导致 GET /projects/{id} 在已结算项目上抛 ValidationError -> 500。
    期望：model_validate 成功，finance_settled_date 为可序列化值（date 或 str 均可）。
    """
    from schemas.project import ProjectResponse

    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _settle_project(db_session, project)
    db_session.refresh(project)

    builder = ProjectResponseBuilder(db_session)
    data = builder.build(project)

    # Pydantic V2 lax 模式不自动转 date→str，类型不匹配会抛 ValidationError
    response = ProjectResponse.model_validate(data)
    assert response.finance_settlement_status == SettlementStatus.SETTLED
    assert response.finance_settled_date is not None


# ========== sync_financials 失败回滚（Fail Loud：不允许假成功）==========


def test_create_record_rolls_back_when_sync_fails(db_session: Session) -> None:
    """Sync 失败时 create_record 整体回滚，无记录/日志残留."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)

    with (
        mock.patch.object(
            FinanceService,
            "_sync_financial_cache",
            side_effect=RuntimeError("sync boom"),
        ),
        pytest.raises(RuntimeError, match="sync boom"),
    ):
        service.create_record(
            project.id,
            _make_record_data(project.id, "S11"),
            operator_id="test-operator",
        )

    # 事务未 commit：回滚后无 FinanceRecord、无 FinanceRecordLog
    db_session.rollback()
    records = db_session.query(FinanceRecord).filter(FinanceRecord.project_id == project.id).all()
    assert len(records) == 0
    logs = db_session.query(FinanceRecordLog).filter(FinanceRecordLog.project_id == project.id).all()
    assert len(logs) == 0


def test_delete_record_rolls_back_when_sync_fails(db_session: Session) -> None:
    """Sync 失败时 delete_record 整体回滚，记录未被软删除."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="test-operator",
    )

    with (
        mock.patch.object(
            FinanceService,
            "_sync_financial_cache",
            side_effect=RuntimeError("sync boom"),
        ),
        pytest.raises(RuntimeError, match="sync boom"),
    ):
        service.delete_record_by_id(record.id, operator_id="test-operator")

    # 事务未 commit：回滚后记录仍可查且未软删
    db_session.rollback()
    db_session.refresh(record)
    assert record.is_deleted is False


def test_delete_record_by_id_rolls_back_when_sync_fails(db_session: Session) -> None:
    """Sync 失败时 delete_record_by_id 整体回滚，记录未被软删除."""
    project = _make_project(db_session, business_form=BusinessForm.AGENT)
    _make_subject(db_session, subject_id="S11", name="收房佣金", modes=["agent"])
    service = FinanceService(db_session)
    record = service.create_record(
        project.id,
        _make_record_data(project.id, "S11"),
        operator_id="test-operator",
    )

    with (
        mock.patch.object(
            FinanceService,
            "_sync_financial_cache",
            side_effect=RuntimeError("sync boom"),
        ),
        pytest.raises(RuntimeError, match="sync boom"),
    ):
        service.delete_record_by_id(record.id, operator_id="test-operator")

    db_session.rollback()
    db_session.refresh(record)
    assert record.is_deleted is False
