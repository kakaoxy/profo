"""MonitorService 单元测试."""

from unittest.mock import MagicMock

import pytest

from schemas.monitor import FloorStats, MarketSentimentResponse
from services.monitor.service import MonitorService


def _make_row(floor_level: str, count: int, avg_price: float | None) -> MagicMock:
    """构造模拟的数据库查询结果行."""
    row = MagicMock()
    row.floor_level = floor_level
    row.count = count
    row.avg_price = avg_price
    return row


def _build_db_mock(
    db: MagicMock,
    current_rows: list | None = None,
    deals_rows: list | None = None,
) -> None:
    """配置 db mock 以模拟 get_market_sentiment 中的四次 db.query() 调用.

    方法内部调用 db.query() 四次:
      1. 内层挂牌子查询 (FOR_SALE) → .filter().distinct().subquery()
      2. 外层挂牌聚合查询 → .group_by().all() → 返回 current_rows
      3. 内层成交子查询 (SOLD) → .filter().distinct().subquery()
      4. 外层成交聚合查询 → .group_by().all() → 返回 deals_rows
    """
    current_rows = current_rows or []
    deals_rows = deals_rows or []

    call_count = 0
    # 索引 0,2 为内层子查询; 索引 1 返回 current_rows; 索引 3 返回 deals_rows
    result_map = {1: current_rows, 3: deals_rows}

    def query_side_effect(*args, **kwargs):
        nonlocal call_count
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.distinct.return_value = mock_q

        subq = MagicMock()
        subq.c.floor_level = MagicMock()
        subq.c.listed_price_wan = MagicMock()
        subq.c.sold_price_wan = MagicMock()
        mock_q.subquery.return_value = subq

        mock_q.group_by.return_value = mock_q
        mock_q.all.return_value = result_map.get(call_count, [])
        call_count += 1
        return mock_q

    db.query.side_effect = query_side_effect


class TestGetMarketSentiment:
    """get_market_sentiment 测试."""

    def test_empty_data(self) -> None:
        """无房源数据时应返回全零楼层统计和 inventory_months=99.9."""
        db = MagicMock()
        _build_db_mock(db, current_rows=[], deals_rows=[])

        result = MonitorService.get_market_sentiment(db, "community-1")

        assert isinstance(result, MarketSentimentResponse)
        assert len(result.floor_stats) == 3
        for stat in result.floor_stats:
            assert isinstance(stat, FloorStats)
            assert stat.deals_count == 0
            assert stat.deal_avg_price == 0
            assert stat.current_count == 0
            assert stat.current_avg_price == 0
        assert result.inventory_months == 99.9

    def test_for_sale_properties_only(self) -> None:
        """仅有挂牌房源时应返回正确的楼层统计和库存月数=99.9."""
        db = MagicMock()
        current_rows = [
            _make_row("高楼层", 5, 300.0),
            _make_row("中楼层", 8, 280.0),
            _make_row("低楼层", 3, 250.0),
        ]
        _build_db_mock(db, current_rows=current_rows, deals_rows=[])

        result = MonitorService.get_market_sentiment(db, "community-1")

        assert isinstance(result, MarketSentimentResponse)
        assert len(result.floor_stats) == 3

        high_stat = next(s for s in result.floor_stats if s.type == "high")
        assert high_stat.current_count == 5
        assert high_stat.current_avg_price == 300.0
        assert high_stat.deals_count == 0

        mid_stat = next(s for s in result.floor_stats if s.type == "mid")
        assert mid_stat.current_count == 8
        assert mid_stat.current_avg_price == 280.0

        low_stat = next(s for s in result.floor_stats if s.type == "low")
        assert low_stat.current_count == 3
        assert low_stat.current_avg_price == 250.0

        # 无成交 → inventory_months = 99.9
        assert result.inventory_months == 99.9

    def test_sold_properties_only(self) -> None:
        """仅有成交房源时应返回零挂牌和正确的成交统计."""
        db = MagicMock()
        deals_rows = [
            _make_row("高楼层", 2, 290.0),
            _make_row("中楼层", 4, 270.0),
        ]
        _build_db_mock(db, current_rows=[], deals_rows=deals_rows)

        result = MonitorService.get_market_sentiment(db, "community-1")

        assert isinstance(result, MarketSentimentResponse)
        assert len(result.floor_stats) == 3

        high_stat = next(s for s in result.floor_stats if s.type == "high")
        assert high_stat.deals_count == 2
        assert high_stat.deal_avg_price == 290.0
        assert high_stat.current_count == 0

        mid_stat = next(s for s in result.floor_stats if s.type == "mid")
        assert mid_stat.deals_count == 4
        assert mid_stat.deal_avg_price == 270.0

        # total_inventory=0, monthly_avg_deals=6/12=0.5, inventory_months=0/0.5=0.0
        assert result.inventory_months == 0.0

    def test_both_for_sale_and_sold_properties(self) -> None:
        """同时有挂牌和成交房源时应返回完整统计和正确的库存月数."""
        db = MagicMock()
        current_rows = [
            _make_row("高楼层", 6, 310.0),
            _make_row("中楼层", 4, 290.0),
        ]
        deals_rows = [
            _make_row("高楼层", 12, 300.0),
            _make_row("中楼层", 8, 280.0),
        ]
        _build_db_mock(db, current_rows=current_rows, deals_rows=deals_rows)

        result = MonitorService.get_market_sentiment(db, "community-1")

        assert isinstance(result, MarketSentimentResponse)
        assert len(result.floor_stats) == 3

        high_stat = next(s for s in result.floor_stats if s.type == "high")
        assert high_stat.current_count == 6
        assert high_stat.current_avg_price == 310.0
        assert high_stat.deals_count == 12
        assert high_stat.deal_avg_price == 300.0

        mid_stat = next(s for s in result.floor_stats if s.type == "mid")
        assert mid_stat.current_count == 4
        assert mid_stat.current_avg_price == 290.0
        assert mid_stat.deals_count == 8
        assert mid_stat.deal_avg_price == 280.0

        low_stat = next(s for s in result.floor_stats if s.type == "low")
        assert low_stat.current_count == 0
        assert low_stat.deals_count == 0

        # total_inventory = 6 + 4 + 0 = 10
        # total_deals_last_year = 12 + 8 + 0 = 20
        # monthly_avg_deals = 20 / 12
        # inventory_months = 10 / (20/12) = 6.0
        assert result.inventory_months == round(10 / (20 / 12), 1)
