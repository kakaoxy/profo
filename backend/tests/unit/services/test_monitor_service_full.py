"""MonitorService 完整单元测试.

覆盖除 get_market_sentiment（已有独立测试文件）之外的所有方法:
- get_trends
- get_competitors
- add_competitor
- remove_competitor
- generate_ai_strategy
- get_neighborhood_radar
- get_community_market_stats
"""

from unittest.mock import MagicMock, patch

import pytest

from schemas.monitor import (
    AIStrategyResponse,
    CommunityMarketStatsResponse,
    CompetitorResponse,
    NeighborhoodRadarItem,
    NeighborhoodRadarResponse,
    RiskPoints,
    TrendData,
)
from services.monitor.service import MonitorService


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_community(community_id: str, name: str) -> MagicMock:
    """构造模拟的 Community 对象."""
    c = MagicMock()
    c.id = community_id
    c.name = name
    return c


def _make_competitor(community_id: str, competitor_community_id: str) -> MagicMock:
    """构造模拟的 CommunityCompetitor 对象."""
    comp = MagicMock()
    comp.community_id = community_id
    comp.competitor_community_id = competitor_community_id
    return comp


def _make_trend_row(month: str, avg_price: float | None, volume: int = 0) -> MagicMock:
    """构造模拟的趋势查询结果行."""
    row = MagicMock()
    row.month = month
    row.avg_deal_price = avg_price
    row.avg_list_price = avg_price
    row.volume = volume
    return row


def _make_listing_stat_row(community_id: str, count: int, avg_price: float | None) -> MagicMock:
    """构造模拟的挂牌统计查询结果行."""
    row = MagicMock()
    row.community_id = community_id
    row.count = count
    row.avg_price = avg_price
    return row


# ---------------------------------------------------------------------------
# get_trends
# ---------------------------------------------------------------------------


