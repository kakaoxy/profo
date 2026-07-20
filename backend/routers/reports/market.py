"""商圈总览报表路由.

提供 KPI / 趋势 / 价格分布 / 商圈列表 / 字典 / 多商圈对比 6 个端点.
所有端点强制 JWT 鉴权 + property:read 权限, 使用同步 SQLAlchemy Session.
"""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from dependencies.auth import DbSessionDep, ReportsReadPermDep
from routers.reports.dependencies import ReportsFilterDep, ValidCompareIdsDep
from schemas.community import DictionaryResponse
from schemas.reports.common import ErrorResponse, SortOrder, TrendDimension
from schemas.reports.market import (
    BusinessDistrictListResponse,
    ComparisonData,
    DistributionResponse,
    KpiData,
    PriceDistributionResponse,
    TrendDataPoint,
)
from services.reports import aggregations, dictionaries

# 报表字典类型枚举
DictType = Literal["data_source", "rooms", "floor_level", "last_updated"]

market_router = APIRouter(prefix="/market", tags=["reports-market"])

# 通用错误响应字典（401/403）
_AUTH_ERRORS: dict[int, dict] = {
    401: {"model": ErrorResponse, "description": "未认证"},
    403: {"model": ErrorResponse, "description": "权限不足"},
}


@market_router.get(
    "/kpi",
    response_model=KpiData,
    status_code=status.HTTP_200_OK,
    responses=_AUTH_ERRORS,
    summary="KPI 指标卡片",
    description="返回选定筛选条件下的 4 张 KPI 卡片聚合数据",
)
def get_kpi(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
) -> KpiData:
    """返回 sold_count / avg_price_wan / avg_unit_price / on_sale_count 4 张 KPI 卡片."""
    return aggregations.get_kpi_data(db, reports_filter)


@market_router.get(
    "/trend",
    response_model=list[TrendDataPoint],
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "不支持的 trend_dim"},
        **_AUTH_ERRORS,
    },
    summary="成交趋势图",
    description="返回按维度分组的成交量与单价趋势",
)
def get_trend(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
    trend_dim: Annotated[
        TrendDimension,
        Query(description="趋势维度: overall(综合) / rooms(户型) / floor(楼层) / price(价格段)"),
    ] = TrendDimension.OVERALL,
) -> list[TrendDataPoint]:
    """返回按周期(周/月)分组的趋势数据点列表, 空周期补 0."""
    return aggregations.get_trend_data(db, reports_filter, trend_dim.value)


@market_router.get(
    "/price-distribution",
    response_model=PriceDistributionResponse,
    status_code=status.HTTP_200_OK,
    responses=_AUTH_ERRORS,
    summary="成交价格分布",
    description="返回基于分位数的动态价格区间分布",
)
def get_price_distribution(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
) -> PriceDistributionResponse:
    """返回价格桶列表与成交样本总数 (动态分段或兜底固定分段)."""
    return aggregations.get_price_distribution(db, reports_filter)


@market_router.get(
    "/rooms-distribution",
    response_model=DistributionResponse,
    status_code=status.HTTP_200_OK,
    responses=_AUTH_ERRORS,
    summary="户型分布",
    description="返回基于户型的成交分布（1室/2室/3室/4室+）",
)
def get_rooms_distribution(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
) -> DistributionResponse:
    """返回户型分布桶列表与成交样本总数."""
    return aggregations.get_rooms_distribution(db, reports_filter)


@market_router.get(
    "/floor-distribution",
    response_model=DistributionResponse,
    status_code=status.HTTP_200_OK,
    responses=_AUTH_ERRORS,
    summary="楼层分布",
    description="返回基于楼层的成交分布（低楼层/中楼层/高楼层）",
)
def get_floor_distribution(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
) -> DistributionResponse:
    """返回楼层分布桶列表与成交样本总数."""
    return aggregations.get_floor_distribution(db, reports_filter)


@market_router.get(
    "/business-districts",
    response_model=BusinessDistrictListResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "不支持的排序参数"},
        **_AUTH_ERRORS,
    },
    summary="商圈列表",
    description="返回按商圈聚合的成交/在售指标行",
)
def get_business_districts(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
    sort_by: Annotated[
        Literal[
            "sold_count",
            "avg_price_wan",
            "avg_unit_price",
            "on_sale_count",
            "absorption_months",
            "price_qoq",
            "volume_qoq",
        ],
        Query(description="排序字段"),
    ] = "sold_count",
    sort_order: Annotated[SortOrder, Query(description="排序方向: asc / desc")] = SortOrder.DESC,
    page: Annotated[int, Query(ge=1, description="页码, 从 1 开始")] = 1,
    page_size: Annotated[int, Query(ge=1, le=100, description="每页数量, 1-100")] = 20,
) -> BusinessDistrictListResponse:
    """返回按 business_circle 聚合的商圈行, 支持排序与分页."""
    return aggregations.get_business_district_rows(
        db,
        reports_filter,
        sort_by=sort_by,
        sort_order=sort_order.value,
        page=page,
        page_size=page_size,
    )


@market_router.get(
    "/dictionaries",
    response_model=DictionaryResponse,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "不支持的 dict_type"},
        **_AUTH_ERRORS,
    },
    summary="报表字典",
    description="返回报表专用动态字典（来源/户型/楼层/最近更新）",
)
def get_dictionaries(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    dict_type: Annotated[
        DictType,
        Query(description="字典类型: data_source / rooms / floor_level / last_updated"),
    ],
) -> DictionaryResponse:
    """返回报表专用动态字典.

    - ``data_source`` → SELECT DISTINCT data_source (排序)
    - ``rooms`` → SELECT DISTINCT rooms (排序, 字符串列表如 ["1","2","3","4"])
    - ``floor_level`` → SELECT DISTINCT floor_level (排序)
    - ``last_updated`` → SELECT MAX(updated_at), 单元素列表 [ISO 时间字符串]

    """
    items = dictionaries.get_dictionary_items(db, dict_type)
    return DictionaryResponse(type=dict_type, items=items)


@market_router.get(
    "/compare",
    response_model=ComparisonData,
    status_code=status.HTTP_200_OK,
    responses={
        400: {"model": ErrorResponse, "description": "ids 数量非法 (需 2-5 个)"},
        **_AUTH_ERRORS,
    },
    summary="多商圈对比分析",
    description="返回多商圈（2-5 个）对比汇总表、成交量趋势、价格趋势、楼层结构与户型结构",
)
def get_compare(
    db: DbSessionDep,
    _current_user: ReportsReadPermDep,
    reports_filter: ReportsFilterDep,
    ids: ValidCompareIdsDep,
) -> ComparisonData:
    """返回 2-5 个商圈的对比聚合数据 (7 行 summary + 趋势 + 结构)."""
    return aggregations.get_comparison_data(db, ids, reports_filter)
