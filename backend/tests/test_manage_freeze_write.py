"""`manage freeze` 落盘安全性测试（在**副本**上跑，绝不触碰仓库文件）。

覆盖四项断言（对应 2026-10-24 评审要求）：

1. **落盘语法校验**：对副本执行完整 ``cmd_freeze`` 后，用 ``ast.parse`` 确认语法正确，
   并经 ``importlib`` 实际导入，确认模块可用、条目数与改写前一致。
2. **双逗号断言**：改写后不出现 ``,,`` / `, )`` 等畸形分隔符；目标版本行形如
   ``    17: ("name", "<64hex>"),``。
3. **幂等性**：对同一版本连续执行两次，第二次检测到「与基线一致」并**保持文件字节不变**
   （可捕获尾随逗号累积）。
4. **仅目标版本变化**：改写前后分别用 ``_parse_frozen_entries`` 解析并 diff，
   断言变化集合恰为 ``{目标版本}``。

设计约束：
- 全程使用 ``tmp_path`` 副本 + ``--manifest`` 注入路径，真实 ``frozen_checksums.py``
  的 mtime/内容在测试前后必须完全一致（用例最后会断言这一点）。
- 为使 ``freeze`` 真的发生改写，需要「源码 checksum ≠ 副本里的基线值」。做法是把副本里
  目标版本的 checksum 改成一个**合法但不同**的 64 位 hex，于是 ``actual``（源码真实值）
  与之不等，触发写入。
"""

from __future__ import annotations

import argparse
import ast
import hashlib
import importlib.util
import re
import shutil
import sys
from pathlib import Path

import pytest

from migrations.checksum import checksum_of
from migrations.manage import (
    EXIT_OK,
    _parse_frozen_entries,
    cmd_freeze,
)
from migrations.registry import MIGRATION_BY_VERSION

_REPO_MANIFEST = Path(__file__).resolve().parent.parent / "migrations" / "frozen_checksums.py"

# 合法但（几乎必然）不同于源码的 64 位 hex，用于制造「需要更新」的前提
_STALE_CHECKSUM = "0" * 64


def _make_args(version: int, manifest: Path, *, confirm: bool = True) -> argparse.Namespace:
    """构造 ``cmd_freeze`` 需要的 argparse 命名空间."""
    return argparse.Namespace(
        version=str(version),
        reason="pytest: freeze 落盘安全性测试",
        confirm=confirm,
        manifest=str(manifest),
    )


def _stale_copy(tmp_path: Path, version: int) -> Path:
    """把真实基线复制到 tmp，并把 ``version`` 的 checksum 改成一个合法但不同的值."""
    copy = tmp_path / "frozen_checksums.py"
    shutil.copyfile(_REPO_MANIFEST, copy)
    text = copy.read_text(encoding="utf-8")
    frozen_name, _real = _parse_frozen_entries(text)[version]
    pattern = re.compile(
        rf'(^\s*{version}: \([ \t]*\n?[ \t]*"{re.escape(frozen_name)}"[ \t]*,[ \t]*\n?[ \t]*")'
        r"([0-9a-f]{64})",
        re.MULTILINE,
    )
    assert pattern.search(text), f"副本里未找到 v{version} 条目"
    copy.write_text(pattern.sub(lambda m: m.group(1) + _STALE_CHECKSUM, text, count=1), encoding="utf-8")
    return copy


def _import_manifest(path: Path, module_name: str) -> dict[str, object]:
    """用 importlib 从指定路径真实导入模块，返回其命名空间（断言「可导入」）."""
    spec = importlib.util.spec_from_file_location(module_name, path)
    assert spec is not None
    assert spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[module_name] = module
    try:
        spec.loader.exec_module(module)
    finally:
        sys.modules.pop(module_name, None)
    return vars(module)


@pytest.fixture
def repo_manifest_guard() -> object:
    """确保测试期间真实基线文件不被改动（前后内容/哈希一致）."""
    before = _REPO_MANIFEST.read_bytes()
    digest_before = hashlib.sha256(before).hexdigest()
    yield
    after = _REPO_MANIFEST.read_bytes()
    assert after == before, "真实 frozen_checksums.py 被测试改动了！"
    assert hashlib.sha256(after).hexdigest() == digest_before


