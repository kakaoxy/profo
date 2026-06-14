"""CommunityQueryService 单元测试."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from schemas.community import CommunityListResponse, CommunityResponse, DictionaryResponse
from services.market.community_service import (
    CommunityQueryService,
    _find_existing_community_by_name,
)


def _make_community_mock(
    id: str = "c-1",
    name: str = "测试小区",
    city_id: int | None = 1,
    district: str | None = "浦东",
    business_circle: str | None = "陆家嘴",
    avg_price_wan: float | None = 8.5,
    is_active: bool = True,
) -> MagicMock:
    """构造 Community 模型 mock."""
    c = MagicMock()
    c.id = id
    c.name = name
    c.city_id = city_id
    c.district = district
    c.business_circle = business_circle
    c.avg_price_wan = avg_price_wan
    c.is_active = is_active
    c.created_at = datetime(2025, 1, 1, tzinfo=timezone.utc)
    return c


# ---------------------------------------------------------------------------
# query_communities
# ---------------------------------------------------------------------------


class TestQueryCommunities:
    """query_communities 测试."""

    def test_without_search(self) -> None:
        """无搜索条件应返回全部小区."""
        db = MagicMock()
        community = _make_community_mock()

        # 主查询链
        main_query = MagicMock()
        main_query.outerjoin.return_value = main_query
        main_query.filter.return_value = main_query
        main_query.group_by.return_value = main_query
        main_query.order_by.return_value = main_query
        main_query.offset.return_value = main_query
        main_query.limit.return_value = main_query
        main_query.all.return_value = [(community, 3)]

        # 计数查询链
        count_query = MagicMock()
        count_query.filter.return_value = count_query
        count_query.scalar.return_value = 1

        db.query.side_effect = [main_query, count_query]

        result = CommunityQueryService.query_communities(db)

        assert isinstance(result, CommunityListResponse)
        assert result.total == 1
        assert len(result.items) == 1
        assert result.items[0].name == "测试小区"
        assert result.items[0].total_properties == 3

    def test_with_search(self) -> None:
        """有搜索条件应调用 filter 进行模糊匹配."""
        db = MagicMock()
        community = _make_community_mock(name="阳光花园")

        main_query = MagicMock()
        main_query.outerjoin.return_value = main_query
        main_query.filter.return_value = main_query
        main_query.group_by.return_value = main_query
        main_query.order_by.return_value = main_query
        main_query.offset.return_value = main_query
        main_query.limit.return_value = main_query
        main_query.all.return_value = [(community, 0)]

        count_query = MagicMock()
        count_query.filter.return_value = count_query
        count_query.scalar.return_value = 1

        db.query.side_effect = [main_query, count_query]

        result = CommunityQueryService.query_communities(db, search="阳光")

        assert result.total == 1
        assert result.items[0].name == "阳光花园"
        # 主查询和计数查询各调用了一次额外的 filter（搜索条件）
        assert main_query.filter.call_count == 2
        assert count_query.filter.call_count == 2

    def test_pagination(self) -> None:
        """分页参数应正确传递 offset 和 limit."""
        db = MagicMock()
        community = _make_community_mock()

        main_query = MagicMock()
        main_query.outerjoin.return_value = main_query
        main_query.filter.return_value = main_query
        main_query.group_by.return_value = main_query
        main_query.order_by.return_value = main_query
        main_query.offset.return_value = main_query
        main_query.limit.return_value = main_query
        main_query.all.return_value = [(community, 5)]

        count_query = MagicMock()
        count_query.filter.return_value = count_query
        count_query.scalar.return_value = 50

        db.query.side_effect = [main_query, count_query]

        result = CommunityQueryService.query_communities(db, page=2, page_size=10)

        assert result.total == 50
        main_query.offset.assert_called_once_with(10)  # (2-1)*10
        main_query.limit.assert_called_once_with(10)


# ---------------------------------------------------------------------------
# query_dictionaries
# ---------------------------------------------------------------------------


class TestQueryDictionaries:
    """query_dictionaries 测试."""

    def test_district_type(self) -> None:
        """dict_type="district" 应返回行政区字典."""
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.limit.return_value = query
        query.all.return_value = [("浦东",), ("徐汇",)]

        db.query.return_value = query

        result = CommunityQueryService.query_dictionaries(db, dict_type="district")

        assert isinstance(result, DictionaryResponse)
        assert result.type == "district"
        assert result.items == ["浦东", "徐汇"]

    def test_business_circle_type(self) -> None:
        """dict_type="business_circle" 应返回商圈字典."""
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.limit.return_value = query
        query.all.return_value = [("陆家嘴",), ("南京路",)]

        db.query.return_value = query

        result = CommunityQueryService.query_dictionaries(db, dict_type="business_circle")

        assert result.type == "business_circle"
        assert result.items == ["陆家嘴", "南京路"]

    def test_with_search(self) -> None:
        """有搜索条件应额外调用 filter 进行模糊匹配."""
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        query.order_by.return_value = query
        query.limit.return_value = query
        query.all.return_value = [("陆家嘴",)]

        db.query.return_value = query

        result = CommunityQueryService.query_dictionaries(
            db, dict_type="business_circle", search="陆"
        )

        assert result.items == ["陆家嘴"]
        # filter 被调用两次：非空过滤 + 搜索过滤
        assert query.filter.call_count == 2

    def test_invalid_dict_type_raises_validation_error(self) -> None:
        """不支持的 dict_type 应抛出 ValidationError."""
        from services.system.exceptions import ValidationError
        db = MagicMock()
        with pytest.raises(ValidationError, match="不支持的字典类型"):
            CommunityQueryService.query_dictionaries(db, dict_type="invalid")


# ---------------------------------------------------------------------------
# build_response_from_community
# ---------------------------------------------------------------------------


class TestBuildResponseFromCommunity:
    """build_response_from_community 测试."""

    def test_builds_response(self) -> None:
        """应从 Community 模型构造 CommunityResponse."""
        community = _make_community_mock()
        result = CommunityQueryService.build_response_from_community(community)

        assert isinstance(result, CommunityResponse)
        assert result.id == "c-1"
        assert result.name == "测试小区"
        assert result.district == "浦东"
        assert result.business_circle == "陆家嘴"


# ---------------------------------------------------------------------------
# _find_existing_community_by_name
# ---------------------------------------------------------------------------


class TestFindExistingCommunityByName:
    """_find_existing_community_by_name 测试."""

    def test_found(self) -> None:
        """找到同名小区应返回该对象."""
        db = MagicMock()
        community = _make_community_mock(name="阳光花园")
        query = MagicMock()
        query.filter.return_value = query
        query.first.return_value = community

        db.query.return_value = query

        result = _find_existing_community_by_name(db, "阳光花园")

        assert result is community
        assert result.name == "阳光花园"

    def test_not_found(self) -> None:
        """未找到应返回 None."""
        db = MagicMock()
        query = MagicMock()
        query.filter.return_value = query
        query.first.return_value = None

        db.query.return_value = query

        result = _find_existing_community_by_name(db, "不存在的名字")

        assert result is None
