"""迁移注册表不变量（T1.2 / spec §5.2）。

**为什么用 AST 而不是直接 import 旧函数**：``migrations/__init__.py::_run_all_migrations``
是「权威迁移顺序」的第二副本（legacy 路径，保留 1 个 release）。若只比较 import 后的
函数对象，无法发现「调用了但没登记」的新增项，也无法发现「顺序被调换」——两者都会
让上线顺序与历史环境产生分歧。因此解析源码文本、按出现顺序取函数名再逐项比对。

同时用 AST 扫一遍 ``migrations/`` 下的函数定义，拦截「新增迁移函数未登记」（§15.1
最后一行失败模式：新迁移忘记登记 → 代码上了但表没建，静默）。
"""

import ast
import re
from pathlib import Path

import pytest

from migrations.registry import (
    LEGACY_MIGRATION_NAMES,
    MIGRATION_BY_NAME,
    MIGRATION_BY_VERSION,
    MIGRATIONS,
    NEXT_VERSION,
    Migration,
)

_MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
_NAME_PATTERN = re.compile(r"^[a-z][a-z0-9_]{2,199}$")

# 非迁移函数白名单：辅助函数 / 常量 / 查询脚本。
# 每项必须写明「为什么不是迁移」——没理由的一律不加（Fail Loud）。
_NOT_A_MIGRATION: frozenset[str] = frozenset(
    {
        # ---- migrations/__init__.py ----
        "run_startup_migrations",
        "_run_all_migrations",
        # ---- _helpers.py ----
        "_pg_quote_literal",
        "_column_exists",
        "_column_default",
        "_index_exists",
        # ---- _schema_columns.py ----
        # _drop_column_if_exists 为薄封装，被 v9/v10 的迁移函数调用
        "_drop_column_if_exists",
        # ---- fix_image_urls.py ----
        # 内部 helper（分表处理 URL 改写），由 run_fix_image_urls 编排
        "_fix_simple_urls",
        "_fix_media_urls",
        # ---- _finance.py ----
        "_sync_enum_values",
        # ---- _type_migrations.py ----
        "_iter_model_datetime_columns",
        "_iter_model_uuid_columns",
        # ---- _permission_system.py ----
        "_ensure_permission_seed",
        # ---- _recruit.py ----
        "_ensure_phone_hash_unique",
        "_ensure_qr_scene_indexes",
        # ---- _keys.py ----
        "_ensure_key_indexes",
        # ---- _marketing_notify.py ----
        # wrapper 内部子步骤（K2：不单列，随父项回滚）
        "add_last_subscribed_at_to_project_subscriptions",
        "add_cancelled_at_to_project_subscriptions",
        # ---- _building_dictionary.py ----
        "_add_column",
        "_create_bd_tables",
        # ---- _bd_audit_20261018_fixes.py ----
        # 内部步骤函数，由 run_bd_audit_20261018_fixes 编排（分别对应 P1/H2/H3/L3）
        "reconcile_room_count",
        "backfill_pending_building_community",
        "close_orphan_pending_references",
        "null_invalid_coordinates",
        # ---- migrate_uploads_to_oss.py ----
        # 带外脚本入口（本地文件批量上传 OSS / 模块 __main__ 包装），不是启动迁移；
        # 启动迁移只做 DB URL 改写（见该模块 docstring「执行时机」）
        "upload_local_files_to_oss",
        "run_out_of_band_migration",
    },
)

# 非迁移模块（辅助/编排/脚本），不参与「未登记函数」扫描
_NON_MIGRATION_MODULES: frozenset[str] = frozenset(
    {
        "__init__.py",
        "_helpers.py",
        "_seeds.py",
        "_seeds_subjects.py",
        "_biz_dicts.py",
        "checksum.py",
        "runner.py",
        "backup.py",
        "manage.py",
        "registry.py",
        "schema_migrations.py",
    },
)


def _legacy_call_names() -> list[str]:
    """解析 ``_run_all_migrations`` 源码，按出现顺序取 ``fn(engine)`` 调用名.

    函数体整体包在 ``try: ... except: raise`` 中（Fail Loud），因此需要展开
    ``ast.Try`` 的 ``body``；``ast.walk`` 会丢失源码顺序，故手工顺序遍历。
    """
    source = (_MIGRATIONS_DIR / "__init__.py").read_text(encoding="utf-8")
    tree = ast.parse(source)
    for node in tree.body:
        if isinstance(node, ast.FunctionDef) and node.name == "_run_all_migrations":
            return _collect_calls(node.body)
    msg = "未找到 _run_all_migrations（legacy 路径必须保留 1 个 release）"
    raise AssertionError(msg)


def _collect_calls(body: list[ast.stmt]) -> list[str]:
    """按源码顺序收集语句块中的 ``fn(engine)`` 调用名（递归展开 try/finally）."""
    names: list[str] = []
    for stmt in body:
        if isinstance(stmt, ast.Try):
            names.extend(_collect_calls(stmt.body))
            names.extend(_collect_calls(stmt.finalbody))
            continue
        if isinstance(stmt, ast.If):
            names.extend(_collect_calls(stmt.body))
            names.extend(_collect_calls(stmt.orelse))
            continue
        if isinstance(stmt, ast.Expr) and isinstance(stmt.value, ast.Call):
            call = stmt.value
            if not isinstance(call.func, ast.Name):
                continue
            if len(call.args) != 1 or not isinstance(call.args[0], ast.Name):
                continue
            names.append(call.func.id)
    return names


