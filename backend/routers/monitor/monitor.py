from typing import Annotated, List
from fastapi import APIRouter, Depends, Path, Query, HTTPException, status, Request

from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from schemas.monitor import (
    AddCompetitorRequest,
    AIStrategyRequest,
    AIStrategyResponse,
    CompetitorResponse,
    MarketSentimentResponse,
    NeighborhoodRadarResponse,
    TrendData,
    CommunityMarketStatsResponse,
)
from services.monitor import MonitorService
from common import limiter

router = APIRouter(prefix="/monitor")

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
@limiter.limit("20/hour")
def remove_competitor(
    request: Request,
    community_id: CommunityIdPath,
    competitor_id: CompetitorIdPath,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> None:
    """删除竞品
    速率限制：20次/小时
    """
    removed = MonitorService.remove_competitor(db, community_id, competitor_id)
    if removed:
        db.commit()
    else:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="竞品小区不存在"
        )


@router.get("/communities/{community_id}/market-stats", response_model=CommunityMarketStatsResponse)
def get_community_market_stats(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
) -> CommunityMarketStatsResponse:
    """获取小区市场统计数据

    用于项目卡片展示的市场数据:
    - on_sale: 竞品在售数量
    - avg_price: 成交均价(元/㎡)
    - volume_30d: 30日成交量
    - price_trend_30d: 30日价格趋势百分比
    - is_price_up: 价格趋势方向
    """
    return MonitorService.get_community_market_stats(db, community_id)
