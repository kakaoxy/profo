"""parse_comma_separated_list 单元测试."""

from utils.param_parser import parse_comma_separated_list


def test_none_input_returns_none():
    """None 输入返回 None."""
    assert parse_comma_separated_list(None) is None


def test_empty_string_returns_none():
    """空字符串返回 None."""
    assert parse_comma_separated_list("") is None


def test_single_value():
    """单个值 "a" 返回 ["a"]."""
    assert parse_comma_separated_list("a") == ["a"]


def test_multiple_values():
    """多个值 "a,b,c" 返回 ["a","b","c"]."""
    assert parse_comma_separated_list("a,b,c") == ["a", "b", "c"]


def test_whitespace_handling():
    """前后空格被去除: " a , b , c " → ["a","b","c"]."""
    assert parse_comma_separated_list(" a , b , c ") == ["a", "b", "c"]


def test_trailing_comma():
    """尾部逗号被过滤: "a,b," → ["a","b"]."""
    assert parse_comma_separated_list("a,b,") == ["a", "b"]


def test_leading_comma():
    """前导逗号被过滤: ",a,b" → ["a","b"]."""
    assert parse_comma_separated_list(",a,b") == ["a", "b"]


def test_only_commas_returns_empty_list():
    """仅逗号 ",,," 返回空列表（非 None）."""
    result = parse_comma_separated_list(",,,")
    assert result == []


def test_values_with_internal_spaces():
    """值内部空格保留: "hello world,foo bar" → ["hello world","foo bar"]."""
    assert parse_comma_separated_list("hello world,foo bar") == [
        "hello world",
        "foo bar",
    ]


def test_mixed_whitespace_and_commas():
    """混合空格与逗号: "  a  ,  b  ,  " → ["a","b"]."""
    assert parse_comma_separated_list("  a  ,  b  ,  ") == ["a", "b"]
