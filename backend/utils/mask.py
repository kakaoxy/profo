"""敏感信息脱敏工具."""

_MIN_MASKABLE_LENGTH = 8
# 手机号脱敏最小长度（<7 位原样返回，不足以安全遮蔽）
_MIN_PHONE_MASKABLE_LENGTH = 7
# 身份证号脱敏最小长度（<8 位原样返回，不足以安全遮蔽）
_MIN_ID_CARD_MASKABLE_LENGTH = 8


def mask_bank_card(card_number: str | None) -> str | None:
    """银行卡号脱敏：保留前4后4，中间*替代；长度<=8原样返回；None返回None.

    Args:
        card_number: 原始银行卡号

    Returns:
        脱敏后的银行卡号，或 None

    """
    if card_number is None:
        return None
    if len(card_number) <= _MIN_MASKABLE_LENGTH:
        return card_number
    return card_number[:4] + "*" * (len(card_number) - _MIN_MASKABLE_LENGTH) + card_number[-4:]


def mask_phone(phone: str | None) -> str | None:
    """手机号脱敏：保留前3后4，中间*替代；过短原样返回；None返回None.

    Args:
        phone: 原始手机号

    Returns:
        脱敏后的手机号，或 None

    """
    if phone is None:
        return None
    if len(phone) < _MIN_PHONE_MASKABLE_LENGTH:
        return phone
    return phone[:3] + "*" * (len(phone) - 7) + phone[-4:]


def mask_id_card(id_card: str | None) -> str | None:
    """身份证号脱敏：保留前3后2，其余*替代；过短原样返回；None返回None.

    Args:
        id_card: 原始身份证号

    Returns:
        脱敏后的身份证号，或 None

    """
    if id_card is None:
        return None
    if len(id_card) < _MIN_ID_CARD_MASKABLE_LENGTH:
        return id_card
    return id_card[:3] + "*" * (len(id_card) - 5) + id_card[-2:]
