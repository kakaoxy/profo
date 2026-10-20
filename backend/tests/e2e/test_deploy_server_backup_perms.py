"""E2E：``deploy-server.sh`` 的备份目录权限边界（真实 chown/chmod + 真实 uid 断言）.

**缺陷背景**（2026-10-20 实测确认）：

``deploy-server.sh`` 原第 123 行用 ``chown -R 1001:1001 "$BACKUP_DIR"`` 准备迁移备份目录。
``$BACKUP_DIR`` 同时存放：

1. ``migrations/*.dump`` —— 后端容器（uid 1001）必须能写，所以要交给 1001；
2. ``backup_*.sql.gz`` —— 部署脚本自身产出的**全库明文备份**，应 root 独占。

``chown -R`` 把 2 也改成了 ``1001:1001 644``，实测 uid 1001 可直接**改写/删除**唯一全库
备份；``scripts/restore-backup.sh`` 会把它拉回本地且不做 sha256 校验，等于「容器内任意
代码可篡改下一次灾难恢复的数据源」。

修复后本用例断言可复现的权限矩阵：

============================  ==================  ==================
路径                          属主                 期望 uid1001
============================  ==================  ==================
backups/                      root               不可列举/读取
backups/backup_*.sql.gz       root, 600          不可读/写/删
backups/migrations/           1001, 700          可建删文件
backups/migrations/*.dump     1001               可读
============================  ==================  ==================

**为什么不是纯单测**：缺陷本质是「文件系统属主 + 真实 uid 的访问控制」，
只有用真实 ``chown``/``chmod`` 并以真实 1001 身份发起 ``open()`` 才能证明修复生效；
用 mock 断言「调了哪个 chown 参数」无法证明「备份文件真的读不到了」。

前置条件：需要 root（或 sudo）执行 chown 到 uid 1001，并能在 test 内切到 1001。
缺失时**不静默跳过**（Fail Loud），打印原因并以退出码 1 结束。

用法::

    cd backend && sudo .venv/bin/python tests/e2e/test_deploy_server_backup_perms.py
"""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent
_PROJECT_DIR = _BACKEND_DIR.parent
_DEPLOY_SCRIPT = _PROJECT_DIR / "deploy-server.sh"
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"

_results: list[tuple[str, bool, str]] = []
# 工件行缓冲：check() 与 emit() 都写这里，保证归档文件包含逐条断言结果
_lines: list[str] = []
_APP_UID = 1001


def check(name: str, detail: str = "", *, ok: bool = True) -> None:
    """记录一条校验结果（打印 + 归档）."""
    _results.append((name, ok, detail))
    line = f"  {'✓' if ok else '✗'} {name}{(' — ' + detail) if detail else ''}"
    print(line)
    _lines.append(line)


def _require_root() -> None:
    """非 root 时 Fail Loud（chown 到 1001 与 setuid 都需要 root）."""
    if os.geteuid() != 0:
        print(
            "[FATAL] 本用例需要 root（要对临时目录 chown 1001 并以 uid 1001 发起访问）：\n"
            f"  sudo {Path(sys.executable)} {Path(__file__).resolve()}",
            file=sys.stderr,
        )
        raise SystemExit(1)


def _extract_prepare_block(script: str) -> str:
    """从 deploy-server.sh 抽出「准备迁移备份目录」代码块（被测对象本身）.

    刻意从真实脚本抽取而不是抄一份：否则脚本改了而测试抄件不改，测试会永久假绿。

    Args:
        script: deploy-server.sh 全文。

    Returns:
        需在 bash 中执行的代码块。

    Raises:
        SystemExit: 找不到标记注释（脚本结构变更后测试必须同步更新）。

    """
    start_marker = 'log_info "准备迁移备份目录..."'
    end_marker = "# 3. 启动 redis 服务"
    start = script.find(start_marker)
    end = script.find(end_marker)
    if start == -1 or end == -1 or end <= start:
        print(
            f"[FATAL] 未能在 deploy-server.sh 中定位被测代码块（{start_marker!r} … {end_marker!r}）。\n"
            "  脚本结构已变更，请同步更新本用例的抽取标记。",
            file=sys.stderr,
        )
        raise SystemExit(1)
    return script[start:end]


