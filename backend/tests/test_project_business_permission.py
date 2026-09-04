"""require_project_business_permission 依赖工厂测试.

覆盖业务身份双通道权限校验：
1. admin 通过 project:write 权限放行
2. operator 通过子权限码（project:renovation:upload_photo / project:sales:add_record）放行
3. user 通过业务身份（对接负责人）放行（装修场景）
4. user 通过业务身份（销售团队成员）放行（销售场景）
5. user 业务身份校验失败（非对接负责人）
6. user 跨项目操作被拒绝
7. customer 角色被拒绝
8. 自定义角色用户通过业务身份放行（验证不限角色）
9. 自定义角色用户无业务身份被拒绝
"""

import uuid
from typing import Any
from unittest.mock import MagicMock

import pytest
from sqlalchemy.orm import Session

from dependencies.auth import require_project_business_permission
from models import Project, ProjectRenovation, ProjectSale, Role, User
from models.common import ProjectStatus
from services.system.exceptions import PermissionDeniedError


def _make_operator_user(session: Session) -> User:
    """创建并持久化 operator 角色用户."""
    user = User(
        id="operator-bp-test",
        username="operator_bp",
        password="hashed",
        nickname="运营用户",
        role_id="operator-role",
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_customer_user(session: Session) -> User:
    """创建并持久化 customer 角色用户."""
    user = User(
        id="customer-bp-test",
        username="customer_bp",
        password="hashed",
        nickname="C 端用户",
        role_id="customer-role",
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_custom_role_user(session: Session) -> User:
    """创建并持久化自定义角色用户（非 admin/operator/user/customer）."""
    role = Role(
        id="manager-role",
        name="业务经理",
        code="manager",
    )
    session.add(role)
    session.flush()
    user = User(
        id="manager-bp-test",
        username="manager_bp",
        password="hashed",
        nickname="业务经理",
        role_id=role.id,
        status="active",
    )
    session.add(user)
    session.commit()
    session.refresh(user)
    return user


def _make_project(
    session: Session,
    *,
    project_id: str,
    status: ProjectStatus = ProjectStatus.RENOVATING,
) -> Project:
    """创建并持久化项目."""
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


def _make_renovation(
    session: Session,
    *,
    project_id: str,
    contact_person_id: str | None = None,
) -> ProjectRenovation:
    """创建并持久化装修记录，可指定对接负责人."""
    renovation = ProjectRenovation(
        id=uuid.uuid4(),
        project_id=project_id,
        contact_person_id=contact_person_id,
        is_deleted=False,
    )
    session.add(renovation)
    session.commit()
    session.refresh(renovation)
    return renovation


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


def _make_request(project_id: str | uuid.UUID | None) -> MagicMock:
    """构造模拟 Request 对象，path_params 包含 project_id.

    真实 HTTP 路径参数为字符串，故将 UUID 形式的 project_id 转成 str.
    """
    request = MagicMock()
    request.path_params = {"project_id": str(project_id)} if project_id is not None else {}
    return request


class TestRequireProjectBusinessPermission:
    """require_project_business_permission 依赖工厂测试."""

    def test_admin_with_project_write_passes(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Admin 持有 project:write → 通过权限码直接放行."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]
        project = _make_project(session, project_id="proj-admin-pass")
        _make_renovation(session, project_id=project.id, contact_person_id="other-user")

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, admin)

        assert result.id == admin.id

    def test_operator_with_renovation_subcode_passes(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Operator 持有 project:renovation:upload_photo → 通过子权限码放行."""
        session = seeded_db["session"]
        operator = _make_operator_user(session)
        project = _make_project(session, project_id="proj-op-renov-pass")
        # 即便 operator 不是对接负责人，权限码通过即可放行
        _make_renovation(session, project_id=project.id, contact_person_id="another-user")

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, operator)

        assert result.id == operator.id

    def test_operator_with_sales_subcode_passes(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Operator 持有 project:sales:add_record → 通过子权限码放行."""
        session = seeded_db["session"]
        operator = _make_operator_user(session)
        project = _make_project(session, project_id="proj-op-sales-pass", status=ProjectStatus.SELLING)
        _make_sale(session, project_id=project.id, channel_manager_id="another-user")

        checker = require_project_business_permission(
            "project:sales:add_record",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, operator)

        assert result.id == operator.id

    def test_user_as_contact_person_passes_renovation(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 无子权限码，但被指派为对接负责人 → 通过业务身份放行（装修场景）."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-user-renov-pass")
        _make_renovation(session, project_id=project.id, contact_person_id=normal.id)

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, normal)

        assert result.id == normal.id

    def test_user_as_channel_manager_passes_sales(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 被指派为 channel_manager → 通过业务身份放行（销售场景）."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-user-sales-cm", status=ProjectStatus.SELLING)
        _make_sale(session, project_id=project.id, channel_manager_id=normal.id)

        checker = require_project_business_permission(
            "project:sales:add_record",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, normal)

        assert result.id == normal.id

    def test_user_as_property_agent_passes_sales(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 被指派为 property_agent → 通过业务身份放行."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-user-sales-pa", status=ProjectStatus.SELLING)
        _make_sale(session, project_id=project.id, property_agent_id=normal.id)

        checker = require_project_business_permission(
            "project:sales:add_record",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, normal)

        assert result.id == normal.id

    def test_user_as_negotiator_passes_sales(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 被指派为 negotiator → 通过业务身份放行."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-user-sales-neg", status=ProjectStatus.SELLING)
        _make_sale(session, project_id=project.id, negotiator_id=normal.id)

        checker = require_project_business_permission(
            "project:sales:add_record",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, normal)

        assert result.id == normal.id

    def test_user_not_contact_person_rejected(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 非对接负责人，无权限码 → 抛 PermissionDeniedError."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-user-renov-reject")
        _make_renovation(session, project_id=project.id, contact_person_id="another-user-id")

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        with pytest.raises(PermissionDeniedError, match="权限不足"):
            checker(request, session, normal)

    def test_user_not_sales_team_member_rejected(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 非销售团队成员，无权限码 → 抛 PermissionDeniedError."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-user-sales-reject", status=ProjectStatus.SELLING)
        _make_sale(
            session,
            project_id=project.id,
            channel_manager_id="another-user-id",
            property_agent_id="another-user-id",
            negotiator_id="another-user-id",
        )

        checker = require_project_business_permission(
            "project:sales:add_record",
            "project_id",
        )
        request = _make_request(project.id)

        with pytest.raises(PermissionDeniedError, match="权限不足"):
            checker(request, session, normal)

    def test_user_cross_project_rejected(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 是项目 A 的对接负责人，访问项目 B → 被拒绝（业务身份不可跨项目）."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project_a = _make_project(session, project_id="proj-user-cross-a")
        _make_renovation(session, project_id=project_a.id, contact_person_id=normal.id)
        project_b = _make_project(session, project_id="proj-user-cross-b")
        # 项目 B 的对接负责人是另一个用户
        _make_renovation(session, project_id=project_b.id, contact_person_id="another-user-id")

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        # 业务身份校验使用 request.path_params.project_id（项目 B），而非项目 A
        request = _make_request(project_b.id)

        with pytest.raises(PermissionDeniedError, match="权限不足"):
            checker(request, session, normal)

    def test_customer_role_rejected(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Customer 角色无 project 权限，也无业务身份 → 抛 PermissionDeniedError."""
        session = seeded_db["session"]
        customer = _make_customer_user(session)
        project = _make_project(session, project_id="proj-customer-reject")
        _make_renovation(session, project_id=project.id, contact_person_id="another-user-id")

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        with pytest.raises(PermissionDeniedError, match="权限不足"):
            checker(request, session, customer)

    def test_renovation_not_found_rejects_user(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """User 无权限码且装修记录不存在 → 抛 PermissionDeniedError.

        业务身份校验依赖 ProjectRenovation 记录，记录不存在时视为无业务身份。
        """
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]
        project = _make_project(session, project_id="proj-renov-missing")
        # 不创建 ProjectRenovation 记录

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        with pytest.raises(PermissionDeniedError, match="权限不足"):
            checker(request, session, normal)

    def test_custom_role_user_as_contact_person_passes(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """自定义角色用户被指派为对接负责人 → 通过业务身份放行.

        验证业务身份校验不限制角色：非 admin/operator/user/customer 的自定义角色，
        只要被指派为项目业务负责人即可放行（回归测试：原实现仅放行 user 角色）。
        """
        session = seeded_db["session"]
        manager = _make_custom_role_user(session)
        project = _make_project(session, project_id="proj-custom-role-pass")
        _make_renovation(session, project_id=project.id, contact_person_id=manager.id)

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, manager)

        assert result.id == manager.id

    def test_custom_role_user_as_sales_member_passes(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """自定义角色用户被指派为销售团队成员 → 通过业务身份放行."""
        session = seeded_db["session"]
        manager = _make_custom_role_user(session)
        project = _make_project(
            session,
            project_id="proj-custom-role-sales",
            status=ProjectStatus.SELLING,
        )
        _make_sale(session, project_id=project.id, negotiator_id=manager.id)

        checker = require_project_business_permission(
            "project:sales:add_record",
            "project_id",
        )
        request = _make_request(project.id)

        result = checker(request, session, manager)

        assert result.id == manager.id

    def test_custom_role_user_without_business_identity_rejected(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """自定义角色用户无权限码且非业务负责人 → 抛 PermissionDeniedError."""
        session = seeded_db["session"]
        manager = _make_custom_role_user(session)
        project = _make_project(session, project_id="proj-custom-role-reject")
        _make_renovation(session, project_id=project.id, contact_person_id="another-user-id")

        checker = require_project_business_permission(
            "project:renovation:upload_photo",
            "project_id",
        )
        request = _make_request(project.id)

        with pytest.raises(PermissionDeniedError, match="权限不足"):
            checker(request, session, manager)
