"""迁移：将本地 uploads 文件迁移到 OSS 并改写 DB URL.

幂等设计：
- 文件上传：upload_file 前调 file_exists 检查，已存在则跳过
- DB URL 改写：已是 OSS URL（以 oss_public_base_url 开头）的记录跳过
- 仅当 settings.storage_backend == "oss" 时执行

执行时机（修复 H2/H3）：
- **启动期**（`migrate_uploads_to_oss`）：仅做 DB URL 改写（快，无网络往返），
  避免逐文件 `object_exists` 的 N 次网络往返阻塞服务就绪。
  多 worker 下由 `run_startup_migrations` 的 advisory lock 串行化。
- **带外**（`upload_local_files_to_oss` / `python -m migrations.migrate_uploads_to_oss`）：
  执行本地文件批量上传到 OSS，应在切换到 OSS 后、对外提供服务前运行一次。
  启动期若发现文件上传未完成，会打印醒目日志提示运行本脚本。
"""

import json
import logging
from pathlib import Path

from redis import Redis
from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from settings import settings
from utils.storage import get_storage_backend

logger = logging.getLogger(__name__)

# DB 中本地 uploads URL 前缀
_STATIC_UPLOADS_PREFIX = "/static/uploads/"
# JSON 数组元素中可能包含 URL 的字段名
_JSON_URL_KEYS: tuple[str, ...] = ("url", "thumbnail_url", "file_url")
# 进度日志间隔
_PROGRESS_INTERVAL = 100

# Redis 完成标记 key
# 文件上传标记（带外执行，避免每次启动重复扫描所有文件——file_exists 网络开销）
_FILE_UPLOAD_DONE_KEY = "profo:migration:oss_uploads_done"
# DB URL 改写标记（启动期执行，改写完成后写入，后续启动跳过）
_DB_REWRITE_DONE_KEY = "profo:migration:oss_db_rewrite_done"

# 需要改写 URL 的普通字符串字段 (table, column)
_SIMPLE_URL_FIELDS: list[tuple[str, str]] = [
    ("renovation_photos", "url"),
    ("renovation_photos", "thumbnail_url"),
    ("property_media", "url"),
    ("property_media", "thumbnail_url"),
    ("l4_marketing_media", "file_url"),
    ("l4_marketing_media", "thumbnail_url"),
    # 软装明细附件（单字段 URL，与今日附件修复直接相关）
    ("project_renovations", "soft_detail_attachment"),
]

# 需要改写 URL 的 JSON 数组字段 (table, column)
# 元素可为 str URL，或含 url/thumbnail_url/file_url 键的 dict（如 SigningMaterial）
_JSON_ARRAY_FIELDS: list[tuple[str, str]] = [
    ("l4_marketing_projects", "images"),
    # 签约附件列表（JSON 数组，元素含 url 字段）
    ("project_contracts", "signing_materials"),
    # 财务票据 URL 列表（JSON 字符串数组）
    ("finance_records", "receipt_urls"),
    # 线索图片列表（JSON 字符串数组）
    ("leads", "images"),
]


def _column_exists(engine: Engine, table: str, column: str) -> bool:
    """检查某列是否已存在."""
    inspector = inspect(engine)
    if table not in inspector.get_table_names():
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def _compute_oss_key(local_path: Path, upload_dir: Path) -> str:
    """根据本地文件路径计算 OSS key（与 storage.py 的 key 约定一致）.

    例：.../static/uploads/20260722_abc.jpg → 20260722_abc.jpg
        .../static/uploads/thumbs/xxx.webp → thumbs/xxx.webp
    """
    rel = local_path.relative_to(upload_dir)
    return rel.as_posix()


