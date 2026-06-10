"""apply_filters 单元测试."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest

from models import Community, PropertyCurrent, PropertyStatus
from services.market.filters import PROPERTY_EXPIRATION_DAYS, apply_filters


@pytest.fixture()
def mock_query() -> MagicMock:
    """创建模拟查询对象，filter 返回自身以支持链式调用."""
    q = MagicMock()
    q.filter.return_value = q
    return q


def _get_filter_args(mock_query: MagicMock, call_index: int = 0) -> tuple:
    """获取第 N 次 filter 调用的位置参数."""
    return mock_query.filter.call_args_list[call_index][0]


class TestNoFilters:
    """无筛选条件时直接返回原查询."""

    def test_returns_original_query(self, mock_query: MagicMock) -> None:
        result = apply_filters(mock_query)
        assert result is mock_query
        mock_query.filter.assert_not_called()


class TestStatusFilter:
    """状态筛选逻辑."""

    def test_status_for_sale(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="在售")
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.status == PropertyStatus.FOR_SALE)
        cutoff = datetime.now(timezone.utc) - timedelta(days=PROPERTY_EXPIRATION_DAYS)
        assert abs((args[1].right.effective_value - cutoff).total_seconds()) < 5

    def test_status_expired(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="过期")
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.status == PropertyStatus.FOR_SALE)
        cutoff = datetime.now(timezone.utc) - timedelta(days=PROPERTY_EXPIRATION_DAYS)
        assert abs((args[1].right.effective_value - cutoff).total_seconds()) < 5

    def test_status_sold(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="成交")
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.status == PropertyStatus.SOLD)

    def test_invalid_status_logs_warning(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="未知状态")
        mock_query.filter.assert_not_called()


class TestCommunityNameFilter:
    """小区名称模糊搜索."""

    def test_community_name_like(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, community_name="万科")
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(Community.name.like("%万科%"))


class TestDistrictsFilter:
    """行政区多选筛选."""

    def test_single_district(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, districts=["浦东"])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(Community.district.in_(["浦东"]))

    def test_multiple_districts(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, districts=["浦东", "徐汇", "静安"])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(Community.district.in_(["浦东", "徐汇", "静安"]))


class TestBusinessCirclesFilter:
    """商圈多选筛选."""

    def test_single_business_circle(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, business_circles=["陆家嘴"])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(Community.business_circle.in_(["陆家嘴"]))

    def test_multiple_business_circles(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, business_circles=["陆家嘴", "南京路"])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(Community.business_circle.in_(["陆家嘴", "南京路"]))


class TestPriceRangeFilter:
    """价格范围筛选，根据状态选择不同价格字段."""

    def test_min_price_with_for_sale_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="在售", min_price=100.0)
        # filter 调用 2 次：status(1) + min_price(1)
        assert mock_query.filter.call_count == 2
        args = _get_filter_args(mock_query, 1)
        assert args[0].compare(PropertyCurrent.listed_price_wan >= 100.0)

    def test_max_price_with_for_sale_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="在售", max_price=500.0)
        assert mock_query.filter.call_count == 2
        args = _get_filter_args(mock_query, 1)
        assert args[0].compare(PropertyCurrent.listed_price_wan <= 500.0)

    def test_price_range_with_expired_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="过期", min_price=200.0, max_price=800.0)
        assert mock_query.filter.call_count == 3
        args_min = _get_filter_args(mock_query, 1)
        args_max = _get_filter_args(mock_query, 2)
        assert args_min[0].compare(PropertyCurrent.listed_price_wan >= 200.0)
        assert args_max[0].compare(PropertyCurrent.listed_price_wan <= 800.0)

    def test_min_price_with_sold_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="成交", min_price=150.0)
        assert mock_query.filter.call_count == 2
        args = _get_filter_args(mock_query, 1)
        assert args[0].compare(PropertyCurrent.sold_price_wan >= 150.0)

    def test_max_price_with_sold_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="成交", max_price=600.0)
        assert mock_query.filter.call_count == 2
        args = _get_filter_args(mock_query, 1)
        assert args[0].compare(PropertyCurrent.sold_price_wan <= 600.0)

    def test_price_range_without_status(self, mock_query: MagicMock) -> None:
        """无状态时，同时考虑挂牌价和成交价，组合为 and_(or_(...), or_(...))."""
        apply_filters(mock_query, min_price=100.0, max_price=500.0)
        assert mock_query.filter.call_count == 1

    def test_min_price_only_without_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, min_price=100.0)
        assert mock_query.filter.call_count == 1

    def test_max_price_only_without_status(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, max_price=500.0)
        assert mock_query.filter.call_count == 1


class TestAreaRangeFilter:
    """面积范围筛选."""

    def test_min_area(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, min_area=50.0)
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.build_area >= 50.0)

    def test_max_area(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, max_area=120.0)
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.build_area <= 120.0)

    def test_area_range(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, min_area=50.0, max_area=120.0)
        assert mock_query.filter.call_count == 2
        args_min = _get_filter_args(mock_query, 0)
        args_max = _get_filter_args(mock_query, 1)
        assert args_min[0].compare(PropertyCurrent.build_area >= 50.0)
        assert args_max[0].compare(PropertyCurrent.build_area <= 120.0)


class TestRoomsFilter:
    """户型筛选."""

    def test_rooms_in(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, rooms=[1, 2, 3])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.rooms.in_([1, 2, 3]))

    def test_rooms_gte(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, rooms_gte=4)
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.rooms >= 4)

    def test_rooms_and_rooms_gte_combined(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, rooms=[2, 3], rooms_gte=4)
        assert mock_query.filter.call_count == 2


class TestFloorLevelsFilter:
    """楼层级别多选筛选."""

    def test_single_floor_level(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, floor_levels=["低"])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.floor_level.in_(["低"]))

    def test_multiple_floor_levels(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, floor_levels=["低", "中", "高"])
        mock_query.filter.assert_called_once()
        args = _get_filter_args(mock_query)
        assert args[0].compare(PropertyCurrent.floor_level.in_(["低", "中", "高"]))


class TestOrientationsFilter:
    """朝向筛选（包含任意关键字）."""

    def test_single_orientation(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, orientations=["南"])
        mock_query.filter.assert_called_once()

    def test_multiple_orientations(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, orientations=["南", "东"])
        mock_query.filter.assert_called_once()

    def test_empty_orientations_ignored(self, mock_query: MagicMock) -> None:
        """空字符串朝向应被忽略."""
        apply_filters(mock_query, orientations=[""])
        mock_query.filter.assert_not_called()

    def test_mixed_empty_and_valid_orientations(self, mock_query: MagicMock) -> None:
        """混合空字符串和有效值时只处理有效值."""
        apply_filters(mock_query, orientations=["", "南"])
        mock_query.filter.assert_called_once()


class TestCombinedFilters:
    """组合筛选条件."""

    def test_status_and_community_name(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="在售", community_name="万科")
        assert mock_query.filter.call_count == 2

    def test_status_and_price_range(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, status="在售", min_price=100.0, max_price=500.0)
        # 1 次 status + 2 次 price
        assert mock_query.filter.call_count == 3

    def test_districts_and_business_circles(self, mock_query: MagicMock) -> None:
        apply_filters(mock_query, districts=["浦东"], business_circles=["陆家嘴"])
        assert mock_query.filter.call_count == 2

    def test_all_filters(self, mock_query: MagicMock) -> None:
        apply_filters(
            mock_query,
            status="在售",
            community_name="万科",
            districts=["浦东"],
            business_circles=["陆家嘴"],
            orientations=["南"],
            floor_levels=["中"],
            min_price=100.0,
            max_price=500.0,
            min_area=50.0,
            max_area=120.0,
            rooms=[2, 3],
            rooms_gte=4,
        )
        # status(1) + community_name(1) + districts(1) + business_circles(1)
        # + min_price(1) + max_price(1) + min_area(1) + max_area(1)
        # + rooms(1) + rooms_gte(1) + floor_levels(1) + orientations(1)
        assert mock_query.filter.call_count == 12
