"""
数据看板API端点
"""
from typing import Any, List
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.api.deps import get_db, get_current_user
from app.models.daily_city_stats import DailyCityStats
from app.models.property import Property
from app.models.my_viewing import MyViewing
from app.models.user import User

router = APIRouter()


@router.get("/stats/overview")
def get_dashboard_overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取看板概览数据"""
    # 获取最新的城市成交数据
    latest_city_stats = db.query(DailyCityStats).order_by(
        desc(DailyCityStats.record_date)
    ).first()
    
    # 房源统计
    total_properties = db.query(Property).count()
    on_sale_properties = db.query(Property).filter(Property.status == "在售").count()
    sold_properties = db.query(Property).filter(Property.status == "已成交").count()
    
    # 个人看房统计
    total_viewings = db.query(MyViewing).filter(MyViewing.user_id == current_user.id).count()
    
    return {
        "latest_city_stats": {
            "record_date": latest_city_stats.record_date if latest_city_stats else None,
            "new_deal_units": latest_city_stats.new_deal_units if latest_city_stats else 0,
            "secondhand_deal_units": latest_city_stats.secondhand_deal_units if latest_city_stats else 0,
        } if latest_city_stats else None,
        "property_stats": {
            "total": total_properties,
            "on_sale": on_sale_properties,
            "sold": sold_properties
        },
        "viewing_stats": {
            "total": total_viewings
        }
    }


@router.get("/stats/trend")
def get_trend_data(
    days: int = Query(30, ge=7, le=365, description="获取最近多少天的数据"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取交易趋势数据"""
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    
    # 获取指定时间范围内的城市成交数据
    city_stats = db.query(DailyCityStats).filter(
        DailyCityStats.record_date >= start_date,
        DailyCityStats.record_date <= end_date
    ).order_by(DailyCityStats.record_date).all()
    
    # 格式化数据用于图表展示
    trend_data = []
    for stat in city_stats:
        trend_data.append({
            "date": stat.record_date.isoformat(),
            "new_deal_units": stat.new_deal_units or 0,
            "secondhand_deal_units": stat.secondhand_deal_units or 0,
            "new_deal_area": float(stat.new_deal_area) if stat.new_deal_area else 0,
            "secondhand_deal_area": float(stat.secondhand_deal_area) if stat.secondhand_deal_area else 0
        })
    
    return {
        "trend_data": trend_data,
        "date_range": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        }
    }


@router.get("/recent/properties")
def get_recent_properties(
    limit: int = Query(5, ge=1, le=20, description="返回数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取最近新增的房源"""
    recent_properties = db.query(Property).order_by(
        desc(Property.created_at)
    ).limit(limit).all()
    
    return [
        {
            "id": prop.id,
            "community_id": prop.community_id,
            "status": prop.status,
            "layout": f"{prop.layout_bedrooms}室{prop.layout_living_rooms}厅" if prop.layout_bedrooms and prop.layout_living_rooms else "未知",
            "area_sqm": float(prop.area_sqm) if prop.area_sqm else None,
            "listing_price_wan": float(prop.listing_price_wan) if prop.listing_price_wan else None,
            "created_at": prop.created_at.isoformat()
        }
        for prop in recent_properties
    ]


@router.get("/recent/viewings")
def get_recent_viewings(
    limit: int = Query(5, ge=1, le=20, description="返回数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取最近的看房笔记"""
    recent_viewings = db.query(MyViewing).filter(
        MyViewing.user_id == current_user.id
    ).order_by(
        desc(MyViewing.created_at)
    ).limit(limit).all()
    
    return [
        {
            "id": viewing.id,
            "property_id": viewing.property_id,
            "viewing_date": viewing.viewing_date.isoformat(),
            "rating": viewing.rating,
            "expected_purchase_price_wan": float(viewing.expected_purchase_price_wan) if viewing.expected_purchase_price_wan else None,
            "created_at": viewing.created_at.isoformat()
        }
        for viewing in recent_viewings
    ]
