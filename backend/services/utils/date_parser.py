"""
日期解析工具函数
"""
from datetime import datetime, date
from typing import Union, Optional


def parse_date_string(date_value: Union[str, datetime, date, None]) -> Optional[datetime]:
    """
    解析日期字符串或日期对象为 datetime 对象

    Args:
        date_value: 日期字符串、datetime 对象、date 对象或 None

    Returns:
        datetime 对象或 None
    """
    if date_value is None:
        return None

    if isinstance(date_value, datetime):
        return date_value

    if isinstance(date_value, date):
        return datetime.combine(date_value, datetime.min.time())

    if isinstance(date_value, str):
        # 尝试多种日期格式
        formats = [
            "%Y-%m-%d",
            "%Y-%m-%d %H:%M:%S",
            "%Y/%m/%d",
            "%Y/%m/%d %H:%M:%S",
            "%d-%m-%Y",
            "%d/%m/%Y",
        ]

        for fmt in formats:
            try:
                return datetime.strptime(date_value.strip(), fmt)
            except ValueError:
                continue

        # 如果都失败了，尝试 ISO 格式
        try:
            return datetime.fromisoformat(date_value.replace('Z', '+00:00'))
        except ValueError:
            pass

    return None