def _upload_local_files() -> tuple[int, int]:
    """上传本地 uploads 目录所有文件到 OSS.

    幂等：upload_file 前调 file_exists 检查，已存在则跳过。

    Returns:
        (uploaded_count, skipped_count)

    """
    storage = get_storage_backend()
    upload_dir = Path(settings.upload_dir)

    if not upload_dir.exists():
        logger.warning("迁移：uploads 目录不存在 %s，跳过文件上传", upload_dir)
        return 0, 0

    files = [f for f in upload_dir.rglob("*") if f.is_file()]
    total = len(files)
    if total == 0:
        logger.info("迁移：uploads 目录为空，无需上传文件")
        return 0, 0

    logger.info("迁移：开始上传 %d 个本地文件到 OSS", total)
    uploaded = 0
    skipped = 0

    for i, local_path in enumerate(files, 1):
        key = _compute_oss_key(local_path, upload_dir)
        if storage.file_exists(key):
            skipped += 1
        else:
            storage.upload_file(local_path, key)
            uploaded += 1

        if i % _PROGRESS_INTERVAL == 0:
            logger.info(
                "迁移：文件上传进度 %d/%d（已上传 %d，已跳过 %d）",
                i,
                total,
                uploaded,
                skipped,
            )

    logger.info("迁移：文件上传完成（总 %d，已上传 %d，已跳过 %d）", total, uploaded, skipped)
    return uploaded, skipped


def _rewrite_url(url: str, oss_base: str) -> str | None:
    """将本地 /static/uploads/xxx URL 改写为 OSS URL.

    Returns:
        改写后的 URL，或 None 表示无需改写（已是 OSS URL 或非 uploads URL）

    """
    if not url:
        return None
    if url.startswith(oss_base):
        return None
    if not url.startswith(_STATIC_UPLOADS_PREFIX):
        return None
    suffix = url[len(_STATIC_UPLOADS_PREFIX) :]
    return f"{oss_base}/{suffix}"


def _rewrite_json_array_urls(value: object, oss_base: str) -> list | None:
    """改写 JSON 数组中的 URL.

    支持两种元素格式：
    - str: 直接改写 URL
    - dict: 遍历 url/thumbnail_url/file_url 字段改写

    Returns:
        改写后的 list，或 None 表示无需改写

    """
    if value is None:
        return None

    items: list | None = None
    if isinstance(value, list):
        items = value
    elif isinstance(value, str):
        if not value:
            return None
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                items = parsed
        except (json.JSONDecodeError, TypeError):
            return None

    if items is None:
        return None

    changed = False
    result: list = []
    for item in items:
        if isinstance(item, str):
            new_url = _rewrite_url(item, oss_base)
            if new_url is not None:
                result.append(new_url)
                changed = True
            else:
                result.append(item)
        elif isinstance(item, dict):
            new_item = dict(item)
            item_changed = False
            for k in _JSON_URL_KEYS:
                if k in new_item and isinstance(new_item[k], str):
                    new_url = _rewrite_url(new_item[k], oss_base)
                    if new_url is not None:
                        new_item[k] = new_url
                        item_changed = True
            result.append(new_item)
            if item_changed:
                changed = True
        else:
            result.append(item)

    return result if changed else None


def _rewrite_simple_url_fields(engine: Engine, oss_base: str) -> int:
    """改写普通字符串 URL 字段，每张表一个事务.

    Returns:
        总改写记录数

    """
    total_rewritten = 0

    # 按表分组（同一表多字段在同一事务处理）
    fields_by_table: dict[str, list[str]] = {}
    for table, col in _SIMPLE_URL_FIELDS:
        fields_by_table.setdefault(table, []).append(col)

    for table, cols in fields_by_table.items():
        existing_cols = [c for c in cols if _column_exists(engine, table, c)]
        for col in cols:
            if col not in existing_cols:
                logger.warning("迁移：%s.%s 列不存在，跳过", table, col)
        if not existing_cols:
            continue

        with engine.begin() as conn:
            table_rewritten = 0
            for col in existing_cols:
                # 批量 UPDATE：REPLACE 等价于 _rewrite_url 的前缀替换逻辑，
                # WHERE 保证幂等（已是 OSS URL 的记录不匹配 '/static/uploads/%'）
                # table/col 来自硬编码元组，无注入风险；oss_prefix 用绑定参数
                result = conn.execute(
                    text(
                        f"UPDATE {table} SET {col} = REPLACE({col}, '/static/uploads/', :oss_prefix) "  # noqa: S608
                        f"WHERE {col} LIKE '/static/uploads/%'",
                    ),
                    {"oss_prefix": f"{oss_base}/"},
                )
                col_rewritten = result.rowcount
                if col_rewritten:
                    logger.info("迁移：%s.%s: 改写 %d 条 URL", table, col, col_rewritten)
                table_rewritten += col_rewritten
                total_rewritten += col_rewritten

            if table_rewritten:
                logger.info("迁移：%s 表事务提交，共改写 %d 条 URL", table, table_rewritten)

    return total_rewritten


