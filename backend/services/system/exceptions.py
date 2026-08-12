"""系统服务层业务异常.

用于替换服务层中的 HTTPException，保持服务层与 FastAPI 解耦。
路由层负责捕获这些异常并转换为 HTTP 响应。
"""


class ServiceException(Exception):  # noqa: N818
    """服务层基础异常."""

    def __init__(self, message: str, status_code: int = 400, headers: dict[str, str] | None = None) -> None:
        """初始化服务异常.

        Args:
            message: 错误消息
            status_code: HTTP状态码
            headers: 额外的HTTP响应头

        """
        self.message = message
        self.status_code = status_code
        self.headers = headers
        super().__init__(self.message)


class AuthenticationError(ServiceException):
    """认证错误（401）."""

    def __init__(self, message: str = "认证失败", *, headers: dict[str, str] | None = None) -> None:
        """初始化认证错误.

        Args:
            message: 错误消息
            headers: 额外的HTTP响应头（默认包含WWW-Authenticate）

        """
        default_headers = {"WWW-Authenticate": "Bearer"}
        if headers:
            default_headers.update(headers)
        super().__init__(message, status_code=401, headers=default_headers)


class PermissionDeniedError(ServiceException):
    """权限不足（403）."""

    def __init__(self, message: str = "权限不足") -> None:
        """初始化权限错误.

        Args:
            message: 错误消息

        """
        super().__init__(message, status_code=403)


class ResourceNotFoundError(ServiceException):
    """资源不存在（404）."""

    def __init__(self, message: str = "资源不存在") -> None:
        """初始化资源未找到错误.

        Args:
            message: 错误消息

        """
        super().__init__(message, status_code=404)


class ValidationError(ServiceException):
    """数据验证错误（400）."""

    def __init__(self, message: str = "请求参数错误") -> None:
        """初始化验证错误.

        Args:
            message: 错误消息

        """
        super().__init__(message, status_code=400)


class ConflictError(ServiceException):
    """资源冲突（409）."""

    def __init__(self, message: str = "资源冲突") -> None:
        """初始化冲突错误.

        Args:
            message: 错误消息

        """
        super().__init__(message, status_code=409)


class FileProcessingError(ServiceException):
    """文件处理错误（400）."""

    def __init__(self, message: str) -> None:
        """初始化文件处理错误.

        Args:
            message: 错误消息

        """
        super().__init__(message, status_code=400)


class BusinessLogicError(ServiceException):
    """业务逻辑错误（422）.

    用于表示请求语义正确但违反业务规则的场景（如状态流转不合法）。
    400 类错误应使用 ValidationError，404 用 ResourceNotFoundError，
    不要通过本异常传 status_code 绕过分类。

    code 字段为可选的业务码，供路由层在响应体中携带（如 40901/40902），
    不设置时为 None。
    """

    def __init__(
        self,
        message: str,
        *,
        code: int | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        """初始化业务逻辑错误.

        Args:
            message: 错误消息
            code: 业务码（可选，供路由层在响应体中携带）
            headers: 额外的HTTP响应头

        """
        super().__init__(message, status_code=422, headers=headers)
        self.code = code


class PhoneTakenByMainAccountError(BusinessLogicError):
    """手机号已被主账号占用（业务码 40901）.

    临时账号绑定手机号时，若手机号已被其他 is_temporary=False 的主账号占用，
    抛出本异常。路由层捕获后返回 HTTP 200 + body.code=40901（配合前端按 body
    解析业务码），前端展示合并确认视图。target_user_hint 含 nickname/phone_masked。
    status_code 表示该业务冲突的语义 HTTP 状态（409），测试据此校验；
    实际响应传输状态码由路由层决定（/phone 为 200）。
    """

    def __init__(self, target_user_hint: dict[str, str]) -> None:
        """初始化手机号被主账号占用错误.

        Args:
            target_user_hint: 目标主账号提示信息，含 nickname/phone_masked

        """
        super().__init__("PHONE_TAKEN_BY_MAIN_ACCOUNT", code=40901)
        self.status_code = 409
        self.target_user_hint = target_user_hint


class TargetHasWechatError(BusinessLogicError):
    """目标账号已绑定其他微信（业务码 40902）.

    账号合并时，若目标主账号已绑定其他微信 openid，抛出本异常。
    路由层捕获后返回 HTTP 409 + body.code=40902。
    """

    def __init__(self) -> None:
        """初始化目标账号已绑其他微信错误."""
        super().__init__("TARGET_ACCOUNT_HAS_OTHER_WECHAT", code=40902)
        self.status_code = 409


class AccountAlreadyMergedError(BusinessLogicError):
    """临时账号已被并发合并（业务码 40903）.

    merge_accounts 通过 SELECT ... FOR UPDATE 串行化同一 temp_user 的并发合并
    请求。后到事务获取锁后重新读取 temp_user.status，若已为 'merged'，说明
    并发事务先完成了合并，当前事务必须放弃以避免「数据迁到 A、merged_to_user_id
    指向 B」的不一致。路由层捕获后返回 HTTP 409 + body.code=40903。
    """

    def __init__(self) -> None:
        """初始化账号已被并发合并错误."""
        super().__init__("ACCOUNT_ALREADY_MERGED", code=40903)
        self.status_code = 409


class WeChatNotBoundError(BusinessLogicError):
    """账号未绑定微信（业务码 40904）.

    unbind_wechat 在目标账号既无直接 wechat_openid 又无经合并临时账号的间接绑定时
    抛出。路由层捕获后返回 HTTP 409 + body.code=40904。
    并发解绑串行化：后到事务获取行级锁后重新检查发现 wechat 字段已被清空，
    同样抛出本异常，不重复执行清理。
    """

    def __init__(self) -> None:
        """初始化账号未绑定微信错误."""
        super().__init__("WECHAT_NOT_BOUND", code=40904)
        self.status_code = 409
