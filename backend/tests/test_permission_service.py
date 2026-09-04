"""PermissionService 单元测试.

覆盖 PermissionService 全部方法：
1. list_permissions / list_permissions_grouped_by_module（查询与分组）
2. create / update / delete（CRUD，含系统权限点保护）
3. get_role_permission_codes / set_role_permissions（角色-权限关联管理）
4. get_user_permission_codes（主角色 + 附加角色权限并集）
"""

import uuid
from typing import Any

import pytest

from models import UserRole
from models.user.permission import PermissionCategory
from schemas.permission import PermissionCreate, PermissionFilter, PermissionUpdate
from services.system import permission_service
from services.system.exceptions import ConflictError, ResourceNotFoundError, ValidationError

# ==================== 1. list_permissions / list_permissions_grouped_by_module ====================


class TestPermissionServiceList:
    """list_permissions / list_permissions_grouped_by_module 测试."""

    def test_list_permissions_returns_paginated(self, seeded_db: dict[str, Any]) -> None:
        """分页查询权限点：返回 (total, list) 元组，total 为全量计数."""
        session = seeded_db["session"]

        total, perms = permission_service.list_permissions(session, page=1, page_size=10)

        # 种子数据含约 35 个系统权限点，total 应大于 10，当前页返回 10 条
        assert total > 10
        assert len(perms) == 10

    def test_list_permissions_with_module_filter(self, seeded_db: dict[str, Any]) -> None:
        """按 module 过滤：仅返回指定模块的权限点."""
        session = seeded_db["session"]

        total, perms = permission_service.list_permissions(
            session,
            filter=PermissionFilter(module="user"),
        )

        # user 模块有 6 个权限点：user:read/create/update/delete/reset_password/unbind_wechat
        assert total == 6
        assert all(p.module == "user" for p in perms)

    def test_list_permissions_with_is_system_filter(self, seeded_db: dict[str, Any]) -> None:
        """按 is_system 过滤：种子权限全部 is_system=True."""
        session = seeded_db["session"]

        total, perms = permission_service.list_permissions(
            session,
            filter=PermissionFilter(is_system=True),
        )

        assert total > 0
        assert all(p.is_system is True for p in perms)

    def test_list_permissions_grouped_by_module(self, seeded_db: dict[str, Any]) -> None:
        """按模块分组：返回 dict[module, list[Permission]]."""
        session = seeded_db["session"]

        grouped = permission_service.list_permissions_grouped_by_module(session)

        # 至少包含 user/role/permission 等模块
        assert "user" in grouped
        assert "role" in grouped
        assert isinstance(grouped["user"], list)
        assert all(p.module == "user" for p in grouped["user"])


# ==================== 2. create / update / delete ====================


class TestPermissionServiceCRUD:
    """create_permission / update_permission / delete_permission 测试."""

    def test_create_permission_success(self, seeded_db: dict[str, Any]) -> None:
        """创建非系统权限点成功."""
        session = seeded_db["session"]

        perm_data = PermissionCreate(
            code="custom:action",
            name="自定义操作",
            module="custom",
            category="api",
            sort_order=10,
            description="测试用自定义权限",
        )
        perm = permission_service.create_permission(session, perm_data)

        assert perm.id is not None
        assert perm.code == "custom:action"
        assert perm.is_system is False
        assert perm.category == PermissionCategory.API

    def test_create_permission_duplicate_code_rejected(self, seeded_db: dict[str, Any]) -> None:
        """重复 code 创建被拒 → ConflictError."""
        session = seeded_db["session"]

        perm_data = PermissionCreate(
            code="user:read",  # 种子数据已存在
            name="重复权限",
            module="user",
            category="api",
        )
        with pytest.raises(ConflictError, match="权限代码已存在"):
            permission_service.create_permission(session, perm_data)

    def test_update_permission_success(self, seeded_db: dict[str, Any]) -> None:
        """更新权限点名称和描述成功."""
        session = seeded_db["session"]

        # 先创建一个非系统权限
        perm_data = PermissionCreate(
            code="custom:update-test",
            name="原始名称",
            module="custom",
            category="api",
        )
        perm = permission_service.create_permission(session, perm_data)

        update_data = PermissionUpdate(name="更新后名称", description="更新后描述")
        updated = permission_service.update_permission(session, perm.id, update_data)

        assert updated.name == "更新后名称"
        assert updated.description == "更新后描述"
        assert updated.code == "custom:update-test"  # code 不在 update_data 中，不变

    def test_update_permission_not_found(self, seeded_db: dict[str, Any]) -> None:
        """更新不存在的权限 → ResourceNotFoundError."""
        session = seeded_db["session"]

        with pytest.raises(ResourceNotFoundError, match="权限不存在"):
            permission_service.update_permission(
                session,
                str(uuid.uuid4()),
                PermissionUpdate(name="新名称"),
            )

    def test_delete_permission_success(self, seeded_db: dict[str, Any]) -> None:
        """删除非系统权限点成功."""
        session = seeded_db["session"]

        # 先创建一个非系统权限
        perm_data = PermissionCreate(
            code="custom:delete-test",
            name="待删除权限",
            module="custom",
            category="api",
        )
        perm = permission_service.create_permission(session, perm_data)

        result = permission_service.delete_permission(session, perm.id)
        assert result == {"message": "权限删除成功"}

        # 验证已删除
        assert permission_service.get_permission_by_id(session, perm.id) is None

    def test_delete_system_permission_rejected(self, seeded_db: dict[str, Any]) -> None:
        """删除系统权限点（is_system=True）被拒 → ConflictError."""
        session = seeded_db["session"]

        # 获取一个种子系统权限（user:read）
        perm = permission_service.get_permission_by_code(session, "user:read")
        assert perm is not None
        assert perm.is_system is True

        with pytest.raises(ConflictError, match="系统权限点不可删除"):
            permission_service.delete_permission(session, perm.id)

    def test_delete_permission_not_found(self, seeded_db: dict[str, Any]) -> None:
        """删除不存在的权限 → ResourceNotFoundError."""
        session = seeded_db["session"]

        with pytest.raises(ResourceNotFoundError, match="权限不存在"):
            permission_service.delete_permission(session, str(uuid.uuid4()))


