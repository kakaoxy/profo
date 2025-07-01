"""
统计数据管理API端点
"""
from typing import Any, List
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session

from app.api.deps import get_db, get_current_user
from app.models.daily_city_stats import DailyCityStats
from app.models.community_stats import CommunityStats
from app.models.city import City
from app.models.community import Community
from app.models.user import User
from app.schemas.daily_city_stats import DailyCityStatsCreate, DailyCityStatsUpdate, DailyCityStatsResponse
from app.schemas.community_stats import CommunityStatsCreate, CommunityStatsUpdate, CommunityStatsResponse

router = APIRouter()


# 城市每日成交统计相关端点
@router.get("/daily-city", response_model=List[DailyCityStatsResponse])
def get_daily_city_stats(
    city_id: int = Query(None, description="按城市筛选"),
    start_date: date = Query(None, description="开始日期"),
    end_date: date = Query(None, description="结束日期"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取城市每日成交统计列表"""
    query = db.query(DailyCityStats)
    
    if city_id:
        query = query.filter(DailyCityStats.city_id == city_id)
    
    if start_date:
        query = query.filter(DailyCityStats.record_date >= start_date)
    
    if end_date:
        query = query.filter(DailyCityStats.record_date <= end_date)
    
    query = query.order_by(DailyCityStats.record_date.desc())
    
    offset = (page - 1) * limit
    stats = query.offset(offset).limit(limit).all()
    return stats


@router.post("/daily-city", response_model=DailyCityStatsResponse)
def create_daily_city_stats(
    stats_data: DailyCityStatsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建城市每日成交统计"""
    # 验证城市是否存在
    city = db.query(City).filter(City.id == stats_data.city_id).first()
    if not city:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的城市不存在"
        )
    
    # 检查是否已存在相同日期的统计
    existing_stats = db.query(DailyCityStats).filter(
        DailyCityStats.city_id == stats_data.city_id,
        DailyCityStats.record_date == stats_data.record_date
    ).first()
    if existing_stats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该城市该日期的统计数据已存在"
        )
    
    stats = DailyCityStats(**stats_data.dict())
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


@router.put("/daily-city/{stats_id}", response_model=DailyCityStatsResponse)
def update_daily_city_stats(
    stats_id: int,
    stats_data: DailyCityStatsUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """更新城市每日成交统计"""
    stats = db.query(DailyCityStats).filter(DailyCityStats.id == stats_id).first()
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="统计数据不存在"
        )
    
    for field, value in stats_data.dict(exclude_unset=True).items():
        setattr(stats, field, value)
    
    db.commit()
    db.refresh(stats)
    return stats


@router.delete("/daily-city/{stats_id}")
def delete_daily_city_stats(
    stats_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """删除城市每日成交统计"""
    stats = db.query(DailyCityStats).filter(DailyCityStats.id == stats_id).first()
    if not stats:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="统计数据不存在"
        )
    
    db.delete(stats)
    db.commit()
    return {"message": "统计数据删除成功"}


# 小区周期统计相关端点
@router.get("/community", response_model=List[CommunityStatsResponse])
def get_community_stats(
    community_id: int = Query(None, description="按小区筛选"),
    start_date: date = Query(None, description="开始日期"),
    end_date: date = Query(None, description="结束日期"),
    page: int = Query(1, ge=1, description="页码"),
    limit: int = Query(20, ge=1, le=100, description="每页数量"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取小区周期统计列表"""
    query = db.query(CommunityStats)
    
    if community_id:
        query = query.filter(CommunityStats.community_id == community_id)
    
    if start_date:
        query = query.filter(CommunityStats.record_date >= start_date)
    
    if end_date:
        query = query.filter(CommunityStats.record_date <= end_date)
    
    query = query.order_by(CommunityStats.record_date.desc())
    
    offset = (page - 1) * limit
    stats = query.offset(offset).limit(limit).all()
    return stats


@router.post("/community", response_model=CommunityStatsResponse)
def create_community_stats(
    stats_data: CommunityStatsCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """创建小区周期统计"""
    # 验证小区是否存在
    community = db.query(Community).filter(Community.id == stats_data.community_id).first()
    if not community:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="指定的小区不存在"
        )
    
    # 检查是否已存在相同日期的统计
    existing_stats = db.query(CommunityStats).filter(
        CommunityStats.community_id == stats_data.community_id,
        CommunityStats.record_date == stats_data.record_date
    ).first()
    if existing_stats:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="该小区该日期的统计数据已存在"
        )
    
    stats = CommunityStats(**stats_data.dict())
    db.add(stats)
    db.commit()
    db.refresh(stats)
    return stats


@router.get("/community/{community_id}/trend")
def get_community_trend(
    community_id: int,
    days: int = Query(90, ge=7, le=365, description="获取最近多少天的数据"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Any:
    """获取小区历史趋势数据"""
    # 验证小区是否存在
    community = db.query(Community).filter(Community.id == community_id).first()
    if not community:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="小区不存在"
        )
    
    from datetime import datetime, timedelta
    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days)
    
    stats = db.query(CommunityStats).filter(
        CommunityStats.community_id == community_id,
        CommunityStats.record_date >= start_date,
        CommunityStats.record_date <= end_date
    ).order_by(CommunityStats.record_date).all()
    
    trend_data = []
    for stat in stats:
        trend_data.append({
            "date": stat.record_date.isoformat(),
            "avg_price_per_sqm": stat.avg_price_per_sqm,
            "active_listings_count": stat.active_listings_count,
            "deals_in_last_90_days": stat.deals_in_last_90_days,
            "showings_in_last_30_days": stat.showings_in_last_30_days
        })
    
    return {
        "community_info": {
            "id": community.id,
            "name": community.name,
            "district": community.district,
            "business_circle": community.business_circle
        },
        "trend_data": trend_data,
        "date_range": {
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat()
        }
    }
