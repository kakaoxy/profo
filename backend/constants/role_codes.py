"""角色编码常量.

将散落在多处的角色编码硬编码字符串集中为枚举，避免 magic string。
前后端共享同一份角色码定义（前端在 lib/auth/permissions.ts 中镜像）。
"""

import enum


class RoleCode(str, enum.Enum):
    """角色编码枚举."""

    ADMIN = "admin"
    OPERATOR = "operator"
    USER = "user"
    CUSTOMER = "customer"


# 后台登录允许的角色集合（C 端 customer 不可登录后台）
BACKEND_ROLE_CODES: frozenset[str] = frozenset({RoleCode.ADMIN.value, RoleCode.OPERATOR.value, RoleCode.USER.value})

# API Key 机器接口允许的角色集合（不含 user，user 虽可登录后台但无 API Key 权限）
INTERNAL_ROLE_CODES: frozenset[str] = frozenset({RoleCode.ADMIN.value, RoleCode.OPERATOR.value})

# 附加角色仅允许 customer（让后台用户同时具备 C 端身份）
ADDITIONAL_ROLE_CODES: frozenset[str] = frozenset({RoleCode.CUSTOMER.value})

# C 端角色码
CUSTOMER_ROLE_CODE = RoleCode.CUSTOMER.value

# 内置角色码集合（用于初始化与校验）
BUILTIN_ROLE_CODES: frozenset[str] = frozenset(
    {RoleCode.ADMIN.value, RoleCode.OPERATOR.value, RoleCode.USER.value, RoleCode.CUSTOMER.value}
)


__all__ = [
    "ADDITIONAL_ROLE_CODES",
    "BACKEND_ROLE_CODES",
    "BUILTIN_ROLE_CODES",
    "CUSTOMER_ROLE_CODE",
    "INTERNAL_ROLE_CODES",
    "RoleCode",
]
