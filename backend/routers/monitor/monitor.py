from typing import Annotated, List
from fastapi import APIRouter, Depends, Path, Query, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from dependencies.auth import CurrentInternalUserDep
from schemas.monitor import (
    AddCompetitorRequest,
    AIStrategyRequest,
    AIStrategyResponse,
    CompetitorResponse,
    MarketSentimentResponse,
    NeighborhoodRadarResponse,
    TrendData,
)
from services.monitor import MonitorService

router = APIRouter(prefix="/monitor")

DbSessionDep = Annotated[Session, Depends(get_db)]
CommunityIdPath = Annotated[str, Path(description="小区ID")]
CompetitorIdPath = Annotated[str, Path(description="竞品小区ID")]


@router.get("/communities/{community_id}/sentiment", response_model=MarketSentimentResponse)
def get_sentiment(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> MarketSentimentResponse:
    return MonitorService.get_market_sentiment(db, community_id)


@router.get("/communities/{community_id}/trends", response_model=List[TrendData])
def get_trends(
    community_id: CommunityIdPath,
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
    community_id: CommunityIdPath,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> NeighborhoodRadarResponse:
    """获取周边竞品雷达数据，包含分渠道统计"""
    return MonitorService.get_neighborhood_radar(db, community_id)


# --- Community Competitor Endpoints (统一放在 monitor_router 下) ---


@router.get("/communities/{community_id}/competitors", response_model=List[CompetitorResponse])
def get_competitors(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> List[CompetitorResponse]:
    return MonitorService.get_competitors(db, community_id)


@router.post("/communities/{community_id}/competitors", status_code=status.HTTP_201_CREATED)
def add_competitor(
    community_id: CommunityIdPath,
    request: AddCompetitorRequest,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> None:
    added = MonitorService.add_competitor(db, community_id, request.competitor_community_id)
    if added:
        db.commit()
    else:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="竞品小区已存在"
        )


@router.delete("/communities/{community_id}/competitors/{competitor_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_competitor(
    community_id: CommunityIdPath,
    competitor_id: CompetitorIdPath,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> None:
    removed = MonitorService.remove_competitor(db, community_id, competitor_id)
    if removed:
        db.commit()
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="竞品小区不存在"
        )
