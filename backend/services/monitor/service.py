"""市场监控服务.

提供市场分析、竞品监控、趋势数据等功能.
周边竞品雷达逻辑已拆分至 neighborhood.py（NeighborhoodRadarService）。
"""

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import Float, func
from sqlalchemy.orm import Session

from models import Community, CommunityCompetitor, PropertyCurrent, PropertyStatus
from schemas.monitor import (
    AIStrategyResponse,
    CommunityMarketStatsResponse,
    CompetitorResponse,
    FloorStats,
    MarketSentimentResponse,
    NeighborhoodRadarResponse,
    RiskPoints,
    TrendData,
)

from .neighborhood import NeighborhoodRadarService

# 成交数据新鲜度阈值:最新成交日距今 ≤ 该天数时视为数据仍新鲜,统计窗口右端点用 now()
_SOLD_DATA_FRESH_DAYS = 7


class MonitorService:
    """市场监控服务."""

    def __init__(self, db: Session) -> None:
        self.db = db
        self._neighborhood_service = NeighborhoodRadarService(db)

    def get_market_sentiment(self, community_id: str) -> MarketSentimentResponse:
        """Calculate market sentiment (floor stats and inventory months).

        去重逻辑: 相同 build_area + floor_level + price 的房源视为同一套房
        """
        db = self.db
        # 1. 查询当前挂牌房源 - 使用子查询去重

        # 获取去重后的挂牌房源统计
        current_subquery = (
            db.query(
                PropertyCurrent.floor_level,
                PropertyCurrent.build_area,
                PropertyCurrent.listed_price_wan,
            )
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.FOR_SALE,
                PropertyCurrent.floor_level.isnot(None),
                PropertyCurrent.build_area.isnot(None),
            )
            .distinct()
            .subquery()
        )

        current_query = (
            db.query(
                current_subquery.c.floor_level,
                func.count().label("count"),
                func.avg(current_subquery.c.listed_price_wan).label("avg_price"),
            )
            .group_by(current_subquery.c.floor_level)
            .all()
        )

        # 2. 查询过去12个月成交房源 - 同样去重
        one_year_ago = datetime.now(timezone.utc) - timedelta(days=365)

        deals_subquery = (
            db.query(
                PropertyCurrent.floor_level,
                PropertyCurrent.build_area,
                PropertyCurrent.sold_price_wan,
            )
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= one_year_ago,
                PropertyCurrent.floor_level.isnot(None),
                PropertyCurrent.build_area.isnot(None),
            )
            .distinct()
            .subquery()
        )

        deals_query = (
            db.query(
                deals_subquery.c.floor_level,
                func.count().label("count"),
                func.avg(deals_subquery.c.sold_price_wan).label("avg_price"),
            )
            .group_by(deals_subquery.c.floor_level)
            .all()
        )

        # 3. 楼层级别映射: DB存储 '高楼层/中楼层/低楼层', API返回 'high/mid/low'
        db_level_map = {"high": "高楼层", "mid": "中楼层", "low": "低楼层"}

        stats = []
        for level in ["high", "mid", "low"]:
            db_level = db_level_map.get(level, level)

            c_data = next((x for x in current_query if x.floor_level == db_level), None)
            d_data = next((x for x in deals_query if x.floor_level == db_level), None)

            # 使用实际查询到的价格数据
            deal_price = float(d_data.avg_price) if d_data and d_data.avg_price else 0
            current_price = float(c_data.avg_price) if c_data and c_data.avg_price else 0

            stats.append(
                FloorStats(
                    type=level,
                    deals_count=d_data.count if d_data else 0,
                    deal_avg_price=deal_price,
                    current_count=c_data.count if c_data else 0,
                    current_avg_price=current_price,
                ),
            )

        # 4. Inventory Months 计算
        total_inventory = sum(s.current_count for s in stats)
        total_deals_last_year = sum(s.deals_count for s in stats)
        monthly_avg_deals = total_deals_last_year / 12.0 if total_deals_last_year > 0 else 0
        inventory_months = total_inventory / monthly_avg_deals if monthly_avg_deals > 0 else 99.9

        return MarketSentimentResponse(
            floor_stats=stats,
            inventory_months=round(inventory_months, 1),
        )

    def get_trends(self, community_id: str, months: int) -> list[TrendData]:
        """获取价格趋势数据.

        按月分组统计在 Python 层完成，避免数据库端 strftime 函数的方言差异，
        保证聚合逻辑可移植。
        """
        db = self.db
        start_date = datetime.now(timezone.utc) - timedelta(days=30 * months)

        # 查询原始数据，在 Python 层按月分组
        deals = (
            db.query(
                PropertyCurrent.sold_date,
                PropertyCurrent.sold_price_wan,
                PropertyCurrent.build_area,
            )
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= start_date,
            )
            .all()
        )

        listings = (
            db.query(
                PropertyCurrent.listed_date,
                PropertyCurrent.listed_price_wan,
                PropertyCurrent.build_area,
            )
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.listed_date >= start_date,
            )
            .all()
        )

        # 在 Python 层按月聚合
        # volume 统计所有成交行；avg 仅对 build_area 有效的行计算（与 SQL avg 忽略 NULL 行为一致）
        deal_groups: dict[str, dict] = {}
        for row in deals:
            if not row.sold_date:
                continue
            month_key = row.sold_date.strftime("%Y-%m")
            if month_key not in deal_groups:
                deal_groups[month_key] = {"volume": 0, "prices": []}
            deal_groups[month_key]["volume"] += 1
            if row.build_area and row.build_area > 0 and row.sold_price_wan is not None:
                unit_price = float(row.sold_price_wan) / float(row.build_area) * 10000
                deal_groups[month_key]["prices"].append(unit_price)

        listing_groups: dict[str, list[float]] = {}
        for row in listings:
            if not row.listed_date:
                continue
            month_key = row.listed_date.strftime("%Y-%m")
            if month_key not in listing_groups:
                listing_groups[month_key] = []
            if row.build_area and row.build_area > 0 and row.listed_price_wan is not None:
                unit_price = float(row.listed_price_wan) / float(row.build_area) * 10000
                listing_groups[month_key].append(unit_price)

        # Merge data
        data_map: dict[str, dict] = {}
        for month_key, data in deal_groups.items():
            prices = data["prices"]
            avg_price = sum(prices) / len(prices) if prices else 0
            data_map[month_key] = {
                "month": month_key,
                "deal_price": round(avg_price, 0) if avg_price else 0,
                "volume": data["volume"],
                "listing_price": 0,
            }

        for month_key, prices in listing_groups.items():
            avg_price = sum(prices) / len(prices) if prices else 0
            if month_key not in data_map:
                data_map[month_key] = {"month": month_key, "deal_price": 0, "volume": 0, "listing_price": 0}
            data_map[month_key]["listing_price"] = round(avg_price, 0) if avg_price else 0

        return sorted([TrendData(**v) for v in data_map.values()], key=lambda x: x.month)

    def get_competitors(self, community_id: str) -> list[CompetitorResponse]:
        """获取竞品列表."""
        db = self.db
        comps = (
            db.query(CommunityCompetitor)
            .filter(
                CommunityCompetitor.community_id == community_id,
            )
            .all()
        )

        # 收集所有竞品小区ID
        competitor_ids = [comp.competitor_community_id for comp in comps]
        if not competitor_ids:
            return []

        # 批量查询小区基本信息
        communities = db.query(Community).filter(Community.id.in_(competitor_ids)).all()
        community_map = {c.id: c for c in communities}

        # 实时计算每个小区的挂牌统计数据
        listing_stats = (
            db.query(
                PropertyCurrent.community_id,
                func.count().label("count"),
                func.avg(func.cast(PropertyCurrent.listed_price_wan, Float) / PropertyCurrent.build_area * 10000).label(
                    "avg_price",
                ),
            )
            .filter(
                PropertyCurrent.community_id.in_(competitor_ids),
                PropertyCurrent.status == PropertyStatus.FOR_SALE,
                PropertyCurrent.build_area > 0,
            )
            .group_by(PropertyCurrent.community_id)
            .all()
        )

        # 构建统计映射
        stats_map = {
            row.community_id: {
                "count": row.count,
                "avg_price": round(row.avg_price, 0) if row.avg_price else 0,
            }
            for row in listing_stats
        }

        results = []
        for comp in comps:
            c = community_map.get(comp.competitor_community_id)
            if c:
                stats = stats_map.get(c.id, {"count": 0, "avg_price": 0})
                results.append(
                    CompetitorResponse(
                        community_id=c.id,
                        community_name=c.name,
                        avg_price=stats["avg_price"],
                        on_sale_count=stats["count"],
                    ),
                )
        return results

    def add_competitor(self, community_id: str, competitor_id: str) -> bool:
        """添加竞品小区，返回是否成功添加.

        内部自动提交事务.
        """
        db = self.db
        exists = (
            db.query(CommunityCompetitor)
            .filter(
                CommunityCompetitor.community_id == community_id,
                CommunityCompetitor.competitor_community_id == competitor_id,
            )
            .first()
        )
        if not exists:
            new_comp = CommunityCompetitor(community_id=community_id, competitor_community_id=competitor_id)
            db.add(new_comp)
            db.commit()
            return True
        return False

    def remove_competitor(self, community_id: str, competitor_id: str) -> bool:
        """移除竞品小区，返回是否成功移除.

        内部自动提交事务.
        """
        db = self.db
        result = (
            db.query(CommunityCompetitor)
            .filter(
                CommunityCompetitor.community_id == community_id,
                CommunityCompetitor.competitor_community_id == competitor_id,
            )
            .delete(synchronize_session=False)
        )
        if result > 0:
            db.commit()
        return result > 0

    def generate_ai_strategy(
        self,
        _project_id: uuid.UUID,
        _context: str,
    ) -> AIStrategyResponse:
        """生成AI策略建议（Mock实现）."""
        return AIStrategyResponse(
            report_markdown=(
                "### AI Analysis\nBased on current market trends (Mock Data), the property is well positioned..."
            ),
            risk_points=RiskPoints(profit_critical_price=2000000, daily_cost=500),
            action_plan=["Suggested listing price: 210W", "refresh photos"],
        )

    def get_neighborhood_radar(self, community_id: str) -> NeighborhoodRadarResponse:
        """获取周边竞品雷达数据（委托至 NeighborhoodRadarService）."""
        return self._neighborhood_service.get_neighborhood_radar(community_id)

    def get_community_market_stats(self, community_id: str) -> CommunityMarketStatsResponse:
        """获取小区市场统计数据.

        用于项目卡片展示:
        - 竞品在售数量 (该小区的在售房源数)
        - 成交均价 (元/㎡)
        - 30日成交量
        - 30日价格趋势

        统计窗口右端点对齐"该小区最新成交日":成交数据存在约 30 天延迟,
        若用 now() 会导致窗口整段落在数据空窗期。当最新成交日距今 > 7 天时,
        以最新成交日为右端点;否则(无成交或距今 ≤ 7 天)用 now()。
        响应中 data_as_of 字段返回实际使用的右端点。
        """
        db = self.db

        # 1. 查询该小区最新成交日,据此对齐统计窗口右端点
        latest_sold_date = (
            db.query(func.max(PropertyCurrent.sold_date))
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.SOLD,
            )
            .scalar()
        )

        now = datetime.now(timezone.utc)
        # 边界:无成交记录或最新成交距今 ≤ 7 天,用 now();否则用 latest_sold_date
        if latest_sold_date is None:
            as_of = now
        else:
            # 注意时区:latest_sold_date 可能是 offset-naive 或 aware,需统一为 aware (UTC) 比较
            if latest_sold_date.tzinfo is None:
                latest_sold_date = latest_sold_date.replace(tzinfo=timezone.utc)
            delta = now - latest_sold_date
            as_of = latest_sold_date if delta.days > _SOLD_DATA_FRESH_DAYS else now

        thirty_days_ago = as_of - timedelta(days=30)
        sixty_days_ago = as_of - timedelta(days=60)

        # 2. 查询当前在售数量
        on_sale_count = (
            db.query(func.count(PropertyCurrent.id))
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.FOR_SALE,
            )
            .scalar()
            or 0
        )

        # 3. 查询最近30天成交均价（同时用于显示和趋势计算）
        avg_price_query = db.query(
            func.avg(func.cast(PropertyCurrent.sold_price_wan, Float) / PropertyCurrent.build_area * 10000),
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= thirty_days_ago,
            PropertyCurrent.sold_date <= as_of,
            PropertyCurrent.build_area > 0,
        )
        avg_price_result = avg_price_query.scalar()
        avg_price = float(avg_price_result) if avg_price_result else 0.0

        # 4. 查询30日成交量
        volume_30d = (
            db.query(func.count(PropertyCurrent.id))
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= thirty_days_ago,
                PropertyCurrent.sold_date <= as_of,
            )
            .scalar()
            or 0
        )

        # 5. 计算30日价格趋势 (比较最近30天 vs 前30天)
        # 复用第3步的查询结果
        recent_avg = avg_price

        # 前30天成交均价 (30-60天前)
        previous_avg_result = (
            db.query(
                func.avg(func.cast(PropertyCurrent.sold_price_wan, Float) / PropertyCurrent.build_area * 10000),
            )
            .filter(
                PropertyCurrent.community_id == community_id,
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= sixty_days_ago,
                PropertyCurrent.sold_date < thirty_days_ago,
                PropertyCurrent.build_area > 0,
            )
            .scalar()
        )
        previous_avg = float(previous_avg_result) if previous_avg_result else 0.0

        # 计算趋势百分比
        if previous_avg > 0 and recent_avg > 0:
            price_trend_30d = ((recent_avg - previous_avg) / previous_avg) * 100
            is_price_up = price_trend_30d > 0
        elif recent_avg > 0 and previous_avg == 0:
            # 前30天无成交，最近30天有成交，视为上涨
            price_trend_30d = 0.0
            is_price_up = None  # 数据不足，无法判断趋势
        else:
            price_trend_30d = 0.0
            is_price_up = None

        return CommunityMarketStatsResponse(
            on_sale=int(on_sale_count),
            avg_price=round(avg_price, 0),
            volume_30d=int(volume_30d),
            price_trend_30d=round(price_trend_30d, 2),
            is_price_up=is_price_up,
            data_as_of=as_of,
        )