def _run_prepare_block(block: str, backup_dir: Path) -> subprocess.CompletedProcess[str]:
    """在受控 BACKUP_DIR 下执行抽取出的代码块."""
    preamble = f"""
set -euo pipefail
PROJECT_DIR={_PROJECT_DIR!s}
BACKUP_DIR={backup_dir!s}
RED=''; GREEN=''; YELLOW=''; NC=''
log_info()  {{ echo "[INFO] $1"; }}
log_warn()  {{ echo "[WARN] $1"; }}
log_error() {{ echo "[ERROR] $1"; }}
"""
    return subprocess.run(  # noqa: S603 - argv 固定，脚本内容来自受控文件
        ["bash", "-c", preamble + block],  # noqa: S607 - bash 来自受控 PATH
        check=False,
        capture_output=True,
        text=True,
    )


def _as_uid1001(cmd: str) -> tuple[int, str]:
    """以 uid 1001 身份执行 shell 片段，返回 (退出码, stderr+stdout 摘要)."""
    completed = subprocess.run(  # noqa: S603 - 片段由本文件构造
        ["setpriv", f"--reuid={_APP_UID}", f"--regid={_APP_UID}", "--clear-groups", "sh", "-c", cmd],  # noqa: S607
        check=False,
        capture_output=True,
        text=True,
    )
    return completed.returncode, (completed.stdout + completed.stderr).strip()