def _rewrite_json_array_field(engine: Engine, table: str, column: str, oss_base: str) -> int:
    """改写指定表的 JSON 数组字段中的 URL.

    使用 raw text() SQL，兼容 String/Integer 主键与不同 JSON 列类型。
    SELECT 返回的 JSON 值可能是已反序列化的 list 或 text 字符串，
    `_rewrite_json_array_urls` 两种情况均处理。

    Returns:
        改写记录数

    """
    if not _column_exists(engine, table, column):
        logger.warning("迁移：%s.%s 列不存在，跳过", table, column)
        return 0

    with engine.begin() as conn:
        # table/column 来自硬编码元组，无注入风险
        rows = conn.execute(
            text(
                f"SELECT id, {column} FROM {table} "  # noqa: S608
                f"WHERE CAST({column} AS text) LIKE :pat"
            ),
            {"pat": "%/static/uploads/%"},
        ).fetchall()

        rewritten = 0
        for row in rows:
            value = row[1]
            if value is None:
                continue
            fixed = _rewrite_json_array_urls(value, oss_base)
            if fixed is None:
                continue
            # 序列化为 JSON 文本后 CAST 为 json 类型（PG 隐式 text -> json）
            conn.execute(
                text(
                    f"UPDATE {table} SET {column} = CAST(:value AS json) WHERE id = :id"  # noqa: S608
                ),
                {"value": json.dumps(fixed), "id": row[0]},
            )
            rewritten += 1

        if rewritten:
            logger.info("迁移：%s.%s: 改写 %d 条 JSON URL", table, column, rewritten)

    return rewritten


def _rewrite_db_urls(engine: Engine, oss_base: str) -> tuple[int, int]:
    """改写 DB 中所有本地 uploads URL 为 OSS URL.

    Returns:
        (simple_rewritten, json_rewritten)

    """
    simple_rewritten = _rewrite_simple_url_fields(engine, oss_base)
    json_rewritten = 0
    for table, column in _JSON_ARRAY_FIELDS:
        json_rewritten += _rewrite_json_array_field(engine, table, column, oss_base)
    return simple_rewritten, json_rewritten


def _get_redis_client_safe() -> Redis | None:
    """获取 Redis 客户端，失败返回 None（迁移本身幂等，Redis 故障时正常执行）."""
    try:
        from utils.redis_client import get_redis_client  # noqa: PLC0415

        return get_redis_client()
    except Exception:  # noqa: BLE001
        logger.debug("Redis 不可用，无法读写迁移标记，继续执行")
        return None


