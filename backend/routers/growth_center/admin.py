"""获客中心后台管理路由（一期聚合只读层）.

前缀 ``/admin/growth-center``，全部为只读端点，鉴权复用 ``recruit:read``
权限依赖。跨 4 条分享获客链路（估价/房源预约/房源单/招募）提供统一
总览、漏斗、员工排行与统一线索视图，不修改各业务线现有写路径。
"""

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Path, Query

from dependencies.auth import DbSessionDep, RecruitReadPermDep
from dependencies.common import PaginationDep
from schemas.growth_center import (
    EmployeeDrilldownResponse,
    EmployeeTopResponse,
    FunnelCompareResponse,
    FunnelResponse,
    GrowthModule,
    GrowthOverviewKpiResponse,
    LeadDetailResponse,
    LeadSource,
    SourceBreakdownResponse,
    TrendResponse,
    UnifiedLeadListResponse,
    UnifiedLeadStatus,
)
from services.growth_center import (
    GrowthEmployeeService,
    GrowthFunnelService,
    GrowthLeadDetailService,
    GrowthLeadService,
    GrowthOverviewService,
)

router = APIRouter(prefix="/admin/growth-center", tags=["growth-center"])

DaysQuery = Annotated[int, Query(ge=1, le=365, description="统计窗口天数")]


# ─── 获客总览 ────────────────────────────────────────────────────────────────


@router.get(
    "/overview/kpi",
    summary="获客总览 KPI",
    description="今日线索（4 链路合计）/ 待跟进（统一状态=new）/ 有效新客（近 30 天，剔除内部员工）/ 整体转化率",
)
def get_overview_kpi(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
) -> GrowthOverviewKpiResponse:
    """获客总览 KPI."""
    return GrowthOverviewKpiResponse(**GrowthOverviewService(db).kpi())


@router.get(
    "/overview/source-breakdown",
    summary="线索来源构成",
    description="各模块线索数与占比（估价/预约/房源单/招募）",
)
def get_source_breakdown(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    days: DaysQuery = 30,
) -> SourceBreakdownResponse:
    """线索来源构成."""
    return SourceBreakdownResponse(**GrowthOverviewService(db).source_breakdown(days))


@router.get(
    "/overview/trend",
    summary="线索逐日趋势",
    description="4 链路留资合计的逐日线索数数组（Asia/Shanghai 自然日，缺日补 0）",
)
def get_overview_trend(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    days: DaysQuery = 30,
) -> TrendResponse:
    """逐日线索趋势."""
    return TrendResponse(**GrowthOverviewService(db).trend(days))


# ─── 漏斗看板 ────────────────────────────────────────────────────────────────


@router.get(
    "/funnel",
    summary="单模块漏斗统计",
    description="招募 6 级（分享→PV/UV→深度浏览→点击授权→留资→有效新客，口径对齐招募漏斗服务）；"
    "估价/预约/房源单 3 级（分享→打开 PV/UV→留资/预约/承接留资）。响应带 uv_metric 口径标识与口径文案",
)
def get_funnel(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    module: Annotated[GrowthModule, Query(description="获客模块")],
    days: DaysQuery = 30,
) -> FunnelResponse:
    """单模块漏斗统计."""
    return FunnelResponse(**GrowthFunnelService(db).module_funnel(module, days))


@router.get(
    "/funnel/compare",
    summary="四模块漏斗并排对比",
    description="各模块以 share 为基准 100%；uv_percent/leads_percent 为真实百分比（可 >100，由前端封顶渲染）",
)
def get_funnel_compare(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    days: DaysQuery = 30,
) -> FunnelCompareResponse:
    """四模块漏斗对比."""
    return FunnelCompareResponse(**GrowthFunnelService(db).compare(days))


# ─── 员工排行 / 下钻 ────────────────────────────────────────────────────────


@router.get(
    "/employees/top",
    summary="员工获客 TOP 榜",
    description="近 N 天按分享归因线索数倒序的员工排行（分享次数/线索数/转化率，4 模块合计），默认取前 20",
)
def get_employee_top(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    days: DaysQuery = 30,
    limit: Annotated[int, Query(ge=1, le=100, description="返回条数上限")] = 20,
) -> EmployeeTopResponse:
    """员工获客 TOP 榜."""
    return EmployeeTopResponse(**GrowthEmployeeService(db).top(days=days, limit=limit))


@router.get(
    "/employees/drilldown",
    summary="员工维度漏斗下钻",
    description="单模块按员工下钻的漏斗各级数据（含未归因聚合行），合计与该模块漏斗一致（同一时间窗同一口径）",
)
def get_employee_drilldown(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    module: Annotated[GrowthModule, Query(description="获客模块")],
    days: DaysQuery = 30,
) -> EmployeeDrilldownResponse:
    """员工维度漏斗下钻."""
    return EmployeeDrilldownResponse(**GrowthFunnelService(db).employee_drilldown(module, days))


# ─── 统一线索 ────────────────────────────────────────────────────────────────


@router.get(
    "/leads",
    summary="统一线索分页列表",
    description="跨 4 模块统一线索视图（模块/统一状态/员工/来源/日期/员工名搜索筛选），手机号脱敏；"
    "手机号加密存储不支持搜索",
)
def list_unified_leads(
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
    pagination: PaginationDep,
    module: Annotated[GrowthModule | None, Query(description="获客模块（省略=全部）")] = None,
    status: Annotated[UnifiedLeadStatus | None, Query(description="统一状态")] = None,
    employee_id: Annotated[str | None, Query(max_length=36, description="归属员工ID")] = None,
    source: Annotated[LeadSource | None, Query(description="来源（card/poster 仅招募可命中）")] = None,
    start_date: Annotated[date | None, Query(description="留资开始日期（YYYY-MM-DD，含）")] = None,
    end_date: Annotated[date | None, Query(description="留资结束日期（YYYY-MM-DD，含）")] = None,
    search: Annotated[str | None, Query(max_length=50, description="归属员工名模糊搜索")] = None,
) -> UnifiedLeadListResponse:
    """统一线索分页列表."""
    result = GrowthLeadService(db).list(
        page=pagination.page,
        page_size=pagination.page_size,
        module=module,
        status=status,
        employee_id=employee_id,
        source=source,
        start_date=start_date,
        end_date=end_date,
        search=search,
    )
    return UnifiedLeadListResponse(
        items=result["items"],
        total=result["total"],
        page=result["page"],
        page_size=result["page_size"],
    )


@router.get(
    "/leads/{module}/{lead_id}",
    summary="统一线索详情",
    description="归因链路时间线（分享/打开/深度浏览/留资，未埋点事件 occurred=false）+ 归属员工 + 模块差异化字段",
)
def get_lead_detail(
    module: Annotated[GrowthModule, Path(description="获客模块")],
    lead_id: Annotated[str, Path(description="线索ID")],
    db: DbSessionDep,
    _current_user: RecruitReadPermDep,
) -> LeadDetailResponse:
    """统一线索详情."""
    return LeadDetailResponse(**GrowthLeadDetailService(db).get(module, lead_id))