@pytest.mark.parametrize("version", [17, 27, 94])
def test_freeze_output_is_valid_python(tmp_path: Path, repo_manifest_guard: object, version: int) -> None:
    """① 落盘语法校验：ast.parse + importlib 导入都必须成功.

    覆盖单行（17/94）与折行（27）两种条目形态。
    """
    copy = _stale_copy(tmp_path, version)
    expected_entries = len(_parse_frozen_entries(copy.read_text(encoding="utf-8")))

    assert cmd_freeze(_make_args(version, copy)) == EXIT_OK

    updated_text = copy.read_text(encoding="utf-8")
    # ast.parse：语法必须合法
    ast.parse(updated_text)

    # importlib：真实导入后条目数不变、目标版本等于源码 checksum
    ns = _import_manifest(copy, f"_frozen_probe_{version}")
    frozen: dict[int, tuple[str, str]] = ns["FROZEN_CHECKSUMS"]  # type: ignore[assignment]
    assert len(frozen) == expected_entries, "改写后条目数变化"
    assert frozen[version][1] == checksum_of(MIGRATION_BY_VERSION[version].fn)


@pytest.mark.parametrize("version", [17, 27])
def test_no_malformed_delimiters(tmp_path: Path, repo_manifest_guard: object, version: int) -> None:
    """② 双逗号断言：不得出现 ``,,`` / `, )`` 等畸形分隔符，且目标行格式正确."""
    copy = _stale_copy(tmp_path, version)
    assert cmd_freeze(_make_args(version, copy)) == EXIT_OK
    text = copy.read_text(encoding="utf-8")

    # 只在「同一行」内检查畸形分隔符：折行条目本身形如 ``,\n    ),`` 是合法的。
    assert ",," not in text, "出现双逗号 `,,`"
    for lineno, line in enumerate(text.splitlines(), 1):
        assert not re.search(r",[ \t]*,", line), f"第 {lineno} 行出现 `, ,`：{line!r}"
        assert not re.search(r",[ \t]*\)", line), f"第 {lineno} 行出现 `, )`：{line!r}"
        assert not re.search(r"\([ \t]*,", line), f"第 {lineno} 行出现 `( ,`：{line!r}"

    frozen_name = _parse_frozen_entries(text)[version][0]
    actual = checksum_of(MIGRATION_BY_VERSION[version].fn)
    # 目标版本行（改写后统一为单行形态）
    expected_line = f'    {version}: ("{frozen_name}", "{actual}"),'
    assert expected_line in text, f"目标行格式不符，期望：{expected_line}"


@pytest.mark.parametrize("version", [17, 27, 94])
def test_freeze_is_idempotent(tmp_path: Path, repo_manifest_guard: object, version: int) -> None:
    """③ 幂等性：连续两次执行，第二次应「与基线一致」并保持内容**逐字节**不变."""
    copy = _stale_copy(tmp_path, version)

    assert cmd_freeze(_make_args(version, copy)) == EXIT_OK
    after_first = copy.read_bytes()
    # 前提：副本已把 stale 值改写成源码真实值（否则本用例无意义，skip 而非误报）
    real = checksum_of(MIGRATION_BY_VERSION[version].fn)
    if _parse_frozen_entries(after_first.decode("utf-8"))[version][1] != real:
        pytest.skip("无法构造改写前提（stale 值等于源码 checksum）")

    assert cmd_freeze(_make_args(version, copy)) == EXIT_OK
    after_second = copy.read_bytes()

    assert after_second == after_first, "第二次执行改动了文件（幂等性破坏，可能是尾随逗号累积）"
    # 额外断言：没有尾随逗号累积 / 畸形分隔符
    assert ",," not in after_second.decode("utf-8")