def main() -> int:
    """执行权限矩阵断言并写工件."""
    _require_root()
    if not _DEPLOY_SCRIPT.is_file():
        print(f"[FATAL] 找不到 {_DEPLOY_SCRIPT}", file=sys.stderr)
        return 1
    if shutil.which("setpriv") is None:
        print("[FATAL] 缺少 setpriv（util-linux），无法以 uid 1001 发起访问", file=sys.stderr)
        return 1

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    from datetime import datetime, timezone

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    artifact = ARTIFACT_DIR / f"deploy-backup-perms-{stamp}.txt"
    script = _DEPLOY_SCRIPT.read_text(encoding="utf-8")
    block = _extract_prepare_block(script)

    lines: list[str] = []

    def emit(text: str) -> None:
        print(text)
        lines.append(text)
        _lines.append(text)

    emit(f"# 被测代码块（从 {_DEPLOY_SCRIPT.name} 抽取）：")
    for line in block.rstrip().splitlines():
        emit(f"| {line}")
    emit("")

    workdir = Path(tempfile.mkdtemp(prefix="deploy-perm-"))
    backup_dir = workdir / "backups"
    try:
        # ⚠️ mkdtemp 默认 0700（root）→ uid 1001 连 workdir 都穿越不了，
        # 那样「读不到 backup_*.sql.gz」会变成假绿（拒绝来自 workdir 而非被测目录）。
        # 置为 0711 只给穿越权，确保下面的拒绝只可能来自 backups/ 自身的属主/权限。
        workdir.chmod(0o711)
        # 复刻部署机起始状态：root 已产出全库备份 + 容器此前写过迁移备份
        (backup_dir / "migrations").mkdir(parents=True)
        full_dump = backup_dir / "backup_20261018_000000.sql.gz"
        full_dump.write_text("FULL-DB-DUMP-CONTAINS-ALL-DATA\n", encoding="utf-8")
        full_dump.chmod(0o644)  # root 默认 umask 下的真实状态
        old_mig = backup_dir / "migrations" / "20261019-000000_v050_backfill_lead_unit_price.dump"
        old_mig.write_text("MIG-DUMP\n", encoding="utf-8")

        emit("① 执行 deploy-server.sh 的备份目录准备代码块")
        result = _run_prepare_block(block, backup_dir)
        check("代码块执行成功", f"exit={result.returncode}", ok=result.returncode == 0)
        if result.returncode != 0:
            emit(result.stderr)
            raise SystemExit(1)
        emit(result.stdout.rstrip())

        emit("\n② 宿主侧属主/权限矩阵")
        parent_mode = backup_dir.stat().st_mode & 0o777
        dump_mode = full_dump.stat().st_mode & 0o777
        migrations_mode = (backup_dir / "migrations").stat().st_mode & 0o777
        check("backups/ 属主仍为 root", f"uid={backup_dir.stat().st_uid}", ok=backup_dir.stat().st_uid == 0)
        check(
            "migrations/ 属主为 1001",
            f"uid={(backup_dir / 'migrations').stat().st_uid}",
            ok=(backup_dir / "migrations").stat().st_uid == _APP_UID,
        )
        check("backup_*.sql.gz 属主仍为 root", f"uid={full_dump.stat().st_uid}", ok=full_dump.stat().st_uid == 0)
        check("backup_*.sql.gz 权限为 600", oct(dump_mode), ok=dump_mode == 0o600)
        check("migrations/ 权限为 700", oct(migrations_mode), ok=migrations_mode == 0o700)
        check("backups/ 权限为 711（other 仅穿越，不可列举）", oct(parent_mode), ok=parent_mode == 0o711)

        emit("\n③ 容器用户 uid 1001 的真实访问断言")
        emit(
            f"（先验证前提：workdir {oct(workdir.stat().st_mode & 0o777)} 可穿越，否则拒绝会来自 workdir 而非被测目录）"
        )
        code, out = _as_uid1001(f"test -x {workdir}")
        check("前提：uid1001 可穿越 workdir", f"exit={code}", ok=code == 0)

        code, out = _as_uid1001(f"ls {backup_dir}")
        check("uid1001 无法列举 backups/", out.replace("\n", " ")[:80], ok=code != 0)

        code, out = _as_uid1001(f"cat {full_dump}")
        check("uid1001 无法读取全库备份", out.splitlines()[0][:80] if out else "", ok=code != 0)

        code, out = _as_uid1001(f"echo tampered >> {full_dump}")
        check("uid1001 无法改写全库备份", out.splitlines()[0][:80] if out else "", ok=code != 0)

        code, out = _as_uid1001(f"rm -f {full_dump}")
        check("uid1001 无法删除全库备份", out.splitlines()[0][:80] if out else "", ok=code != 0)
        check(
            "全库备份内容未被篡改",
            full_dump.read_text(encoding="utf-8").strip(),
            ok=full_dump.read_text(encoding="utf-8").strip() == "FULL-DB-DUMP-CONTAINS-ALL-DATA",
        )

        code, out = _as_uid1001(
            f"touch {backup_dir / 'migrations' / 'new.dump'} && rm {backup_dir / 'migrations' / 'new.dump'}"
        )
        check("uid1001 可在 migrations/ 建删备份", f"exit={code}", ok=code == 0)

        code, out = _as_uid1001(f"cat {old_mig}")
        check("uid1001 可读历史迁移备份（prune 需要）", f"exit={code}", ok=code == 0)

        emit("\n④ 反向验证：旧写法 chown -R 整个 backups/ 会重新引入缺陷")
        subprocess.run(  # noqa: S603 - 复现旧写法（缺陷验证，非生产路径）
            ["chown", "-R", f"{_APP_UID}:{_APP_UID}", str(backup_dir)],  # noqa: S607
            check=True,
            capture_output=True,
        )
        code, _ = _as_uid1001(f"echo tampered >> {full_dump}")
        check("旧写法下 uid1001 可改写全库备份（复现缺陷）", f"exit={code}", ok=code == 0)
    finally:
        shutil.rmtree(workdir, ignore_errors=True)

    passed = sum(1 for _, ok, _ in _results if ok)
    total = len(_results)
    summary = [
        "",
        "═" * 78,
        f"用例总数：{total}，通过：{passed}，失败：{total - passed}",
        "总结论：全部通过 ✓" if passed == total else "总结论：存在失败 ✗",
        "",
    ]
    for line in summary:
        emit(line)

    artifact.write_text("\n".join(_lines) + "\n", encoding="utf-8")
    print(f"工件：{artifact}")
    return 0 if passed == total else 1


if __name__ == "__main__":
    raise SystemExit(main())
