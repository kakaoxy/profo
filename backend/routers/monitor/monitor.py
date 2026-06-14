"""市场监控路由."""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request, status

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentInternalUserDep, DbSessionDep
from schemas.monitor import (
    AddCompetitorRequest,
    AIStrategyRequest,
    AIStrategyResponse,
    CommunityMarketStatsResponse,
    CompetitorResponse,
    MarketSentimentResponse,
    NeighborhoodRadarResponse,
    TrendData,
)
from services.monitor import MonitorService
from services.system.exceptions import ConflictError, ResourceNotFoundError

router = APIRouter(prefix="/monitor", tags=["monitor"])

CommunityIdPath = Annotated[str, Path(description="小区ID")]
CompetitorIdPath = Annotated[str, Path(description="竞品小区ID")]


@router.get("/communities/{community_id}/sentiment")
def get_sentiment(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> MarketSentimentResponse:
    """获取市场情绪数据."""
    return MonitorService.get_market_sentiment(db, community_id)


@router.get("/communities/{community_id}/trends")
def get_trends(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    months: Annotated[int, Query(ge=1, le=24)] = 6,
) -> list[TrendData]:
    """获取趋势数据."""
    return MonitorService.get_trends(db, community_id, months)


@router.post("/ai-strategy")
def generate_strategy(
    request: AIStrategyRequest,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> AIStrategyResponse:
    """生成AI策略建议."""
    return MonitorService.generate_ai_strategy(db, request.project_id, request.user_context)


@router.get("/communities/{community_id}/radar")
def get_neighborhood_radar(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> NeighborhoodRadarResponse:
    """获取周边竞品雷达数据，包含分渠道统计."""
    return MonitorService.get_neighborhood_radar(db, community_id)


@router.get("/communities/{community_id}/competitors")
def get_competitors(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> list[CompetitorResponse]:
    """获取竞品列表."""
    return MonitorService.get_competitors(db, community_id)


@router.post("/communities/{community_id}/competitors", status_code=status.HTTP_201_CREATED)
def add_competitor(
    community_id: CommunityIdPath,
    request: AddCompetitorRequest,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """添加竞品小区."""
    added = MonitorService.add_competitor(db, community_id, request.competitor_community_id)
    if added:
        db.commit()
    else:
        raise ConflictError("竞品小区已存在")


@router.delete("/communities/{community_id}/competitors/{competitor_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(RateLimits.MONITOR_DELETE)
def remove_competitor(
    request: Request,
    community_id: CommunityIdPath,
    competitor_id: CompetitorIdPath,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """删除竞品.

    速率限制：20次/小时.
    """
    removed = MonitorService.remove_competitor(db, community_id, competitor_id)
    if removed:
        db.commit()
    else:
        raise ResourceNotFoundError("竞品小区不存在")


@router.get("/communities/{community_id}/market-stats")
def get_community_market_stats(
    community_id: CommunityIdPath,
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
) -> CommunityMarketStatsResponse:
    """获取小区市场统计数据.

    用于项目卡片展示的市场数据:
    - on_sale: 竞品在售数量
    - avg_price: 成交均价(元/㎡)
    - volume_30d: 30日成交量
    - price_trend_30d: 30日价格趋势百分比
    - is_price_up: 价格趋势方向
    """
    return MonitorService.get_community_market_stats(db, community_id)
