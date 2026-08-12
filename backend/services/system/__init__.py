"""系统服务模块.

提供认证、用户管理、角色管理和错误记录等系统级功能。

使用方式:
    from services.system import AuthService, UserService, RoleService
    from services.system import save_failed_record
"""

from .api_key import ApiKeyService
from .auth import AuthService
from .error import save_failed_record
from .init_service import SystemInitService, init_service
from .operation_log import OperationLogService, operation_log_service
from .permission import PermissionService, permission_service
from .role import RoleService, role_service
from .user import (
    UserLifecycleService,
    UserProfileService,
    UserService,
    UserWechatService,
    user_lifecycle_service,
    user_profile_service,
    user_service,
    user_wechat_service,
)
from .wechat import WeChatAuthService

__all__ = [
    "ApiKeyService",
    "AuthService",
    "OperationLogService",
    "PermissionService",
    "RoleService",
    "SystemInitService",
    "UserLifecycleService",
    "UserProfileService",
    "UserService",
    "UserWechatService",
    "WeChatAuthService",
    "init_service",
    "operation_log_service",
    "permission_service",
    "role_service",
    "save_failed_record",
    "user_lifecycle_service",
    "user_profile_service",
    "user_service",
    "user_wechat_service",
]