class TestGetTrends:
    """get_trends 测试."""

    def test_empty_data(self) -> None:
        """无数据时返回空列表."""
        db = MagicMock()
        db.query.return_value.filter.return_value.group_by.return_value.all.return_value = []

        # 两次 db.query: deals + listings
        mock_q = MagicMock()
        mock_q.filter.return_value = mock_q
        mock_q.group_by.return_value = mock_q
        mock_q.all.return_value = []
        db.query.side_effect = [mock_q, mock_q]

        result = MonitorService.get_trends(db, "community-1", 6)

        assert result == []

    def test_deals_only(self) -> None:
        """仅有成交数据时返回正确的趋势."""
        db = MagicMock()

        deal_row = MagicMock()
        deal_row.month = "2025-01"
        deal_row.avg_deal_price = 35000.0
        deal_row.volume = 5

        deals_q = MagicMock()
        deals_q.filter.return_value = deals_q
        deals_q.group_by.return_value = deals_q
        deals_q.all.return_value = [deal_row]

        listings_q = MagicMock()
        listings_q.filter.return_value = listings_q
        listings_q.group_by.return_value = listings_q
        listings_q.all.return_value = []

        db.query.side_effect = [deals_q, listings_q]

        result = MonitorService.get_trends(db, "community-1", 6)

        assert len(result) == 1
        assert isinstance(result[0], TrendData)
        assert result[0].month == "2025-01"
        assert result[0].deal_price == 35000.0
        assert result[0].volume == 5
        assert result[0].listing_price == 0

    def test_listings_only(self) -> None:
        """仅有挂牌数据时返回正确的趋势."""
        db = MagicMock()

        deals_q = MagicMock()
        deals_q.filter.return_value = deals_q
        deals_q.group_by.return_value = deals_q
        deals_q.all.return_value = []

        listing_row = MagicMock()
        listing_row.month = "2025-02"
        listing_row.avg_list_price = 38000.0

        listings_q = MagicMock()
        listings_q.filter.return_value = listings_q
        listings_q.group_by.return_value = listings_q
        listings_q.all.return_value = [listing_row]

        db.query.side_effect = [deals_q, listings_q]

        result = MonitorService.get_trends(db, "community-1", 6)

        assert len(result) == 1
        assert result[0].month == "2025-02"
        assert result[0].listing_price == 38000.0
        assert result[0].deal_price == 0
        assert result[0].volume == 0

    def test_merged_deals_and_listings(self) -> None:
        """成交和挂牌数据合并时返回完整趋势."""
        db = MagicMock()

        deal_row = MagicMock()
        deal_row.month = "2025-03"
        deal_row.avg_deal_price = 36000.0
        deal_row.volume = 3

        deals_q = MagicMock()
        deals_q.filter.return_value = deals_q
        deals_q.group_by.return_value = deals_q
        deals_q.all.return_value = [deal_row]

        listing_row = MagicMock()
        listing_row.month = "2025-03"
        listing_row.avg_list_price = 37000.0

        listings_q = MagicMock()
        listings_q.filter.return_value = listings_q
        listings_q.group_by.return_value = listings_q
        listings_q.all.return_value = [listing_row]

        db.query.side_effect = [deals_q, listings_q]

        result = MonitorService.get_trends(db, "community-1", 6)

        assert len(result) == 1
        assert result[0].deal_price == 36000.0
        assert result[0].listing_price == 37000.0
        assert result[0].volume == 3

    def test_sorted_by_month(self) -> None:
        """结果按月份排序."""
        db = MagicMock()

        deal_rows = [
            MagicMock(month="2025-03", avg_deal_price=36000.0, volume=3),
            MagicMock(month="2025-01", avg_deal_price=34000.0, volume=2),
        ]

        deals_q = MagicMock()
        deals_q.filter.return_value = deals_q
        deals_q.group_by.return_value = deals_q
        deals_q.all.return_value = deal_rows

        listings_q = MagicMock()
        listings_q.filter.return_value = listings_q
        listings_q.group_by.return_value = listings_q
        listings_q.all.return_value = []

        db.query.side_effect = [deals_q, listings_q]

        result = MonitorService.get_trends(db, "community-1", 6)

        assert len(result) == 2
        assert result[0].month == "2025-01"
        assert result[1].month == "2025-03"

    def test_null_avg_price_treated_as_zero(self) -> None:
        """avg_price 为 None 时应视为 0."""
        db = MagicMock()

        deal_row = MagicMock()
        deal_row.month = "2025-01"
        deal_row.avg_deal_price = None
        deal_row.volume = 1

        deals_q = MagicMock()
        deals_q.filter.return_value = deals_q
        deals_q.group_by.return_value = deals_q
        deals_q.all.return_value = [deal_row]

        listing_row = MagicMock()
        listing_row.month = "2025-01"
        listing_row.avg_list_price = None

        listings_q = MagicMock()
        listings_q.filter.return_value = listings_q
        listings_q.group_by.return_value = listings_q
        listings_q.all.return_value = [listing_row]

        db.query.side_effect = [deals_q, listings_q]

        result = MonitorService.get_trends(db, "community-1", 6)

        assert result[0].deal_price == 0
        assert result[0].listing_price == 0


# ---------------------------------------------------------------------------
# get_competitors
# ---------------------------------------------------------------------------


