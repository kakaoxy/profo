"""迁移函数源码校验和（总纲 K4 / K5）。

设计目标：**对逻辑敏感，对注释/空行不敏感**。否则一次 ``ruff format`` 或补一行
注释就会让生产启动被 checksum 阻断（风险 R3）。

归一化步骤：
1. ``inspect.getsource(fn)`` 取源码（失败即抛，不静默返回空串——空串会让所有
   checksum 相等，形成「假安全」，见 §15.1 失败模式表）；
2. ``ast`` 定位**函数/模块 docstring** 的行列范围，从 token 流中剔除；
3. ``tokenize`` 切分，丢弃 ``COMMENT`` / ``NL`` / ``INDENT`` / ``DEDENT`` /
   ``ENCODING`` 及纯空白 token；
4. 用单个空格连接 token 文本 → ``sha256``。

⚠️ token 文本本身包含有意义的大小写与字符串内容，因此字符串字面量、运算符、
容器结构变化都会改变 checksum——这正是期望行为。
"""

import ast
import hashlib
import inspect
import io
import tokenize
from collections.abc import Callable
from typing import Any

# 归一化时丢弃的 token 类型：注释、空行、缩进标记、编码声明
_DROP_TOKEN_TYPES = frozenset(
    {
        tokenize.COMMENT,
        tokenize.NL,
        tokenize.INDENT,
        tokenize.DEDENT,
        tokenize.ENCODING,
    },
)


def normalize_source(fn: Callable[..., Any]) -> str:
    """取函数源码并归一化（去注释、去空行、去 docstring）.

    Args:
        fn: 迁移函数（必须可被 ``inspect.getsource`` 取到源码）。

    Returns:
        归一化后的 token 串（各 token 以单空格分隔）。

    Raises:
        OSError: ``inspect.getsource`` 无法取源码（C 扩展、动态生成函数等）。
            **必须抛出**：静默返回空串会让 checksum 恒等，形成假安全。

    """
    return normalize_text(inspect.getsource(fn))


def normalize_text(source: str) -> str:
    """归一化 Python 源码文本（与 ``normalize_source`` 同算法，供单测直接喂文本）.

    Args:
        source: 函数源码文本。

    Returns:
        归一化后的 token 串。

    """
    docstring_spans = _docstring_spans(source)
    tokens: list[str] = []
    for token in tokenize.generate_tokens(io.StringIO(source).readline):
        if token.type in _DROP_TOKEN_TYPES:
            continue
        if not token.string.strip():
            continue
        if _in_spans(token.start, docstring_spans):
            continue
        tokens.append(token.string)
    return " ".join(tokens).strip()


def _docstring_spans(source: str) -> list[tuple[tuple[int, int], tuple[int, int]]]:
    """解析源码中所有 docstring 的 (start, end) 行列范围.

    Args:
        source: 源码文本。

    Returns:
        docstring 字符串 token 的起止位置列表；源码不可解析时返回空列表
        （不可解析时退化为「只去注释」，不会误判为「全部相同」）。

    """
    try:
        tree = ast.parse(_dedent_for_parse(source))
    except SyntaxError:
        return []
    spans: list[tuple[tuple[int, int], tuple[int, int]]] = []
    for node in ast.walk(tree):
        body = getattr(node, "body", None)
        if not isinstance(body, list) or not body:
            continue
        first = body[0]
        if not isinstance(first, ast.Expr):
            continue
        value = first.value
        if not isinstance(value, ast.Constant) or not isinstance(value.value, str):
            continue
        start = (first.lineno, first.col_offset)
        end = (first.end_lineno or first.lineno, first.end_col_offset or first.col_offset)
        spans.append((start, end))
    return spans


def _dedent_for_parse(source: str) -> str:
    """把可能带前导缩进的函数源码整体去缩进，使其可被 ``ast.parse`` 解析.

    Args:
        source: 可能带缩进的源码文本。

    Returns:
        去掉公共前导缩进的源码。

    """
    lines = source.splitlines()
    indents = [len(line) - len(line.lstrip()) for line in lines if line.strip()]
    cut = min(indents) if indents else 0
    return "\n".join(line[cut:] for line in lines)


def _in_spans(
    position: tuple[int, int],
    spans: list[tuple[tuple[int, int], tuple[int, int]]],
) -> bool:
    """判断 token 起点是否落在任一 docstring 范围内.

    Args:
        position: token 起始 (行, 列)。
        spans: docstring 范围列表。

    Returns:
        落在范围内返回 True。

    """
    return any(start <= position < end for start, end in spans)


def checksum_of(fn: Callable[..., Any]) -> str:
    """计算迁移函数源码的 sha256（64 位小写 hex）.

    Args:
        fn: 迁移函数。

    Returns:
        ``sha256(normalize_source(fn))`` 的十六进制摘要。

    """
    return hashlib.sha256(normalize_source(fn).encode("utf-8")).hexdigest()


def checksum_of_text(source: str) -> str:
    """计算源码文本的 sha256（单测用，等价 ``checksum_of``）.

    Args:
        source: 源码文本。

    Returns:
        十六进制摘要。

    """
    return hashlib.sha256(normalize_text(source).encode("utf-8")).hexdigest()
