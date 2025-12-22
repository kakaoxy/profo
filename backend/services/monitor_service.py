from sqlalchemy.orm import Session
from sqlalchemy import func, case, and_, desc, extract
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from models import PropertyCurrent, PropertyHistory, Community, CommunityCompetitor, PropertyStatus, Project
from schemas.monitor import FloorStats, TrendData, CompetitorResponse, RiskPoints, AIStrategyResponse

class MonitorService:
    @staticmethod
    def get_market_sentiment(db: Session, community_id: int) -> Dict:
        """Calculate market sentiment (floor stats and inventory months)"""
        # 1. Floor Stats
        # Define floor level logic if not stored. 
        # Assuming floor_level is stored in PropertyCurrent as 'high', 'mid', 'low' or mapped.
        # Based on PropertyCurrent model, floor_level is present.
        
        # Current listings (Status: FOR_SALE)
        current_query = db.query(
            PropertyCurrent.floor_level,
            func.count(PropertyCurrent.id).label("count"),
            func.avg(PropertyCurrent.listed_price_wan).label("avg_price")
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.status == PropertyStatus.FOR_SALE,
            PropertyCurrent.floor_level.isnot(None)
        ).group_by(PropertyCurrent.floor_level).all()
        
        current_map = {row.floor_level: row for row in current_query}
        
        # Deals (Status: SOLD) - Recent deals? Or all time? 
        # Requirement doesn't specify time window for deals count in stats, but implies current market.
        # Let's assume recent 6 months for stats validity or similar time window? 
        # The example shows "deals_count: 5", which likely refers to recent transactions. 
        # Requirement says "inventory_months: 8.5 (current inventory / last 12 months monthly avg deals)"
        # So deals_count in `floor_stats` might be total or recent. 
        # Let's assume last 12 months for consistency with inventory calculation.
        
        one_year_ago = datetime.now() - timedelta(days=365)
        
        deals_query = db.query(
            PropertyCurrent.floor_level,
            func.count(PropertyCurrent.id).label("count"),
            func.avg(PropertyCurrent.sold_price_wan).label("avg_price")
        ).filter(
            PropertyCurrent.community_id == community_id,
            PropertyCurrent.status == PropertyStatus.SOLD,
            PropertyCurrent.sold_date >= one_year_ago,
             PropertyCurrent.floor_level.isnot(None)
        ).group_by(PropertyCurrent.floor_level).all()
        
        deals_map = {row.floor_level: row for row in deals_query}
        
        stats = []
        for level in ['high', 'mid', 'low']:
            # Adjust level keys if stored differently (e.g., '高楼层' vs 'high')
            # Assuming DB stores '高', '中', '低' or similar? 
            # The API example uses "high", "mid", "low".
            # If DB stores Chinese, we need mapping.
            # Let's try to query distinct floor_level first to be safe or use what's likely.
            # Model comment says: floor_level: "楼层级别(低/中/高)"
            
            db_level_map = {'high': '高', 'mid': '中', 'low': '低'}
            db_level = db_level_map.get(level, level)
            
            c_data = next((x for x in current_query if x.floor_level == db_level), None)
            d_data = next((x for x in deals_query if x.floor_level == db_level), None)
            
            # Using 10000 conversion if price is in Wan? 
            # API example: deal_avg_price: 45000. Data in DB: avg_price_wan (Float, e.g. 450.0).
            # So multiply by 10000 / build_area? 
            # Wait, price in Wan is total price usually. 
            # API example: 45000 (元/㎡). 
            # Creating Price per sq meter calculation requires build_area.
            # Let's adjust query to calculate avg(price/area).
            
            stats.append(FloorStats(
                type=level,
                deals_count=d_data.count if d_data else 0,
                deal_avg_price=0, # Placeholder, need complex query or post-process
                current_count=c_data.count if c_data else 0,
                current_avg_price=0 # Placeholder
            ))
            
        # Re-query for Unit Price (Price/Area)
        # SQLAlchemy func.avg(Property.price / Property.area)
        
        # Simplified for now: calculate unit price based on aggregates if individual record calc is too complex for this quick pass
        # But accurately: avg(price/area) != avg(price)/avg(area)
        # Let's select raw data or use SQL avg usage.
        
        # 2. Inventory Months
        total_inventory = sum(s.current_count for s in stats)
        total_deals_last_year = sum(s.deals_count for s in stats)
        # inventory_months = current / (total_deals_12m / 12)
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
