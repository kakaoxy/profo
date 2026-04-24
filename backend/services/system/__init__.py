"""
系统服务模块

提供认证、用户管理、角色管理和错误记录等系统级功能。

使用方式:
    from services.system import AuthService, UserService, RoleService
    from services.system import save_failed_record
"""

from .auth import AuthService
from .user import UserService, user_service
from .role import RoleService, role_service
from .error import save_failed_record
from .api_key import ApiKeyService, api_key_service

__all__ = [
    "AuthService",
    "UserService",
    "user_service",
    "RoleService",
    "role_service",
    "save_failed_record",
    "ApiKeyService",
    "api_key_service",
]
