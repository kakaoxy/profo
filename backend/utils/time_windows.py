"""统计时间窗口工具.

分享漏斗「今日」维度共用的自然日窗口计算（Asia/Shanghai），
供招募/房源/评估三处 share-stats 统计复用，保证口径一致。
"""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

_CST = ZoneInfo("Asia/Shanghai")


def today_window() -> tuple[datetime, datetime]:
    """今日自然日窗口（Asia/Shanghai，timezone-aware）.

    Returns:
        (今日 00:00:00, 明日 00:00:00)，统计口径左闭右开 [start, end)

    """
    today_start = cst_today_start()
    return today_start, today_start + timedelta(days=1)


def cst_today_start() -> datetime:
    """今日自然日起点（Asia/Shanghai 00:00:00，timezone-aware）.

    Returns:
        今日 00:00:00，统计口径左闭右开 [start, ...)

    """
    now = datetime.now(_CST)
    return now.replace(hour=0, minute=0, second=0, microsecond=0)
