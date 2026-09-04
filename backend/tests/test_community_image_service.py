"""``services.market.community_image_service`` 单元测试.

覆盖 ``CommunityImageService`` 的 CRUD + ``classify_to_community`` 方法，
含选不到户型图、重复 URL、小区为空等场景。
"""

from __future__ import annotations

import pytest
from sqlalchemy.orm import Session

from models.property import CommunityImage, CommunityImageSource
from schemas.community_image import CommunityImageCreate, CommunityImageUpdate
from services.market.community_image_service import CommunityImageService
from services.system.exceptions import ResourceNotFoundError, ValidationError

# ==================== 辅助函数 ====================


def _count_images(db_session: Session, community_id: str) -> int:
    """统计未删除的户型图数量."""
    return (
        db_session.query(CommunityImage)
        .filter(
            CommunityImage.community_id == community_id,
            CommunityImage.is_deleted.is_(False),
        )
        .count()
    )


# ==================== list_by_community ====================


class TestListByCommunity:
    def test_empty_community(self, db_session: Session):
        """无户型图的小区返回空列表."""
        result = CommunityImageService.list_by_community(
            db=db_session,
            community_id="nonexistent-community",
            page=1,
            page_size=20,
        )
        assert result.total == 0
        assert result.items == []

    def test_returns_only_non_deleted(self, db_session: Session):
        """仅返回未删除的户型图."""
        community_id = "test-community-list"
        # 2 条未删除 + 1 条已删除
        for i in range(2):
            db_session.add(
                CommunityImage(
                    community_id=community_id,
                    url=f"https://example.com/active-{i}.jpg",
                    source=CommunityImageSource.UPLOADED,
                    is_deleted=False,
                ),
            )
        db_session.add(
            CommunityImage(
                community_id=community_id,
                url="https://example.com/deleted.jpg",
                source=CommunityImageSource.UPLOADED,
                is_deleted=True,
            ),
        )
        db_session.flush()

        result = CommunityImageService.list_by_community(
            db=db_session,
            community_id=community_id,
            page=1,
            page_size=20,
        )
        assert result.total == 2
        assert len(result.items) == 2

    def test_pagination(self, db_session: Session):
        """分页正确."""
        community_id = "test-community-page"
        for i in range(5):
            db_session.add(
                CommunityImage(
                    community_id=community_id,
                    url=f"https://example.com/page-{i}.jpg",
                    source=CommunityImageSource.UPLOADED,
                    is_deleted=False,
                ),
            )
        db_session.flush()

        result = CommunityImageService.list_by_community(
            db=db_session,
            community_id=community_id,
            page=2,
            page_size=2,
        )
        assert result.total == 5
        assert len(result.items) == 2


# ==================== create_uploaded ====================


class TestCreateUploaded:
    def test_create_success(self, db_session: Session):
        """成功创建上传户型图."""
        community_id = "test-community-create"
        body = CommunityImageCreate(
            url="https://example.com/upload.jpg",
            thumbnail_url="https://example.com/upload-thumb.webp",
            description="测试户型图",
        )
        result = CommunityImageService.create_uploaded(
            db=db_session,
            community_id=community_id,
            body=body,
        )
        assert result.id is not None
        assert result.community_id == community_id
        assert result.url == "https://example.com/upload.jpg"
        assert result.source == CommunityImageSource.UPLOADED
        assert result.description == "测试户型图"
        assert result.is_deleted is False

    def test_create_duplicate_url_raises_validation_error(self, db_session: Session):
        """同小区相同 URL 的未删除户型图重复创建抛 ValidationError."""
        community_id = "test-community-dup"
        db_session.add(
            CommunityImage(
                community_id=community_id,
                url="https://example.com/dup.jpg",
                source=CommunityImageSource.UPLOADED,
                is_deleted=False,
            ),
        )
        db_session.flush()

        body = CommunityImageCreate(url="https://example.com/dup.jpg")
        with pytest.raises(ValidationError, match="已存在"):
            CommunityImageService.create_uploaded(
                db=db_session,
                community_id=community_id,
                body=body,
            )

    def test_create_after_soft_delete(self, db_session: Session):
        """软删除后可重新插入相同 URL."""
        community_id = "test-community-recreate"
        db_session.add(
            CommunityImage(
                community_id=community_id,
                url="https://example.com/recreate.jpg",
                source=CommunityImageSource.UPLOADED,
                is_deleted=True,  # 已软删除
            ),
        )
        db_session.flush()

        body = CommunityImageCreate(url="https://example.com/recreate.jpg")
        result = CommunityImageService.create_uploaded(
            db=db_session,
            community_id=community_id,
            body=body,
        )
        assert result.url == "https://example.com/recreate.jpg"
        assert result.is_deleted is False


