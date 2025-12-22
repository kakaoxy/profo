from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from db import get_db
from schemas.monitor import (
    MarketSentimentResponse,
    TrendResponse,
    TrendData,
    CompetitorResponse,
    AddCompetitorRequest,
    AIStrategyRequest,
    AIStrategyResponse,
    NeighborhoodRadarResponse
)
from services.monitor_service import MonitorService

router = APIRouter(prefix="/monitor")
community_router = APIRouter(prefix="/communities")

@router.get("/communities/{community_id}/sentiment", response_model=MarketSentimentResponse)
def get_sentiment(community_id: int, db: Session = Depends(get_db)):
    return MonitorService.get_market_sentiment(db, community_id)

@router.get("/communities/{community_id}/trends", response_model=List[TrendData])
def get_trends(
    community_id: int, 
    months: int = Query(6, ge=1, le=24), 
    db: Session = Depends(get_db)
):
    return MonitorService.get_trends(db, community_id, months)

@router.post("/ai-strategy", response_model=AIStrategyResponse)
def generate_strategy(request: AIStrategyRequest, db: Session = Depends(get_db)):
    return MonitorService.generate_ai_strategy(db, request.project_id, request.user_context)


@router.get("/communities/{community_id}/radar", response_model=NeighborhoodRadarResponse)
def get_neighborhood_radar(community_id: int, db: Session = Depends(get_db)):
    """获取周边竞品雷达数据，包含分渠道统计"""
    return MonitorService.get_neighborhood_radar(db, community_id)

# --- Community Competitor Endpoints ---

@community_router.get("/{community_id}/competitors", response_model=List[CompetitorResponse])
def get_competitors(community_id: int, db: Session = Depends(get_db)):
    return MonitorService.get_competitors(db, community_id)

@community_router.post("/{community_id}/competitors")
def add_competitor(
    community_id: int, 
    request: AddCompetitorRequest, 
    db: Session = Depends(get_db)
):
    MonitorService.add_competitor(db, community_id, request.competitor_community_id)
    return {"status": "success"}

@community_router.delete("/{community_id}/competitors/{competitor_id}")
def remove_competitor(
    community_id: int, 
    competitor_id: int, 
    db: Session = Depends(get_db)
):
    MonitorService.remove_competitor(db, community_id, competitor_id)
    return {"status": "success"}
