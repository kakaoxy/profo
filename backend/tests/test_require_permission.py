"""require_permission 依赖测试.

覆盖：
1. has_permission 函数（True/False 判断）
2. require_permission 工厂函数（通过/拒绝）
3. 多角色权限并集
"""

from typing import Any

import pytest

from dependencies.auth import has_permission, require_permission
from models import UserRole
from services.system.exceptions import PermissionDeniedError


class TestHasPermission:
    """has_permission 函数测试."""

    def test_has_permission_true(self, seeded_db: dict[str, Any]) -> None:
        """Admin 用户拥有 user:read 权限 → True."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        assert has_permission(admin, "user:read", session) is True

    def test_has_permission_false(self, seeded_db: dict[str, Any]) -> None:
        """Normal user 不拥有 user:delete 权限 → False."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        assert has_permission(normal, "user:delete", session) is False

    def test_has_permission_admin_has_all(self, seeded_db: dict[str, Any]) -> None:
        """Admin 角色拥有全部权限码 → 任意权限码均 True."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        assert has_permission(admin, "user:read", session) is True
        assert has_permission(admin, "user:delete", session) is True
        assert has_permission(admin, "role:assign_permissions", session) is True
        assert has_permission(admin, "permission:manage", session) is True


class TestRequirePermission:
    """require_permission 工厂函数测试."""

    def test_require_permission_passes_on_allowed(self, seeded_db: dict[str, Any]) -> None:
        """有权限时 permission_checker 返回 user 对象."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        checker = require_permission("user:read")
        result = checker(admin, session)

        assert result.id == admin.id

    def test_require_permission_raises_on_denied(self, seeded_db: dict[str, Any]) -> None:
        """无权限时 permission_checker 抛 PermissionDeniedError."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        checker = require_permission("user:delete")
        with pytest.raises(PermissionDeniedError, match="user:delete"):
            checker(normal, session)

    def test_require_permission_admin_all_codes_pass(self, seeded_db: dict[str, Any]) -> None:
        """Admin 用户对任意权限码均通过校验."""
        session = seeded_db["session"]
        admin = seeded_db["users"]["admin"]

        for code in ["user:read", "user:delete", "role:read", "permission:manage"]:
            checker = require_permission(code)
            # 不抛异常即通过
            result = checker(admin, session)
            assert result.id == admin.id

    def test_require_permission_normal_user_readonly(self, seeded_db: dict[str, Any]) -> None:
        """Normal user 仅有只读权限，写权限被拒."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        # 只读权限通过
        checker_read = require_permission("property:read")
        assert checker_read(normal, session).id == normal.id

        # 写权限被拒
        checker_write = require_permission("property:write")
        with pytest.raises(PermissionDeniedError):
            checker_write(normal, session)


class TestMultiRolePermissionUnion:
    """多角色权限并集测试."""

    def test_multi_role_permission_union(self, seeded_db: dict[str, Any]) -> None:
        """用户有附加角色时，权限为主角色与附加角色的并集."""
        session = seeded_db["session"]
        normal = seeded_db["users"]["normal"]

        # normal 主角色 user-role：有 property:read，无 valuation:write
        assert has_permission(normal, "property:read", session) is True
        assert has_permission(normal, "valuation:write", session) is False

        # 添加附加角色 customer-role（拥有 valuation:write、lead:submit）
        session.add(UserRole(user_id=normal.id, role_id="customer-role"))
        session.commit()
        session.refresh(normal)

        # 并集后：property:read（来自 user-role）+ valuation:write（来自 customer-role）
        assert has_permission(normal, "property:read", session) is True
        assert has_permission(normal, "valuation:write", session) is True
        assert has_permission(normal, "lead:submit", session) is True
