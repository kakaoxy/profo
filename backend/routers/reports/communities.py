"""小区分析报表路由.

提供小区明细列表与小区成交分析详情 2 个端点.
所有端点强制 JWT 鉴权 + property:read 权限, 使用同步 SQLAlchemy Session.
"""

from typing import Annotated

from fastapi import APIRouter, Query, status

from dependencies.auth import DbSessionDep, ReportsReadPermDep
from routers.reports.dependencies import (
    ReportsFilterDep,
    ValidCommunityIdDep,
)
from schemas.reports.common import ErrorResponse, TrendDimension
from schemas.reports.communities import CommunityDetailResponse, CommunityListResponse
from services.reports import aggregations
from utils.param_parser import parse_comma_separated_list

communities_router = APIRouter(prefix="/communities", tags=["reports-communities"])

# 通用错误响应字典（401/403）
_AUTH_ERRORS: dict[int, dict] = {
    401: {"model": ErrorResponse, "description": "未认证"},
    403: {"model": ErrorResponse, "description": "权限不足"},
}


@communities_router.get(
    "/",
    response_model=CommunityListResponse,
    status_code=status.HTTP_200_OK,
    responses={
        422: {"model": ErrorResponse, "description": "缺少必填参数 business_circles"},
        **_AUTH_ERRORS,
    },
    summary="小区明细列表",
    description="返回指定商圈下达到最低成交数的小区行",
)
def list_communities(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
    business_circles: Annotated[str, Query(description="商圈名称列表 (必填, 逗号分隔)")],
    min_sold_count: Annotated[int, Query(ge=1, description="最低成交套数阈值, 默认 3")] = 3,
) -> CommunityListResponse:
    """返回指定商圈下达到 min_sold_count 的小区行列表.

    - ``business_circles`` 为必填 Query 参数 (FastAPI 自动 422 缺失), 合并到 reports_filter
    - ``min_sold_count`` 默认 3, 过滤 sold_count < min_sold_count 的小区
    - ``range/sources/rooms/floor_levels`` 由 ReportsFilterDep 解析后透传给 Service 层
    - 时间窗口基于 MAX(sold_date) (reference_date) 而非 now, 避免数据更新延迟导致空窗口
    - status 强制为 '成交' (小区列表天然只关心成交, 即使 filter.status='在售' 也只统计成交)
    """
    # business_circles 作为独立必填 Query 参数 (FastAPI 自动 422 缺失),
    # 显式合并到 reports_filter 以覆盖可能由依赖项解析的同名字段
    merged_filter = reports_filter.model_copy(update={"business_circles": parse_comma_separated_list(business_circles)})
    return aggregations.get_community_rows(db, filter=merged_filter, min_sold_count=min_sold_count)


@communities_router.get(
    "/{community_id}/analysis",
    response_model=CommunityDetailResponse,
    status_code=status.HTTP_200_OK,
    responses={
        404: {"model": ErrorResponse, "description": "小区不存在或已停用"},
        **_AUTH_ERRORS,
    },
    summary="小区成交分析",
    description="返回小区成交分析聚合数据（KPI+趋势+价格分布+同商圈对比）",
)
def get_community_analysis(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    community: ValidCommunityIdDep,
    reports_filter: ReportsFilterDep,
    trend_dim: Annotated[
        TrendDimension,
        Query(description="趋势维度: overall(综合) / rooms(户型) / floor(楼层) / price(价格段)"),
    ] = TrendDimension.OVERALL,
) -> CommunityDetailResponse:
    """返回小区成交分析聚合数据.

    - ``community_id`` 由依赖项 valid_community_id 校验存在并 is_active=True (404)
    - 组合 KPI / 趋势 / 价格分布 + main_layout + 同商圈对比小区列表
    - ``range/sources/rooms/floor_levels`` 由 ReportsFilterDep 解析后透传给 Service 层
    - ``trend_dim`` 默认 overall, 透传给 _get_trend_data_impl 计算 dim_breakdown
    """
    return aggregations.get_community_detail(db, community, filter=reports_filter, trend_dim=trend_dim.value)