def migrate_uploads_to_oss(engine: Engine) -> None:
    """启动期迁移：仅改写 DB URL（不含文件上传）.

    文件上传改为带外执行（见 `upload_local_files_to_oss` / `__main__`），
    避免启动期 N 次 `object_exists` 网络往返阻塞服务就绪。

    幂等：已是 OSS URL 的记录跳过。
    完成后写入 Redis 标记，后续启动跳过重复 DB 扫描。
    若文件上传标记缺失，打印醒目日志提示运行带外脚本。
    """
    if settings.storage_backend != "oss":
        logger.info("跳过 OSS 迁移：storage_backend=%s", settings.storage_backend)
        return

    oss_base = settings.oss_public_base_url
    if not oss_base:
        logger.warning("迁移：oss_public_base_url 未配置，跳过 OSS 迁移")
        return

    redis_client = _get_redis_client_safe()

    # DB 改写完成标记：避免每次启动重复扫描（改写本身幂等，标记仅为省 DB 往返）
    if redis_client is not None and redis_client.get(_DB_REWRITE_DONE_KEY):
        logger.info("跳过 OSS DB URL 改写：已完成（Redis 标记存在）")
    else:
        logger.info("迁移：开始改写 DB URL 为 OSS URL（base_url=%s）", oss_base)
        simple_rewritten, json_rewritten = _rewrite_db_urls(engine, oss_base)
        logger.info(
            "迁移：DB URL 改写完成（普通字段 %d，JSON 字段 %d）",
            simple_rewritten,
            json_rewritten,
        )
        try:
            if redis_client is not None:
                redis_client.set(_DB_REWRITE_DONE_KEY, "1")
        except Exception:  # noqa: BLE001
            logger.warning("迁移：无法写入 Redis DB 改写标记，下次启动将重新检查")

    # 文件上传未完成 → 醒目提示运行带外脚本（不阻塞启动）
    if redis_client is not None:
        try:
            file_uploaded = redis_client.get(_FILE_UPLOAD_DONE_KEY)
        except Exception:  # noqa: BLE001
            file_uploaded = None
        if not file_uploaded:
            logger.warning(
                "迁移：本地文件上传到 OSS 尚未完成，请运行带外脚本："
                "docker compose exec backend .venv/bin/python -m migrations.migrate_uploads_to_oss"
            )


def upload_local_files_to_oss() -> tuple[int, int]:
    """带外迁移：上传本地 uploads 文件到 OSS.

    幂等：upload_file 前调 file_exists 检查，已存在则跳过。
    完成后写入 Redis 标记，后续运行跳过重复扫描。

    Returns:
        (uploaded_count, skipped_count)

    """
    if settings.storage_backend != "oss":
        logger.warning("跳过文件上传：storage_backend=%s（非 oss）", settings.storage_backend)
        return 0, 0

    oss_base = settings.oss_public_base_url
    if not oss_base:
        logger.warning("文件上传：oss_public_base_url 未配置，跳过")
        return 0, 0

    redis_client = _get_redis_client_safe()
    if redis_client is not None:
        try:
            if redis_client.get(_FILE_UPLOAD_DONE_KEY):
                logger.info("跳过文件上传：已完成（Redis 标记存在）")
                return 0, 0
        except Exception:  # noqa: BLE001
            logger.debug("无法读取文件上传标记，继续执行")

    uploaded, skipped = _upload_local_files()

    try:
        if redis_client is not None:
            redis_client.set(_FILE_UPLOAD_DONE_KEY, "1")
    except Exception:  # noqa: BLE001
        logger.warning("迁移：无法写入 Redis 文件上传标记，下次运行将重新检查")

    return uploaded, skipped


def run_out_of_band_migration(engine: Engine) -> None:
    """带外完整迁移：上传本地文件 + 改写 DB URL.

    供 `python -m migrations.migrate_uploads_to_oss` 调用，应在切换到 OSS 后、
    对外提供服务前运行一次。幂等，可重复执行。
    """
    if settings.storage_backend != "oss":
        logger.error("storage_backend 非 oss，退出（当前=%s）", settings.storage_backend)
        return

    oss_base = settings.oss_public_base_url
    if not oss_base:
        logger.error("oss_public_base_url 未配置，退出")
        return

    logger.info("带外迁移：开始（base_url=%s）", oss_base)

    # A. 上传本地文件到 OSS
    uploaded, skipped = upload_local_files_to_oss()

    # B. 改写 DB URL（与启动期逻辑一致，幂等）
    redis_client = _get_redis_client_safe()
    simple_rewritten, json_rewritten = _rewrite_db_urls(engine, oss_base)
    try:
        if redis_client is not None:
            redis_client.set(_DB_REWRITE_DONE_KEY, "1")
    except Exception:  # noqa: BLE001
        logger.warning("迁移：无法写入 Redis DB 改写标记")

    logger.info(
        "带外迁移：完成（文件上传 %d，跳过 %d，DB URL 改写 %d，JSON 改写 %d）",
        uploaded,
        skipped,
        simple_rewritten,
        json_rewritten,
    )


if __name__ == "__main__":
    # 带外执行入口：python -m migrations.migrate_uploads_to_oss
    from db import engine

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    run_out_of_band_migration(engine)
