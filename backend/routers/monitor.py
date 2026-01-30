from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List
from db import get_db
from models.user import User
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
from schemas.response import ApiResponse
from services.monitor_service import MonitorService
from dependencies.auth import get_current_normal_user, get_current_operator_user

router = APIRouter(prefix="/monitor")
community_router = APIRouter(prefix="/communities")

@router.get("/communities/{community_id}/sentiment", response_model=ApiResponse[MarketSentimentResponse])
def get_sentiment(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_normal_user)
):
    data = MonitorService.get_market_sentiment(db, community_id)
    return ApiResponse.success(data=data)

@router.get("/communities/{community_id}/trends", response_model=ApiResponse[List[TrendData]])
def get_trends(
    community_id: int,
    months: int = Query(6, ge=1, le=24),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_normal_user)
):
    data = MonitorService.get_trends(db, community_id, months)
    return ApiResponse.success(data=data)

@router.post("/ai-strategy", response_model=AIStrategyResponse)
def generate_strategy(
    request: AIStrategyRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_operator_user)
):
    return MonitorService.generate_ai_strategy(db, request.project_id, request.user_context)


@router.get("/communities/{community_id}/radar", response_model=ApiResponse[NeighborhoodRadarResponse])
def get_neighborhood_radar(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_normal_user)
):
    """获取周边竞品雷达数据，包含分渠道统计"""
    data = MonitorService.get_neighborhood_radar(db, community_id)
    return ApiResponse.success(data=data)

# --- Community Competitor Endpoints ---

@community_router.get("/{community_id}/competitors", response_model=ApiResponse[List[CompetitorResponse]])
def get_competitors(
    community_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_normal_user)
):
    data = MonitorService.get_competitors(db, community_id)
    return ApiResponse.success(data=data)

@community_router.post("/{community_id}/competitors", response_model=ApiResponse)
def add_competitor(
    community_id: int,
    request: AddCompetitorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_operator_user)
):
    MonitorService.add_competitor(db, community_id, request.competitor_community_id)
    return ApiResponse.success(data=None)

@community_router.delete("/{community_id}/competitors/{competitor_id}", response_model=ApiResponse)
def remove_competitor(
    community_id: int,
    competitor_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_operator_user)
):
    MonitorService.remove_competitor(db, community_id, competitor_id)
    return ApiResponse.success(data=None)