class TestGetCompetitors:
    """get_competitors 测试."""

    def test_no_competitors(self) -> None:
        """无竞品时返回空列表."""
        db = MagicMock()
        db.query.return_value.filter.return_value.all.return_value = []

        result = MonitorService.get_competitors(db, "community-1")

        assert result == []

    def test_competitors_with_stats(self) -> None:
        """有竞品且有挂牌统计时返回正确结果."""
        db = MagicMock()

        comp1 = _make_competitor("community-1", "comp-a")
        comp2 = _make_competitor("community-1", "comp-b")

        # 第1次 query: CommunityCompetitor
        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp1, comp2]

        # 第2次 query: Community
        c_a = _make_community("comp-a", "竞品A小区")
        c_b = _make_community("comp-b", "竞品B小区")
        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [c_a, c_b]

        # 第3次 query: listing stats
        stat_a = _make_listing_stat_row("comp-a", 5, 35000.0)
        stat_b = _make_listing_stat_row("comp-b", 3, 28000.0)
        stats_q = MagicMock()
        stats_q.filter.return_value = stats_q
        stats_q.group_by.return_value = stats_q
        stats_q.all.return_value = [stat_a, stat_b]

        db.query.side_effect = [comp_q, comm_q, stats_q]

        result = MonitorService.get_competitors(db, "community-1")

        assert len(result) == 2
        assert isinstance(result[0], CompetitorResponse)
        # comp-a 的统计
        a_item = next(r for r in result if r.community_id == "comp-a")
        assert a_item.community_name == "竞品A小区"
        assert a_item.on_sale_count == 5
        assert a_item.avg_price == 35000.0

    def test_competitor_missing_community(self) -> None:
        """竞品小区不存在于 Community 表时跳过该条."""
        db = MagicMock()

        comp1 = _make_competitor("community-1", "comp-missing")

        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp1]

        # Community 查询返回空
        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = []

        stats_q = MagicMock()
        stats_q.filter.return_value = stats_q
        stats_q.group_by.return_value = stats_q
        stats_q.all.return_value = []

        db.query.side_effect = [comp_q, comm_q, stats_q]

        result = MonitorService.get_competitors(db, "community-1")

        assert result == []

    def test_competitor_no_listing_stats(self) -> None:
        """竞品无挂牌统计时 avg_price 和 on_sale_count 为 0."""
        db = MagicMock()

        comp1 = _make_competitor("community-1", "comp-a")

        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp1]

        c_a = _make_community("comp-a", "竞品A")
        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [c_a]

        stats_q = MagicMock()
        stats_q.filter.return_value = stats_q
        stats_q.group_by.return_value = stats_q
        stats_q.all.return_value = []

        db.query.side_effect = [comp_q, comm_q, stats_q]

        result = MonitorService.get_competitors(db, "community-1")

        assert len(result) == 1
        assert result[0].avg_price == 0
        assert result[0].on_sale_count == 0


# ---------------------------------------------------------------------------
# add_competitor
# ---------------------------------------------------------------------------


