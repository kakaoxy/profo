"""校验和归一化（T1.3 / K4 / 风险 R3）。

核心断言两条：
1. **对注释/空行/格式化稳健**：``ruff format`` 或补注释不得阻断启动；
2. **对逻辑敏感**：改常量、改条件、改字符串都必须改变摘要。

⚠️ 额外守住 §15.1 的「假安全」失败模式：所有迁移函数的 checksum 必须长度 64
且互不相同——若 ``inspect.getsource`` 对某类函数失效并返回空串，全部摘要会相等。
"""

import textwrap

import pytest

from migrations.checksum import checksum_of, checksum_of_text, normalize_text
from migrations.registry import MIGRATIONS

_BASE = """
def sample(engine):
    \"\"\"示例迁移说明.\"\"\"
    # 这是一行注释
    if engine is None:
        return
    print("hello")
"""


def test_comment_and_blank_lines_do_not_change_checksum() -> None:
    """注释 / 空行 / 缩进风格改动不改变 checksum（防格式化误报）."""
    reformatted = """
def sample(engine):
    \"\"\"示例迁移说明（文档可改）.\"\"\"
    # 注释也可以改
    if engine is None:

        return
    print("hello")  # 行尾注释
"""
    assert checksum_of_text(_BASE) == checksum_of_text(reformatted)


def test_docstring_change_does_not_change_checksum() -> None:
    """Docstring 属于说明文字，改动不该阻断启动."""
    with_doc = """
def sample(engine):
    \"\"\"完全不同的说明文字.\"\"\"
    print("hello")
"""
    without_doc = """
def sample(engine):
    print("hello")
"""
    assert checksum_of_text(with_doc) == checksum_of_text(without_doc)


@pytest.mark.parametrize(
    "mutated",
    [
        # 改字符串字面量（逻辑变化）
        """
def sample(engine):
    print("world")
""",
        # 改条件（逻辑变化）
        """
def sample(engine):
    if engine is not None:
        return
    print("hello")
""",
        # 改语句顺序（逻辑变化）
        """
def sample(engine):
    print("hello")
    if engine is None:
        return
""",
        # 增加语句（逻辑变化）
        """
def sample(engine):
    if engine is None:
        return
    print("hello")
    print("extra")
""",
    ],
)
def test_logic_change_does_change_checksum(mutated: str) -> None:
    """逻辑改动必须改变 checksum（否则无法阻断源码漂移）."""
    assert checksum_of_text(_BASE) != checksum_of_text(mutated)


def test_checksum_of_real_migration_function() -> None:
    """真实迁移函数：两次调用稳定，且为 64 位 hex."""
    fn = MIGRATIONS[0].fn
    first = checksum_of(fn)
    second = checksum_of(fn)
    assert first == second
    assert len(first) == 64
    assert all(ch in "0123456789abcdef" for ch in first)


def test_all_migration_checksums_unique_and_nonempty() -> None:
    """全部 82 项 checksum 互不相同（守住「getsource 失效导致假安全」）."""
    checksums = {m.version: checksum_of(m.fn) for m in MIGRATIONS}
    assert len(set(checksums.values())) == len(MIGRATIONS), "存在相同 checksum，说明归一化过度或 getsource 失效"
    for version, digest in checksums.items():
        assert len(digest) == 64, f"v{version} checksum 长度异常：{digest!r}"


def test_checksum_raises_for_uninspectable_callable() -> None:
    """无法取源码时必须抛错，不得静默返回空串（假安全防线）."""
    builtin = len  # C 实现，inspect.getsource 会抛 TypeError/OSError
    with pytest.raises((TypeError, OSError)):
        checksum_of(builtin)


def test_normalize_text_is_idempotent() -> None:
    """归一化是幂等的（同文本重复归一化结果不变）."""
    once = normalize_text(_BASE)
    assert normalize_text(_BASE) == once
    assert textwrap.dedent(once) == once
