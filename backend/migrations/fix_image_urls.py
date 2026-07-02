"""迁移：将数据库中的绝对 URL 转为相对路径.

幂等设计：仅处理包含已知后端 host 的 URL，已为相对路径的记录不受影响.
"""
import json
import logging

from sqlalchemy import text
from sqlalchemy.engine import Engine

logger = logging.getLogger(__name__)

# 需要处理的 host 前缀
HOST_PREFIXES = [
    "http://127.0.0.1:8000",
    "http://localhost:8000",
]


def _strip_host(url: str) -> str:
    """将绝对 URL 转为相对路径."""
    for prefix in HOST_PREFIXES:
        if url.startswith(prefix):
            return url[len(prefix):]
    return url


def _fix_json_array(value: str) -> str:
    """处理 JSON 数组中的 URL（如 l4_marketing_projects.images）."""
    try:
        urls = json.loads(value)
        if isinstance(urls, list):
            fixed = [_strip_host(u) if isinstance(u, str) else u for u in urls]
            return json.dumps(fixed, ensure_ascii=False)
    except (json.JSONDecodeError, TypeError):
        pass
    return value


def run_fix_image_urls(engine: Engine) -> None:
    """执行 URL 迁移."""
    with engine.begin() as conn:
        # 1. renovation_photos.url
        rows = conn.execute(text(
            "SELECT id, url FROM renovation_photos WHERE url LIKE 'http://%'"
        )).fetchall()
        for row in rows:
            conn.execute(text(
                "UPDATE renovation_photos SET url = :url WHERE id = :id"
            ), {"url": _strip_host(row[1]), "id": row[0]})
        if rows:
            logger.info("renovation_photos.url: 修正 %d 条 URL", len(rows))

        # 2. property_media.url
        rows = conn.execute(text(
            "SELECT id, url FROM property_media WHERE url LIKE 'http://%'"
        )).fetchall()
        for row in rows:
            conn.execute(text(
                "UPDATE property_media SET url = :url WHERE id = :id"
            ), {"url": _strip_host(row[1]), "id": row[0]})
        if rows:
            logger.info("property_media.url: 修正 %d 条 URL", len(rows))

        # 3. l4_marketing_media.file_url / thumbnail_url
        for col in ("file_url", "thumbnail_url"):
            rows = conn.execute(text(
                f"SELECT id, {col} FROM l4_marketing_media WHERE {col} LIKE 'http://%'"
            )).fetchall()
            for row in rows:
                conn.execute(text(
                    f"UPDATE l4_marketing_media SET {col} = :url WHERE id = :id"
                ), {"url": _strip_host(row[1]), "id": row[0]})
            if rows:
                logger.info("l4_marketing_media.%s: 修正 %d 条 URL", col, len(rows))

        # 4. l4_marketing_projects.images (JSON 数组)
        rows = conn.execute(text(
            "SELECT id, images FROM l4_marketing_projects WHERE images LIKE '%http://%'"
        )).fetchall()
        for row in rows:
            if row[1]:
                conn.execute(text(
                    "UPDATE l4_marketing_projects SET images = :images WHERE id = :id"
                ), {"images": _fix_json_array(row[1]), "id": row[0]})
        if rows:
            logger.info("l4_marketing_projects.images: 修正 %d 条 JSON", len(rows))
