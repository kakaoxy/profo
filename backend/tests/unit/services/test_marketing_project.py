"""MarketingProjectService 单元测试."""

from unittest.mock import MagicMock, call, patch

import pytest

from models.marketing.l4_marketing import MarketingProjectStatus, PublishStatus
from services.marketing.project import MarketingProjectService


# ---------------------------------------------------------------------------
# _build_base_query
# ---------------------------------------------------------------------------


class TestBuildBaseQuery:
    """_build_base_query 测试."""

    def setup_method(self) -> None:
        """每个测试前初始化 mock db 和 service."""
        self.db = MagicMock()
        self.service = MarketingProjectService(self.db)

    def test_no_filters_applies_only_is_deleted(self) -> None:
        """无筛选条件时仅过滤 is_deleted == False."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        result = self.service._build_base_query()

        self.db.query.assert_called_once()
        mock_query.filter.assert_called_once()
        # 验证只调用了一次 filter（is_deleted 过滤）
        assert result == mock_query

    def test_publish_status_filter(self) -> None:
        """publish_status 筛选应追加额外 filter 调用."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        result = self.service._build_base_query(publish_status=PublishStatus.PUBLISHED)

        # 两次 filter: is_deleted + publish_status
        assert mock_query.filter.call_count == 2
        assert result == mock_query

    def test_project_status_filter(self) -> None:
        """project_status 筛选应追加额外 filter 调用."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        result = self.service._build_base_query(project_status=MarketingProjectStatus.FOR_SALE)

        assert mock_query.filter.call_count == 2
        assert result == mock_query

    def test_consultant_id_filter(self) -> None:
        """consultant_id 筛选应追加额外 filter 调用."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        result = self.service._build_base_query(consultant_id="user-123")

        assert mock_query.filter.call_count == 2
        assert result == mock_query

    def test_community_id_filter(self) -> None:
        """community_id 筛选应追加额外 filter 调用."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        result = self.service._build_base_query(community_id="community-456")

        assert mock_query.filter.call_count == 2
        assert result == mock_query

    def test_multiple_filters_combined(self) -> None:
        """多条件组合筛选应追加对应数量的 filter 调用."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query

        result = self.service._build_base_query(
            publish_status=PublishStatus.DRAFT,
            project_status=MarketingProjectStatus.SOLD,
            consultant_id="user-789",
            community_id="community-000",
        )

        # 1 (is_deleted) + 4 (各筛选条件) = 5
        assert mock_query.filter.call_count == 5
        assert result == mock_query


# ---------------------------------------------------------------------------
# get_projects
# ---------------------------------------------------------------------------


class TestGetProjects:
    """get_projects 测试."""

    def setup_method(self) -> None:
        """每个测试前初始化 mock db 和 service."""
        self.db = MagicMock()
        self.service = MarketingProjectService(self.db)

    def test_returns_correct_tuple(self) -> None:
        """应返回 (项目列表, 总数) 元组."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.count.return_value = 2

        mock_items = [MagicMock(), MagicMock()]
        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = mock_items

        items, total = self.service.get_projects()

        assert total == 2
        assert items == mock_items
        assert isinstance(total, int)

    def test_applies_pagination(self) -> None:
        """应正确应用 skip/limit 分页参数."""
        mock_query = MagicMock()
        self.db.query.return_value = mock_query
        mock_query.filter.return_value = mock_query
        mock_query.count.return_value = 100

        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []

        self.service.get_projects(skip=20, limit=10)

        mock_query.offset.assert_called_once_with(20)
        mock_query.limit.assert_called_once_with(10)