class TestAddCompetitor:
    """add_competitor 测试."""

    def test_add_new_competitor(self) -> None:
        """添加新竞品时返回 True 并调用 db.add."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        result = MonitorService.add_competitor(db, "community-1", "comp-a")

        assert result is True
        db.add.assert_called_once()

    def test_add_existing_competitor(self) -> None:
        """添加已存在的竞品时返回 False 且不调用 db.add."""
        db = MagicMock()
        existing = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = existing

        result = MonitorService.add_competitor(db, "community-1", "comp-a")

        assert result is False
        db.add.assert_not_called()


# ---------------------------------------------------------------------------
# remove_competitor
# ---------------------------------------------------------------------------


class TestRemoveCompetitor:
    """remove_competitor 测试."""

    def test_remove_existing_competitor(self) -> None:
        """成功移除竞品时返回 True."""
        db = MagicMock()
        db.query.return_value.filter.return_value.delete.return_value = 1

        result = MonitorService.remove_competitor(db, "community-1", "comp-a")

        assert result is True

    def test_remove_nonexistent_competitor(self) -> None:
        """移除不存在的竞品时返回 False."""
        db = MagicMock()
        db.query.return_value.filter.return_value.delete.return_value = 0

        result = MonitorService.remove_competitor(db, "community-1", "comp-a")

        assert result is False


# ---------------------------------------------------------------------------
# generate_ai_strategy
# ---------------------------------------------------------------------------


class TestGenerateAIStrategy:
    """generate_ai_strategy 测试."""

    def test_returns_mock_response(self) -> None:
        """应返回固定 Mock 数据."""
        db = MagicMock()
        result = MonitorService.generate_ai_strategy(db, "project-1", "test context")

        assert isinstance(result, AIStrategyResponse)
        assert isinstance(result.risk_points, RiskPoints)
        assert isinstance(result.action_plan, list)
        assert len(result.action_plan) > 0
        assert "Mock" in result.report_markdown

    def test_ignores_db_and_project_id(self) -> None:
        """不同参数应返回相同的 Mock 响应."""
        db = MagicMock()
        r1 = MonitorService.generate_ai_strategy(db, "p-1", "ctx-1")
        r2 = MonitorService.generate_ai_strategy(db, "p-2", "ctx-2")

        assert r1.report_markdown == r2.report_markdown
        assert r1.risk_points.profit_critical_price == r2.risk_points.profit_critical_price


# ---------------------------------------------------------------------------
# get_neighborhood_radar
# ---------------------------------------------------------------------------


class TestGetNeighborhoodRadar:
    """get_neighborhood_radar 测试."""

    def test_community_not_found(self) -> None:
        """本案小区不存在时返回空列表."""
        db = MagicMock()
        db.query.return_value.filter.return_value.first.return_value = None

        result = MonitorService.get_neighborhood_radar(db, "nonexistent")

        assert isinstance(result, NeighborhoodRadarResponse)
        assert result.items == []

    def test_subject_only_no_competitors(self) -> None:
        """仅有本案小区、无竞品时返回单项数据."""
        db = MagicMock()

        subject = _make_community("c-1", "本案小区")

        # 第1次 query: Community (subject)
        subject_q = MagicMock()
        subject_q.filter.return_value = subject_q
        subject_q.first.return_value = subject

        # 第2次 query: CommunityCompetitor
        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = []

        # 第3次 query: Community (batch)
        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [subject]

        # 第4次 query: listing stats
        listing_q = MagicMock()
        listing_q.filter.return_value = listing_q
        listing_q.group_by.return_value = listing_q
        listing_q.all.return_value = []

        # 第5次 query: deal stats
        deal_q = MagicMock()
        deal_q.filter.return_value = deal_q
        deal_q.group_by.return_value = deal_q
        deal_q.all.return_value = []

        db.query.side_effect = [subject_q, comp_q, comm_q, listing_q, deal_q]

        result = MonitorService.get_neighborhood_radar(db, "c-1")

        assert len(result.items) == 1
        item = result.items[0]
        assert item.is_subject is True
        assert "本案" in item.community_name
        assert item.spread_label == "[ 当前位置 ]"
        assert item.spread_percent == 0.0

    def test_with_competitors_and_data(self) -> None:
        """有竞品且有挂牌/成交数据时返回完整雷达."""
        db = MagicMock()

        subject = _make_community("c-1", "本案小区")
        comp_a = _make_community("c-a", "竞品A")

        # 第1次 query: Community (subject)
        subject_q = MagicMock()
        subject_q.filter.return_value = subject_q
        subject_q.first.return_value = subject

        # 第2次 query: CommunityCompetitor
        comp_obj = _make_competitor("c-1", "c-a")
        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp_obj]

        # 第3次 query: Community (batch)
        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [subject, comp_a]

        # 第4次 query: listing stats
        listing_row_subject = MagicMock()
        listing_row_subject.community_id = "c-1"
        listing_row_subject.data_source = "beike"
        listing_row_subject.count = 10
        listing_row_subject.avg_price = 30000.0

        listing_row_comp = MagicMock()
        listing_row_comp.community_id = "c-a"
        listing_row_comp.data_source = "5i5j"
        listing_row_comp.count = 5
        listing_row_comp.avg_price = 35000.0

        listing_q = MagicMock()
        listing_q.filter.return_value = listing_q
        listing_q.group_by.return_value = listing_q
        listing_q.all.return_value = [listing_row_subject, listing_row_comp]

        # 第5次 query: deal stats
        deal_row_subject = MagicMock()
        deal_row_subject.community_id = "c-1"
        deal_row_subject.data_source = "beike"
        deal_row_subject.count = 8
        deal_row_subject.avg_price = 28000.0

        deal_row_comp = MagicMock()
        deal_row_comp.community_id = "c-a"
        deal_row_comp.data_source = "5i5j"
        deal_row_comp.count = 4
        deal_row_comp.avg_price = 32000.0

        deal_q = MagicMock()
        deal_q.filter.return_value = deal_q
        deal_q.group_by.return_value = deal_q
        deal_q.all.return_value = [deal_row_subject, deal_row_comp]

        db.query.side_effect = [subject_q, comp_q, comm_q, listing_q, deal_q]

        result = MonitorService.get_neighborhood_radar(db, "c-1")

        assert len(result.items) == 2

        subject_item = next(i for i in result.items if i.is_subject)
        assert subject_item.community_id == "c-1"
        assert subject_item.listing_count == 10
        assert subject_item.listing_beike == 10
        assert subject_item.listing_iaij == 0
        assert subject_item.deal_count == 8
        assert subject_item.deal_beike == 8

        comp_item = next(i for i in result.items if not i.is_subject)
        assert comp_item.community_id == "c-a"
        assert comp_item.listing_count == 5
        assert comp_item.listing_beike == 0
        assert comp_item.listing_iaij == 5
        assert comp_item.deal_count == 4
        assert comp_item.deal_iaij == 4
        # 竞品成交均价 32000 > 本案 28000 → 高于本案
        assert "高于本案" in comp_item.spread_label

    def test_spread_label_lower(self) -> None:
        """竞品成交均价低于本案时标签应为'低于本案'."""
        db = MagicMock()

        subject = _make_community("c-1", "本案小区")
        comp_b = _make_community("c-b", "低价竞品")

        subject_q = MagicMock()
        subject_q.filter.return_value = subject_q
        subject_q.first.return_value = subject

        comp_obj = _make_competitor("c-1", "c-b")
        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp_obj]

        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [subject, comp_b]

        # 本案挂牌
        listing_row_subject = MagicMock()
        listing_row_subject.community_id = "c-1"
        listing_row_subject.data_source = "beike"
        listing_row_subject.count = 10
        listing_row_subject.avg_price = 30000.0

        listing_row_comp = MagicMock()
        listing_row_comp.community_id = "c-b"
        listing_row_comp.data_source = "beike"
        listing_row_comp.count = 5
        listing_row_comp.avg_price = 25000.0

        listing_q = MagicMock()
        listing_q.filter.return_value = listing_q
        listing_q.group_by.return_value = listing_q
        listing_q.all.return_value = [listing_row_subject, listing_row_comp]

        # 本案成交均价高，竞品低
        deal_row_subject = MagicMock()
        deal_row_subject.community_id = "c-1"
        deal_row_subject.data_source = "beike"
        deal_row_subject.count = 8
        deal_row_subject.avg_price = 30000.0

        deal_row_comp = MagicMock()
        deal_row_comp.community_id = "c-b"
        deal_row_comp.data_source = "beike"
        deal_row_comp.count = 4
        deal_row_comp.avg_price = 25000.0

        deal_q = MagicMock()
        deal_q.filter.return_value = deal_q
        deal_q.group_by.return_value = deal_q
        deal_q.all.return_value = [deal_row_subject, deal_row_comp]

        db.query.side_effect = [subject_q, comp_q, comm_q, listing_q, deal_q]

        result = MonitorService.get_neighborhood_radar(db, "c-1")

        comp_item = next(i for i in result.items if not i.is_subject)
        assert "低于本案" in comp_item.spread_label

    def test_insufficient_data_label(self) -> None:
        """本案无成交均价时竞品标签为'数据不足'."""
        db = MagicMock()

        subject = _make_community("c-1", "本案小区")
        comp_a = _make_community("c-a", "竞品A")

        subject_q = MagicMock()
        subject_q.filter.return_value = subject_q
        subject_q.first.return_value = subject

        comp_obj = _make_competitor("c-1", "c-a")
        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp_obj]

        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [subject, comp_a]

        listing_q = MagicMock()
        listing_q.filter.return_value = listing_q
        listing_q.group_by.return_value = listing_q
        listing_q.all.return_value = []

        deal_q = MagicMock()
        deal_q.filter.return_value = deal_q
        deal_q.group_by.return_value = deal_q
        deal_q.all.return_value = []

        db.query.side_effect = [subject_q, comp_q, comm_q, listing_q, deal_q]

        result = MonitorService.get_neighborhood_radar(db, "c-1")

        comp_item = next(i for i in result.items if not i.is_subject)
        assert comp_item.spread_label == "数据不足"

    def test_data_source_chinese_keywords(self) -> None:
        """中文数据源关键词（贝壳/链家/我爱我家）应正确归类."""
        db = MagicMock()

        subject = _make_community("c-1", "本案小区")

        subject_q = MagicMock()
        subject_q.filter.return_value = subject_q
        subject_q.first.return_value = subject

        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = []

        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [subject]

        # 使用中文数据源名称
        listing_row = MagicMock()
        listing_row.community_id = "c-1"
        listing_row.data_source = "贝壳"
        listing_row.count = 6
        listing_row.avg_price = 30000.0

        listing_q = MagicMock()
        listing_q.filter.return_value = listing_q
        listing_q.group_by.return_value = listing_q
        listing_q.all.return_value = [listing_row]

        deal_row = MagicMock()
        deal_row.community_id = "c-1"
        deal_row.data_source = "我爱我家"
        deal_row.count = 3
        deal_row.avg_price = 28000.0

        deal_q = MagicMock()
        deal_q.filter.return_value = deal_q
        deal_q.group_by.return_value = deal_q
        deal_q.all.return_value = [deal_row]

        db.query.side_effect = [subject_q, comp_q, comm_q, listing_q, deal_q]

        result = MonitorService.get_neighborhood_radar(db, "c-1")

        item = result.items[0]
        assert item.listing_beike == 6
        assert item.deal_iaij == 3

    def test_subject_sorted_last(self) -> None:
        """本案小区应排在列表最后."""
        db = MagicMock()

        subject = _make_community("c-1", "本案小区")
        comp_a = _make_community("c-a", "竞品A")

        subject_q = MagicMock()
        subject_q.filter.return_value = subject_q
        subject_q.first.return_value = subject

        comp_obj = _make_competitor("c-1", "c-a")
        comp_q = MagicMock()
        comp_q.filter.return_value = comp_q
        comp_q.all.return_value = [comp_obj]

        comm_q = MagicMock()
        comm_q.filter.return_value = comm_q
        comm_q.all.return_value = [subject, comp_a]

        listing_q = MagicMock()
        listing_q.filter.return_value = listing_q
        listing_q.group_by.return_value = listing_q
        listing_q.all.return_value = []

        deal_q = MagicMock()
        deal_q.filter.return_value = deal_q
        deal_q.group_by.return_value = deal_q
        deal_q.all.return_value = []

        db.query.side_effect = [subject_q, comp_q, comm_q, listing_q, deal_q]

        result = MonitorService.get_neighborhood_radar(db, "c-1")

        assert len(result.items) == 2
        assert result.items[-1].is_subject is True
        assert result.items[0].is_subject is False


# ---------------------------------------------------------------------------
# get_community_market_stats
# ---------------------------------------------------------------------------


class TestGetCommunityMarketStats:
    """get_community_market_stats 测试."""

    def test_all_zero_no_data(self) -> None:
        """无数据时所有统计为 0."""
        db = MagicMock()

        # 4 次 scalar 查询: on_sale_count, avg_price, volume_30d, previous_avg
        scalar_results = [0, None, 0, None]
        call_idx = 0

        def query_side_effect(*args, **kwargs):
            nonlocal call_idx
            mock_q = MagicMock()
            mock_q.filter.return_value = mock_q
            result = scalar_results[call_idx]
            mock_q.scalar.return_value = result
            call_idx += 1
            return mock_q

        db.query.side_effect = query_side_effect

        result = MonitorService.get_community_market_stats(db, "c-1")

        assert isinstance(result, CommunityMarketStatsResponse)
        assert result.on_sale == 0
        assert result.avg_price == 0.0
        assert result.volume_30d == 0
        assert result.price_trend_30d == 0.0
        assert result.is_price_up is None

    def test_normal_data_price_up(self) -> None:
        """最近30天均价高于前30天时 is_price_up=True."""
        db = MagicMock()

        # on_sale=15, avg_price=35000.0, volume_30d=8, previous_avg=32000.0
        scalar_results = [15, 35000.0, 8, 32000.0]
        call_idx = 0

        def query_side_effect(*args, **kwargs):
            nonlocal call_idx
            mock_q = MagicMock()
            mock_q.filter.return_value = mock_q
            mock_q.scalar.return_value = scalar_results[call_idx]
            call_idx += 1
            return mock_q

        db.query.side_effect = query_side_effect

        result = MonitorService.get_community_market_stats(db, "c-1")

        assert result.on_sale == 15
        assert result.avg_price == 35000.0
        assert result.volume_30d == 8
        assert result.is_price_up is True
        # trend = (35000 - 32000) / 32000 * 100 = 9.375
        assert result.price_trend_30d == round(9.375, 2)

    def test_normal_data_price_down(self) -> None:
        """最近30天均价低于前30天时 is_price_up=False."""
        db = MagicMock()

        scalar_results = [10, 28000.0, 5, 32000.0]
        call_idx = 0

        def query_side_effect(*args, **kwargs):
            nonlocal call_idx
            mock_q = MagicMock()
            mock_q.filter.return_value = mock_q
            mock_q.scalar.return_value = scalar_results[call_idx]
            call_idx += 1
            return mock_q

        db.query.side_effect = query_side_effect

        result = MonitorService.get_community_market_stats(db, "c-1")

        assert result.is_price_up is False
        # trend = (28000 - 32000) / 32000 * 100 = -12.5
        assert result.price_trend_30d == round(-12.5, 2)

    def test_recent_avg_no_previous(self) -> None:
        """有最近30天成交但无前30天成交时 is_price_up=None."""
        db = MagicMock()

        scalar_results = [5, 30000.0, 3, None]
        call_idx = 0

        def query_side_effect(*args, **kwargs):
            nonlocal call_idx
            mock_q = MagicMock()
            mock_q.filter.return_value = mock_q
            mock_q.scalar.return_value = scalar_results[call_idx]
            call_idx += 1
            return mock_q

        db.query.side_effect = query_side_effect

        result = MonitorService.get_community_market_stats(db, "c-1")

        assert result.is_price_up is None
        assert result.price_trend_30d == 0.0
        assert result.avg_price == 30000.0

    def test_no_recent_avg(self) -> None:
        """最近30天无成交均价时 is_price_up=None, avg_price=0."""
        db = MagicMock()

        scalar_results = [5, None, 0, 30000.0]
        call_idx = 0

        def query_side_effect(*args, **kwargs):
            nonlocal call_idx
            mock_q = MagicMock()
            mock_q.filter.return_value = mock_q
            mock_q.scalar.return_value = scalar_results[call_idx]
            call_idx += 1
            return mock_q

        db.query.side_effect = query_side_effect

        result = MonitorService.get_community_market_stats(db, "c-1")

        assert result.avg_price == 0.0
        assert result.is_price_up is None
