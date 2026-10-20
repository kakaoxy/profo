"""迁移前备份（总纲 K9–K14、D-02、D-03）。

**为何不合并进 ``deploy-server.sh`` 的全库备份**（spec §8.5 结论）：
1. 部署脚本只在「部署路径」触发；``docker compose restart``、``manage up``、手工
   ``python -m migrations.manage`` 无备份；
2. 部署备份与版本号无关联，无法回答「这次失败前有没有备份、覆盖到哪一版」；
3. 它是 plain SQL ``.sql.gz``，恢复需 psql 全量重放，**不能做单表 recovery**。

因此保留两层：部署脚本不动（全库回放用），本模块提供「版本粒度 + 单表可恢复」层。

**安全约定**
- 密码经 ``PGPASSWORD`` 环境变量传入，**绝不进 argv**（``ps`` 可见）；
- 日志只记 ``dbname``/``host``/``tables`` 与目标路径，不打印完整命令；
- 输出先写临时文件再 ``os.replace`` 原子改名，避免半文件被当成有效备份；
- 目录 ``0o700``、文件 ``0o600``。
"""

import hashlib
import logging
import os
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from sqlalchemy import text
from sqlalchemy.engine import URL, Engine, make_url

from settings import settings

logger = logging.getLogger(__name__)

BackupScope = Literal["table", "full"]

# pg_dump 单次执行超时（秒）
_PG_DUMP_TIMEOUT = 1800
# 文件名中的时间戳格式
_TS_FORMAT = "%Y%m%d-%H%M%S"
# 备份文件后缀
_SUFFIX = ".dump"
# 临时文件前缀：``create_backup`` 先写 ``.tmp-*.dump`` 再原子改名。
# 进程被 kill -9 / OOM 终止时（``_safe_unlink`` 只覆盖 Python 异常路径）会留下残留文件，
# 必须从「备份列举」中排除，否则它会被 ``prune_backups`` 当成最新备份而把真实备份删掉，
# 也会被 ``manage restore-hint`` 列在最近备份首位（运维据此恢复截断归档）。
_TMP_PREFIX = ".tmp-"


class BackupError(RuntimeError):
    """备份失败（调用方据此**中止迁移**，K11）."""


@dataclass(frozen=True, slots=True)
class BackupResult:
    """一次备份的结果（写入 ``schema_migrations`` 审计链）.

    ``client_version`` 记录产出备份的 ``pg_dump`` 版本。**恢复时必须使用同大版本客户端**：
    client ≥17 产出归档格式 1.16，PG16 自带的 ``pg_restore`` 会直接报
    ``unsupported version (1.16) in file header``（实测）。因此该字段是恢复命令的
    唯一权威依据，不能靠操作者「按经验判断」。
    """

    path: str
    sha256: str
    size_bytes: int
    scope: BackupScope
    tables: tuple[str, ...]
    client_version: str = ""


def backup_dir() -> Path:
    """备份目录路径（``MIGRATION_BACKUP_DIR``）."""
    return Path(settings.migration_backup_dir)


def ensure_backup_dir() -> Path:
    """确保备份目录存在且权限为 ``0o700``（启动期执行一次）.

    不可写时只记 WARNING（不阻断启动），真正写不进去会在 ``create_backup``
    阶段 Fail Loud（K11）。

    Returns:
        备份目录路径。

    """
    directory = backup_dir()
    try:
        directory.mkdir(parents=True, exist_ok=True)
        directory.chmod(0o700)
    except OSError:
        logger.warning("迁移备份目录不可用：%s（备份将失败并中止迁移）", directory, exc_info=True)
    return directory


