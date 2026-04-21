"""
系统服务层业务异常

用于替换服务层中的 HTTPException，保持服务层与 FastAPI 解耦。
路由层负责捕获这些异常并转换为 HTTP 响应。
"""


class ServiceException(Exception):
    """服务层基础异常"""

    def __init__(self, message: str, status_code: int = 400):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)


class AuthenticationError(ServiceException):
    """认证错误（401）"""

    def __init__(self, message: str = "认证失败"):
        super().__init__(message, status_code=401)


class PermissionDeniedError(ServiceException):
    """权限不足（403）"""

    def __init__(self, message: str = "权限不足"):
        super().__init__(message, status_code=403)


class ResourceNotFoundError(ServiceException):
    """资源不存在（404）"""

    def __init__(self, message: str = "资源不存在"):
        super().__init__(message, status_code=404)


class ValidationError(ServiceException):
    """数据验证错误（400）"""

    def __init__(self, message: str = "请求参数错误"):
        super().__init__(message, status_code=400)


class ConflictError(ServiceException):
    """资源冲突（409）"""

    def __init__(self, message: str = "资源冲突"):
        super().__init__(message, status_code=409)
