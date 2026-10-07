"""安全日志工具模块.

提供请求体数据脱敏功能，防止敏感信息泄露到日志中.
另提供认证事件结构化日志入口 ``log_auth_event``，以及日志出口的
上游 URL 凭据拦截（``WechatCredentialScrubFilter`` / ``redact_url_credentials``）.
"""

import json
import logging
import re
from typing import Any

logger = logging.getLogger(__name__)

# 敏感字段列表，这些字段在日志中会被脱敏
SENSITIVE_FIELDS = {
    # 密码与令牌类
    "password",
    "current_password",
    "new_password",
    "pwd",
    "passwd",
    "passcode",
    "pin",
    "otp",
    "token",
    "access_token",
    "refresh_token",
    "temp_token",
    "api_key",
    "api_secret",
    "secret",
    "secret_key",
    "private_key",
    "authorization",
    "cookie",
    "session",
    "verification_code",
    "captcha",
    # 身份证号类
    "id_card",
    "id_number",
    "citizen_id",
    "resident_id",
    "ssn",
    "social_security",
    # 银行卡与支付类
    "credit_card",
    "cvv",
    "bank_account",
    "bank_card",
    "card_number",
    "card_no",
    "account",
    "account_number",
    # 手机号类
    "mobile",
    "phone",
    "tel",
}

_SHORT_VALUE_THRESHOLD = 6

# ==================== 上游 URL 凭据脱敏（日志出口拦截）====================
# httpx 的 ``HTTP Request: GET <完整 URL>`` 属 INFO 级日志，**成功路径也会输出**；
# 而微信凭据接口将 secret / access_token / js_code 放在 query 里，因此每次调用都会
# 把这些凭据写进标准输出（容器日志 / journald 可直接 grep）。
# 异常消息（HTTPStatusError）同样包含完整 URL。仅靠各调用点手工脱敏盖不住这个面
# （任何第三方 logger、未来新增 httpx 调用都可能重现），因此在日志出口统一拦截。
_URL_CREDENTIAL_KEYS = (
    "secret",
    "appsecret",
    "access_token",
    "authorizer_access_token",
    "component_access_token",
    "js_code",
)
_URL_CREDENTIAL_RE = re.compile(
    r"(" + "|".join(_URL_CREDENTIAL_KEYS) + r")=[^&\s]*",
    re.IGNORECASE,
)


def redact_url_credentials(message: str) -> str:
    """脱敏文本中 URL query 形式的凭据参数值（保留参数名以便定位）.

    Args:
        message: 任意文本（异常消息、日志行、待入库的 error_msg 等）

    Returns:
        凭据参数值替换为 ``***`` 后的文本；appid / 域名 / 路径等非凭据信息保留以便排障

    """
    return _URL_CREDENTIAL_RE.sub(r"\1=***", message)


# 仅用于渲染异常堆栈文本（不拼格式头尾），供出口过滤器脱敏后写回 record.exc_text
_EXCEPTION_FORMATTER = logging.Formatter()


class WechatCredentialScrubFilter(logging.Filter):
    """日志出口凭据拦截过滤器（需挂在 **root handler** 上）.

    ⚠️ 必须挂在 handler 而非 logger：``logging.Logger.handle`` 只执行
    **当前 logger** 自身的 filter，httpx 等第三方 logger 的记录沿 manager 传播到
    root handler 时不会经过仅挂在其他 logger 上的 filter。

    两个注入面都拦：
    1. 日志消息本体 —— httpx 在 INFO 级打 ``HTTP Request: GET <完整 URL>``（**成功路径也会打**），
       而微信凭据接口把 secret / access_token / js_code 放在 query；另外任何把
       ``traceback.format_exc()`` 当消息参数传入的调用（如 general_exception_handler）同理。
    2. ``exc_info`` 堆栈 —— ``logger.exception(...)`` 会格式化原始异常，而 httpx 的
       HTTPStatusError ``__str__`` 就是含凭据的完整 URL。预先渲染并脱敏到 ``exc_text``，
       ``Formatter.format`` 见 ``exc_text`` 已缓存就不再重跑 ``formatException``，直接用脱敏文本。
       这样既保住排查用的堆栈（不必退化成 logger.error 丢 traceback），又不依赖每个调用点自觉。

    命中才改写；未命中仅走快路正则检查，对绝大多数日志零影响。
    """

    def filter(self, record: logging.LogRecord) -> bool:
        # 1) 消息本体（getMessage() 已将 args 全部完成）
        message = record.getMessage()
        if _URL_CREDENTIAL_RE.search(message):
            record.msg = redact_url_credentials(message)
            record.args = ()
        # 2) 异常堆栈（写入 exc_text 缓存，阻断 Formatter 重跑 formatException）
        if record.exc_info and record.exc_text is None:
            text = _EXCEPTION_FORMATTER.formatException(record.exc_info)
            if _URL_CREDENTIAL_RE.search(text):
                record.exc_text = redact_url_credentials(text)
        return True


