"""安全日志工具模块.

提供请求体数据脱敏功能，防止敏感信息泄露到日志中.
另提供认证事件结构化日志入口 ``log_auth_event``.
"""

import json
import logging
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
