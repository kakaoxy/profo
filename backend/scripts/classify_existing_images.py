"""历史数据归类脚本.

将现有 ``property_media`` 中的户型图归类到 ``community_images`` 表。

背景：
- 本 spec 上线前，``property_media`` 可能含多张非户型图（室内图/外观图）
- 上线后新推送的房源 ``property_media`` 只会有 1 张户型图
- 此脚本处理上线前的历史数据，对每组房源的图片调用 ``get_floor_plan`` 选出户型图，
  JOIN ``property_current`` 获取 ``community_id``，插入 ``community_images``

幂等性：
- 跳过已存在的 ``(community_id, url)`` 记录（依赖 ``CommunityImageService.classify_to_community``
  的应用层去重 + PostgreSQL 部分唯一索引）

运行方式::

    cd backend
    python -m scripts.classify_existing_images

"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict

from sqlalchemy import tuple_
from sqlalchemy.orm import Session

from db import SessionLocal
from models.property import PropertyCurrent, PropertyMedia
from services.market.community_image_service import CommunityImageService
from utils.floor_plan import get_floor_plan

logger = logging.getLogger(__name__)


def classify_existing_images(db: Session) -> tuple[int, int, int]:
    """归类历史户型图数据.

    Args:
        db: 数据库会话

    Returns:
        (total_properties, classified, skipped) 元组：
        - total_properties: 扫描的房源总数
        - classified: 成功归类的户型图数
        - skipped: 跳过的房源数（选不到户型图 / 无小区 / 重复）

    """
    # 1. 查询所有 property_media 记录，按 (data_source, source_property_id) 分组
    media_records = (
        db.query(
            PropertyMedia.data_source,
            PropertyMedia.source_property_id,
            PropertyMedia.url,
        )
        .order_by(PropertyMedia.data_source, PropertyMedia.source_property_id, PropertyMedia.sort_order)
        .all()
    )

    grouped: dict[tuple[str, str], list[str]] = defaultdict(list)
    for data_source, source_property_id, url in media_records:
        grouped[(data_source, source_property_id)].append(url)

    logger.info("扫描到 %s 个房源的 %s 条媒体记录", len(grouped), len(media_records))

    # 2. 批量查询关联的 community_id（通过 property_current）
    keys = list(grouped.keys())
    community_map: dict[tuple[str, str], str | None] = {}
    # 分批查询避免 IN 子句过长
    batch_size = 500
    for i in range(0, len(keys), batch_size):
        batch = keys[i : i + batch_size]
        rows = (
            db.query(
                PropertyCurrent.data_source,
                PropertyCurrent.source_property_id,
                PropertyCurrent.community_id,
            )
            .filter(
                PropertyCurrent.is_active.is_(True),
            )
            .filter(
                tuple_(PropertyCurrent.data_source, PropertyCurrent.source_property_id).in_(batch),
            )
            .all()
        )
        for ds, spid, cid in rows:
            community_map[(ds, spid)] = cid

    # 3. 对每组调用 get_floor_plan 选户型图，归类到 community_images
    total_properties = len(grouped)
    classified = 0
    skipped = 0

    for (data_source, source_property_id), urls in grouped.items():
        community_id = community_map.get((data_source, source_property_id))

        if not community_id:
            skipped += 1
            logger.debug(
                "跳过：房源未关联小区: data_source=%s, source_property_id=%s",
                data_source,
                source_property_id,
            )
            continue

        floor_plan_url = get_floor_plan(data_source, urls)
        if not floor_plan_url:
            skipped += 1
            logger.debug(
                "跳过：未识别到户型图: data_source=%s, source_property_id=%s, urls=%s",
                data_source,
                source_property_id,
                urls,
            )
            continue

        try:
            CommunityImageService.classify_to_community(
                db=db,
                community_id=community_id,
                url=floor_plan_url,
                source_property_id=source_property_id,
            )
            classified += 1
        except Exception as e:
            skipped += 1
            logger.warning(
                "归类失败: data_source=%s, source_property_id=%s, url=%s, err=%s",
                data_source,
                source_property_id,
                floor_plan_url,
                e,
            )

    db.commit()
    logger.info(
        "归类完成：扫描 %s 个房源，归类 %s 张户型图，跳过 %s 个",
        total_properties,
        classified,
        skipped,
    )
    return total_properties, classified, skipped


def main() -> None:
    """脚本入口."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )

    db = SessionLocal()
    try:
        total, classified, skipped = classify_existing_images(db)
        print("\n=== 历史户型图归类完成 ===")
        print(f"扫描房源总数: {total}")
        print(f"归类户型图数: {classified}")
        print(f"跳过房源数:   {skipped}")
    except Exception:
        db.rollback()
        logger.exception("历史户型图归类脚本执行失败")
        sys.exit(1)
    finally:
        db.close()


if __name__ == "__main__":
    main()
