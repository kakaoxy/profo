r"""PostgreSQL 兼容性测试：LIKE 查询转义.

覆盖 Task 4 修复点：
escape_like() 转义 LIKE 模式中的特殊字符（%、_、\\），
配合 escape="\\" 参数使用，防止用户输入注入 LIKE 模式匹配。
"""

from utils.formatters import escape_like


def test_escape_like_percent() -> None:
    r"""百分号应被转义为 \\%."""
    result = escape_like("50%")
    assert "\\%" in result
    assert result == "50\\%"


def test_escape_like_underscore() -> None:
    r"""下划线应被转义为 \\_."""
    result = escape_like("a_b")
    assert "\\_" in result
    assert result == "a\\_b"


def test_escape_like_backslash() -> None:
    r"""反斜杠应被转义为 \\\\."""
    result = escape_like("a\\b")
    assert "\\\\" in result
    assert result == "a\\\\b"


def test_escape_like_normal() -> None:
    """普通字符串（无特殊字符）应保持不变."""
    assert escape_like("hello world") == "hello world"


def test_escape_like_empty() -> None:
    """空字符串应保持不变."""
    assert escape_like("") == ""


def test_escape_like_combined() -> None:
    r"""混合特殊字符应全部转义."""
    result = escape_like("50%_a\\b")
    assert "\\%" in result
    assert "\\_" in result
    assert "\\\\" in result