# ==================== update ====================


class TestUpdate:
    def test_update_description(self, db_session: Session):
        """更新描述."""
        community_id = "test-community-update"
        img = CommunityImage(
            community_id=community_id,
            url="https://example.com/update.jpg",
            source=CommunityImageSource.UPLOADED,
            is_deleted=False,
        )
        db_session.add(img)
        db_session.flush()

        result = CommunityImageService.update(
            db=db_session,
            image_id=img.id,
            body=CommunityImageUpdate(description="新描述"),
        )
        assert result.description == "新描述"

    def test_update_not_found(self, db_session: Session):
        """更新不存在的户型图抛 ResourceNotFoundError."""
        with pytest.raises(ResourceNotFoundError):
            CommunityImageService.update(
                db=db_session,
                image_id=99999,
                body=CommunityImageUpdate(description="x"),
            )

    def test_update_deleted_raises_not_found(self, db_session: Session):
        """更新已删除的户型图抛 ResourceNotFoundError."""
        img = CommunityImage(
            community_id="test-community",
            url="https://example.com/deleted.jpg",
            source=CommunityImageSource.UPLOADED,
            is_deleted=True,
        )
        db_session.add(img)
        db_session.flush()

        with pytest.raises(ResourceNotFoundError):
            CommunityImageService.update(
                db=db_session,
                image_id=img.id,
                body=CommunityImageUpdate(description="x"),
            )


# ==================== soft_delete ====================


class TestSoftDelete:
    def test_soft_delete_success(self, db_session: Session):
        """软删除成功."""
        img = CommunityImage(
            community_id="test-community-del",
            url="https://example.com/del.jpg",
            source=CommunityImageSource.UPLOADED,
            is_deleted=False,
        )
        db_session.add(img)
        db_session.flush()

        CommunityImageService.soft_delete(db=db_session, image_id=img.id)

        db_session.refresh(img)
        assert img.is_deleted is True

    def test_soft_delete_not_found(self, db_session: Session):
        """软删除不存在的户型图抛 ResourceNotFoundError."""
        with pytest.raises(ResourceNotFoundError):
            CommunityImageService.soft_delete(db=db_session, image_id=99999)

    def test_soft_delete_already_deleted(self, db_session: Session):
        """软删除已删除的户型图抛 ResourceNotFoundError."""
        img = CommunityImage(
            community_id="test-community",
            url="https://example.com/already-del.jpg",
            source=CommunityImageSource.UPLOADED,
            is_deleted=True,
        )
        db_session.add(img)
        db_session.flush()

        with pytest.raises(ResourceNotFoundError):
            CommunityImageService.soft_delete(db=db_session, image_id=img.id)


# ==================== classify_to_community ====================


