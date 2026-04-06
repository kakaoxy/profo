"""
日期解析工具模块
提供日期字符串到 datetime 对象的解析功能
"""

from typing import Optional, Union
from datetime import datetime


def parse_date_string(value: Union[str, datetime, None]) -> Optional[datetime]:
    """
    解析日期字符串为 datetime 对象

    支持格式:
        - YYYY-MM-DD (标准日期格式)
        - ISO 格式字符串
        - datetime 对象（直接返回）
        - YYYY-MM-DDTHH:MM:SS.sssZ (UTC格式)

    Args:
        value: 待解析的日期值，可以是字符串、datetime对象或None

    Returns:
        解析后的 datetime 对象，解析失败或输入为None时返回None

    Examples:
        >>> parse_date_string("2024-01-15")
        datetime(2024, 1, 15, 0, 0)
        >>> parse_date_string(datetime.now())
        datetime(2024, 1, 15, 10, 30, 0)
        >>> parse_date_string(None)
        None
    """
    if value is None:
        return None

    if isinstance(value, datetime):
        return value

    if isinstance(value, str):
        # 尝试解析 YYYY-MM-DD 格式
        if len(value) == 10 and value.count('-') == 2:
            try:
                year, month, day = map(int, value.split('-'))
                return datetime(year, month, day)
            except ValueError:
                pass

        # 尝试解析 ISO 格式
        try:
            return datetime.fromisoformat(value.replace('Z', '+00:00').replace('+00:00', ''))
        except ValueError:
            pass

        # 尝试其他格式
        try:
            return datetime.strptime(value, '%Y-%m-%dT%H:%M:%S.%fZ')
        except ValueError:
            pass

    return None