def disk_free_mb(path: Path | None = None) -> int:
    """目标盘剩余空间（MB）.

    Args:
        path: 目标路径，默认备份目录；路径不存在时退到其最近存在的父目录。

    Returns:
        剩余空间 MB（向下取整）。

    """
    target = path or backup_dir()
    probe = target
    while not probe.exists() and probe != probe.parent:
        probe = probe.parent
    usage = shutil.disk_usage(probe)
    return int(usage.free // (1024 * 1024))


def resolve_pg_dump() -> str:
    """定位 ``pg_dump`` 可执行文件（K9：缺失即 RuntimeError，不静默跳过）.

    Returns:
        pg_dump 的绝对路径。

    Raises:
        BackupError: 未配置且 PATH 中不存在 ``pg_dump``。

    """
    if settings.migration_pg_dump_path:
        candidate = Path(settings.migration_pg_dump_path)
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return str(candidate)
        msg = f"MIGRATION_PG_DUMP_PATH 指向的文件不可执行：{settings.migration_pg_dump_path}"
        raise BackupError(msg)
    found = shutil.which("pg_dump")
    if not found:
        msg = (
            "未找到 pg_dump 可执行文件，迁移备份无法执行。修复：\n"
            "  - 容器内：镜像已安装 postgresql-client，请检查 PATH；\n"
            "  - 本机开发：brew install libpq 后设置 "
            "MIGRATION_PG_DUMP_PATH=/opt/homebrew/opt/libpq/bin/pg_dump"
        )
        raise BackupError(msg)
    return found


def client_version(pg_dump_path: str | None = None) -> str:
    """取 ``pg_dump --version`` 的版本号（如 ``18.6``）.

    Args:
        pg_dump_path: pg_dump 路径；None 时自动发现。

    Returns:
        版本号字符串；获取失败返回空串（不阻断备份，但审计会缺该字段）。

    """
    path = pg_dump_path or resolve_pg_dump()
    try:
        completed = subprocess.run(  # noqa: S603 - path 来自受控配置/PATH
            [path, "--version"],
            check=False,
            capture_output=True,
            text=True,
            timeout=30,
        )
    except (OSError, subprocess.SubprocessError):
        logger.warning("无法获取 pg_dump 版本：%s", path, exc_info=True)
        return ""
    # 输出形如 "pg_dump (PostgreSQL) 18.6"
    parts = completed.stdout.strip().split()
    return parts[-1].split(" ")[0] if parts else ""


def server_version(engine: Engine) -> str:
    """取 PostgreSQL 服务端版本（如 ``16.15``）.

    Args:
        engine: SQLAlchemy 引擎。

    Returns:
        版本号字符串；查询失败返回空串。

    """
    try:
        with engine.connect() as conn:
            return str(conn.execute(text("SHOW server_version")).scalar() or "")
    except Exception:
        logger.warning("无法获取 PostgreSQL 服务端版本", exc_info=True)
        return ""


def _major(version: str) -> int:
    """取版本号的主版本（``18.6`` → 18；``16`` → 16；不可解析 → 0）."""
    head = version.split(".", maxsplit=1)[0].strip()
    return int(head) if head.isdigit() else 0


def assert_client_compatible(pg_dump_path: str, engine: Engine) -> str:
    """校验 ``pg_dump`` 主版本 ≥ 服务端主版本（K9），否则 Fail Loud.

    为什么必须校验：``pg_dump`` 只允许导出 **不高于** 自己版本的 server；用低版本
    client dump 高版本 server 会直接报错中止。反过来（client > server）能导出，但
    归档格式版本会高于老 server 自带的 ``pg_restore`` 所能读——因此恢复端必须同版本，
    由 ``restore-hint`` 依据本函数记录的版本给出命令。

    Args:
        pg_dump_path: pg_dump 路径。
        engine: SQLAlchemy 引擎。

    Returns:
        pg_dump 版本号。

    Raises:
        BackupError: 客户端主版本低于服务端，或无法解析版本。

    """
    client = client_version(pg_dump_path)
    server = server_version(engine)
    if not client or not server:
        msg = (
            f"无法确定 pg_dump/服务端版本（pg_dump={client!r} server={server!r}），"
            "迁移备份要求可核对版本，请检查客户端安装。"
        )
        raise BackupError(msg)
    if _major(client) < _major(server):
        msg = (
            f"pg_dump 主版本 {client} 低于 PostgreSQL 服务端 {server}，会直接导出失败。"
            "请安装与服务端同大版本或更高的 postgresql-client。"
        )
        raise BackupError(msg)
    if _major(client) > _major(server):
        logger.info(
            "pg_dump %s 高于服务端 %s：备份可用，但**恢复必须使用同大版本客户端**"
            "（manage restore-hint 会给出对应命令）",
            client,
            server,
        )
    return client


def build_dump_command(
    *,
    pg_dump_path: str,
    database_url: "str | URL",
    out_path: Path,
    scope: BackupScope,
    tables: tuple[str, ...] = (),
) -> list[str]:
    """构造 pg_dump 命令（**不含密码**，密码走 ``PGPASSWORD`` 环境变量）.

    Args:
        pg_dump_path: pg_dump 绝对路径。
        database_url: SQLAlchemy 连接串或 ``URL`` 对象。
            ⚠️ 必须传 ``URL`` 对象或 ``render_as_string(hide_password=False)`` 的结果：
            ``str(URL)`` 会把密码渲染成 ``***``。
        out_path: 输出文件路径。
        scope: ``table`` 或 ``full``。
        tables: ``scope=table`` 时的表名列表（不带 schema 前缀）。

    Returns:
        argv 列表。

    Raises:
        BackupError: ``scope=table`` 但未给表。

    """
    url = database_url if isinstance(database_url, URL) else make_url(database_url)
    if scope == "table" and not tables:
        msg = "scope=table 必须提供 tables"
        raise BackupError(msg)
    cmd = [
        pg_dump_path,
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--compress=6",
        "--host",
        url.host or "localhost",
        "--port",
        str(url.port or 5432),
        "--username",
        url.username or "postgres",
        "--dbname",
        url.database or "postgres",
        "--file",
        str(out_path),
    ]
    if scope == "table":
        cmd.append("--data-only")
        for table in tables:
            cmd.extend(["--table", f"public.{table}"])
    return cmd


def create_backup(
    engine: Engine,
    *,
    version: int,
    name: str,
    scope: BackupScope,
    tables: tuple[str, ...] = (),
) -> BackupResult:
    """执行 pg_dump 备份并校验（任一步失败即抛，调用方据此中止迁移，K11）.

    Args:
        engine: SQLAlchemy 引擎（用于取连接串，不参与 dump）。
        version: 迁移版本号（文件名前缀）。
        name: 迁移名（文件名）。
        scope: ``table`` 或 ``full``。
        tables: ``scope=table`` 的表名列表。

    Returns:
        备份结果（路径 / sha256 / 大小 / 范围 / 表）。

    Raises:
        BackupError: pg_dump 缺失、磁盘余量不足、非零退出、超时、0 字节、摘要失败。

    """
    if settings.migration_backup_mode == "off":
        msg = "MIGRATION_BACKUP_MODE=off，但调用方要求备份（内部错误：应由 runner 提前跳过）"
        raise BackupError(msg)

    free_mb = disk_free_mb()
    if free_mb < settings.migration_backup_min_free_mb:
        msg = (
            f"备份前磁盘余量不足：剩余 {free_mb}MB < 下限 {settings.migration_backup_min_free_mb}MB。"
            "请清理磁盘或调整 MIGRATION_BACKUP_MIN_FREE_MB 后重试。"
        )
        raise BackupError(msg)

    pg_dump_path = resolve_pg_dump()
    dump_client_version = assert_client_compatible(pg_dump_path, engine)
    directory = ensure_backup_dir()
    stamp = datetime.now(timezone.utc).strftime(_TS_FORMAT)
    final_path = directory / f"{stamp}_v{version:03d}_{name}{_SUFFIX}"
    # 连接参数一律取自 engine（测试库/只读副本等场景下可能与 settings 不同）；
    # 注意用 URL 对象，不用 str(url)（会隐藏密码）
    url = engine.url
    cmd = build_dump_command(
        pg_dump_path=pg_dump_path,
        database_url=engine.url,
        out_path=final_path,
        scope=scope,
        tables=tables,
    )

    logger.info(
        "开始迁移备份：v%d %s scope=%s db=%s host=%s tables=%s → %s",
        version,
        name,
        scope,
        url.database,
        url.host,
        ",".join(tables) or "-",
        final_path,
    )

    # 先写临时文件（同目录，保证 os.replace 原子性）
    tmp_fd, tmp_name = tempfile.mkstemp(prefix=_TMP_PREFIX, suffix=_SUFFIX, dir=directory)
    os.close(tmp_fd)
    tmp_path = Path(tmp_name)
    env = {**os.environ, "PGPASSWORD": url.password or ""}
    # 把 --file 指向临时文件
    cmd[cmd.index("--file") + 1] = str(tmp_path)
    try:
        subprocess.run(  # noqa: S603 - argv 为内部构造，无可注入外部输入
            cmd,
            env=env,
            check=True,
            capture_output=True,
            timeout=_PG_DUMP_TIMEOUT,
        )
        size = tmp_path.stat().st_size
        if size == 0:
            msg = f"备份文件为空（0 字节）：{tmp_path}"
            raise BackupError(msg)
        digest = _sha256_of(tmp_path)
        tmp_path.chmod(0o600)
        tmp_path.replace(final_path)
    except subprocess.CalledProcessError as exc:
        stderr = (exc.stderr or b"").decode("utf-8", "replace").strip()
        _safe_unlink(tmp_path)
        msg = f"pg_dump 失败（exit={exc.returncode}）：{stderr[:500]}"
        raise BackupError(msg) from exc
    except subprocess.TimeoutExpired as exc:
        _safe_unlink(tmp_path)
        msg = f"pg_dump 超时（>{_PG_DUMP_TIMEOUT}s）"
        raise BackupError(msg) from exc
    except OSError as exc:
        _safe_unlink(tmp_path)
        msg = f"备份文件写入失败：{exc}"
        raise BackupError(msg) from exc
    except BackupError:
        _safe_unlink(tmp_path)
        raise

    logger.info(
        "迁移备份完成：%s（%.2f MB, sha256=%s, pg_dump=%s）",
        final_path,
        size / 1024 / 1024,
        digest[:12],
        dump_client_version,
    )
    return BackupResult(
        path=str(final_path),
        sha256=digest,
        size_bytes=size,
        scope=scope,
        tables=tables,
        client_version=dump_client_version,
    )


def _sha256_of(path: Path) -> str:
    """计算文件 sha256（分块读，避免大文件占内存）.

    Args:
        path: 文件路径。

    Returns:
        十六进制摘要。

    Raises:
        BackupError: 读取失败。

    """
    hasher = hashlib.sha256()
    try:
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(1024 * 1024), b""):
                hasher.update(chunk)
    except OSError as exc:
        msg = f"备份文件摘要计算失败：{exc}"
        raise BackupError(msg) from exc
    return hasher.hexdigest()


