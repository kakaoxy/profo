from typing import Annotated, List

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import get_current_internal_user
from models.user import User
from schemas.monitor import (
    AddCompetitorRequest,
    AIStrategyRequest,
    AIStrategyResponse,
    CompetitorResponse,
    MarketSentimentResponse,
    NeighborhoodRadarResponse,
    TrendData,
)
from services.monitor_service import MonitorService

router = APIRouter(prefix="/monitor")
community_router = APIRouter(prefix="/communities")

DbSessionDep = Annotated[Session, Depends(get_db)]
CurrentInternalUserDep = Annotated[User, Depends(get_current_internal_user)]


@router.get("/communities/{community_id}/sentiment", response_model=MarketSentimentResponse)
def get_sentiment(
    community_id: int,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> MarketSentimentResponse:
    return MonitorService.get_market_sentiment(db, community_id)


@router.get("/communities/{community_id}/trends", response_model=List[TrendData])
def get_trends(
    community_id: int,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    months: Annotated[int, Query(ge=1, le=24)] = 6,
) -> List[TrendData]:
    return MonitorService.get_trends(db, community_id, months)


@router.post("/ai-strategy", response_model=AIStrategyResponse)
def generate_strategy(
    request: AIStrategyRequest,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> AIStrategyResponse:
    return MonitorService.generate_ai_strategy(db, request.project_id, request.user_context)


@router.get("/communities/{community_id}/radar", response_model=NeighborhoodRadarResponse)
def get_neighborhood_radar(
    community_id: int,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> NeighborhoodRadarResponse:
    """获取周边竞品雷达数据，包含分渠道统计"""
    return MonitorService.get_neighborhood_radar(db, community_id)


# --- Community Competitor Endpoints ---


@community_router.get("/{community_id}/competitors", response_model=List[CompetitorResponse])
def get_competitors(
    community_id: int,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> List[CompetitorResponse]:
    return MonitorService.get_competitors(db, community_id)


@community_router.post("/{community_id}/competitors", status_code=201)
def add_competitor(
    community_id: int,
    request: AddCompetitorRequest,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> None:
    MonitorService.add_competitor(db, community_id, request.competitor_community_id)


@community_router.delete("/{community_id}/competitors/{competitor_id}", status_code=204)
def remove_competitor(
    community_id: int,
    competitor_id: int,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> None:
    MonitorService.remove_competitor(db, community_id, competitor_id)
