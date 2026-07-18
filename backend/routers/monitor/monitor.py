"""市场监控路由."""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status

from dependencies.auth import CurrentInternalUserDep, DbSessionDep, ProjectReadPermDep
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
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/monitor", tags=["monitor"])

CommunityIdPath = Annotated[str, Path(description="小区ID")]
CompetitorIdPath = Annotated[str, Path(description="竞品小区ID")]


def get_monitor_service(db: DbSessionDep) -> MonitorService:
    """创建市场监控服务实例."""
    return MonitorService(db)


_MonitorServiceDep = Annotated[MonitorService, Depends(get_monitor_service)]


@router.get("/communities/{community_id}/sentiment")
def get_sentiment(
    community_id: CommunityIdPath,
    service: _MonitorServiceDep,
    _current_user: ProjectReadPermDep,
) -> MarketSentimentResponse:
    """获取市场情绪数据."""
    return service.get_market_sentiment(community_id)


@router.get("/communities/{community_id}/trends")
def get_trends(
    community_id: CommunityIdPath,
    service: _MonitorServiceDep,
    _current_user: ProjectReadPermDep,
    months: Annotated[int, Query(ge=1, le=24)] = 6,
) -> list[TrendData]:
    """获取趋势数据."""
    return service.get_trends(community_id, months)


@router.post("/ai-strategy")
def generate_strategy(
    request: AIStrategyRequest,
    service: _MonitorServiceDep,
    _current_user: CurrentInternalUserDep,
) -> AIStrategyResponse:
    """生成AI策略建议."""
    return service.generate_ai_strategy(request.project_id, request.user_context)


@router.get("/communities/{community_id}/radar")
def get_neighborhood_radar(
    community_id: CommunityIdPath,
    service: _MonitorServiceDep,
    _current_user: ProjectReadPermDep,
) -> NeighborhoodRadarResponse:
    """获取周边竞品雷达数据，包含分渠道统计."""
    return service.get_neighborhood_radar(community_id)


@router.get("/communities/{community_id}/competitors")
def get_competitors(
    community_id: CommunityIdPath,
    service: _MonitorServiceDep,
    _current_user: ProjectReadPermDep,
) -> list[CompetitorResponse]:
    """获取竞品列表."""
    return service.get_competitors(community_id)


@router.post("/communities/{community_id}/competitors", status_code=status.HTTP_201_CREATED)
def add_competitor(
    community_id: CommunityIdPath,
    request: AddCompetitorRequest,
    service: _MonitorServiceDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """添加竞品小区."""
    added = service.add_competitor(community_id, request.competitor_community_id)
    if not added:
        msg = "竞品小区已存在"
        raise ConflictError(msg)


@router.delete("/communities/{community_id}/competitors/{competitor_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(RateLimits.MONITOR_DELETE)
def remove_competitor(
    request: Request,
    community_id: CommunityIdPath,
    competitor_id: CompetitorIdPath,
    service: _MonitorServiceDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """删除竞品.

    速率限制：20次/小时.
    """
    removed = service.remove_competitor(community_id, competitor_id)
    if not removed:
        msg = "竞品小区不存在"
        raise ResourceNotFoundError(msg)


@router.get("/communities/{community_id}/market-stats")
def get_community_market_stats(
    community_id: CommunityIdPath,
    service: _MonitorServiceDep,
    _current_user: ProjectReadPermDep,
) -> CommunityMarketStatsResponse:
    """获取小区市场统计数据.

    用于项目卡片展示的市场数据:
    - on_sale: 竞品在售数量
    - avg_price: 成交均价(元/㎡)
    - volume_30d: 30日成交量
    - price_trend_30d: 30日价格趋势百分比
    - is_price_up: 价格趋势方向
    """
    return service.get_community_market_stats(community_id)