@pytest.mark.parametrize("version", [17, 27, 94])
def test_only_target_version_changes(tmp_path: Path, repo_manifest_guard: object, version: int) -> None:
    """④ 仅目标版本变化：改写前后解析 diff，差异集合恰为 ``{version}``."""
    copy = _stale_copy(tmp_path, version)
    before = _parse_frozen_entries(copy.read_text(encoding="utf-8"))

    assert cmd_freeze(_make_args(version, copy)) == EXIT_OK

    after = _parse_frozen_entries(copy.read_text(encoding="utf-8"))
    changed = {v for v in set(before) | set(after) if before.get(v) != after.get(v)}
    assert changed == {version}, f"受影响版本应为 {{{version}}}，实际 {sorted(changed)}"
    # 未受影响版本的键集合必须完全一致
    assert set(before) == set(after)


def test_freeze_refuses_without_confirm_and_leaves_file_untouched(
    tmp_path: Path,
    repo_manifest_guard: object,
) -> None:
    """补充：未加 ``--confirm`` 时必须拒绝，且副本内容保持不变."""
    from migrations.manage import EXIT_REFUSED

    copy = _stale_copy(tmp_path, 17)
    before = copy.read_bytes()
    assert cmd_freeze(_make_args(17, copy, confirm=False)) == EXIT_REFUSED
    assert copy.read_bytes() == before, "拒绝路径不应写文件"


def test_freeze_rejects_missing_manifest(repo_manifest_guard: object, tmp_path: Path) -> None:
    """补充：``--manifest`` 指向不存在文件时 Fail Loud（不静默改真实文件）."""
    from migrations.manage import EXIT_REFUSED

    ghost = tmp_path / "nope.py"
    assert cmd_freeze(_make_args(17, ghost)) == EXIT_REFUSED


def _drop_entry(tmp_path: Path, version: int, name: str) -> Path:
    """复制真实基线并删除指定版本条目（构造「与仓库不同步的副本」）."""
    copy = tmp_path / f"frozen_drop_{version}.py"
    text = _REPO_MANIFEST.read_text(encoding="utf-8")
    entry = _parse_frozen_entries(text)[version]
    assert entry[0] == name
    lines = [ln for ln in text.splitlines(keepends=True) if not ln.startswith(f"    {version}: (")]
    result = "".join(lines)
    assert f'"{name}"' not in result
    copy.write_text(result, encoding="utf-8")
    return copy


def test_freeze_upper_limit_comes_from_manifest_not_module(
    tmp_path: Path,
    repo_manifest_guard: object,
) -> None:
    """⑤ 同源上限：落后副本（缺尾部条目）必须按**副本自身**上限拒绝.

    ⚠️ 回归背景（2026-10-24）：上限判断曾读模块常量 FROZEN_MAX_VERSION（=仓库真实值），
    条目判断读 --manifest 副本。副本落后一步（如缺 v94）时，门槛用 94 放行、
    条目查找却按副本失败，同一函数内两个数据源结论互相矛盾。
    现在上限 = ``max(_parse_frozen_entries(副本))``，与条目/当前值完全同源。
    """
    from migrations.manage import EXIT_REFUSED

    max_version = max(_parse_frozen_entries(_REPO_MANIFEST.read_text(encoding="utf-8")))
    latest_name = _parse_frozen_entries(_REPO_MANIFEST.read_text(encoding="utf-8"))[max_version][0]
    lagging = _drop_entry(tmp_path, max_version, latest_name)

    # 对「缺最新条目」的副本 freeze 该版本：应被副本自身上限拒绝（EXIT_REFUSED），
    # 而不是漏到条目查找才报 EXIT_PROBLEM，更不是被模块常量放行。
    before = lagging.read_bytes()
    assert cmd_freeze(_make_args(max_version, lagging)) == EXIT_REFUSED
    assert lagging.read_bytes() == before, "拒绝路径不得写文件"


def test_freeze_detects_manifest_gap(
    tmp_path: Path,
    repo_manifest_guard: object,
) -> None:
    """⑥ 副本中间空洞：上限够但条目缺失 → EXIT_PROBLEM（区别于超限拒绝）."""
    from migrations.manage import EXIT_PROBLEM

    gap = _drop_entry(tmp_path, 50, "backfill_lead_unit_price")
    assert cmd_freeze(_make_args(50, gap)) == EXIT_PROBLEM
