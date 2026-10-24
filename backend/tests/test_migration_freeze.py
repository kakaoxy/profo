"""已发布迁移的 checksum 冻结守护（防「改历史迁移」重复事故）。

**背景**：2026-10-22 ~ 10-24 期间，本项目连续 3 次因同一类失误导致启动失败：

- 给已 applied 的 v17「加一步」，并对**本地**库 ``rebaseline``，
  本地一切正常 → 部署到生产时 ``_verify_checksums`` 阻断 →
  ``deploy-local.sh`` 报「backend 健康状态为 unhealthy（120s 超时）」；
- 反过来，生产被 rebaseline 过、本地没有 → ``dev-start.sh`` 起不来
  （``MigrationBlockedError: 迁移源码校验和不匹配``）。

根因不是某次具体改动，而是**checksum 只存在各环境自己的账本里，缺一个跨环境真源**。
本测试把「已发布到生产」的 checksum 固化为仓库内基线
（``migrations/frozen_checksums.py``），于是任何对历史迁移的改动都会在
**跑 pytest 时就失败**，而不是等到部署。

**正确做法**：需要改行为 → 新增追加迁移（版本号从 ``NEXT_VERSION`` 起）。
"""

from __future__ import annotations

import pytest

from migrations.checksum import checksum_of
from migrations.frozen_checksums import FROZEN_CHECKSUMS, FROZEN_MAX_VERSION
from migrations.registry import MIGRATION_BY_VERSION, MIGRATIONS


def test_frozen_manifest_covers_registry_prefix() -> None:
    """冻结基线必须恰好覆盖 1..FROZEN_MAX_VERSION，且与注册表同名."""
    assert sorted(FROZEN_CHECKSUMS) == list(range(1, FROZEN_MAX_VERSION + 1)), (
        "冻结基线版本号必须从 1 连续到 FROZEN_MAX_VERSION；"
        f"当前缺 {sorted(set(range(1, FROZEN_MAX_VERSION + 1)) - set(FROZEN_CHECKSUMS))}，"
        f"多 {sorted(set(FROZEN_CHECKSUMS) - set(range(1, FROZEN_MAX_VERSION + 1)))}"
    )
    for version, (name, checksum) in FROZEN_CHECKSUMS.items():
        migration = MIGRATION_BY_VERSION.get(version)
        assert migration is not None, f"冻结基线里的 v{version} 在注册表中不存在（禁止删除迁移）"
        assert migration.name == name, f"v{version} 名称漂移：基线={name} 注册表={migration.name}"
        assert len(checksum) == 64, f"v{version} 的基线 checksum 非法：{checksum!r}"


@pytest.mark.parametrize("version", sorted(FROZEN_CHECKSUMS))
def test_published_migration_source_is_frozen(version: int) -> None:
    """已发布的迁移源码 checksum 必须与冻结基线逐字一致（**核心防复发用例**）.

    失败时说明有人改了已经发布到生产的迁移。此时**不要**更新本基线，
    而应把改动写成新的追加迁移——否则部署时生产会因 checksum 不匹配而拒绝启动。
    """
    migration = MIGRATION_BY_VERSION[version]
    frozen_name, frozen_checksum = FROZEN_CHECKSUMS[version]
    actual = checksum_of(migration.fn)
    assert actual == frozen_checksum, (
        f"禁止修改已发布的迁移 v{version} {frozen_name}！\n"
        f"  冻结基线 checksum: {frozen_checksum}\n"
        f"  当前源码 checksum: {actual}\n"
        "  正确做法：把改动写成**新的追加迁移**（version 从 NEXT_VERSION 起），"
        "保留旧函数原样。\n"
        "  若确认是纯重构（无行为变化）且已完成全环境 rebaseline，"
        "才用 python -m migrations.manage freeze "
        f"{version} --reason '...' --confirm 更新基线。"
    )


def test_new_migrations_must_be_appended_not_frozen() -> None:
    """超出冻结上限的迁移必须严格追加（版本号 > FROZEN_MAX_VERSION）."""
    for migration in MIGRATIONS:
        if migration.version > FROZEN_MAX_VERSION:
            assert migration.version > FROZEN_MAX_VERSION, (
                f"v{migration.version} 超出冻结上限却未被登记到冻结基线；新增迁移请勿回填历史版本号"
            )
    # 注册表本身仍要连续（由 test_migration_registry 覆盖，这里只做交叉确认）
    versions = [m.version for m in MIGRATIONS]
    assert versions == sorted(versions)


def test_manifest_parser_covers_every_entry() -> None:
    """``_parse_frozen_entries`` 必须解析出**全部**条目（含 ruff format 折行形态）.

    ⚠️ 这条是回归护栏（2026-10-24 实测踩坑）：``ruff format`` 会把超长条目折成多行，
    本基线 94 条中有 8 条是折行形态。早期解析器只认单行，导致
    ``manage freeze`` 的「改写后校验」把未受影响的折行条目误判为"消失"，
    从而拒绝写入或漏检。
    """
    from pathlib import Path

    from migrations.manage import _parse_frozen_entries

    manifest = Path(__file__).resolve().parent.parent / "migrations" / "frozen_checksums.py"
    parsed = _parse_frozen_entries(manifest.read_text(encoding="utf-8"))
    assert parsed == FROZEN_CHECKSUMS, (
        "解析结果与模块内基线不一致："
        f"缺失={sorted(set(FROZEN_CHECKSUMS) - set(parsed))[:5]}，"
        f"多余={sorted(set(parsed) - set(FROZEN_CHECKSUMS))[:5]}"
    )
    assert len(parsed) == len(FROZEN_CHECKSUMS) == FROZEN_MAX_VERSION


def test_freeze_locate_and_parse_share_one_regex() -> None:
    """``freeze`` 的定位与 ``_parse_frozen_entries`` 的解析必须**行为一致**.

    ⚠️ 回归背景（2026-10-24）：两处原本各写一份正则，实测在「条目末尾缺逗号」时
    定位失败、解析却成功——维护者在手工调整过格式的基线文件上会被 CLI 卡住。
    现改为共用 ``_FROZEN_ENTRY_RE``；本用例锁住「两侧判定一致」，防止再次分叉。
    """
    from migrations.manage import _compile_frozen_entry_pattern, _parse_frozen_entries

    hex_checksum = "721533f386b3a1d727b1118e17f63e21a2b999e69633804d06e450560995fda7"
    candidates = {
        "标准单行": f'    17: ("create_finance_subjects_table", "{hex_checksum}"),',
        "折行": (f'    17: (\n        "create_finance_subjects_table",\n        "{hex_checksum}",\n    ),'),
        "末尾无逗号": f'    17: ("create_finance_subjects_table", "{hex_checksum}")',
        "单引号": f"    17: ('create_finance_subjects_table', '{hex_checksum}'),",
        "Tab缩进": f'\t17: ("create_finance_subjects_table", "{hex_checksum}"),',
    }
    locator = _compile_frozen_entry_pattern(17)
    diverged = []
    for name, source in candidates.items():
        by_locator = bool(locator.search(source))
        by_parser = bool(_parse_frozen_entries(source).get(17))
        if by_locator != by_parser:
            diverged.append(f"{name}(定位={by_locator}, 解析={by_parser})")
    assert not diverged, f"两处正则行为分叉：{diverged}"
