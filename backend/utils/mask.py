"""敏感信息脱敏工具."""

_MIN_MASKABLE_LENGTH = 8


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
