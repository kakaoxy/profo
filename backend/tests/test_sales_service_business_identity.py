"""SalesService.create_record 功能与 operator_id 审计字段测试.

原 Service 层业务身份校验已移至 Router 层（require_project_business_permission
+ ProjectSalesAddRecordPermDep），Service 层不再做权限校验。本文件仅保留
create_record 的功能测试与 operator_id 审计字段回归测试（修复原 None bug）。
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from models import Project, ProjectSale, User
from models.common import ProjectStatus, RecordType
from schemas.project.sales import SalesRecordCreate
from services.projects.sales import SalesService


def _make_operator_user(session: Session, *, user_id: str = "op-sales-svc") -> User:
    """创建并持久化 operator 角色用户."""
    user = User(
        id=user_id,
        username=f"op_{user_id}",
        password="hashed",
        nickname="运营用户",
        role_id="operator-role",
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_project(
    session: Session,
    *,
    project_id: str = "proj-sales-svc",
    status: ProjectStatus = ProjectStatus.SELLING,
) -> Project:
    """创建并持久化项目，默认 SELLING 状态."""
    project = Project(
        id=uuid.uuid4(),
        name=f"测试项目-{project_id}",
        community_name="测试小区",
        address="测试地址",
        status=status,
        is_deleted=False,
    )
    session.add(project)
    session.commit()
    session.refresh(project)
    return project


def _make_sale(
    session: Session,
    *,
    project_id: str,
    channel_manager_id: str | None = None,
    property_agent_id: str | None = None,
    negotiator_id: str | None = None,
) -> ProjectSale:
    """创建并持久化销售记录，可指定销售团队成员."""
    sale = ProjectSale(
        id=uuid.uuid4(),
        project_id=project_id,
        channel_manager_id=channel_manager_id,
        property_agent_id=property_agent_id,
        negotiator_id=negotiator_id,
        transaction_status="在售",
        is_deleted=False,
    )
    session.add(sale)
    session.commit()
    session.refresh(sale)
    return sale


def _make_record_data(
    *,
    record_type: RecordType = RecordType.VIEWING,
    customer_name: str = "测试客户",
) -> SalesRecordCreate:
    """构造 SalesRecordCreate 请求体."""
    return SalesRecordCreate(
        record_type=record_type,
        customer_name=customer_name,
        record_date=datetime.now(timezone.utc),
        price=Decimal("100.5"),
        notes="测试带看记录",
    )


class TestSalesServiceCreateRecord:
    """SalesService.create_record 功能与 operator_id 审计字段.

    权限校验由 Router 层 ProjectSalesAddRecordPermDep（业务身份双通道）执行，
    Service 层不再校验。本测试仅验证 create_record 的功能行为：记录被正确创建，
    且 operator_id 审计字段填充为 current_user.id（修复原 None bug）。
    """

    def test_create_record_admin_sets_operator_id(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Admin 创建记录 → operator_id 为 admin.id."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session, project_id="proj-cr-admin")
        _make_sale(session, project_id=project.id, channel_manager_id="another-user")

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(),
            current_user=admin,
        )

        assert record.id is not None
        assert record.project_id == project.id
        # operator_id 应为 admin.id（修复原 None bug）
        assert record.operator_id == admin.id

    def test_create_record_operator_sets_operator_id(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Operator 创建记录 → operator_id 为 operator.id."""
        session = seeded_db["session"]
        operator = _make_operator_user(session, user_id="op-cr-perm")
        project = _make_project(session, project_id="proj-cr-operator")
        _make_sale(session, project_id=project.id, channel_manager_id="another-user")

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(record_type=RecordType.OFFER),
            current_user=operator,
        )

        assert record.id is not None
        assert record.operator_id == operator.id

    def test_create_record_user_as_channel_manager_sets_operator_id(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 作为 channel_manager 创建记录 → operator_id 为 user.id."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-cr-cm")
        _make_sale(session, project_id=project.id, channel_manager_id=normal.id)

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(),
            current_user=normal,
        )

        assert record.id is not None
        assert record.operator_id == normal.id

    def test_create_record_user_as_property_agent_sets_operator_id(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 作为 property_agent 创建记录 → operator_id 为 user.id."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-cr-pa")
        _make_sale(session, project_id=project.id, property_agent_id=normal.id)

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(record_type=RecordType.NEGOTIATION),
            current_user=normal,
        )

        assert record.id is not None
        assert record.operator_id == normal.id

    def test_create_record_user_as_negotiator_sets_operator_id(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 作为 negotiator 创建记录 → operator_id 为 user.id."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-cr-neg")
        _make_sale(session, project_id=project.id, negotiator_id=normal.id)

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(),
            current_user=normal,
        )

        assert record.id is not None
        assert record.operator_id == normal.id

    def test_create_record_operator_id_is_current_user_id(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """create_record 必须将 operator_id 填充为 current_user.id（修复原 None bug）."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-cr-opid")
        _make_sale(session, project_id=project.id, channel_manager_id=normal.id)

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(),
            current_user=normal,
        )

        # 关键断言：operator_id 不为 None，且等于 current_user.id
        assert record.operator_id is not None
        assert record.operator_id == normal.id