def _safe_unlink(path: Path) -> None:
    """静默删除临时文件（失败只记 debug，不掩盖原始异常）.

    Args:
        path: 待删除路径。

    """
    try:
        path.unlink(missing_ok=True)
    except OSError:
        logger.debug("临时备份文件删除失败：%s", path, exc_info=True)


def list_backups() -> list[Path]:
    """列出备份目录下的**已完成**备份 ``*.dump``（按 mtime 倒序，排除 ``.tmp-*`` 残留）.

    残留临时文件（进程被 kill 时产生）不是有效备份：它可能被截断，且 mtime 更新，
    若参与列举会挤占 ``prune_backups`` 的「保留最新」槽位并污染 ``restore-hint`` 列表。
    """
    directory = backup_dir()
    if not directory.exists():
        return []
    files = [p for p in directory.glob(f"*{_SUFFIX}") if p.is_file() and not p.name.startswith(_TMP_PREFIX)]
    return sorted(files, key=lambda p: p.stat().st_mtime, reverse=True)


def prune_backups(*, keep_days: int, keep_count: int) -> int:
    """按保留策略清理旧备份（K14 / D-02）.

    语义：**「超过 N 天」与「超过 N 份」同时满足才删**——避免「20 份都在 30 天内」
    误删历史，也避免「1 年前 3 份」永久占盘。**始终保留最新 1 份**。

    Args:
        keep_days: 保留天数。
        keep_count: 最多保留份数（至少生效为 1）。

    Returns:
        删除的文件数量。

    """
    files = list_backups()
    if not files:
        return 0
    effective_count = max(1, keep_count)
    keep = set(files[:effective_count])
    newest = files[0]
    keep.add(newest)
    now = datetime.now(timezone.utc).timestamp()
    removed = 0
    for path in files:
        if path in keep:
            continue
        age_days = (now - path.stat().st_mtime) / 86400
        if age_days <= keep_days:
            continue
        try:
            path.unlink()
        except OSError:
            logger.warning("旧备份删除失败：%s", path, exc_info=True)
            continue
        removed += 1
    if removed:
        logger.info("迁移备份清理：删除 %d 份（保留 %d 份 / %d 天）", removed, effective_count, keep_days)
    return removed


