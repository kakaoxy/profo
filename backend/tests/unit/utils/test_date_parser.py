"""parse_date_string 单元测试."""

from datetime import date, datetime, timezone

import pytest

from services.utils.date_parser import parse_date_string


class TestParseDateStringNone:
    """None 输入返回 None."""

    def test_none_returns_none(self) -> None:
        assert parse_date_string(None) is None


class TestParseDateStringDatetime:
    """datetime 输入原样返回."""

    def test_datetime_returned_as_is(self) -> None:
        dt = datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)
        result = parse_date_string(dt)
        assert result is dt

    def test_naive_datetime_returned_as_is(self) -> None:
        dt = datetime(2024, 1, 15, 10, 30, 0)
        result = parse_date_string(dt)
        assert result is dt


class TestParseDateStringDate:
    """date 输入转换为午夜 datetime."""

    def test_date_converted_to_midnight_datetime(self) -> None:
        d = date(2024, 1, 15)
        result = parse_date_string(d)
        assert result == datetime(2024, 1, 15, 0, 0, 0)

    def test_date_result_is_datetime_instance(self) -> None:
        d = date(2024, 6, 1)
        result = parse_date_string(d)
        assert isinstance(result, datetime)


class TestParseDateStringYmd:
    """字符串 "%Y-%m-%d" 格式."""

    def test_ymd_format(self) -> None:
        result = parse_date_string("2024-01-15")
        assert result == datetime(2024, 1, 15, 0, 0, 0, tzinfo=timezone.utc)

    def test_ymd_has_utc_tzinfo(self) -> None:
        result = parse_date_string("2024-01-15")
        assert result is not None
        assert result.tzinfo == timezone.utc


class TestParseDateStringYmdHms:
    """字符串 "%Y-%m-%d %H:%M:%S" 格式."""

    def test_ymd_hms_format(self) -> None:
        result = parse_date_string("2024-01-15 10:30:00")
        assert result == datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)


class TestParseDateStringSlashYmd:
    """字符串 "%Y/%m/%d" 格式."""

    def test_slash_ymd_format(self) -> None:
        result = parse_date_string("2024/01/15")
        assert result == datetime(2024, 1, 15, 0, 0, 0, tzinfo=timezone.utc)


class TestParseDateStringSlashYmdHms:
    """字符串 "%Y/%m/%d %H:%M:%S" 格式."""

    def test_slash_ymd_hms_format(self) -> None:
        result = parse_date_string("2024/01/15 10:30:00")
        assert result == datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)


class TestParseDateStringDmy:
    """字符串 "%d-%m-%Y" 格式."""

    def test_dmy_dash_format(self) -> None:
        result = parse_date_string("15-01-2024")
        assert result == datetime(2024, 1, 15, 0, 0, 0, tzinfo=timezone.utc)


class TestParseDateStringSlashDmy:
    """字符串 "%d/%m/%Y" 格式."""

    def test_dmy_slash_format(self) -> None:
        result = parse_date_string("15/01/2024")
        assert result == datetime(2024, 1, 15, 0, 0, 0, tzinfo=timezone.utc)


class TestParseDateStringIso:
    """ISO 格式解析."""

    def test_iso_with_z(self) -> None:
        result = parse_date_string("2024-01-15T10:30:00Z")
        assert result == datetime(2024, 1, 15, 10, 30, 0, tzinfo=timezone.utc)

    def test_iso_with_timezone_offset(self) -> None:
        result = parse_date_string("2024-01-15T10:30:00+08:00")
        assert result is not None
        assert result.year == 2024
        assert result.month == 1
        assert result.day == 15
        assert result.hour == 10
        assert result.minute == 30


class TestParseDateStringInvalid:
    """无效输入返回 None."""

    def test_invalid_string_returns_none(self) -> None:
        assert parse_date_string("not-a-date") is None

    def test_empty_string_returns_none(self) -> None:
        assert parse_date_string("") is None


class TestParseDateStringWhitespace:
    """带空白字符的字符串."""

    def test_leading_trailing_whitespace(self) -> None:
        result = parse_date_string("  2024-01-15  ")
        assert result == datetime(2024, 1, 15, 0, 0, 0, tzinfo=timezone.utc)
