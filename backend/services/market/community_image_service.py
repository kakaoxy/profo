"""小区户型图库服务.

提供小区户型图的 CRUD 与推送时自动归类能力.

设计要点：
- 整个模块只管户型图，不区分 ``media_type``
- ``classify_to_community`` 接收已选好的户型图 URL（选择逻辑在 importer 层用
  ``get_floor_plan`` 完成），重复 URL 跳过，``community_id`` 为空时跳过
- 软删除（``is_deleted=True``）的记录不参与唯一约束，可重新插入
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError
from sqlalchemy.orm import Session

from models.property import CommunityImage, CommunityImageSource
from schemas.community_image import (
    CommunityImageCreate,
    CommunityImageListResponse,
    CommunityImageResponse,
    CommunityImageUpdate,
)
from services.system.exceptions import ResourceNotFoundError, ServiceException, ValidationError

logger = logging.getLogger(__name__)


class CommunityImageService:
    """小区户型图库服务."""

    @staticmethod
    def list_by_community(
        db: Session,
        community_id: str,
        page: int = 1,
        page_size: int = 20,
    ) -> CommunityImageListResponse:
        """按小区查询户型图列表（仅未删除）.

        Args:
            db: 数据库会话
            community_id: 小区ID
            page: 页码（从 1 开始）
            page_size: 每页数量

        Returns:
            CommunityImageListResponse: 分页列表响应

        """
        base_filter = (
            CommunityImage.community_id == community_id,
            CommunityImage.is_deleted.is_(False),
        )

        total = db.query(func.count(CommunityImage.id)).filter(*base_filter).scalar() or 0

        items = (
            db.query(CommunityImage)
            .filter(*base_filter)
            .order_by(CommunityImage.sort_order.asc(), CommunityImage.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return CommunityImageListResponse(
            total=total,
            items=[CommunityImageResponse.model_validate(item) for item in items],
        )

    @staticmethod
    def create_uploaded(
        db: Session,
        community_id: str,
        body: CommunityImageCreate,
    ) -> CommunityImageResponse:
        """创建 admin 手动上传的户型图记录.

        Args:
            db: 数据库会话
            community_id: 关联小区ID
            body: 创建请求（含 url / thumbnail_url / description）

        Returns:
            CommunityImageResponse: 创建后的响应

        Raises:
            ValidationError: 同小区已存在相同 URL 的未删除户型图
            ServiceException: 数据库操作失败

        """
        # 应用层去重（SQLite 测试环境无部分唯一索引兜底）
        existing = (
            db.query(CommunityImage)
            .filter(
                CommunityImage.community_id == community_id,
                CommunityImage.url == body.url,
                CommunityImage.is_deleted.is_(False),
            )
            .first()
        )
        if existing is not None:
            msg = "该小区已存在相同 URL 的户型图"
            raise ValidationError(msg)

        image = CommunityImage(
            community_id=community_id,
            url=body.url,
            thumbnail_url=body.thumbnail_url,
            source=CommunityImageSource.UPLOADED,
            source_property_id=None,
            description=body.description,
            sort_order=0,
            is_deleted=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        db.add(image)
        try:
            db.flush()
            db.commit()
            db.refresh(image)
        except IntegrityError as e:
            db.rollback()
            logger.warning("创建户型图时唯一约束冲突: community_id=%s, url=%s, err=%s", community_id, body.url, e)
            msg = "该小区已存在相同 URL 的户型图"
            raise ValidationError(msg) from e
        except SQLAlchemyError:
            db.rollback()
            logger.exception("创建户型图数据库错误: community_id=%s", community_id)
            msg = "创建户型图失败"
            raise ServiceException(msg) from None

        logger.info("创建户型图成功: id=%s, community_id=%s", image.id, community_id)
        return CommunityImageResponse.model_validate(image)

    @staticmethod
    def update(
        db: Session,
        image_id: int,
        body: CommunityImageUpdate,
    ) -> CommunityImageResponse:
        """更新户型图描述/排序（PATCH 语义）.

        Args:
            db: 数据库会话
            image_id: 户型图ID
            body: 更新请求

        Returns:
            CommunityImageResponse: 更新后的响应

        Raises:
            ResourceNotFoundError: 户型图不存在或已删除
            ServiceException: 数据库操作失败

        """
        image = (
            db.query(CommunityImage)
            .filter(
                CommunityImage.id == image_id,
                CommunityImage.is_deleted.is_(False),
            )
            .first()
        )
        if image is None:
            msg = "户型图不存在"
            raise ResourceNotFoundError(msg)

        update_data = body.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            setattr(image, field, value)
        image.updated_at = datetime.now(timezone.utc)

        try:
            db.commit()
            db.refresh(image)
        except SQLAlchemyError:
            db.rollback()
            logger.exception("更新户型图数据库错误: id=%s", image_id)
            msg = "更新户型图失败"
            raise ServiceException(msg) from None

        return CommunityImageResponse.model_validate(image)

    @staticmethod
    def soft_delete(db: Session, image_id: int) -> None:
        """软删除户型图（``is_deleted=True``）.

        Args:
            db: 数据库会话
            image_id: 户型图ID

        Raises:
            ResourceNotFoundError: 户型图不存在或已删除
            ServiceException: 数据库操作失败

        """
        image = (
            db.query(CommunityImage)
            .filter(
                CommunityImage.id == image_id,
                CommunityImage.is_deleted.is_(False),
            )
            .first()
        )
        if image is None:
            msg = "户型图不存在"
            raise ResourceNotFoundError(msg)

        image.is_deleted = True
        image.updated_at = datetime.now(timezone.utc)

        try:
            db.commit()
        except SQLAlchemyError:
            db.rollback()
            logger.exception("软删除户型图数据库错误: id=%s", image_id)
            msg = "删除户型图失败"
            raise ServiceException(msg) from None

        logger.info("软删除户型图成功: id=%s", image_id)

    @staticmethod
    def classify_to_community(
        db: Session,
        community_id: str | None,
        url: str,
        source_property_id: str | None = None,
    ) -> None:
        """推送房源时自动归类户型图到小区户型图库.

        接收已选好的户型图 URL（选择逻辑在 importer 层用 ``get_floor_plan`` 完成）。
        - ``community_id`` 为空时跳过，不报错
        - 重复 URL（同小区未删除）跳过，不报错
        - 同 ``source_property_id`` 的未删除记录已存在时，**更新其 URL**
          （房源重新导入时下载会生成新本地 URL，按 URL 去重会无限累积，
          按来源房源 ID 覆盖 URL 才能保持一房一图）
        - ``source=scraped``，``source_property_id`` 填房源来源 ID

        Args:
            db: 数据库会话
            community_id: 小区ID（可空，空时跳过）
            url: 户型图 URL（已下载到本地存储后的 URL 或外站 URL）
            source_property_id: 来源房源ID

        """
        if not community_id:
            logger.debug("community_id 为空，跳过户型图归类: url=%s", url)
            return

        # 1. 按 URL 去重（与 PostgreSQL 部分唯一索引双保险，SQLite 测试环境由此兜底）
        existing_by_url = (
            db.query(CommunityImage)
            .filter(
                CommunityImage.community_id == community_id,
                CommunityImage.url == url,
                CommunityImage.is_deleted.is_(False),
            )
            .first()
        )
        if existing_by_url is not None:
            logger.debug("户型图已存在，跳过归类: community_id=%s, url=%s", community_id, url)
            return

        # 2. 按 source_property_id 覆盖：同小区同来源房源已有未删除记录时，
        #    更新其 URL（避免重复下载生成的不同本地 URL 导致累积）
        if source_property_id:
            existing_by_source = (
                db.query(CommunityImage)
                .filter(
                    CommunityImage.community_id == community_id,
                    CommunityImage.source_property_id == source_property_id,
                    CommunityImage.is_deleted.is_(False),
                )
                .first()
            )
            if existing_by_source is not None:
                existing_by_source.url = url
                existing_by_source.updated_at = datetime.now(timezone.utc)
                # 使用 savepoint 保护：flush 失败时仅回滚 savepoint，
                # 不污染外层事务（importer / 脚本批处理仍可正常提交其余记录）
                nested = db.begin_nested()
                try:
                    db.flush()
                    nested.commit()
                except SQLAlchemyError:
                    nested.rollback()
                    logger.exception(
                        "更新户型图 URL 失败: community_id=%s, source_property_id=%s",
                        community_id,
                        source_property_id,
                    )
                else:
                    logger.info(
                        "更新户型图 URL: community_id=%s, source_property_id=%s, url=%s",
                        community_id,
                        source_property_id,
                        url,
                    )
                return

        image = CommunityImage(
            community_id=community_id,
            url=url,
            thumbnail_url=None,
            source=CommunityImageSource.SCRAPED,
            source_property_id=source_property_id,
            description=None,
            sort_order=0,
            is_deleted=False,
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc),
        )
        # 使用 savepoint 保护：IntegrityError 时仅回滚 savepoint，
        # 不影响外层事务（如 importer 已 flush 的 property_media 记录）
        nested = db.begin_nested()
        db.add(image)
        try:
            db.flush()
            nested.commit()
        except IntegrityError as e:
            # PostgreSQL 部分唯一索引冲突 = 已存在，回滚 savepoint 并跳过
            nested.rollback()
            logger.debug("户型图唯一约束冲突，跳过归类: community_id=%s, url=%s, err=%s", community_id, url, e)
            return
        logger.info("归类户型图成功: community_id=%s, url=%s", community_id, url)


def get_community_image_service() -> CommunityImageService:
    """获取小区户型图库服务实例."""
    return CommunityImageService()
