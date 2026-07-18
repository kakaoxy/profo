"""系统管理模块路由.

包含：认证、用户管理、角色管理、权限管理等功能.
"""

from .auth import router as auth_router
from .operation_logs import router as operation_logs_router
from .permissions import router as permissions_router
from .roles import router as roles_router
from .users import router as users_router

__all__ = [
    "auth_router",
    "operation_logs_router",
    "permissions_router",
    "roles_router",
    "users_router",
]
