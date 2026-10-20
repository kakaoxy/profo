"""备份模块（T1.5 / K9–K14 / D-02）。

覆盖点（对齐 spec §13.1 ``test_migration_backup.py``）：
- 命令构造**不含密码**（密码只走 ``PGPASSWORD`` 环境变量）；
- 0 字节 / 非零退出 / 超时 → ``BackupError``（调用方据此中止迁移）；
- ``sha256`` 与文件内容一致；
- ``prune`` 不删最新 1 份，且「天数与份数同时超限」才删；
- 磁盘余量不足时拒绝。

⚠️ 真实 ``pg_dump`` 调用在 ``tests/e2e/test_migration_runner.py`` 覆盖；本文件用
临时目录 + 桩替代，保证在无 PG 客户端的 CI 机器上也能跑（不静默跳过）。
"""

import hashlib
import os
import subprocess
from pathlib import Path
from typing import Any

import pytest
from sqlalchemy.engine import Engine, make_url

from migrations import backup as backup_module
from migrations.backup import (
    BackupError,
    BackupResult,
    build_dump_command,
    create_backup,
    disk_free_mb,
    ensure_backup_dir,
    list_backups,
    prune_backups,
    prune_with_settings,
    resolve_pg_dump,
    verify_backup_file,
)
from settings import settings

_DUMP_CONTENT = b"PGDMP-fake-dump-bytes-for-tests"
# 桩 pg_dump 报告的版本：必须 >= 服务端主版本，否则 assert_client_compatible 会拒绝
_STUB_VERSION = "18.6"
# 仅用于构造 argv 的占位输出路径（不会真正写入）
_OUT_PATH = Path("build") / "x.dump"


@pytest.fixture
def backup_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """把备份目录指向临时目录（不污染仓库 ``backups/``）."""
    target = tmp_path / "migrations"
    monkeypatch.setattr(settings, "migration_backup_dir", str(target))
    return target


