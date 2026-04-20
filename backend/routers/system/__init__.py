"""
系统管理模块路由
包含：认证、用户管理、角色管理等功能
"""
from .auth import router as auth_router
from .users import router as users_router
from .roles import router as roles_router

__all__ = [
    "auth_router",
    "users_router",
    "roles_router",
]
