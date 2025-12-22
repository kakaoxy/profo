from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, desc, extract
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from models import PropertyCurrent, PropertyHistory, Community, CommunityCompetitor, PropertyStatus, Project
from schemas.monitor import (
    FloorStats, TrendData, CompetitorResponse, RiskPoints, AIStrategyResponse,
    NeighborhoodRadarItem, NeighborhoodRadarResponse
)

class MonitorService:
    @staticmethod
    def get_market_sentiment(db: Session, community_id: int) -> Dict:
        """Calculate market sentiment (floor stats and inventory months)
        
        去重逻辑: 相同 build_area + floor_level + price 的房源视为同一套房
        """
        # 1. 查询当前挂牌房源 - 使用子查询去重
        # 去重条件: build_area, floor_level, listed_price_wan 相同则为重复
        from sqlalchemy import distinct, tuple_
        
        # 获取去重后的挂牌房源统计
        current_subquery = db.query(
            PropertyCurrent.floor_level,
            PropertyCurrent.build_area,
            PropertyCurrent.listed_price_wan
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.status == PropertyStatus.FOR_SALE,
            PropertyCurrent.floor_level.isnot(None),
            PropertyCurrent.build_area.isnot(None)
        ).distinct().subquery()
        
        current_query = db.query(
            current_subquery.c.floor_level,
            func.count().label("count"),
            func.avg(current_subquery.c.listed_price_wan).label("avg_price")
        ).group_by(current_subquery.c.floor_level).all()
        
        # print(f"[MonitorService] community_id={community_id}, current_query (deduplicated): {current_query}")
        
        # 2. 查询过去12个月成交房源 - 同样去重
        one_year_ago = datetime.now() - timedelta(days=365)
        
        deals_subquery = db.query(
            PropertyCurrent.floor_level,
            PropertyCurrent.build_area,
            PropertyCurrent.sold_price_wan
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= one_year_ago,
            PropertyCurrent.floor_level.isnot(None),
            PropertyCurrent.build_area.isnot(None)
        ).distinct().subquery()
        
        deals_query = db.query(
            deals_subquery.c.floor_level,
            func.count().label("count"),
            func.avg(deals_subquery.c.sold_price_wan).label("avg_price")
        ).group_by(deals_subquery.c.floor_level).all()
        
        # print(f"[MonitorService] deals_query (deduplicated): {deals_query}")
        
        # 3. 楼层级别映射: DB存储 '高楼层/中楼层/低楼层', API返回 'high/mid/low'
        db_level_map = {'high': '高楼层', 'mid': '中楼层', 'low': '低楼层'}
        
        stats = []
        for level in ['high', 'mid', 'low']:
            db_level = db_level_map.get(level, level)
            
            c_data = next((x for x in current_query if x.floor_level == db_level), None)
            d_data = next((x for x in deals_query if x.floor_level == db_level), None)
            
            # 使用实际查询到的价格数据
            deal_price = float(d_data.avg_price) if d_data and d_data.avg_price else 0
            current_price = float(c_data.avg_price) if c_data and c_data.avg_price else 0
            
            stats.append(FloorStats(
                type=level,
                deals_count=d_data.count if d_data else 0,
                deal_avg_price=deal_price,
                current_count=c_data.count if c_data else 0,
                current_avg_price=current_price
            ))
        
        
        # 4. Inventory Months 计算
        total_inventory = sum(s.current_count for s in stats)
        total_deals_last_year = sum(s.deals_count for s in stats)
        monthly_avg_deals = total_deals_last_year / 12.0 if total_deals_last_year > 0 else 0
        inventory_months = total_inventory / monthly_avg_deals if monthly_avg_deals > 0 else 99.9
        
        return {
            "floor_stats": stats,
            "inventory_months": round(inventory_months, 1)
        }



    @staticmethod
    def get_trends(db: Session, community_id: int, months: int) -> List[TrendData]:
        start_date = datetime.now() - timedelta(days=30 * months)
        
        # Group by Month
        # SQLite uses strftime('%Y-%m', date_column)
        
        # Listings (History table or Current table listed_date)
        # Using Current table listed_date for simplicity of active market trends
        
        # Deals
        deals = db.query(
            func.strftime('%Y-%m', PropertyCurrent.sold_date).label('month'),
            func.avg(PropertyCurrent.sold_price_wan / PropertyCurrent.build_area * 10000).label('avg_deal_price'),
            func.count(PropertyCurrent.id).label('volume')
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= start_date
        ).group_by('month').all()
        
        # Listings Price (avg listing price of properties listed or active in that month?)
        # This is harder to reconstruct from just 'current' table.
        # We can use PropertyHistory or just current listed properties listed in that month.
        listings = db.query(
             func.strftime('%Y-%m', PropertyCurrent.listed_date).label('month'),
             func.avg(PropertyCurrent.listed_price_wan / PropertyCurrent.build_area * 10000).label('avg_list_price')
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.listed_date >= start_date
        ).group_by('month').all()
        
        # Merge data
        data_map = {}
        for d in deals:
            data_map[d.month] = {
                "month": d.month,
                "deal_price": round(d.avg_deal_price, 0) if d.avg_deal_price else 0,
                "volume": d.volume,
                "listing_price": 0
            }
            
        for l in listings:
            if l.month not in data_map:
                data_map[l.month] = {"month": l.month, "deal_price": 0, "volume": 0, "listing_price": 0}
            data_map[l.month]["listing_price"] = round(l.avg_list_price, 0) if l.avg_list_price else 0
            
        return sorted([TrendData(**v) for v in data_map.values()], key=lambda x: x.month)

    @staticmethod
    def get_competitors(db: Session, community_id: int) -> List[CompetitorResponse]:
        comps = db.query(CommunityCompetitor).filter(
            CommunityCompetitor.community_id == community_id
        ).all()
        
        results = []
        for comp in comps:
            c = db.query(Community).filter(Community.id == comp.competitor_community_id).first()
            if c:
                results.append(CompetitorResponse(
                    community_id=c.id,
                    community_name=c.name,
                    avg_price=c.avg_price_wan * 10000 if c.avg_price_wan else 0, # Assuming wan -> unit price estimate? Or just wan total? API says 52000, likely unit price.
                    on_sale_count=c.total_properties # Or real-time count
                ))
        return results

    @staticmethod
    def add_competitor(db: Session, community_id: int, competitor_id: int):
        exists = db.query(CommunityCompetitor).filter(
            CommunityCompetitor.community_id == community_id,
            CommunityCompetitor.competitor_community_id == competitor_id
        ).first()
        if not exists:
            new_comp = CommunityCompetitor(community_id=community_id, competitor_community_id=competitor_id)
            db.add(new_comp)
            db.commit()
            
    @staticmethod
    def remove_competitor(db: Session, community_id: int, competitor_id: int):
        db.query(CommunityCompetitor).filter(
            CommunityCompetitor.community_id == community_id,
            CommunityCompetitor.competitor_community_id == competitor_id
        ).delete(synchronize_session=False)
        db.commit()

    @staticmethod
    def generate_ai_strategy(db: Session, project_id: str, context: str) -> AIStrategyResponse:
        # Mock implementation for now
        # Ideally: Fetch project info -> Build Prompt -> Call LLM -> Parse
        return AIStrategyResponse(
            report_markdown="### AI Analysis\nBased on current market trends (Mock Data), the property is well positioned...",
            risk_points=RiskPoints(profit_critical_price=2000000, daily_cost=500),
            action_plan=["Suggested listing price: 210W", "refresh photos"]
        )

    @staticmethod
    def get_neighborhood_radar(db: Session, community_id: int) -> NeighborhoodRadarResponse:
        """获取周边竞品雷达数据
        
        包含本案小区和所有竞品小区的挂牌/成交统计，按数据来源分渠道
        """
        one_year_ago = datetime.now() - timedelta(days=365)
        
        # 1. 获取本案小区
        subject = db.query(Community).filter(Community.id == community_id).first()
        if not subject:
            return NeighborhoodRadarResponse(items=[])
        
        # 2. 获取所有竞品小区ID
        competitor_ids = [
            c.competitor_community_id 
            for c in db.query(CommunityCompetitor).filter(
                CommunityCompetitor.community_id == community_id
            ).all()
        ]
        
        # 3. 合并所有需要统计的小区 (本案 + 竞品)
        all_community_ids = [community_id] + competitor_ids
        communities = db.query(Community).filter(Community.id.in_(all_community_ids)).all()
        community_map = {c.id: c for c in communities}
        
        # 4. 统计每个小区的数据
        def get_stats(cid: int):
            """获取单个小区的统计数据"""
            # 挂牌统计 - 按 data_source 分组
            listing_query = db.query(
                PropertyCurrent.data_source,
                func.count().label("count"),
                func.avg(PropertyCurrent.listed_price_wan / PropertyCurrent.build_area * 10000).label("avg_price")
            ).filter(
                PropertyCurrent.community_id == cid,
                PropertyCurrent.status == PropertyStatus.FOR_SALE,
                PropertyCurrent.build_area > 0
            ).group_by(PropertyCurrent.data_source).all()
            
            # 成交统计 - 按 data_source 分组 (过去12个月)
            deal_query = db.query(
                PropertyCurrent.data_source,
                func.count().label("count"),
                func.avg(PropertyCurrent.sold_price_wan / PropertyCurrent.build_area * 10000).label("avg_price")
            ).filter(
                PropertyCurrent.community_id == cid,
                PropertyCurrent.status == PropertyStatus.SOLD,
                PropertyCurrent.sold_date >= one_year_ago,
                PropertyCurrent.build_area > 0
            ).group_by(PropertyCurrent.data_source).all()
            
            # 解析结果 - 贝壳/我爱我家渠道
            listing_beike = 0
            listing_iaij = 0
            listing_total_price = 0.0
            listing_total_count = 0
            
            for row in listing_query:
                src = (row.data_source or "").lower()
                if "beike" in src or "贝壳" in src or "链家" in src:
                    listing_beike += row.count
                elif "5i5j" in src or "我爱" in src or "iaij" in src:
                    listing_iaij += row.count
                listing_total_count += row.count
                if row.avg_price:
                    listing_total_price += row.avg_price * row.count
            
            deal_beike = 0
            deal_iaij = 0
            deal_total_price = 0.0
            deal_total_count = 0
            
            for row in deal_query:
                src = (row.data_source or "").lower()
                if "beike" in src or "贝壳" in src or "链家" in src:
                    deal_beike += row.count
                elif "5i5j" in src or "我爱" in src or "iaij" in src:
                    deal_iaij += row.count
                deal_total_count += row.count
                if row.avg_price:
                    deal_total_price += row.avg_price * row.count
            
            listing_avg = listing_total_price / listing_total_count if listing_total_count > 0 else 0
            deal_avg = deal_total_price / deal_total_count if deal_total_count > 0 else 0
            
            return {
                "listing_count": listing_total_count,
                "listing_beike": listing_beike,
                "listing_iaij": listing_iaij,
                "listing_avg_price": round(listing_avg, 0),
                "deal_count": deal_total_count,
                "deal_beike": deal_beike,
                "deal_iaij": deal_iaij,
                "deal_avg_price": round(deal_avg, 0),
            }
        
        # 5. 计算所有小区数据
        all_stats = {cid: get_stats(cid) for cid in all_community_ids}
        
        # 6. 获取本案成交均价作为基准
        subject_deal_avg = all_stats[community_id]["deal_avg_price"]
        
        # 7. 构建响应
        items = []
        for cid in all_community_ids:
            c = community_map.get(cid)
            if not c:
                continue
            stats = all_stats[cid]
            is_subject = (cid == community_id)
            
            # 计算价差
            if is_subject:
                spread_percent = 0.0
                spread_label = "[ 📍 当前位置 ]"
            elif subject_deal_avg > 0 and stats["deal_avg_price"] > 0:
                spread_percent = ((stats["deal_avg_price"] - subject_deal_avg) / subject_deal_avg) * 100
                if spread_percent > 0:
                    spread_label = f"高于本案 {abs(spread_percent):.1f}%"
                else:
                    spread_label = f"低于本案 {abs(spread_percent):.1f}%"
            else:
                spread_percent = 0.0
                spread_label = "数据不足"
            
            items.append(NeighborhoodRadarItem(
                community_id=cid,
                community_name=c.name + (" (本案)" if is_subject else ""),
                is_subject=is_subject,
                listing_count=stats["listing_count"],
                listing_beike=stats["listing_beike"],
                listing_iaij=stats["listing_iaij"],
                listing_avg_price=stats["listing_avg_price"],
                deal_count=stats["deal_count"],
                deal_beike=stats["deal_beike"],
                deal_iaij=stats["deal_iaij"],
                deal_avg_price=stats["deal_avg_price"],
                spread_percent=round(spread_percent, 1),
                spread_label=spread_label,
            ))
        
        # 本案排在最后
        items.sort(key=lambda x: (x.is_subject, x.community_name))
        
        return NeighborhoodRadarResponse(items=items)
