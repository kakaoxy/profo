"""SalesRecordCreate.record_date 时区归一化测试.

无时区输入必须按 Asia/Shanghai 解析（修复 PG timestamptz 按 UTC 解释
导致小程序列表统一显示 07:59 的问题）；显式带时区的输入原样保留。
"""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from schemas.project.sales import SalesRecordCreate

_CST = ZoneInfo("Asia/Shanghai")


def _make(record_date: datetime | str) -> SalesRecordCreate:
    return SalesRecordCreate(
        record_type="viewing",
        customer_name="张三",
        record_date=record_date,
    )


def test_record_date_naive_gets_shanghai_tz() -> None:
    """字符串 naive 输入按东八区解析."""
    record = _make("2026-08-23T14:30:00")
    assert record.record_date.tzinfo is not None
    assert record.record_date.utcoffset().total_seconds() == 8 * 3600
    assert record.record_date == datetime(2026, 8, 23, 14, 30, tzinfo=_CST)


def test_record_date_naive_datetime_gets_shanghai_tz() -> None:
    """Naive datetime 输入按东八区解析."""
    record = _make(datetime(2026, 8, 23, 14, 30))  # noqa: DTZ001 （naive 输入正是被测场景）
    assert record.record_date == datetime(2026, 8, 23, 14, 30, tzinfo=_CST)


def test_record_date_aware_unchanged() -> None:
    """显式带时区的输入原样保留."""
    aware_utc = datetime(2026, 8, 23, 6, 30, tzinfo=timezone.utc)
    assert _make(aware_utc).record_date == aware_utc

    aware_cst = "2026-08-23T14:30:00+08:00"
    record = _make(aware_cst)
    assert record.record_date.utcoffset().total_seconds() == 8 * 3600
    assert record.record_date.isoformat() == "2026-08-23T14:30:00+08:00"
