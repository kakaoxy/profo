"""项目管理-销售域审计日志测试.

覆盖 SalesService 三个写方法在主操作成功 commit 后写入 OperationLog
（resource_type="project_sales"）：
1. create_record → action=create，after 含记录类型 record_type 等关键字段；
2. update_roles → action=update，before/after 角色成员快照非空；
3. delete_record → action=delete，before 为被删记录关键字段快照。
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from models import Project, ProjectSale
from models.common import ProjectStatus, RecordType
from models.system import OperationLog
from schemas.project.sales import SalesRecordCreate, SalesRolesUpdate
from services.projects.sales import SalesService


def _make_project(
    session: Session,
    *,
    project_id: str = "proj-audit-sales",
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
    project_id: Any,
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
    price: Decimal | None = Decimal("100.5"),
) -> SalesRecordCreate:
    """构造 SalesRecordCreate 请求体."""
    return SalesRecordCreate(
        record_type=record_type,
        customer_name=customer_name,
        record_date=datetime.now(timezone.utc),
        price=price,
        notes="测试销售记录",
    )


def _query_sales_audit_logs(session: Session, *, action: str, resource_id: str | None = None) -> list[OperationLog]:
    """按 action（及可选 resource_id）查询 project_sales 审计日志."""
    query = session.query(OperationLog).filter(
        OperationLog.resource_type == "project_sales",
        OperationLog.action == action,
    )
    if resource_id is not None:
        query = query.filter(OperationLog.resource_id == resource_id)
    return query.all()


class TestCreateRecordAudit:
    """创建销售记录 → create/project_sales 审计日志."""

    def test_create_record_writes_create_audit_log(self, seeded_db: dict[str, Any]) -> None:
        """新增带看记录落一条 create 日志，after 含记录类型与关键字段，before 为空."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session, project_id="proj-audit-create")

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(),
            current_user=admin,
            operator_id=str(admin.id),
        )

        logs = _query_sales_audit_logs(session, action="create", resource_id=str(record.id))
        assert len(logs) == 1
        log = logs[0]
        assert log.user_id == str(admin.id)
        # create 语义：仅 after 快照，无 before
        assert log.before is None
        assert log.after is not None
        assert log.after["record_type"] == RecordType.VIEWING.value
        assert log.after["customer_name"] == "测试客户"
        assert log.after["price"] == 100.5
        assert log.after["record_date"] is not None

    def test_create_record_without_operator_still_audits(self, seeded_db: dict[str, Any]) -> None:
        """未传 operator_id 时主操作不受影响，日志 user_id 为 None."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session, project_id="proj-audit-create-noop")

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(),
            current_user=admin,
        )

        logs = _query_sales_audit_logs(session, action="create", resource_id=str(record.id))
        assert len(logs) == 1
        assert logs[0].user_id is None


class TestUpdateRolesAudit:
    """更新销售角色 → update/project_sales 审计日志."""

    def test_update_roles_writes_update_audit_log(self, seeded_db: dict[str, Any]) -> None:
        """更新销售角色落一条 update 日志，before/after 角色成员快照非空且内容正确."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-audit-roles")
        # 既有角色成员：渠道负责人 = normal（校验要求 user_id 真实存在）
        _make_sale(session, project_id=project.id, channel_manager_id=str(normal.id))

        service = SalesService(session)
        service.update_roles(
            project.id,
            SalesRolesUpdate(channel_manager_id=str(admin.id)),
            current_user=admin,
            operator_id=str(admin.id),
        )

        logs = _query_sales_audit_logs(session, action="update")
        assert len(logs) == 1
        log = logs[0]
        assert log.user_id == str(admin.id)
        assert log.before is not None
        assert log.before != {}
        assert log.after is not None
        assert log.after != {}
        assert log.before["channel_manager_id"] == str(normal.id)
        assert log.after["channel_manager_id"] == str(admin.id)


class TestDeleteRecordAudit:
    """删除销售记录 → delete/project_sales 审计日志."""

    def test_delete_record_writes_delete_audit_log(self, seeded_db: dict[str, Any]) -> None:
        """删除记录落一条 delete 日志，before 为被删记录关键字段快照，after 为空."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session, project_id="proj-audit-delete")

        service = SalesService(session)
        record = service.create_record(
            project_id=project.id,
            record_data=_make_record_data(record_type=RecordType.OFFER, price=200),
            current_user=admin,
            operator_id=str(admin.id),
        )
        service.delete_record(project.id, str(record.id), operator_id=str(admin.id))

        logs = _query_sales_audit_logs(session, action="delete", resource_id=str(record.id))
        assert len(logs) == 1
        log = logs[0]
        assert log.user_id == str(admin.id)
        # delete 语义：仅 before 快照，无 after
        assert log.after is None
        assert log.before is not None
        assert log.before["record_type"] == RecordType.OFFER.value
        assert log.before["customer_name"] == "测试客户"
        assert log.before["price"] == 200.0
