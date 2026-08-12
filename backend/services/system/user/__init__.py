"""用户管理服务子包.

按职责拆分为 4 个独立 Service：
- core: 后台管理 CRUD（UserService）
- lifecycle: 密码与账号生命周期（UserLifecycleService）
- profile: C 端用户资料与手机号（UserProfileService）
- wechat: 微信绑定与账号合并（UserWechatService）

使用方式:
    from services.system.user import UserService, user_service
    from services.system.user import UserLifecycleService, user_lifecycle_service
"""

from .core import UserService, user_service
from .lifecycle import UserLifecycleService, user_lifecycle_service
from .profile import UserProfileService, user_profile_service
from .wechat import UserWechatService, user_wechat_service

__all__ = [
    "UserLifecycleService",
    "UserProfileService",
    "UserService",
    "UserWechatService",
    "user_lifecycle_service",
    "user_profile_service",
    "user_service",
    "user_wechat_service",
]
