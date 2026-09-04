"""权限自提权防护测试.

覆盖三个防护点：
1. UserService.update_user：操作者不能修改自身 role_id / status / additional_role_ids
2. RoleService.update_role：操作者不能修改自身所属角色（主角色或附加角色）
3. PermissionService.set_role_permissions：操作者不能修改自身所属角色权限集

设计决策：
- admin 同样受限（纵深防御：admin 账号被盗也无法立即提权或锁死其他管理员）
- 自提权触发 ValidationError（400 状态码，避免 403 暴露权限差异）
- 修改自身所属角色（含 permission_codes 字段）也算自提权
"""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

import db
from main import app
from models import Role, User, UserRole
from schemas.user import RoleUpdate, UserUpdate
from services.system.exceptions import ValidationError
from services.system.role import RoleService
from services.system.user import UserService
from utils.auth import AUDIENCE_ADMIN, create_access_token, get_password_hash

# 测试用密码（满足强度要求：8+ 字符 + 大小写 + 数字 + 特殊字符）
_TEST_PASSWORD = "Test1234!"


def _make_db_override(session: Session) -> type[Generator[Session, None, None]]:
    """创建 get_db 覆盖函数（FastAPI 需要生成器函数）."""

    def _override() -> Generator[Session, None, None]:
        yield session

    return _override


def _create_user(
    session: Session,
    *,
    user_id: str,
    username: str,
    main_role_code: str,
    additional_role_codes: list[str] | None = None,
    password: str = _TEST_PASSWORD,
    nickname: str | None = None,
) -> User:
    """直接通过 ORM 创建用户（绕过 service 校验，用于测试自提权防护）.

    Args:
        session: 数据库会话
        user_id: 用户ID
        username: 用户名
        main_role_code: 主角色代码
        additional_role_codes: 附加角色代码列表
        password: 明文密码（内部加密存储）
        nickname: 昵称

    Returns:
        创建的 User 对象

    """
    main_role = session.query(Role).filter(Role.code == main_role_code).first()
    user = User(
        id=user_id,
        username=username,
        password=get_password_hash(password),
        nickname=nickname or username,
        role_id=main_role.id,
        status="active",
    )
    session.add(user)
    session.flush()

    if additional_role_codes:
        for code in additional_role_codes:
            role = session.query(Role).filter(Role.code == code).first()
            session.add(UserRole(user_id=user.id, role_id=role.id))

    session.commit()
    session.refresh(user)
    return user


# ==================== 1. UserService.update_user 自提权防护 ====================


