"""
安全日志工具模块
提供请求体数据脱敏功能，防止敏感信息泄露到日志中
"""
import json
from typing import Any


# 敏感字段列表，这些字段在日志中会被脱敏
SENSITIVE_FIELDS = {
    "password",
    "current_password",
    "new_password",
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
    "credit_card",
    "cvv",
    "ssn",
    "social_security",
}


def is_sensitive_field(field_name: str) -> bool:
    """
    检查字段名是否为敏感字段

    Args:
        field_name: 字段名

    Returns:
        是否为敏感字段
    """
    field_lower = field_name.lower()
    return any(sensitive in field_lower for sensitive in SENSITIVE_FIELDS)


def mask_value(value: Any) -> str:
    """
    脱敏字段值

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
        if len(value) <= 6:
            return "***"
        # 显示前3个和后3个字符，中间用***代替
        return f"{value[:3]}***{value[-3:]}"

    # 对于非字符串值，直接返回掩码
    return "***"


def mask_sensitive_data(data: Any, parent_key: str = "") -> Any:
    """
    递归脱敏敏感数据

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
            elif isinstance(value, (dict, list)):
                masked[key] = mask_sensitive_data(value, key)
            else:
                masked[key] = value
        return masked

    elif isinstance(data, list):
        return [mask_sensitive_data(item, parent_key) for item in data]

    else:
        # 基础类型直接返回
        return data


def safe_log_request_body(body: bytes | str | None) -> dict[str, Any] | None:
    """
    安全地解析和脱敏请求体数据

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
        if isinstance(body, bytes):
            body_str = body.decode('utf-8')
        else:
            body_str = body

        data = json.loads(body_str)

        if isinstance(data, dict):
            return mask_sensitive_data(data)
        else:
            # 非字典类型的数据，包装后返回
            return {"data": mask_sensitive_data(data)}

    except (json.JSONDecodeError, UnicodeDecodeError):
        # 解析失败，返回脱敏的原始内容提示
        if isinstance(body, bytes) and len(body) > 100:
            return {"raw_body": f"[Binary data: {len(body)} bytes]"}
        return None


def safe_log_dict(data: dict[str, Any] | None) -> dict[str, Any] | None:
    """
    安全地记录字典数据（脱敏敏感字段）

    Args:
        data: 原始字典数据

    Returns:
        脱敏后的字典数据
    """
    if data is None:
        return None
    return mask_sensitive_data(data)


def create_safe_log_message(
    message: str,
    data: dict[str, Any] | None = None,
    include_data: bool = True
) -> str:
    """
    创建安全的日志消息

    Args:
        message: 日志消息
        data: 相关数据（会被脱敏）
        include_data: 是否包含数据部分

    Returns:
        格式化后的安全日志消息
    """
    if not include_data or data is None:
        return message

    safe_data = mask_sensitive_data(data)
    try:
        data_str = json.dumps(safe_data, ensure_ascii=False, separators=(',', ':'))
        return f"{message} | data={data_str}"
    except (TypeError, ValueError):
        return f"{message} | data=[无法序列化]"