@pytest.fixture
def stub_pg_dump(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    """桩 pg_dump：按 ``--file`` 参数写出固定内容，返回 0.

    这样能在不安装 PostgreSQL 客户端的环境里验证「临时文件 → 校验 → 原子改名」全链路。
    """
    fake = tmp_path / "fake-pg_dump"
    fake.write_text(
        "#!/usr/bin/env python3\n"
        "import sys\n"
        "from pathlib import Path\n"
        "if '--version' in sys.argv:\n"
        f"    print('pg_dump (PostgreSQL) {_STUB_VERSION}')\n"
        "    sys.exit(0)\n"
        "args = sys.argv\n"
        "out = Path(args[args.index('--file') + 1])\n"
        f"out.write_bytes({_DUMP_CONTENT!r})\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    monkeypatch.setattr(settings, "migration_pg_dump_path", str(fake))
    return fake


# ---------------------------------------------------------------------------
# 命令构造
# ---------------------------------------------------------------------------


def test_build_dump_command_has_no_password() -> None:
    """命令行参数不得包含密码（ps 可见）；密码只经 PGPASSWORD 传入."""
    password = "s3cr3t-pa55word"
    url = f"postgresql+psycopg://user:{password}@dbhost:5432/profodb"
    cmd = build_dump_command(
        pg_dump_path="/usr/bin/pg_dump",
        database_url=url,
        out_path=_OUT_PATH,
        scope="full",
    )
    joined = " ".join(cmd)
    assert password not in joined
    assert "--dbname" in cmd
    assert cmd[cmd.index("--dbname") + 1] == "profodb"
    assert cmd[cmd.index("--host") + 1] == "dbhost"
    assert cmd[cmd.index("--port") + 1] == "5432"


def test_build_dump_command_table_scope() -> None:
    """``scope=table`` → ``--data-only`` + 每表一个 ``--table public.<t>``."""
    cmd = build_dump_command(
        pg_dump_path="pg_dump",
        database_url="postgresql+psycopg://u:p@h:5432/d",
        out_path=_OUT_PATH,
        scope="table",
        tables=("users", "leads"),
    )
    assert "--data-only" in cmd
    tables = [cmd[i + 1] for i, token in enumerate(cmd) if token == "--table"]
    assert tables == ["public.users", "public.leads"]


def test_build_dump_command_table_scope_requires_tables() -> None:
    """``scope=table`` 未给表 → 立即报错（不生成错误的空备份命令）."""
    with pytest.raises(BackupError, match="必须提供 tables"):
        build_dump_command(
            pg_dump_path="pg_dump",
            database_url="postgresql+psycopg://u:p@h:5432/d",
            out_path=_OUT_PATH,
            scope="table",
        )


def test_build_dump_command_accepts_url_object() -> None:
    """传 ``URL`` 对象与传字符串等价（且不会把密码渲染成 ``***``）."""
    url = make_url("postgresql+psycopg://u:p@h:5432/d")
    cmd = build_dump_command(
        pg_dump_path="pg_dump",
        database_url=url,
        out_path=_OUT_PATH,
        scope="full",
    )
    assert cmd[cmd.index("--dbname") + 1] == "d"
    assert "***" not in " ".join(cmd)


# ---------------------------------------------------------------------------
# pg_dump 发现（K9）
# ---------------------------------------------------------------------------


def test_resolve_pg_dump_raises_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    """未配置且 PATH 无 pg_dump → RuntimeError 语义（不静默跳过备份）."""
    monkeypatch.setattr(settings, "migration_pg_dump_path", "")
    monkeypatch.setattr(backup_module.shutil, "which", lambda _name: None)
    with pytest.raises(BackupError, match="未找到 pg_dump"):
        resolve_pg_dump()


def test_resolve_pg_dump_rejects_non_executable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """``MIGRATION_PG_DUMP_PATH`` 指向不可执行文件 → 报错并说明路径."""
    bad = tmp_path / "not-executable"
    bad.write_text("x", encoding="utf-8")
    bad.chmod(0o644)
    monkeypatch.setattr(settings, "migration_pg_dump_path", str(bad))
    with pytest.raises(BackupError, match="不可执行"):
        resolve_pg_dump()


# ---------------------------------------------------------------------------
# create_backup 全链路（桩 pg_dump）
# ---------------------------------------------------------------------------


def test_create_backup_writes_sha256_and_naming(
    backup_dir: Path,
    stub_pg_dump: Path,
    test_engine: Engine,
) -> None:
    """备份成功：文件名含版本与迁移名、sha256 与内容一致、文件权限 0600."""
    result = create_backup(test_engine, version=49, name="backfill_lead_unit_price", scope="table", tables=("leads",))

    assert isinstance(result, BackupResult)
    path = Path(result.path)
    assert path.is_file()
    assert path.parent == backup_dir
    assert "v049_backfill_lead_unit_price.dump" in path.name
    assert result.sha256 == hashlib.sha256(_DUMP_CONTENT).hexdigest()
    assert result.size_bytes == len(_DUMP_CONTENT)
    assert (path.stat().st_mode & 0o777) == 0o600
    assert (backup_dir.stat().st_mode & 0o777) == 0o700


def test_create_backup_rejects_zero_byte_output(
    backup_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """0 字节 → BackupError（半成品备份不得进入审计链）."""
    fake = tmp_path / "empty-pg_dump"
    fake.write_text(
        "#!/usr/bin/env python3\nimport sys\nfrom pathlib import Path\n"
        "if '--version' in sys.argv:\n"
        f"    print('pg_dump (PostgreSQL) {_STUB_VERSION}')\n"
        "    sys.exit(0)\n"
        "args = sys.argv\nPath(args[args.index('--file') + 1]).write_bytes(b'')\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    monkeypatch.setattr(settings, "migration_pg_dump_path", str(fake))

    with pytest.raises(BackupError, match="0 字节"):
        create_backup(test_engine, version=3, name="encrypt_existing_phones", scope="table", tables=("users",))
    assert list_backups() == [], "失败的备份不得留下任何 .dump 文件"


def test_create_backup_propagates_nonzero_exit(
    backup_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """非零退出 → BackupError，且错误含 exit code 与 stderr 摘录."""
    fake = tmp_path / "failing-pg_dump"
    fake.write_text(
        "#!/usr/bin/env python3\nimport sys\n"
        "if '--version' in sys.argv:\n"
        f"    print('pg_dump (PostgreSQL) {_STUB_VERSION}')\n"
        "    sys.exit(0)\n"
        "sys.stderr.write('boom: connection refused\\n')\nsys.exit(3)\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    monkeypatch.setattr(settings, "migration_pg_dump_path", str(fake))

    with pytest.raises(BackupError, match="exit=3") as excinfo:
        create_backup(test_engine, version=3, name="encrypt_existing_phones", scope="table", tables=("users",))
    assert "boom" in str(excinfo.value)
    assert list_backups() == []


def test_create_backup_timeout_aborts(
    backup_dir: Path,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """超时 → BackupError（不无限阻塞启动）."""
    fake = tmp_path / "slow-pg_dump"
    fake.write_text(
        "#!/usr/bin/env python3\nimport sys, time\n"
        "if '--version' in sys.argv:\n"
        f"    print('pg_dump (PostgreSQL) {_STUB_VERSION}')\n"
        "    sys.exit(0)\n"
        "time.sleep(30)\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    monkeypatch.setattr(settings, "migration_pg_dump_path", str(fake))
    monkeypatch.setattr(backup_module, "_PG_DUMP_TIMEOUT", 0.2)

    with pytest.raises(BackupError, match="超时"):
        create_backup(test_engine, version=3, name="encrypt_existing_phones", scope="table", tables=("users",))


def test_create_backup_refuses_when_disk_low(
    backup_dir: Path,
    stub_pg_dump: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """磁盘余量不足 → 拒绝备份（K11）."""
    monkeypatch.setattr(settings, "migration_backup_min_free_mb", 10**9)
    with pytest.raises(BackupError, match="磁盘余量不足"):
        create_backup(test_engine, version=3, name="encrypt_existing_phones", scope="table", tables=("users",))
    assert list_backups() == []


def test_create_backup_refuses_when_mode_off(
    backup_dir: Path,
    stub_pg_dump: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """``MIGRATION_BACKUP_MODE=off`` 时不应走到 create_backup（内部防御性报错）."""
    monkeypatch.setattr(settings, "migration_backup_mode", "off")
    with pytest.raises(BackupError, match="MIGRATION_BACKUP_MODE=off"):
        create_backup(test_engine, version=3, name="encrypt_existing_phones", scope="table", tables=("users",))


# ---------------------------------------------------------------------------
# 保留策略（K14 / D-02）
# ---------------------------------------------------------------------------


def _make_backup_file(directory: Path, name: str, age_days: float, size: int = 8) -> Path:
    """造一个指定「文件年龄」的备份文件（用 mtime 表达）."""
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_bytes(b"x" * size)
    stamp = path.stat().st_mtime - age_days * 86400
    os.utime(path, (stamp, stamp))
    return path


def test_prune_keeps_newest_even_if_all_expired(backup_dir: Path) -> None:
    """全部文件都超期且超出份数时，仍保留最新 1 份（K14 / D-02）."""
    for index in range(5):
        _make_backup_file(backup_dir, f"2025010{index}-000000_v001_x.dump", age_days=400 - index)
    # keep_count=1 → 只有最新 1 份在保留集合内，其余既超天数又超份数 → 删除
    removed = prune_backups(keep_days=30, keep_count=1)
    remaining = list_backups()
    assert removed == 4
    assert len(remaining) == 1


def test_prune_requires_both_days_and_count(backup_dir: Path) -> None:
    """「超天数」与「超份数」同时满足才删（避免误删近期历史）."""
    # 25 份都在保留期内 → 一份都不删（尽管超了 keep_count=20）
    for index in range(25):
        _make_backup_file(backup_dir, f"recent-{index:02d}.dump", age_days=1)
    assert prune_backups(keep_days=30, keep_count=20) == 0
    assert len(list_backups()) == 25

    # 追加 5 份超期文件：它们既超天数又排在 20 份之外 → 全删
    for index in range(5):
        _make_backup_file(backup_dir, f"old-{index:02d}.dump", age_days=90)
    removed = prune_backups(keep_days=30, keep_count=20)
    assert removed == 5
    assert len(list_backups()) == 25


def test_list_backups_excludes_stale_temp_files(backup_dir: Path) -> None:
    """残留 ``.tmp-*.dump`` 不得被当作有效备份（否则 prune 会删真备份）。

    回归背景：``create_backup`` 先写 ``.tmp-XXXX.dump`` 再 ``os.replace`` 原子改名；
    进程被 kill -9 / OOM 终止时 ``_safe_unlink`` 不执行，临时文件会残留。原实现
    ``glob("*.dump")`` 会把它列为备份，且因其 mtime 更新而进入 ``prune_backups`` 的
    ``keep`` 集合（实质是「保留最新 1 份」被截断文件占用），真实备份可能被当作旧文件删除；
    ``manage restore-hint`` 也会把它排在「最近备份」首位。
    """
    real = _make_backup_file(backup_dir, "20261020-100000_v004_populate_phone_hash.dump", age_days=40)
    stale = backup_dir / ".tmp-8f2a1c.dump"
    stale.write_bytes(b"PARTIAL")
    # 临时文件 mtime 更新（模拟被 kill 后残留、随后无新备份）
    os.utime(stale, (real.stat().st_mtime + 3600, real.stat().st_mtime + 3600))

    names = [p.name for p in list_backups()]
    assert names == [real.name], f"残留临时文件被当作备份：{names}"

    # prune 必须以真实备份为「最新」：keep_count=1 时保留 real，且不得把临时文件算进份数
    removed = prune_backups(keep_days=30, keep_count=1)
    remaining = [p.name for p in list_backups()]
    assert stale.exists(), "prune 不应处理临时文件（交由运维清理或下次 create_backup 覆盖）"
    assert real.exists(), "真实备份被误删（临时文件占用了保留槽位）"
    assert remaining == [real.name]
    assert removed == 0, "唯一一份真实备份被删除"


def test_prune_with_settings_swallows_errors(
    backup_dir: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``prune_with_settings`` 异常只记 WARNING，不影响启动（K14）."""
    _make_backup_file(backup_dir, "a.dump", age_days=100)

    message = "磁盘故障（测试注入）"

    def _boom(**kwargs: Any) -> int:
        raise OSError(message)

    monkeypatch.setattr(backup_module, "prune_backups", _boom)
    assert prune_with_settings() == 0


# ---------------------------------------------------------------------------
# 辅助函数
# ---------------------------------------------------------------------------


def test_verify_backup_file_detects_mismatch(backup_dir: Path) -> None:
    """sha256 不匹配 → 校验失败并给出 expected/actual 摘要."""
    path = _make_backup_file(backup_dir, "check.dump", age_days=1)
    ok, detail = verify_backup_file(str(path), "0" * 64)
    assert not ok
    assert "sha256 不匹配" in detail

    ok2, detail2 = verify_backup_file(str(path), hashlib.sha256(b"x" * 8).hexdigest())
    assert ok2
    assert detail2 == "ok"


def test_verify_backup_file_detects_missing(backup_dir: Path) -> None:
    """文件不存在 → 校验失败."""
    ok, detail = verify_backup_file(str(backup_dir / "nope.dump"), "0" * 64)
    assert not ok
    assert "不存在" in detail


def test_ensure_backup_dir_sets_permissions(backup_dir: Path) -> None:
    """目录创建为 0700，且重复调用幂等."""
    first = ensure_backup_dir()
    second = ensure_backup_dir()
    assert first == second == backup_dir
    assert (backup_dir.stat().st_mode & 0o777) == 0o700


def test_disk_free_mb_returns_positive() -> None:
    """磁盘余量探测返回正值（用于 K11 预检）."""
    assert disk_free_mb() > 0


# ---------------------------------------------------------------------------
# 客户端 / 服务端版本兼容（K9 / 实测归档格式缺陷）
# ---------------------------------------------------------------------------


def test_assert_client_compatible_rejects_lower_major(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """Client 主版本低于 server → 拒绝（pg_dump 会直接导出失败）."""
    fake = tmp_path / "old-pg_dump"
    fake.write_text(
        "#!/usr/bin/env python3\nimport sys\nprint('pg_dump (PostgreSQL) 15.9')\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    with pytest.raises(BackupError, match="低于 PostgreSQL 服务端"):
        backup_module.assert_client_compatible(str(fake), test_engine)


def test_assert_client_compatible_accepts_higher_major(
    tmp_path: Path,
    test_engine: Engine,
) -> None:
    """Client 高于 server → 允许导出（恢复端由 restore-hint 约束）."""
    fake = tmp_path / "new-pg_dump"
    fake.write_text(
        "#!/usr/bin/env python3\nimport sys\nprint('pg_dump (PostgreSQL) 18.6')\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    assert backup_module.assert_client_compatible(str(fake), test_engine) == "18.6"


def test_backup_result_records_client_version(
    backup_dir: Path,
    stub_pg_dump: Path,
    test_engine: Engine,
) -> None:
    """备份结果记录 pg_dump 版本（恢复命令的唯一权威依据）."""
    result = create_backup(test_engine, version=4, name="populate_phone_hash", scope="table", tables=("users",))
    assert result.client_version == _STUB_VERSION


def test_client_version_parses_output(tmp_path: Path) -> None:
    """``pg_dump --version`` 解析为纯版本号."""
    fake = tmp_path / "v"
    fake.write_text(
        "#!/usr/bin/env python3\nprint('pg_dump (PostgreSQL) 17.11')\n",
        encoding="utf-8",
    )
    fake.chmod(0o755)
    assert backup_module.client_version(str(fake)) == "17.11"


def test_major_parsing() -> None:
    """主版本解析：兼容 ``18.6`` / ``16`` / 空串 / 非数字."""
    assert backup_module._major("18.6") == 18
    assert backup_module._major("16") == 16
    assert backup_module._major("") == 0
    assert backup_module._major("abc") == 0


def test_subprocess_run_not_called_with_password_in_argv(
    backup_dir: Path,
    stub_pg_dump: Path,
    monkeypatch: pytest.MonkeyPatch,
    test_engine: Engine,
) -> None:
    """端到端断言：真实调用 subprocess 时，argv 中不含密码，``PGPASSWORD`` 已注入."""
    captured: dict[str, Any] = {}
    original_run = subprocess.run

    def _capture(cmd: list[str], **kwargs: Any) -> Any:
        captured["cmd"] = cmd
        captured["env"] = kwargs.get("env", {})
        return original_run(cmd, **kwargs)

    monkeypatch.setattr(backup_module.subprocess, "run", _capture)
    # 注意：str(URL) 会隐藏密码，必须直接读 URL.password
    password = test_engine.url.password or ""
    result = create_backup(test_engine, version=1, name="add_token_version_column", scope="table", tables=("users",))

    assert password
    assert password not in " ".join(captured["cmd"])
    assert captured["env"]["PGPASSWORD"] == password
    assert Path(result.path).is_file()