class TestUpdateUserSelfEscalation:
    """操作者不能修改自身 role_id / status / additional_role_ids."""

    def test_update_user_cannot_modify_own_role_id(self, seeded_db: dict[str, Any]) -> None:
        """Operator 改自身 role_id → ValidationError."""
        session = seeded_db["session"]
        operator = _create_user(
            session,
            user_id="operator-self-role",
            username="op-self-role",
            main_role_code="operator",
        )

        user_service = UserService()
        update_data = UserUpdate(role_id="admin-role")

        with pytest.raises(ValidationError, match="不能修改自身的角色"):
            user_service.update_user(
                session,
                operator.id,
                update_data,
                operator_id=operator.id,
            )

    def test_update_user_cannot_modify_own_status(self, seeded_db: dict[str, Any]) -> None:
        """Operator 改自身 status → ValidationError（防自禁用/自激活绕过审计）."""
        session = seeded_db["session"]
        operator = _create_user(
            session,
            user_id="operator-self-status",
            username="op-self-status",
            main_role_code="operator",
        )

        user_service = UserService()
        update_data = UserUpdate(status="inactive")

        with pytest.raises(ValidationError, match="不能修改自身的角色"):
            user_service.update_user(
                session,
                operator.id,
                update_data,
                operator_id=operator.id,
            )

    def test_update_user_cannot_modify_own_additional_roles(self, seeded_db: dict[str, Any]) -> None:
        """Operator 改自身 additional_role_ids（含 []）→ ValidationError."""
        session = seeded_db["session"]
        # 先创建带附加 customer 角色的 operator 用户
        operator = _create_user(
            session,
            user_id="operator-self-addr",
            username="op-self-addr",
            main_role_code="operator",
            additional_role_codes=["customer"],
        )
        assert len(operator.roles) == 1

        user_service = UserService()
        update_data = UserUpdate()

        # 尝试清空附加角色 → 应被拒
        with pytest.raises(ValidationError, match="不能修改自身的角色"):
            user_service.update_user(
                session,
                operator.id,
                update_data,
                additional_role_ids=[],
                operator_id=operator.id,
            )

    def test_update_user_can_modify_own_nickname(self, seeded_db: dict[str, Any]) -> None:
        """Operator 改自身 nickname（非角色/状态/附加角色）→ 成功."""
        session = seeded_db["session"]
        operator = _create_user(
            session,
            user_id="operator-self-nick",
            username="op-self-nick",
            main_role_code="operator",
            nickname="原昵称",
        )

        user_service = UserService()
        update_data = UserUpdate(nickname="新昵称")

        updated = user_service.update_user(
            session,
            operator.id,
            update_data,
            operator_id=operator.id,
        )
        assert updated.nickname == "新昵称"

    def test_admin_cannot_modify_own_role_id(self, seeded_db: dict[str, Any]) -> None:
        """Admin 改自身 role_id → ValidationError（admin 不豁免自提权防护）."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        user_service = UserService()
        update_data = UserUpdate(role_id="user-role")

        with pytest.raises(ValidationError, match="不能修改自身的角色"):
            user_service.update_user(
                session,
                admin.id,
                update_data,
                operator_id=admin.id,
            )


# ==================== 2. RoleService.update_role 自提权防护 ====================


class TestUpdateRoleSelfEscalation:
    """操作者不能修改自身所属角色（主角色或附加角色）."""

    def test_update_role_cannot_modify_own_main_role(self, seeded_db: dict[str, Any]) -> None:
        """Operator 修改自身主角色（operator-role）→ ValidationError."""
        session = seeded_db["session"]
        operator = _create_user(
            session,
            user_id="operator-role-main",
            username="op-role-main",
            main_role_code="operator",
        )

        role_service = RoleService()
        update_data = RoleUpdate(description="尝试修改自身主角色")

        with pytest.raises(ValidationError, match="不能修改自身所属的角色"):
            role_service.update_role(
                session,
                "operator-role",
                update_data,
                operator_id=operator.id,
            )

    def test_update_role_cannot_modify_own_additional_role(self, seeded_db: dict[str, Any]) -> None:
        """admin+customer 用户修改自身附加角色（customer-role）→ ValidationError."""
        session = seeded_db["session"]
        # 创建带附加 customer 角色的 admin 用户
        dual_user = _create_user(
            session,
            user_id="admin-cust-role",
            username="admin-cust-role",
            main_role_code="admin",
            additional_role_codes=["customer"],
        )

        role_service = RoleService()
        update_data = RoleUpdate(description="尝试修改自身附加角色")

        with pytest.raises(ValidationError, match="不能修改自身所属的角色"):
            role_service.update_role(
                session,
                "customer-role",
                update_data,
                operator_id=dual_user.id,
            )

    def test_update_role_can_modify_other_role(self, seeded_db: dict[str, Any]) -> None:
        """Operator 修改非自身角色（user-role）→ 成功."""
        session = seeded_db["session"]
        operator = _create_user(
            session,
            user_id="operator-other-role",
            username="op-other-role",
            main_role_code="operator",
        )

        role_service = RoleService()
        update_data = RoleUpdate(description="由 operator 修改的非自身角色")

        updated = role_service.update_role(
            session,
            "user-role",
            update_data,
            operator_id=operator.id,
        )
        assert updated.description == "由 operator 修改的非自身角色"


# ==================== 3. PermissionService.set_role_permissions 自提权防护（HTTP 层） ====================


class TestSetRolePermissionsSelfEscalation:
    """操作者不能通过 PUT /permissions/roles/{role_id} 修改自身所属角色权限集."""

    def test_set_role_permissions_cannot_modify_own_role(
        self,
        seeded_db: dict[str, Any],
    ) -> None:
        """Admin 直调 PUT /api/v1/permissions/roles/admin-role 修改自身角色权限 → 400.

        使用 admin 用户而非 operator，因为 admin 拥有 role:assign_permissions 权限
        可通过路由层权限校验，从而触发 service 层自提权防护；operator 无此权限会被
        路由层 403 拦截，到不了自提权检查代码。
        """
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        # admin 拥有所有权限（包括 role:assign_permissions），可绕过路由层权限校验
        token = create_access_token(
            data={"sub": admin.id, "role": "admin", "ver": admin.token_version},
            audience=AUDIENCE_ADMIN,
        )

        app.dependency_overrides[db.get_db] = _make_db_override(session)
        try:
            client = TestClient(app, cookies={"access_token": token})
            client.headers["X-Requested-With"] = "XMLHttpRequest"

            # admin 尝试修改自身主角色（admin-role）的权限集 → 自提权防护触发
            resp = client.put(
                "/api/v1/permissions/roles/admin-role",
                json={"permission_codes": []},
            )
            assert resp.status_code == 400, f"admin 修改自身角色权限应返回 400，实际 {resp.status_code}: {resp.text}"
            assert "不能修改自身所属的角色" in resp.json().get("message", "")
        finally:
            app.dependency_overrides.clear()
