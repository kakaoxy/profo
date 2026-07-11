"""迁移：将数据库中的绝对 URL 转为相对路径.

幂等设计：仅处理包含已知后端 host 的 URL，已为相对路径的记录不受影响.
"""

import json
import logging

from sqlalchemy import select, text, update
from sqlalchemy.engine import Engine

from models.marketing import L4MarketingMedia, L4MarketingProject

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
            return url[len(prefix) :]
    return url


def _fix_json_array(value: object) -> object:
    """处理 JSON 数组中的 URL（如 l4_marketing_projects.images）.

    兼容 list/str 输入（psycopg 读取 JSON 列时可能自动反序列化为 list）：
    - list: 直接遍历处理
    - str: 先 json.loads 再处理
    - None/空/非数组: 原样返回
    返回 list 或原值，由 Core update 按 JSON 列类型序列化写入.
    """
    if value is None:
        return value
    if isinstance(value, list):
        return [_strip_host(u) if isinstance(u, str) else u for u in value]
    if isinstance(value, str):
        if not value:
            return value
        try:
            parsed = json.loads(value)
            if isinstance(parsed, list):
                return [_strip_host(u) if isinstance(u, str) else u for u in parsed]
        except (json.JSONDecodeError, TypeError):
            pass
    return value


def run_fix_image_urls(engine: Engine) -> None:
    """执行 URL 迁移."""
    with engine.begin() as conn:
        # 1. renovation_photos.url
        rows = conn.execute(
            text(
                "SELECT id, url FROM renovation_photos WHERE url LIKE 'http://%'",
            ),
        ).fetchall()
        for row in rows:
            conn.execute(
                text(
                    "UPDATE renovation_photos SET url = :url WHERE id = :id",
                ),
                {"url": _strip_host(row[1]), "id": row[0]},
            )
        if rows:
            logger.info("renovation_photos.url: 修正 %d 条 URL", len(rows))

        # 2. property_media.url
        rows = conn.execute(
            text(
                "SELECT id, url FROM property_media WHERE url LIKE 'http://%'",
            ),
        ).fetchall()
        for row in rows:
            conn.execute(
                text(
                    "UPDATE property_media SET url = :url WHERE id = :id",
                ),
                {"url": _strip_host(row[1]), "id": row[0]},
            )
        if rows:
            logger.info("property_media.url: 修正 %d 条 URL", len(rows))

        # 3. l4_marketing_media.file_url / thumbnail_url
        # 用 Core update 保持与 JSON 列处理一致，由 SQLAlchemy 处理列类型
        for col in ("file_url", "thumbnail_url"):
            rows = conn.execute(
                text(
                    f"SELECT id, {col} FROM l4_marketing_media WHERE {col} LIKE 'http://%'",
                ),
            ).fetchall()
            for row in rows:
                conn.execute(
                    update(L4MarketingMedia).where(L4MarketingMedia.id == row[0]).values(**{col: _strip_host(row[1])}),
                )
            if rows:
                logger.info("l4_marketing_media.%s: 修正 %d 条 URL", col, len(rows))

        # 4. l4_marketing_projects.images (JSON 数组)
        # 用 Core select/update 让 SQLAlchemy 按 JSON 列类型反序列化/序列化，
        # 避免 psycopg 自动反序列化为 list 后 _fix_json_array 期望 str 的类型冲突
        stmt = select(L4MarketingProject.id, L4MarketingProject.images).where(
            text("CAST(images AS text) LIKE '%http://%'"),
        )
        rows = conn.execute(stmt).fetchall()
        for row in rows:
            if row[1]:
                fixed = _fix_json_array(row[1])
                conn.execute(update(L4MarketingProject).where(L4MarketingProject.id == row[0]).values(images=fixed))
        if rows:
            logger.info("l4_marketing_projects.images: 修正 %d 条 JSON", len(rows))