# ==================== 3. get_role_permission_codes / set_role_permissions ====================


class TestRolePermissions:
    """get_role_permission_codes / set_role_permissions 测试."""

    def test_get_role_permission_codes_admin(self, seeded_db: dict[str, Any]) -> None:
        """Admin 角色拥有全部权限码."""
        session = seeded_db["session"]

        codes = permission_service.get_role_permission_codes(session, "admin-role")

        # admin 拥有所有种子权限
        assert "user:read" in codes
        assert "user:delete" in codes
        assert "role:assign_permissions" in codes
        assert "permission:manage" in codes
        assert len(codes) > 20  # 种子数据约 35 个权限

    def test_get_role_permission_codes_user(self, seeded_db: dict[str, Any]) -> None:
        """User 角色仅有只读权限码."""
        session = seeded_db["session"]

        codes = permission_service.get_role_permission_codes(session, "user-role")

        assert "property:read" in codes
        assert "lead:read" in codes
        assert "user:read" not in codes  # user 角色无用户管理权限
        assert "user:delete" not in codes

    def test_set_role_permissions_replace_all(self, seeded_db: dict[str, Any]) -> None:
        """全量替换角色权限：传入新列表后，角色权限与列表一致."""
        session = seeded_db["session"]

        # user-role 原本有 property:read 等
        original_codes = permission_service.get_role_permission_codes(session, "user-role")
        assert "property:read" in original_codes

        # 替换为仅 user:read
        new_codes = ["user:read"]
        result = permission_service.set_role_permissions(session, "user-role", new_codes)

        assert result == ["user:read"]
        # 验证数据库中确实只有 user:read
        actual_codes = permission_service.get_role_permission_codes(session, "user-role")
        assert set(actual_codes) == {"user:read"}

    def test_set_role_permissions_clear_all(self, seeded_db: dict[str, Any]) -> None:
        """传入空列表清空角色所有权限."""
        session = seeded_db["session"]

        result = permission_service.set_role_permissions(session, "user-role", [])

        assert result == []
        actual_codes = permission_service.get_role_permission_codes(session, "user-role")
        assert actual_codes == []

    def test_set_role_permissions_invalid_code_rejected(self, seeded_db: dict[str, Any]) -> None:
        """传入不存在的权限码 → ValidationError."""
        session = seeded_db["session"]

        with pytest.raises(ValidationError, match="权限代码不存在"):
            permission_service.set_role_permissions(
                session,
                "user-role",
                ["user:read", "nonexistent:code"],
            )

    def test_set_role_permissions_role_not_found(self, seeded_db: dict[str, Any]) -> None:
        """角色不存在 → ResourceNotFoundError."""
        session = seeded_db["session"]

        with pytest.raises(ResourceNotFoundError, match="角色不存在"):
            permission_service.set_role_permissions(
                session,
                "non-existent-role-id",
                ["user:read"],
            )


# ==================== 4. get_user_permission_codes ====================


class TestUserPermissions:
    """get_user_permission_codes 测试（主角色 + 附加角色权限并集）."""

    def test_get_user_permission_codes_main_role_only(self, seeded_db: dict[str, Any]) -> None:
        """仅有主角色时：返回主角色权限集."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        codes = permission_service.get_user_permission_codes(session, admin)

        # admin 主角色拥有全部权限
        assert "user:read" in codes
        assert "user:delete" in codes
        assert "role:read" in codes

    def test_get_user_permission_codes_normal_user(self, seeded_db: dict[str, Any]) -> None:
        """普通用户（user-role）权限集不含用户管理权限."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        codes = permission_service.get_user_permission_codes(session, normal)

        assert "property:read" in codes
        assert "user:read" not in codes  # user 角色无用户管理权限

    def test_get_user_permission_codes_with_additional_roles(self, seeded_db: dict[str, Any]) -> None:
        """有附加角色时：权限为主角色与附加角色的并集."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        # normal 用户主角色为 user-role，权限含 property:read 但无 valuation:write
        main_codes = permission_service.get_user_permission_codes(session, normal)
        assert "property:read" in main_codes
        assert "valuation:write" not in main_codes

        # 添加附加角色 customer-role（拥有 valuation:write、lead:submit）
        session.add(UserRole(user_id=normal.id, role_id="customer-role"))
        session.commit()
        session.refresh(normal)

        # 重新获取权限：应为 user-role ∪ customer-role 的并集
        union_codes = permission_service.get_user_permission_codes(session, normal)
        assert "property:read" in union_codes  # 来自 user-role
        assert "valuation:write" in union_codes  # 来自 customer-role
        assert "lead:submit" in union_codes  # 来自 customer-role
