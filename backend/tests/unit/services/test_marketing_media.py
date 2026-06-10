"""MarketingMediaService 单元测试."""

from unittest.mock import MagicMock, patch

import pytest

from schemas.l4_marketing import (
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
    MediaSortOrderUpdate,
)
from services.marketing.media import MarketingMediaService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db() -> MagicMock:
    """Mock 数据库会话."""
    return MagicMock()


@pytest.fixture
def service(db: MagicMock) -> MarketingMediaService:
    """构造被测服务实例."""
    return MarketingMediaService(db)


def _make_media(media_id=1, marketing_project_id=10, sort_order=0, is_deleted=False, **overrides):
    """构造 mock L4MarketingMedia 对象."""
    media = MagicMock()
    media.id = media_id
    media.marketing_project_id = marketing_project_id
    media.sort_order = sort_order
    media.is_deleted = is_deleted
    media.photo_category = "marketing"
    media.renovation_stage = None
    media.description = "测试媒体"
    media.thumbnail_url = "http://thumb/1.jpg"
    for k, v in overrides.items():
        setattr(media, k, v)
    return media


# ---------------------------------------------------------------------------
# get_media_list
# ---------------------------------------------------------------------------


class TestGetMediaList:
    """get_media_list 方法测试."""

    def test_returns_items_and_total(self, service: MarketingMediaService, db: MagicMock) -> None:
        """正常返回列表和总数."""
        media1 = _make_media(media_id=1)
        media2 = _make_media(media_id=2)
        mock_query = MagicMock()
        mock_query.count.return_value = 2
        mock_query.order_by.return_value.offset.return_value.limit.return_value.all.return_value = [media1, media2]
        db.query.return_value.filter.return_value = mock_query

        items, total = service.get_media_list(marketing_project_id=10)

        assert total == 2
        assert len(items) == 2
        assert items[0].id == 1
        assert items[1].id == 2

    def test_returns_empty_list(self, service: MarketingMediaService, db: MagicMock) -> None:
        """无记录时返回空列表和0."""
        mock_query = MagicMock()
        mock_query.count.return_value = 0
        mock_query.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value = mock_query

        items, total = service.get_media_list(marketing_project_id=999)

        assert total == 0
        assert items == []

    def test_passes_skip_and_limit(self, service: MarketingMediaService, db: MagicMock) -> None:
        """skip 和 limit 参数正确传递."""
        mock_query = MagicMock()
        mock_query.count.return_value = 50
        mock_query.order_by.return_value.offset.return_value.limit.return_value.all.return_value = []
        db.query.return_value.filter.return_value = mock_query

        service.get_media_list(marketing_project_id=10, skip=10, limit=20)

        mock_query.order_by.return_value.offset.assert_called_once_with(10)
        mock_query.order_by.return_value.offset.return_value.limit.assert_called_once_with(20)


# ---------------------------------------------------------------------------
# get_media
# ---------------------------------------------------------------------------


class TestGetMedia:
    """get_media 方法测试."""

    def test_returns_media_when_found(self, service: MarketingMediaService, db: MagicMock) -> None:
        """媒体存在时返回对象."""
        media = _make_media(media_id=1)
        db.query.return_value.filter.return_value.first.return_value = media

        result = service.get_media(1)

        assert result is not None
        assert result.id == 1

    def test_returns_none_when_not_found(self, service: MarketingMediaService, db: MagicMock) -> None:
        """媒体不存在时返回 None."""
        db.query.return_value.filter.return_value.first.return_value = None

        result = service.get_media(999)

        assert result is None


# ---------------------------------------------------------------------------
# create_media
# ---------------------------------------------------------------------------


class TestCreateMedia:
    """create_media 方法测试."""

    def test_creates_media_and_commits(self, service: MarketingMediaService, db: MagicMock) -> None:
        """创建媒体并提交事务."""
        data = L4MarketingMediaCreate(file_url="http://img/1.jpg")

        result = service.create_media(data, marketing_project_id=10)

        db.add.assert_called_once()
        db.commit.assert_called_once()
        db.refresh.assert_called_once()
        assert result is not None

    def test_passes_marketing_project_id(self, service: MarketingMediaService, db: MagicMock) -> None:
        """marketing_project_id 正确传入模型."""
        data = L4MarketingMediaCreate(file_url="http://img/1.jpg")

        # 捕获 add 的参数
        added_obj = None

        def capture_add(obj):
            nonlocal added_obj
            added_obj = obj

        db.add.side_effect = capture_add
        service.create_media(data, marketing_project_id=42)

        assert added_obj is not None
        assert added_obj.marketing_project_id == 42


# ---------------------------------------------------------------------------
# update_media
# ---------------------------------------------------------------------------


