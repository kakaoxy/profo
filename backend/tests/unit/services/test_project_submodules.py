"""项目子模块服务单元测试.

测试 FinanceService、SalesService、RenovationService 的关键方法。
使用 db_session fixture 进行真实数据库操作。
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal

import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from models import (
    FinanceRecord,
    Project,
    ProjectContract,
    ProjectInteraction,
    ProjectRenovation,
    ProjectSale,
    RenovationPhoto,
    Role,
    User,
)
from models.common import CashFlowCategory, CashFlowType, ProjectStatus, RecordType, RenovationStage
from schemas.project.renovation import RenovationUpdate
from schemas.project.sales import SalesRecordCreate, SalesRolesUpdate
from services.projects.finance import FinanceService
from services.projects.renovation import RenovationService
from services.projects.sales import SalesService


# ---------------------------------------------------------------------------
# 辅助函数：创建种子数据
# ---------------------------------------------------------------------------


def _seed_roles(session: Session) -> None:
    """创建角色种子数据."""
    role = Role(
        id="test-role",
        name="测试角色",
        code="test",
        permissions=["view_data"],
    )
    session.add(role)
    session.commit()


def _seed_user(session: Session, user_id: str = "test-user-1", username: str = "testuser1") -> User:
    """创建用户种子数据."""
    user = User(
        id=user_id,
        username=username,
        password="hashed_password",
        nickname=f"测试{username}",
        role_id="test-role",
        status="active",
    )
    session.add(user)
    session.commit()
    return user


def _create_project(
    session: Session,
    status: str = ProjectStatus.SIGNING.value,
    project_id: str | None = None,
) -> Project:
    """创建测试项目（含合同记录）."""
    pid = project_id or str(uuid.uuid4())
    now = datetime.now(timezone.utc)

    project = Project(
        id=pid,
        community_name="测试小区",
        address="测试地址1号",
        status=status,
        is_deleted=False,
        created_at=now,
        updated_at=now,
    )
    project.name = project.generate_name()
    session.add(project)

    # 创建合同记录（部分服务依赖此记录）
    contract = ProjectContract(
        id=str(uuid.uuid4()),
        project_id=pid,
        contract_no=f"MFB-202606-{pid[:4]}",
        signing_price=Decimal("100.00"),
        signing_date=now,
        is_deleted=False,
        created_at=now,
        updated_at=now,
    )
    session.add(contract)
    session.commit()
    session.refresh(project)
    return project


# ---------------------------------------------------------------------------
# FinanceService 测试
# ---------------------------------------------------------------------------


class TestFinanceServiceSyncFinancials:
    """FinanceService.sync_financials() 测试."""

    def test_syncs_income_and_expense(self, db_session: Session) -> None:
        """应正确汇总收入和支出并更新项目缓存字段."""
        project = _create_project(db_session)

        # 手动插入财务记录
        now = datetime.now(timezone.utc)
        db_session.add(
            FinanceRecord(
                id=str(uuid.uuid4()),
                project_id=project.id,
                type="income",
                category=CashFlowCategory.SALE_PRICE.value,
                amount=Decimal("200.00"),
                record_date=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.add(
            FinanceRecord(
                id=str(uuid.uuid4()),
                project_id=project.id,
                type="expense",
                category=CashFlowCategory.RENOVATION_FEE.value,
                amount=Decimal("80.00"),
                record_date=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = FinanceService(db_session)
        svc.sync_financials(project.id)

        db_session.refresh(project)
        assert project.total_income == Decimal("200.00")
        assert project.total_expense == Decimal("80.00")
        assert project.net_cash_flow == Decimal("120.00")
        assert project.roi == pytest.approx(150.0)

    def test_no_records_yields_zero(self, db_session: Session) -> None:
        """无财务记录时应归零."""
        project = _create_project(db_session)

        svc = FinanceService(db_session)
        svc.sync_financials(project.id)

        db_session.refresh(project)
        assert project.total_income == Decimal("0")
        assert project.total_expense == Decimal("0")
        assert project.net_cash_flow == Decimal("0")
        assert project.roi == 0.0

    def test_nonexistent_project_does_nothing(self, db_session: Session) -> None:
        """不存在的项目应静默返回（不抛异常）."""
        svc = FinanceService(db_session)
        svc.sync_financials("nonexistent-id")  # 不应抛异常


class TestFinanceServiceGetReport:
    """FinanceService.get_report() 测试."""

    def test_returns_report_dict(self, db_session: Session) -> None:
        """应返回包含财务数据的报告字典."""
        project = _create_project(db_session)

        now = datetime.now(timezone.utc)
        db_session.add(
            FinanceRecord(
                id=str(uuid.uuid4()),
                project_id=project.id,
                type="income",
                category=CashFlowCategory.SALE_PRICE.value,
                amount=Decimal("300.00"),
                record_date=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.add(
            FinanceRecord(
                id=str(uuid.uuid4()),
                project_id=project.id,
                type="expense",
                category=CashFlowCategory.RENOVATION_FEE.value,
                amount=Decimal("100.00"),
                record_date=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = FinanceService(db_session)
        report = svc.get_report(project.id)

        assert report["project_id"] == project.id
        assert report["total_income"] == 300.0
        assert report["total_investment"] == 100.0
        assert report["net_profit"] == 200.0
        assert report["roi"] == pytest.approx(200.0)
        assert report["community_name"] == "测试小区"

    def test_nonexistent_project_raises_404(self, db_session: Session) -> None:
        """不存在的项目应抛出 404."""
        svc = FinanceService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.get_report("nonexistent-id")
        assert exc_info.value.status_code == 404


# ---------------------------------------------------------------------------
# SalesService 测试
# ---------------------------------------------------------------------------


class TestSalesServiceUpdateRoles:
    """SalesService.update_roles() 测试."""

    def test_creates_sale_and_updates_roles(self, db_session: Session) -> None:
        """应创建销售记录并更新角色."""
        _seed_roles(db_session)
        user = _seed_user(db_session)
        project = _create_project(db_session, status=ProjectStatus.SELLING.value)

        svc = SalesService(db_session)
        roles_data = SalesRolesUpdate(channel_manager_id=user.id)
        result = svc.update_roles(project.id, roles_data)

        assert result.channel_manager_id == user.id

        # 验证数据库中确实创建了 ProjectSale
        sale = db_session.query(ProjectSale).filter(ProjectSale.project_id == project.id).first()
        assert sale is not None
        assert sale.channel_manager_id == user.id

    def test_invalid_user_id_raises_400(self, db_session: Session) -> None:
        """无效用户ID应抛出 400."""
        project = _create_project(db_session, status=ProjectStatus.SELLING.value)

        svc = SalesService(db_session)
        roles_data = SalesRolesUpdate(channel_manager_id="nonexistent-user")

        with pytest.raises(HTTPException) as exc_info:
            svc.update_roles(project.id, roles_data)
        assert exc_info.value.status_code == 400

    def test_nonexistent_project_raises_404(self, db_session: Session) -> None:
        """不存在的项目应抛出 404."""
        svc = SalesService(db_session)
        roles_data = SalesRolesUpdate(channel_manager_id=None)

        with pytest.raises(HTTPException) as exc_info:
            svc.update_roles("nonexistent-id", roles_data)
        assert exc_info.value.status_code == 404


class TestSalesServiceCreateRecord:
    """SalesService.create_record() 测试."""

    def test_creates_interaction_record(self, db_session: Session) -> None:
        """应在在售项目上创建互动记录."""
        project = _create_project(db_session, status=ProjectStatus.SELLING.value)

        svc = SalesService(db_session)
        record_data = SalesRecordCreate(
            record_type=RecordType.VIEWING,
            customer_name="张三",
            record_date=datetime.now(timezone.utc),
            notes="客户看房",
        )
        record = svc.create_record(project.id, record_data)

        assert record.project_id == project.id
        assert record.record_type == RecordType.VIEWING.value
        assert record.interaction_target == "张三"
        assert record.content == "客户看房"

    def test_non_selling_project_raises_400(self, db_session: Session) -> None:
        """非在售项目应抛出 400."""
        project = _create_project(db_session, status=ProjectStatus.SIGNING.value)

        svc = SalesService(db_session)
        record_data = SalesRecordCreate(
            record_type=RecordType.VIEWING,
            customer_name="张三",
            record_date=datetime.now(timezone.utc),
        )

        with pytest.raises(HTTPException) as exc_info:
            svc.create_record(project.id, record_data)
        assert exc_info.value.status_code == 400

    def test_nonexistent_project_raises_404(self, db_session: Session) -> None:
        """不存在的项目应抛出 404."""
        svc = SalesService(db_session)
        record_data = SalesRecordCreate(
            record_type=RecordType.VIEWING,
            customer_name="张三",
            record_date=datetime.now(timezone.utc),
        )

        with pytest.raises(HTTPException) as exc_info:
            svc.create_record("nonexistent-id", record_data)
        assert exc_info.value.status_code == 404


class TestSalesServiceGetRecords:
    """SalesService.get_records() 测试."""

    def test_returns_records_for_project(self, db_session: Session) -> None:
        """应返回指定项目的互动记录."""
        project = _create_project(db_session, status=ProjectStatus.SELLING.value)

        now = datetime.now(timezone.utc)
        db_session.add(
            ProjectInteraction(
                id=str(uuid.uuid4()),
                project_id=project.id,
                record_type=RecordType.VIEWING.value,
                interaction_target="张三",
                content="看房",
                interaction_at=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = SalesService(db_session)
        records = svc.get_records(project.id)

        assert len(records) == 1
        assert records[0]["customer_name"] == "张三"
        assert records[0]["record_type"] == RecordType.VIEWING.value

    def test_filters_by_record_type(self, db_session: Session) -> None:
        """应按记录类型筛选."""
        project = _create_project(db_session, status=ProjectStatus.SELLING.value)

        now = datetime.now(timezone.utc)
        db_session.add(
            ProjectInteraction(
                id=str(uuid.uuid4()),
                project_id=project.id,
                record_type=RecordType.VIEWING.value,
                interaction_target="张三",
                content="看房",
                interaction_at=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.add(
            ProjectInteraction(
                id=str(uuid.uuid4()),
                project_id=project.id,
                record_type=RecordType.OFFER.value,
                interaction_target="李四",
                content="出价",
                interaction_at=now,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = SalesService(db_session)
        records = svc.get_records(project.id, record_type=RecordType.VIEWING.value)

        assert len(records) == 1
        assert records[0]["record_type"] == RecordType.VIEWING.value

    def test_empty_result_for_no_records(self, db_session: Session) -> None:
        """无记录时应返回空列表."""
        project = _create_project(db_session)

        svc = SalesService(db_session)
        records = svc.get_records(project.id)

        assert records == []


# ---------------------------------------------------------------------------
# RenovationService 测试
# ---------------------------------------------------------------------------


class TestRenovationServiceUpdateStage:
    """RenovationService.update_stage() 测试."""

    def test_updates_renovation_stage(self, db_session: Session) -> None:
        """应更新项目的改造阶段."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        svc = RenovationService(db_session)
        renovation_data = RenovationUpdate(
            renovation_stage=RenovationStage.DEMOLITION,
            stage_completed_at=datetime.now(timezone.utc),
        )
        updated_project = svc.update_stage(project.id, renovation_data)

        db_session.refresh(updated_project)
        assert updated_project.renovation_stage == RenovationStage.DEMOLITION.value

    def test_disallowed_status_raises_400(self, db_session: Session) -> None:
        """签约阶段项目不允许更新改造进度."""
        project = _create_project(db_session, status=ProjectStatus.SIGNING.value)

        svc = RenovationService(db_session)
        renovation_data = RenovationUpdate(
            renovation_stage=RenovationStage.DEMOLITION,
        )

        with pytest.raises(HTTPException) as exc_info:
            svc.update_stage(project.id, renovation_data)
        assert exc_info.value.status_code == 400

    def test_nonexistent_project_raises_404(self, db_session: Session) -> None:
        """不存在的项目应抛出 404."""
        svc = RenovationService(db_session)
        renovation_data = RenovationUpdate(
            renovation_stage=RenovationStage.DEMOLITION,
        )

        with pytest.raises(HTTPException) as exc_info:
            svc.update_stage("nonexistent-id", renovation_data)
        assert exc_info.value.status_code == 404

    def test_creates_renovation_record_on_first_update(self, db_session: Session) -> None:
        """首次更新时应自动创建装修记录."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        # 确认无装修记录
        assert db_session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project.id).first() is None

        svc = RenovationService(db_session)
        renovation_data = RenovationUpdate(
            renovation_stage=RenovationStage.DESIGN,
            stage_completed_at=datetime.now(timezone.utc),
        )
        svc.update_stage(project.id, renovation_data)

        # 应自动创建装修记录
        renovation = db_session.query(ProjectRenovation).filter(ProjectRenovation.project_id == project.id).first()
        assert renovation is not None


class TestRenovationServiceGetInfo:
    """RenovationService.get_info() 测试."""

    def test_returns_none_when_no_renovation(self, db_session: Session) -> None:
        """无装修记录时应返回 None."""
        project = _create_project(db_session)

        svc = RenovationService(db_session)
        result = svc.get_info(project.id)

        assert result is None

    def test_returns_renovation_record(self, db_session: Session) -> None:
        """应返回装修记录."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        now = datetime.now(timezone.utc)
        renovation = ProjectRenovation(
            id=str(uuid.uuid4()),
            project_id=project.id,
            renovation_company="测试装修公司",
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        db_session.add(renovation)
        db_session.commit()

        svc = RenovationService(db_session)
        result = svc.get_info(project.id)

        assert result is not None
        assert result.renovation_company == "测试装修公司"


class TestRenovationServiceAddPhoto:
    """RenovationService.add_photo() 测试."""

    def test_adds_photo_to_renovating_project(self, db_session: Session) -> None:
        """应在改造阶段项目上添加照片."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        # 创建装修记录
        now = datetime.now(timezone.utc)
        renovation = ProjectRenovation(
            id=str(uuid.uuid4()),
            project_id=project.id,
            is_deleted=False,
            created_at=now,
            updated_at=now,
        )
        db_session.add(renovation)
        db_session.commit()

        svc = RenovationService(db_session)
        photo = svc.add_photo(
            project_id=project.id,
            stage=RenovationStage.DEMOLITION.value,
            url="https://example.com/photo.jpg",
            filename="photo.jpg",
            description="拆除前照片",
        )

        assert photo.project_id == project.id
        assert photo.stage == RenovationStage.DEMOLITION.value
        assert photo.url == "https://example.com/photo.jpg"
        assert photo.filename == "photo.jpg"
        assert photo.description == "拆除前照片"
        assert photo.renovation_id == renovation.id

    def test_disallowed_status_raises_400(self, db_session: Session) -> None:
        """签约阶段项目不允许上传装修照片."""
        project = _create_project(db_session, status=ProjectStatus.SIGNING.value)

        svc = RenovationService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.add_photo(
                project_id=project.id,
                stage=RenovationStage.DEMOLITION.value,
                url="https://example.com/photo.jpg",
            )
        assert exc_info.value.status_code == 400

    def test_nonexistent_project_raises_404(self, db_session: Session) -> None:
        """不存在的项目应抛出 404."""
        svc = RenovationService(db_session)
        with pytest.raises(HTTPException) as exc_info:
            svc.add_photo(
                project_id="nonexistent-id",
                stage=RenovationStage.DEMOLITION.value,
                url="https://example.com/photo.jpg",
            )
        assert exc_info.value.status_code == 404


class TestRenovationServiceGetPhotos:
    """RenovationService.get_photos() 测试."""

    def test_returns_photos_for_project(self, db_session: Session) -> None:
        """应返回项目的装修照片."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        now = datetime.now(timezone.utc)
        db_session.add(
            RenovationPhoto(
                id=str(uuid.uuid4()),
                project_id=project.id,
                stage=RenovationStage.DEMOLITION.value,
                url="https://example.com/photo1.jpg",
                is_deleted=False,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.add(
            RenovationPhoto(
                id=str(uuid.uuid4()),
                project_id=project.id,
                stage=RenovationStage.DESIGN.value,
                url="https://example.com/photo2.jpg",
                is_deleted=False,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = RenovationService(db_session)
        photos = svc.get_photos(project.id)

        assert len(photos) == 2

    def test_filters_by_stage(self, db_session: Session) -> None:
        """应按阶段筛选照片."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        now = datetime.now(timezone.utc)
        db_session.add(
            RenovationPhoto(
                id=str(uuid.uuid4()),
                project_id=project.id,
                stage=RenovationStage.DEMOLITION.value,
                url="https://example.com/photo1.jpg",
                is_deleted=False,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.add(
            RenovationPhoto(
                id=str(uuid.uuid4()),
                project_id=project.id,
                stage=RenovationStage.DESIGN.value,
                url="https://example.com/photo2.jpg",
                is_deleted=False,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = RenovationService(db_session)
        photos = svc.get_photos(project.id, stage=RenovationStage.DEMOLITION.value)

        assert len(photos) == 1
        assert photos[0].stage == RenovationStage.DEMOLITION.value

    def test_empty_result_for_no_photos(self, db_session: Session) -> None:
        """无照片时应返回空列表."""
        project = _create_project(db_session)

        svc = RenovationService(db_session)
        photos = svc.get_photos(project.id)

        assert photos == []

    def test_excludes_soft_deleted_photos(self, db_session: Session) -> None:
        """应排除软删除的照片."""
        project = _create_project(db_session, status=ProjectStatus.RENOVATING.value)

        now = datetime.now(timezone.utc)
        db_session.add(
            RenovationPhoto(
                id=str(uuid.uuid4()),
                project_id=project.id,
                stage=RenovationStage.DEMOLITION.value,
                url="https://example.com/photo1.jpg",
                is_deleted=False,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.add(
            RenovationPhoto(
                id=str(uuid.uuid4()),
                project_id=project.id,
                stage=RenovationStage.DEMOLITION.value,
                url="https://example.com/photo2.jpg",
                is_deleted=True,
                created_at=now,
                updated_at=now,
            ),
        )
        db_session.commit()

        svc = RenovationService(db_session)
        photos = svc.get_photos(project.id)

        assert len(photos) == 1
        assert photos[0].is_deleted is False