class TestClassifyToCommunity:
    def test_classify_success(self, db_session: Session):
        """成功归类户型图（source=scraped）."""
        community_id = "test-community-classify"
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=community_id,
            url="https://example.com/floorplan.jpg",
            source_property_id="source-001",
        )
        db_session.flush()

        img = (
            db_session.query(CommunityImage)
            .filter(
                CommunityImage.community_id == community_id,
                CommunityImage.url == "https://example.com/floorplan.jpg",
            )
            .first()
        )
        assert img is not None
        assert img.source == CommunityImageSource.SCRAPED
        assert img.source_property_id == "source-001"
        assert img.is_deleted is False

    def test_classify_empty_community_id_skips(self, db_session: Session):
        """community_id 为空时跳过，不报错."""
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=None,
            url="https://example.com/skip.jpg",
            source_property_id="source-002",
        )
        # 不应有任何记录插入
        assert (
            db_session.query(CommunityImage).filter(CommunityImage.url == "https://example.com/skip.jpg").count() == 0
        )

    def test_classify_empty_string_community_id_skips(self, db_session: Session):
        """community_id 为空字符串时也跳过."""
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id="",
            url="https://example.com/skip2.jpg",
            source_property_id="source-003",
        )
        assert (
            db_session.query(CommunityImage).filter(CommunityImage.url == "https://example.com/skip2.jpg").count() == 0
        )

    def test_classify_duplicate_url_skips(self, db_session: Session):
        """重复 URL 跳过，不产生重复记录."""
        community_id = "test-community-dup-classify"
        # 先插入一条
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=community_id,
            url="https://example.com/dup-classify.jpg",
            source_property_id="source-004",
        )
        db_session.flush()

        # 再次插入相同 URL
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=community_id,
            url="https://example.com/dup-classify.jpg",
            source_property_id="source-004",
        )
        db_session.flush()

        count = _count_images(db_session, community_id)
        assert count == 1

    def test_classify_deleted_url_can_reinsert(self, db_session: Session):
        """已软删除的 URL 可重新插入."""
        community_id = "test-community-reclassify"
        db_session.add(
            CommunityImage(
                community_id=community_id,
                url="https://example.com/reclassify.jpg",
                source=CommunityImageSource.SCRAPED,
                source_property_id="old-source",
                is_deleted=True,
            ),
        )
        db_session.flush()

        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=community_id,
            url="https://example.com/reclassify.jpg",
            source_property_id="new-source",
        )
        db_session.flush()

        images = (
            db_session.query(CommunityImage)
            .filter(
                CommunityImage.community_id == community_id,
                CommunityImage.url == "https://example.com/reclassify.jpg",
            )
            .all()
        )
        # 应有 2 条：1 条已删除 + 1 条未删除
        assert len(images) == 2
        active = [img for img in images if not img.is_deleted]
        assert len(active) == 1
        assert active[0].source_property_id == "new-source"

    def test_classify_same_source_different_url_updates_existing(self, db_session: Session):
        """同 source_property_id 的不同 URL 应更新已有记录，而非插入新记录.

        模拟房源重新导入：下载生成的新本地 URL 不同，但来源房源相同，
        应覆盖旧 URL 避免累积重复记录。
        """
        community_id = "test-community-update-url"
        # 首次归类（模拟首次导入下载到 /static/uploads/properties/20260811_aaa.jpg）
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=community_id,
            url="/static/uploads/properties/20260811_aaa.jpg",
            source_property_id="source-reimport",
        )
        db_session.flush()

        # 再次归类（模拟重新导入：下载生成不同 UUID 文件名）
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id=community_id,
            url="/static/uploads/properties/20260811_bbb.jpg",
            source_property_id="source-reimport",
        )
        db_session.flush()

        # 应仅 1 条未删除记录，且 URL 被更新为新值
        active = (
            db_session.query(CommunityImage)
            .filter(
                CommunityImage.community_id == community_id,
                CommunityImage.is_deleted.is_(False),
            )
            .all()
        )
        assert len(active) == 1
        assert active[0].url == "/static/uploads/properties/20260811_bbb.jpg"
        assert active[0].source_property_id == "source-reimport"

    def test_classify_same_source_different_community_inserts_both(self, db_session: Session):
        """同 source_property_id 跨小区时分别插入（房源改小区的场景）."""
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id="community-a",
            url="/static/uploads/properties/a.jpg",
            source_property_id="source-cross-community",
        )
        CommunityImageService.classify_to_community(
            db=db_session,
            community_id="community-b",
            url="/static/uploads/properties/a.jpg",
            source_property_id="source-cross-community",
        )
        db_session.flush()

        count_a = _count_images(db_session, "community-a")
        count_b = _count_images(db_session, "community-b")
        assert count_a == 1
        assert count_b == 1