_LARGE_BODY_THRESHOLD = 100


def is_sensitive_field(field_name: str) -> bool:
    """检查字段名是否为敏感字段.

    Args:
        field_name: 字段名

    Returns:
        是否为敏感字段

    """
    field_lower = field_name.lower()
    return any(sensitive in field_lower for sensitive in SENSITIVE_FIELDS)


def mask_value(value: Any) -> str:
    """脱敏字段值.

    Args:
        value: 原始值

    Returns:
        脱敏后的字符串表示

    """
    if value is None:
        return "null"

    if isinstance(value, str):
        if len(value) == 0:
            return ""
        if len(value) <= _SHORT_VALUE_THRESHOLD:
            return "***"
        # 显示前3个和后3个字符，中间用***代替
        return f"{value[:3]}***{value[-3:]}"

    # 对于非字符串值，直接返回掩码
    return "***"


def mask_sensitive_data(data: Any, parent_key: str = "") -> Any:
    """递归脱敏敏感数据.

    Args:
        data: 需要脱敏的数据
        parent_key: 父级键名（用于递归时的上下文）

    Returns:
        脱敏后的数据

    Examples:
        >>> mask_sensitive_data({"username": "admin", "password": "secret123"})
        {'username': 'admin', 'password': '***'}
        >>> mask_sensitive_data({"user": {"token": "abc123", "name": "test"}})
        {'user': {'token': '***', 'name': 'test'}}

    """
    if isinstance(data, dict):
        masked = {}
        for key, value in data.items():
            if is_sensitive_field(key):
                masked[key] = mask_value(value)
            elif isinstance(value, dict | list):
                masked[key] = mask_sensitive_data(value, key)
            else:
                masked[key] = value
        return masked

    if isinstance(data, list):
        return [mask_sensitive_data(item, parent_key) for item in data]

    # 基础类型直接返回
    return data


def safe_log_request_body(body: bytes | str | None) -> dict[str, Any] | None:
    """安全地解析和脱敏请求体数据.

    Args:
        body: 原始请求体（bytes 或字符串）

    Returns:
        脱敏后的字典数据，如果解析失败返回 None

    Examples:
        >>> safe_log_request_body(b'{"username": "admin", "password": "secret"}')
        {'username': 'admin', 'password': '***'}

    """
    if not body:
        return None

    try:
        body_str = body.decode("utf-8") if isinstance(body, bytes) else body

        data = json.loads(body_str)

        if isinstance(data, dict):
            return mask_sensitive_data(data)
        # 非字典类型的数据，包装后返回
        return {"data": mask_sensitive_data(data)}

    except (json.JSONDecodeError, UnicodeDecodeError):
        # 解析失败，返回脱敏的原始内容提示
        if isinstance(body, bytes) and len(body) > _LARGE_BODY_THRESHOLD:
            return {"raw_body": f"[Binary data: {len(body)} bytes]"}
        return None


def log_auth_event(
    event_type: str,
    user_id: int | str | None = None,
    client_ip: str | None = None,
    user_agent: str | None = None,
    **extra: object,
) -> None:
    """记录认证事件结构化日志.

    统一认证事件日志入口，事件类型与上下文通过 ``extra`` 携带，
    供日志收集系统按 ``event_type`` 检索与告警。不记录任何敏感数据
    （密码、令牌、密钥等）。

    Args:
        event_type: 事件类型，如 ``login_success`` / ``login_failure`` /
            ``refresh_success`` / ``refresh_failure`` / ``logout`` /
            ``token_invalidated`` / ``api_key_auth_success`` /
            ``api_key_auth_failure`` / ``register_success``.
        user_id: 用户ID，认证失败且无法识别用户时为 None.
        client_ip: 客户端IP.
        user_agent: 客户端 User-Agent.
        **extra: 附加结构化字段（如 ``reason`` / ``username`` / ``key_prefix``），
            禁止传入密码、令牌等敏感值.

    """
    logger.info(
        "auth_event",
        extra={
            "event_type": event_type,
            "user_id": user_id,
            "client_ip": client_ip,
            "user_agent": user_agent,
            **extra,
        },
    )
