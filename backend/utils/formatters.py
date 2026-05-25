"""通用格式化工具函数."""

_MIN_PHONE_LENGTH = 7


def mask_phone(phone: str | None) -> str | None:
    """手机号脱敏，保留前3位和后4位.

    Args:
        phone: 原始手机号

    Returns:
        脱敏后的手机号，如果输入无效返回原值

    """
    if not phone or len(phone) < _MIN_PHONE_LENGTH:
        return phone
    return phone[:3] + "****" + phone[-4:]


def escape_like(value: str) -> str:
    """转义 LIKE 查询中的特殊字符.

    Args:
        value: 待转义的字符串

    Returns:
        转义后的字符串

    """
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
