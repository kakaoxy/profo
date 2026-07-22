"""迁移：将本地 uploads 文件迁移到 OSS 并改写 DB URL.

幂等设计：
- 文件上传：upload_file 前调 file_exists 检查，已存在则跳过
- DB URL 改写：已是 OSS URL（以 oss_public_base_url 开头）的记录跳过
- 仅当 settings.storage_backend == "oss" 时执行
"""

import json
import logging
from pathlib import Path

from sqlalchemy import inspect, select, text, update
from sqlalchemy.engine import Engine

from models.marketing import L4MarketingProject
from settings import settings
from utils.storage import get_storage_backend

logger = logging.getLogger(__name__)

# DB 中本地 uploads URL 前缀
_STATIC_UPLOADS_PREFIX = "/static/uploads/"
# JSON 数组元素中可能包含 URL 的字段名
_JSON_URL_KEYS: tuple[str, ...] = ("url", "thumbnail_url", "file_url")
# 进度日志间隔
_PROGRESS_INTERVAL = 100
# Redis 完成标记 key（迁移成功后写入，后续启动跳过重复扫描）
_MIGRATION_DONE_KEY = "profo:migration:oss_uploads_done"

# 需要改写 URL 的普通字符串字段 (table, column)
_SIMPLE_URL_FIELDS: list[tuple[str, str]] = [
    ("renovation_photos", "url"),
    ("property_media", "url"),
    ("l4_marketing_media", "file_url"),
    ("l4_marketing_media", "thumbnail_url"),
]

# JSON 数组字段
_JSON_ARRAY_TABLE = "l4_marketing_projects"
_JSON_ARRAY_COLUMN = "images"


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

    # 按表分组（l4_marketing_media 有两个字段，在同一事务处理）
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


def _rewrite_json_array_field(engine: Engine, oss_base: str) -> int:
    """改写 l4_marketing_projects.images JSON 数组字段.

    用 Core select/update 让 SQLAlchemy 按 JSON 列类型反序列化/序列化。

    Returns:
        改写记录数

    """
    if not _column_exists(engine, _JSON_ARRAY_TABLE, _JSON_ARRAY_COLUMN):
        logger.warning("迁移：%s.%s 列不存在，跳过", _JSON_ARRAY_TABLE, _JSON_ARRAY_COLUMN)
        return 0

    with engine.begin() as conn:
        # CAST(images AS text) LIKE 用于过滤含 /static/uploads/ 的 JSON 行
        stmt = select(L4MarketingProject.id, L4MarketingProject.images).where(
            text("CAST(images AS text) LIKE '%/static/uploads/%'"),
        )
        rows = conn.execute(stmt).fetchall()

        rewritten = 0
        for row in rows:
            if row[1] is None:
                continue
            fixed = _rewrite_json_array_urls(row[1], oss_base)
            if fixed is None:
                continue
            conn.execute(
                update(L4MarketingProject).where(L4MarketingProject.id == row[0]).values(images=fixed),
            )
            rewritten += 1

        if rewritten:
            logger.info(
                "迁移：%s.%s: 改写 %d 条 JSON URL",
                _JSON_ARRAY_TABLE,
                _JSON_ARRAY_COLUMN,
                rewritten,
            )

    return rewritten


def migrate_uploads_to_oss(engine: Engine) -> None:
    """迁移本地 uploads 到 OSS 并改写 DB URL.

    幂等：已上传到 OSS 的文件跳过，已是 OSS URL 的记录跳过。
    仅当 settings.storage_backend == "oss" 时执行。
    完成后写入 Redis 标记，后续启动跳过重复扫描。
    """
    if settings.storage_backend != "oss":
        logger.info("跳过 OSS 迁移：storage_backend=%s", settings.storage_backend)
        return

    oss_base = settings.oss_public_base_url
    if not oss_base:
        logger.warning("迁移：oss_public_base_url 未配置，跳过 OSS 迁移")
        return

    # 完成标记：避免每次启动重复扫描所有文件（file_exists 网络开销）
    # Redis 不可用时降级为正常执行（迁移本身幂等，重复执行无副作用）
    try:
        from utils.redis_client import get_redis_client  # noqa: PLC0415

        redis_client = get_redis_client()
        if redis_client.get(_MIGRATION_DONE_KEY):
            logger.info("跳过 OSS 迁移：已完成（Redis 标记存在）")
            return
    except Exception:  # noqa: BLE001
        logger.debug("Redis 不可用，无法检查迁移标记，继续执行迁移")

    logger.info("迁移：开始将本地 uploads 迁移到 OSS（base_url=%s）", oss_base)

    # A. 上传本地文件到 OSS
    uploaded, skipped = _upload_local_files()

    # B. 改写 DB URL
    # B1. 普通字符串 URL 字段
    simple_rewritten = _rewrite_simple_url_fields(engine, oss_base)
    # B2. JSON 数组 URL 字段
    json_rewritten = _rewrite_json_array_field(engine, oss_base)

    logger.info(
        "迁移：OSS 迁移完成（文件上传 %d，跳过 %d，DB URL 改写 %d，JSON 改写 %d）",
        uploaded,
        skipped,
        simple_rewritten,
        json_rewritten,
    )

    # 写入完成标记（无 TTL，持久化；Redis 数据丢失时迁移会重新执行，幂等无副作用）
    try:
        redis_client.set(_MIGRATION_DONE_KEY, "1")
    except Exception:  # noqa: BLE001
        logger.warning("迁移：无法写入 Redis 完成标记，下次启动将重新检查")
