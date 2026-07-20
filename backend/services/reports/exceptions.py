"""报表服务模块异常.

依赖 backend/services/system/exceptions.py 中的父类，
路由层通过全局 exception_handler 转换为 HTTP 响应.
"""

from services.system.exceptions import ResourceNotFoundError, ValidationError


class CommunityNotFoundError(ResourceNotFoundError):
    """小区不存在或 is_active=false（404）."""

    def __init__(self, message: str = "小区不存在") -> None:
        """初始化小区未找到错误.

        Args:
            message: 错误消息，默认 "小区不存在"

        """
        super().__init__(message)


class InvalidCompareIdsError(ValidationError):
    """多商圈对比 ids 数量非法（<2 或 >5）（400）."""

    def __init__(self, message: str = "对比 ids 数量非法") -> None:
        """初始化对比 ids 校验错误.

        Args:
            message: 错误消息，如 "至少需要 2 个商圈" / "最多支持 5 个商圈"

        """
        super().__init__(message)


__all__ = ["CommunityNotFoundError", "InvalidCompareIdsError"]