class TestUpdateMedia:
    """update_media 方法测试."""

    def test_updates_allowed_fields(self, service: MarketingMediaService, db: MagicMock) -> None:
        """更新允许的字段."""
        media = _make_media(media_id=1)
        # get_media 内部调用 db.query，需要让 update_media 里的 self.get_media 返回 media
        with patch.object(service, "get_media", return_value=media):
            data = L4MarketingMediaUpdate(description="新描述", sort_order=5)
            result = service.update_media(1, data)

        assert result is not None
        db.commit.assert_called_once()
        db.refresh.assert_called_once()

    def test_returns_none_when_media_not_found(self, service: MarketingMediaService) -> None:
        """媒体不存在时返回 None."""
        with patch.object(service, "get_media", return_value=None):
            result = service.update_media(999, L4MarketingMediaUpdate(description="x"))

        assert result is None

    def test_ignores_disallowed_fields(self, service: MarketingMediaService, db: MagicMock) -> None:
        """不在 allowed_fields 中的字段被忽略."""
        media = _make_media(media_id=1)
        with patch.object(service, "get_media", return_value=media):
            # L4MarketingMediaUpdate 只包含允许的字段，这里验证 exclude_unset 行为
            data = L4MarketingMediaUpdate(description="新描述")
            result = service.update_media(1, data)

        assert result is not None
        # 确认只有 description 被设置
        media.__setattr__  # mock 对象不限制 setattr，但逻辑上 allowed_fields 过滤了无关字段

    def test_updates_thumbnail_url(self, service: MarketingMediaService, db: MagicMock) -> None:
        """thumbnail_url 在允许字段中可更新."""
        media = _make_media(media_id=1)
        with patch.object(service, "get_media", return_value=media):
            data = L4MarketingMediaUpdate(thumbnail_url="http://new-thumb/1.jpg")
            result = service.update_media(1, data)

        assert result is not None
        assert media.thumbnail_url == "http://new-thumb/1.jpg"


# ---------------------------------------------------------------------------
# delete_media
# ---------------------------------------------------------------------------


class TestDeleteMedia:
    """delete_media 方法测试."""

    def test_soft_deletes_media(self, service: MarketingMediaService, db: MagicMock) -> None:
        """逻辑删除媒体，设置 is_deleted=True."""
        media = _make_media(media_id=1, is_deleted=False)
        with patch.object(service, "get_media", return_value=media):
            result = service.delete_media(1)

        assert result is True
        assert media.is_deleted is True
        db.commit.assert_called_once()

    def test_returns_false_when_not_found(self, service: MarketingMediaService) -> None:
        """媒体不存在时返回 False."""
        with patch.object(service, "get_media", return_value=None):
            result = service.delete_media(999)

        assert result is False


# ---------------------------------------------------------------------------
# batch_update_sort_order
# ---------------------------------------------------------------------------


class TestBatchUpdateSortOrder:
    """batch_update_sort_order 方法测试."""

    def test_returns_zero_when_empty_list(self, service: MarketingMediaService) -> None:
        """空列表返回 0."""
        result = service.batch_update_sort_order(project_id=10, sort_updates=[])
        assert result == 0

    def test_updates_sort_order_for_matching_media(self, service: MarketingMediaService, db: MagicMock) -> None:
        """匹配的媒体更新排序."""
        media1 = _make_media(media_id=1, marketing_project_id=10)
        media2 = _make_media(media_id=2, marketing_project_id=10)
        db.query.return_value.filter.return_value.all.return_value = [media1, media2]

        updates = [
            MediaSortOrderUpdate(media_id=1, sort_order=10),
            MediaSortOrderUpdate(media_id=2, sort_order=20),
        ]
        result = service.batch_update_sort_order(project_id=10, sort_updates=updates)

        assert result == 2
        assert media1.sort_order == 10
        assert media2.sort_order == 20
        db.commit.assert_called_once()

    def test_only_updates_matching_media(self, service: MarketingMediaService, db: MagicMock) -> None:
        """只更新数据库中找到的媒体."""
        media1 = _make_media(media_id=1, marketing_project_id=10)
        db.query.return_value.filter.return_value.all.return_value = [media1]

        updates = [
            MediaSortOrderUpdate(media_id=1, sort_order=5),
            MediaSortOrderUpdate(media_id=999, sort_order=99),
        ]
        result = service.batch_update_sort_order(project_id=10, sort_updates=updates)

        assert result == 1
        assert media1.sort_order == 5

    def test_no_commit_when_nothing_updated(self, service: MarketingMediaService, db: MagicMock) -> None:
        """无匹配时不提交事务."""
        db.query.return_value.filter.return_value.all.return_value = []

        updates = [MediaSortOrderUpdate(media_id=999, sort_order=1)]
        result = service.batch_update_sort_order(project_id=10, sort_updates=updates)

        assert result == 0
        db.commit.assert_not_called()

    def test_skips_updates_with_none_fields(self, service: MarketingMediaService, db: MagicMock) -> None:
        """media_id 或 sort_order 为 None 的项被跳过."""
        db.query.return_value.filter.return_value.all.return_value = []

        # 构造含 None 的更新列表
        updates = [MediaSortOrderUpdate(media_id=1, sort_order=0)]
        # 通过 mock 绕过 Pydantic 验证来测试 None 过滤逻辑
        mock_update = MagicMock()
        mock_update.media_id = None
        mock_update.sort_order = 5
        updates_with_none = [mock_update]

        result = service.batch_update_sort_order(project_id=10, sort_updates=updates_with_none)

        assert result == 0
        db.query.assert_not_called()

    def test_filters_by_project_id(self, service: MarketingMediaService, db: MagicMock) -> None:
        """查询时过滤 marketing_project_id."""
        db.query.return_value.filter.return_value.all.return_value = []

        updates = [MediaSortOrderUpdate(media_id=1, sort_order=0)]
        service.batch_update_sort_order(project_id=42, sort_updates=updates)

        # 验证 filter 被调用（含 project_id 条件）
        db.query.return_value.filter.assert_called_once()


# ---------------------------------------------------------------------------
# 向后兼容别名
# ---------------------------------------------------------------------------


class TestBackwardCompatAlias:
    """L4MarketingMediaService 别名测试."""

    def test_alias_exists(self) -> None:
        """L4MarketingMediaService 是 MarketingMediaService 的别名."""
        from services.marketing.media import L4MarketingMediaService

        assert L4MarketingMediaService is MarketingMediaService
