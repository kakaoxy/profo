"""统计时间窗口工具.

分享漏斗「昨日」维度共用的自然日窗口计算（Asia/Shanghai），
供招募/房源/评估三处 share-stats 统计复用，保证口径一致。
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

_CST = ZoneInfo("Asia/Shanghai")


def yesterday_window() -> tuple[datetime, datetime]:
    """昨日自然日窗口（Asia/Shanghai，timezone-aware）.

    Returns:
        (昨日 00:00:00, 今日 00:00:00)，统计口径左闭右开 [start, end)

    """
    now = datetime.now(_CST)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return today_start - timedelta(days=1), today_start


def cst_today_start() -> datetime:
    """今日自然日起点（Asia/Shanghai 00:00:00，timezone-aware）.

    Returns:
        今日 00:00:00，统计口径左闭右开 [start, ...)

    """
    now = datetime.now(_CST)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
