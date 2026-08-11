"""回填 OSS properties/ 前缀对象的 Content-Disposition: inline（幂等）.

阿里云 2022 年后新建 public-read Bucket 默认返回 Content-Disposition: attachment，
导致微信小程序 <image> 无法内联显示（downloadFile 机制尊重 attachment 头，浏览器
<img> 子资源请求则忽略）。此脚本通过 copy_object（同源同目标复制 + 更新 metadata）
回填现有对象的 Content-Disposition 为 inline。

幂等性：head_object 检查已为 inline 的对象跳过；完成后写入 Redis 标记，后续启动跳过。
仅当 settings.storage_backend == "oss" 时执行。
"""

import logging

from redis import Redis
from sqlalchemy.engine import Engine

from settings import settings

logger = logging.getLogger(__name__)

# Redis 完成标记 key（避免每次启动重复遍历 OSS 对象）
_CONTENT_DISPOSITION_DONE_KEY = "profo:migration:oss_content_disposition_done"

# 需要回填的 OSS 对象前缀（房源户型图存储路径）
_PREFIX = "properties/"


def _get_redis_client_safe() -> Redis | None:
    """获取 Redis 客户端，失败返回 None（迁移本身幂等，Redis 故障时正常执行）."""
    try:
        from utils.redis_client import get_redis_client

        return get_redis_client()
    except Exception:
        logger.debug("Redis 不可用，无法读写迁移标记，继续执行")
        return None


def backfill_oss_content_disposition(engine: Engine) -> None:  # noqa: ARG001
    """幂等回填 OSS properties/ 前缀对象的 Content-Disposition: inline.

    Args:
        engine: SQLAlchemy 引擎（本迁移不操作数据库，仅为接口一致性保留）

    """
    if settings.storage_backend != "oss":
        logger.info("跳过 Content-Disposition 回填：storage_backend=%s", settings.storage_backend)
        return

    redis_client = _get_redis_client_safe()
    if redis_client is not None and redis_client.get(_CONTENT_DISPOSITION_DONE_KEY):
        logger.info("跳过 Content-Disposition 回填：已完成（Redis 标记存在）")
        return

    import oss2

    auth = oss2.Auth(settings.oss_access_key_id, settings.oss_access_key_secret)
    bucket = oss2.Bucket(auth, settings.oss_endpoint, settings.oss_bucket_name)

    updated = 0
    skipped = 0

    for obj in oss2.ObjectIterator(bucket, prefix=_PREFIX):
        # 读取当前 metadata
        meta = bucket.head_object(obj.key)
        current_disp = meta.headers.get("Content-Disposition", "")
        if current_disp == "inline":
            skipped += 1
            continue

        # copy_object 同源同目标复制，仅更新 metadata
        # 必须设置 x-oss-metadata-directive: Replaced 才能覆盖元数据
        # 同时保留 Content-Type（Replaced 会清除未指定的元数据）
        # Content-Disposition / Content-Type 是标准 HTTP header，oss2.headers
        # 模块未提供对应常量，直接用字符串字面量
        content_type = meta.headers.get("Content-Type", "")
        headers: dict[str, str] = {
            "Content-Disposition": "inline",
            oss2.headers.OSS_METADATA_DIRECTIVE: "Replaced",
        }
        if content_type:
            headers["Content-Type"] = content_type

        bucket.copy_object(settings.oss_bucket_name, obj.key, obj.key, headers=headers)
        updated += 1

        if updated % 100 == 0:
            logger.info("Content-Disposition 回填进度：已更新 %d，已跳过 %d", updated, skipped)

    logger.info(
        "Content-Disposition 回填完成：已更新 %d 个对象，已跳过 %d 个（已是 inline）",
        updated,
        skipped,
    )

    try:
        if redis_client is not None:
            redis_client.set(_CONTENT_DISPOSITION_DONE_KEY, "1")
    except Exception:
        logger.warning("迁移：无法写入 Content-Disposition 回填标记，下次启动将重新检查")


if __name__ == "__main__":
    # 带外执行入口：python -m migrations.backfill_oss_content_disposition
    from db import engine

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    )
    backfill_oss_content_disposition(engine)
