"""C端公开小区路由.

提供无需登录的小区搜索与户型图查询，供 C端估价表单使用。
"""

from typing import Annotated

from fastapi import APIRouter, Path, Query, Request

from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from routers.reports.dependencies import ValidCommunityIdDep
from schemas.community_image import CommunityImageListResponse
from schemas.public import PublicCommunityAnalysisResponse, PublicCommunitySearchItem
from schemas.reports.common import RangeOption, ReportsFilter, TrendDimension
from services.market.community_image_service import CommunityImageService
from services.market.community_service import CommunityQueryService
from services.reports import aggregations
from services.system.exceptions import PermissionDeniedError
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/public/communities", tags=["public-communities"])


@router.get(
    "/search",
    summary="搜索小区",
    description="根据关键词搜索小区，无需登录",
)
@limiter.limit(RateLimits.PUBLIC_COMMUNITY_SEARCH)
def search_communities(
    request: Request,
    db: DbSessionDep,
    q: Annotated[str, Query(min_length=1, max_length=100, description="搜索关键词")],
    limit: Annotated[int, Query(ge=1, le=100, description="返回条数限制")] = 20,
) -> list[PublicCommunitySearchItem]:
    """根据关键词搜索小区."""
    return CommunityQueryService.search_public_communities(db=db, keyword=q, limit=limit)


@router.get(
    "/{community_id}/images",
    summary="查询小区户型图",
    description="返回指定小区的户型图列表，无需登录，供 C端估价表单选择户型图",
)
@limiter.limit(RateLimits.PUBLIC_COMMUNITY_SEARCH)
def list_community_images(
    request: Request,
    db: DbSessionDep,
    community_id: Annotated[str, Path(min_length=1, max_length=36, description="小区ID")],
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页数量")] = 100,
) -> CommunityImageListResponse:
    """查询小区户型图列表（公开端点）."""
    return CommunityImageService.list_by_community(
        db=db,
        community_id=community_id,
        page=page,
        page_size=page_size,
    )


@router.get(
    "/{community_id}/analysis",
    summary="小区成交分析",
    description=(
        "返回指定小区的成交分析聚合数据（KPI+趋势+价格分布+户型分布+楼层分布+主力户型），"
        "需 C端登录且已绑定手机号，未绑定手机号将返回 403"
    ),
)
@limiter.limit(RateLimits.PUBLIC_COMMUNITY_ANALYSIS)
def get_community_analysis(
    request: Request,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
    community_id: Annotated[str, Path(min_length=1, max_length=36, description="小区ID")],
    community: ValidCommunityIdDep,
    range: Annotated[
        RangeOption,
        Query(description="时间范围：4w/8w=周；6m/12m/24m=月"),
    ] = RangeOption.M12,
    trend_dim: Annotated[
        TrendDimension,
        Query(description="趋势维度: overall(综合) / rooms(户型) / floor(楼层) / price(价格段)"),
    ] = TrendDimension.OVERALL,
) -> PublicCommunityAnalysisResponse:
    """返回指定小区的成交分析聚合数据（C端公开端点）.

    - ``community_id`` 由依赖项 valid_community_id 校验存在并 is_active=True（404）
    - 当前用户未绑定手机号时拒绝访问（403），与小程序端引导绑定手机号的门槛一致
    - ``range``/``trend_dim`` 解析为最小 ReportsFilter 后透传给 Service 层聚合
    - 路由仅编排，聚合全部复用 services.reports.aggregations.get_community_detail
    """
    if not current_user.phone:
        msg = "请先绑定手机号后查看小区分析"
        raise PermissionDeniedError(msg)
    reports_filter = ReportsFilter(range=range.value)
    return aggregations.get_community_detail(db, community, filter=reports_filter, trend_dim=trend_dim.value)