def prune_with_settings() -> int:
    """按当前配置执行清理；异常只记 WARNING（不影响启动，K14）.

    Returns:
        删除的文件数量（异常时 0）。

    """
    try:
        return prune_backups(
            keep_days=settings.migration_backup_retention_days,
            keep_count=settings.migration_backup_max_count,
        )
    except Exception:
        logger.warning("迁移备份清理失败（不影响启动）", exc_info=True)
        return 0


def backup_status() -> dict[str, object]:
    """``manage status`` 用的备份目录概况.

    Returns:
        目录、份数、总大小、最旧/最新时间、磁盘余量。

    """
    files = list_backups()
    total_bytes = sum(p.stat().st_size for p in files)
    return {
        "dir": str(backup_dir()),
        "count": len(files),
        "total_mb": round(total_bytes / 1024 / 1024, 2),
        "free_mb": disk_free_mb(),
        "oldest": datetime.fromtimestamp(files[-1].stat().st_mtime, tz=timezone.utc).isoformat() if files else None,
        "newest": datetime.fromtimestamp(files[0].stat().st_mtime, tz=timezone.utc).isoformat() if files else None,
    }


def verify_backup_file(path: str, expected_sha256: str) -> tuple[bool, str]:
    """校验备份文件存在且 sha256 一致（``manage verify`` 用）.

    Args:
        path: 备份文件路径。
        expected_sha256: 账本记录的摘要。

    Returns:
        ``(是否通过, 说明)``。

    """
    file_path = Path(path)
    if not file_path.is_file():
        return False, "备份文件不存在"
    try:
        actual = _sha256_of(file_path)
    except BackupError as exc:
        return False, str(exc)
    if actual != expected_sha256:
        return False, f"sha256 不匹配（expected={expected_sha256[:12]} actual={actual[:12]}）"
    return True, "ok"