def test_registry_versions_contiguous() -> None:
    """Version 必须严格 1..N 连续无缺口（K1）."""
    versions = [m.version for m in MIGRATIONS]
    assert versions == sorted(versions), "MIGRATIONS 必须按 version 升序排列"
    assert versions == list(range(1, len(MIGRATIONS) + 1)), f"版本不连续：{versions}"
    assert len(MIGRATION_BY_VERSION) == len(MIGRATIONS)


def test_registry_matches_legacy_order() -> None:
    """登记顺序必须与旧 ``_run_all_migrations`` 逐项相同（防上线顺序变化）."""
    legacy = _legacy_call_names()
    registered = [m.name for m in MIGRATIONS]
    assert legacy == registered, (
        "注册表顺序与 legacy 路径不一致：\n"
        f"  仅在 legacy 中：{sorted(set(legacy) - set(registered))}\n"
        f"  仅在注册表中：{sorted(set(registered) - set(legacy))}\n"
        f"  顺序差异位置：{[i for i, (a, b) in enumerate(zip(legacy, registered, strict=True)) if a != b][:5]}"
    )
    assert tuple(registered) == LEGACY_MIGRATION_NAMES


def test_registry_names_unique() -> None:
    """Name 全局唯一且符合命名约定."""
    names = [m.name for m in MIGRATIONS]
    assert len(set(names)) == len(names), "存在重复 name"
    for name in names:
        assert _NAME_PATTERN.match(name), f"name 不符合 {_NAME_PATTERN.pattern}: {name}"
    assert len(MIGRATION_BY_NAME) == len(MIGRATIONS)


def test_registry_append_only() -> None:
    """NEXT_VERSION 必须大于所有已登记版本（禁止回填空号 / 复用历史号）."""
    assert max(m.version for m in MIGRATIONS) + 1 == NEXT_VERSION
    assert NEXT_VERSION > 82, "新增迁移必须从 83 起（总纲 §1 B8）"


def test_registry_metadata_self_check() -> None:
    """``Migration.__post_init__`` 三项自检必须真的拦得住（不是仅写在文档里）."""
    with pytest.raises(ValueError, match="backup_tables"):
        Migration(
            version=900,
            name="bad_backup_table",
            fn=_noop,
            kind="schema",
            risk="A",
            backup="table",
            reversible=True,
        )
    with pytest.raises(ValueError, match="不得声明 reversible"):
        Migration(
            version=901,
            name="bad_reversible",
            fn=_noop,
            kind="schema",
            risk="C",
            backup="table",
            reversible=True,
            backup_tables=("users",),
        )
    with pytest.raises(ValueError, match="必须备份"):
        Migration(
            version=902,
            name="bad_no_backup",
            fn=_noop,
            kind="schema",
            risk="C",
            backup="none",
            reversible=False,
        )
    with pytest.raises(ValueError, match="数据类迁移"):
        Migration(
            version=903,
            name="bad_data_reversible",
            fn=_noop,
            kind="data",
            risk="B",
            backup="none",
            reversible=True,
        )


def test_compensation_modules_importable() -> None:
    """每个非空 ``compensation`` 必须能导入并暴露 ``compensate``（§5.2）."""
    import importlib

    for migration in MIGRATIONS:
        if not migration.compensation:
            continue
        module = importlib.import_module(f"migrations.compensations.{migration.compensation}")
        assert callable(getattr(module, "compensate", None)), (
            f"v{migration.version} 的补偿模块 {migration.compensation} 未暴露 compensate(conn, ctx)"
        )


def test_compensation_registry_covers_declared_scripts() -> None:
    """``compensations/registry.py`` 的实脚本登记必须与注册表 ``compensation`` 字段一致."""
    from migrations.compensations.registry import SCRIPT_MODULES

    declared = {m.version: m.compensation for m in MIGRATIONS if m.compensation}
    importable = {version: module.rsplit(".", 1)[-1] for version, module in SCRIPT_MODULES.items()}
    assert declared == importable, (
        f"实脚本登记不一致：注册表独有={declared.items() - importable.items()} "
        f"脚本表独有={importable.items() - declared.items()}"
    )


def test_no_unregistered_migration_callables() -> None:
    """``migrations/`` 下所有 ``*_migrations``/迁移型函数必须已登记（§15.1 未登记检测）.

    启发式：模块（除辅助/编排文件外）内定义的顶层函数，若名字在
    ``MIGRATIONS``/``_NOT_A_MIGRATION`` 中都找不到，即视为「疑似未登记」。
    """
    registered = {m.name for m in MIGRATIONS}
    problems: list[str] = []
    for path in sorted(_MIGRATIONS_DIR.glob("*.py")):
        if path.name in _NON_MIGRATION_MODULES:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in tree.body:
            if not isinstance(node, ast.FunctionDef):
                continue
            if node.name in registered or node.name in _NOT_A_MIGRATION:
                continue
            # 单下划线开头视为模块内部 helper（迁移函数一律公开命名）
            if node.name.startswith("_"):
                continue
            problems.append(f"{path.name}::{node.name}")
    assert not problems, "以下函数定义在迁移模块中但未登记到 registry（新增迁移必须追加登记）：\n  " + "\n  ".join(
        problems
    )


def test_non_migration_modules_whitelist_is_reasonable() -> None:
    """``_NON_MIGRATION_MODULES`` 中的每个文件都必须真实存在（防失效白名单）."""
    missing = [name for name in _NON_MIGRATION_MODULES if not (_MIGRATIONS_DIR / name).is_file()]
    assert not missing, f"白名单里的文件已不存在：{missing}"


def _noop(engine: object) -> None:
    """测试桩（不执行任何迁移）."""
