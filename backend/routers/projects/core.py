"""项目相关API路由（简化版本）.

直接返回 Pydantic 模型，不使用 ApiResponse 包装器
符合 AGENTS.md 规范第 26 条.
"""

import csv
import io
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query, Request, status
from fastapi.responses import StreamingResponse

from common import RateLimits, limiter
from dependencies.auth import CurrentInternalUserDep
from dependencies.projects import ProjectServiceDep
from schemas.common import PaginatedResponse
from schemas.project import (
    ProjectCompleteRequest,
    ProjectCreate,
    ProjectReportResponse,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectUpdate,
    StatusUpdate,
)

from .renovation import router as renovation_router
from .sales import router as sales_router

router = APIRouter(prefix="/projects", tags=["projects"])

router.include_router(renovation_router, tags=["renovation"])
router.include_router(sales_router, tags=["sales"])


@router.get("/contract-no/next")
def get_next_contract_no(
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> str:
    """获取下一个合同编号.

    格式: MFB-年月-4位自增序号，如 MFB-202604-0001
    后端生成保证唯一性，避免前端竞态条件
    """
    return service.generate_contract_no()


@router.post("", status_code=status.HTTP_201_CREATED)
@limiter.limit(RateLimits.PROJECT_CREATE)
def create_project(
    request: Request,
    project_data: ProjectCreate,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """创建项目.

    速率限制：100次/小时.
    """
    return service.create_project(project_data)


@router.get("")
def get_projects(
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
    status: Annotated[str | None, Query(description="项目状态筛选")] = None,
    community_name: Annotated[str | None, Query(description="小区名称筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> PaginatedResponse[ProjectResponse]:
    """获取项目列表."""
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=page,
        page_size=page_size,
    )
    return PaginatedResponse(
        items=result["items"],
        total=result["total"],
        page=page,
        page_size=page_size,
    )


@router.get("/stats")
def get_project_stats(
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectStatsResponse:
    """获取项目统计."""
    return service.get_project_stats()


@router.get("/export")
@limiter.limit(RateLimits.PROJECT_EXPORT)
def export_projects(
    request: Request,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
    status: Annotated[str | None, Query(description="项目状态筛选")] = None,
    community_name: Annotated[str | None, Query(description="小区名称筛选")] = None,
) -> StreamingResponse:
    """导出项目数据为 CSV 文件.

    支持按状态和小区名称筛选，导出所有匹配记录（无分页限制）
    速率限制：10次/小时
    """
    result = service.get_projects(
        status_filter=status,
        community_name=community_name,
        page=1,
        page_size=10000,
    )

    items = result["items"]

    output = io.StringIO()
    writer = csv.writer(output)

    headers = [
        "项目ID",
        "项目名称",
        "项目状态",
        "小区名称",
        "物业地址",
        "面积(m²)",
        "户型",
        "朝向",
        "合同编号",
        "签约价格(万)",
        "签约日期",
        "合同周期(天)",
        "顺延期(天)",
        "顺延期租金(元/月)",
        "税费承担",
        "计划交房日期",
        "业主姓名",
        "业主电话",
        "挂牌价(万)",
        "上架日期",
        "成交价(万)",
        "成交日期",
        "总收入(元)",
        "总支出(元)",
        "净现金流(元)",
        "ROI(%)",
        "创建时间",
        "更新时间",
    ]
    writer.writerow(headers)

    for project in items:
        row = [
            project.id,
            project.name or "",
            project.status,
            project.community_name or "",
            project.address or "",
            str(project.area) if project.area else "",
            project.layout or "",
            project.orientation or "",
            project.contract_no or "",
            str(project.signing_price) if project.signing_price else "",
            project.signing_date or "",
            str(project.signing_period) if project.signing_period else "",
            str(project.extension_period) if project.extension_period else "",
            str(project.extension_rent) if project.extension_rent else "",
            project.cost_assumption or "",
            project.planned_handover_date or "",
            project.owner_name or "",
            project.owner_phone or "",
            str(project.list_price) if project.list_price else "",
            project.listing_date or "",
            str(project.sold_price) if project.sold_price else "",
            project.sold_date or "",
            str(project.total_income) if project.total_income else "0",
            str(project.total_expense) if project.total_expense else "0",
            str(project.net_cash_flow) if project.net_cash_flow else "0",
            str(project.roi) if project.roi else "0",
            project.created_at.strftime("%Y-%m-%d %H:%M:%S") if project.created_at else "",
            project.updated_at.strftime("%Y-%m-%d %H:%M:%S") if project.updated_at else "",
        ]
        writer.writerow(row)

    csv_content = output.getvalue()
    output.close()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    filename = f"projects_export_{timestamp}.csv"

    return StreamingResponse(
        iter([csv_content.encode("utf-8-sig")]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "Content-Type": "text/csv; charset=utf-8",
        },
    )


@router.get("/{project_id}")
def get_project(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
    *,
    full: Annotated[bool, Query(description="是否获取完整详情(包含大字段)")] = False,
) -> ProjectResponse:
    """获取项目详情."""
    project = service.get_project(project_id, include_all=full)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.put("/{project_id}")
@limiter.limit(RateLimits.PROJECT_UPDATE)
def update_project(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    update_data: ProjectUpdate,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """更新项目信息.

    速率限制：100次/小时.
    """
    project = service.update_project(project_id, update_data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(RateLimits.PROJECT_DELETE)
def delete_project(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> None:
    """删除项目.

    速率限制：20次/小时.
    """
    service.delete_project(project_id)


@router.put("/{project_id}/status")
@limiter.limit(RateLimits.PROJECT_STATUS_UPDATE)
def update_project_status(
    request: Request,
    project_id: Annotated[str, Path(description="项目ID")],
    status_update: StatusUpdate,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """更新项目状态.

    速率限制：100次/小时.
    """
    project = service.update_status(project_id, status_update)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.post("/{project_id}/complete", status_code=status.HTTP_201_CREATED)
def complete_project(
    project_id: Annotated[str, Path(description="项目ID")],
    complete_data: ProjectCompleteRequest,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """完成项目."""
    project = service.complete_project(project_id, complete_data)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.get("/{project_id}/report")
def get_project_report(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectReportResponse:
    """获取项目报告."""
    report = service.get_project_report(project_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    return report
