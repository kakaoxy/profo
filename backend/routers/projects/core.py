"""项目相关API路由（简化版本）.

直接返回 Pydantic 模型，不使用 ApiResponse 包装器
符合 AGENTS.md 规范第 26 条.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import UUID4

from dependencies.auth import (
    CurrentActiveUserDep,
    CurrentAdminUserDep,
    CurrentInternalUserDep,
    DbSessionDep,
    ProjectReadOrBusinessPermDep,
    ProjectReadPermDep,
)
from dependencies.common import PaginationDep
from dependencies.projects import ProjectServiceDep
from schemas.project import (
    ProjectCompleteRequest,
    ProjectCreate,
    ProjectFilter,
    ProjectReportResponse,
    ProjectResponse,
    ProjectStatsResponse,
    ProjectStatusUpdate,
    ProjectUpdate,
)
from schemas.response import PaginatedResponse
from services.system.exceptions import ResourceNotFoundError, ValidationError
from services.system.operation_log import operation_log_service
from utils.common import RateLimits, limiter
from utils.csv_exporter import generate_csv_response

from .documents import router as documents_router
from .renovation import router as renovation_router
from .sales import router as sales_router

router = APIRouter(prefix="/projects", tags=["projects"])

router.include_router(documents_router, tags=["documents"])
router.include_router(renovation_router, tags=["renovation"])
router.include_router(sales_router, tags=["sales"])


@router.get("/contract-no/next")
def get_next_contract_no(
    service: ProjectServiceDep,
    _current_user: ProjectReadPermDep,
    business_form: Annotated[
        str,
        Query(description="业务形式: agent(代理美化) / wholesale(收购美化)"),
    ],
) -> str:
    """获取下一个合同编号.

    格式: SH + 4位自增序号 + - + 后缀
    - agent(代理美化) -> DL，如 SH0028-DL
    - wholesale(收购美化) -> SG，如 SH0028-SG
    后端生成保证唯一性，避免前端竞态条件。
    business_form 非 agent/wholesale 时返回 400。
    """
    if business_form not in ("agent", "wholesale"):
        msg = "business_form 必须为 agent 或 wholesale"
        raise ValidationError(msg)
    return service.generate_contract_no(business_form)


@router.get("/owners/{owner_id}/bank-card")
@limiter.limit(RateLimits.PROJECT_BANK_CARD)
def get_owner_bank_card(
    request: Request,
    owner_id: Annotated[UUID4, Path(description="业主ID")],
    service: ProjectServiceDep,
    current_user: CurrentAdminUserDep,
    db: DbSessionDep,
) -> dict[str, str | None]:
    """获取业主未脱敏银行卡号.

    完整卡号不随项目详情下发（默认脱敏），需调用本接口按需获取。
    仅 admin 角色可调用（银行卡号为敏感财务数据）。
    service 层会校验 owner 所属 project 未被软删除；
    审计日志（OperationLog）在路由层记录，不记录银行卡号本身。
    """
    bank_card_number = service.get_owner_bank_card_number(
        str(owner_id),
        operator_id=str(current_user.id),
    )
    if bank_card_number is None:
        msg = "业主不存在"
        raise ResourceNotFoundError(msg)
    # 敏感数据访问审计日志：仅记录访问行为，不写入银行卡号本身
    operation_log_service.log_action(
        db,
        user_id=str(current_user.id),
        action="sensitive_data_access",
        resource_type="owner_bank_card",
        resource_id=str(owner_id),
        request=request,
    )
    return {"bank_card_number": bank_card_number}


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
    _current_user: ProjectReadPermDep,
    pagination: PaginationDep,
    filters: Annotated[ProjectFilter, Depends()],
    include_interactions: Annotated[
        bool,
        Query(description="是否包含互动记录(sales_records)，工作台重点监控卡片需传 true"),
    ] = False,
    monitor_sort: Annotated[
        bool,
        Query(description="工作台重点监控排序（状态优先级 在售→装修→签约→已售 + 创建时间升序）"),
    ] = False,
) -> PaginatedResponse[ProjectResponse]:
    """获取项目列表.

    使用 ProjectReadPermDep 基于权限码校验：
    - admin/operator/user 持 project:read 权限可访问
    - 移除 user 角色的 project:read 权限后，user 立即失去访问权
    """
    result = service.get_projects(
        status_filter=filters.status,
        community_name=filters.community_name,
        business_form=filters.business_form,
        page=pagination.page,
        page_size=pagination.page_size,
        include_interactions=include_interactions,
        monitor_sort=monitor_sort,
    )
    return PaginatedResponse(
        items=result["items"],
        total=result["total"],
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/stats")
def get_project_stats(
    service: ProjectServiceDep,
    _current_user: ProjectReadPermDep,
) -> ProjectStatsResponse:
    """获取项目统计.

    使用 ProjectReadPermDep 基于权限码校验（dashboard 统计卡片需 project:read）.
    """
    return service.get_project_stats()


@router.get("/my-responsible")
def get_my_responsible_projects(
    service: ProjectServiceDep,
    current_user: CurrentActiveUserDep,
) -> list[ProjectResponse]:
    """获取当前用户作为业务身份负责的项目列表.

    用于工作台"我负责的项目"卡片：普通用户即使无 project:read 权限，被指派为
    项目装修对接负责人或销售团队成员后也能查看自己负责的项目。

    权限校验：仅需登录态（CurrentActiveUserDep），不检查权限码——业务身份本身
    即为访问凭证。返回的列表已按 created_at 降序，前端直接渲染卡片。
    """
    return service.get_my_responsible_projects(str(current_user.id), current_user=current_user)


@router.get("/export")
@limiter.limit(RateLimits.PROJECT_EXPORT)
def export_projects(
    request: Request,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
    status: Annotated[str | None, Query(max_length=100, description="项目状态筛选")] = None,
    community_name: Annotated[str | None, Query(max_length=100, description="小区名称筛选")] = None,
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
        "税费承担类型",
        "税费承担说明",
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

    rows = []
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
            project.cost_assumption_type or "",
            project.cost_assumption_other or "",
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
        rows.append(row)

    return generate_csv_response(headers, rows, "projects_export")


@router.get("/{project_id}")
def get_project(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    current_user: ProjectReadOrBusinessPermDep,
    *,
    full: Annotated[bool, Query(description="是否获取完整详情(包含大字段)")] = False,
) -> ProjectResponse:
    """获取项目详情.

    使用 ProjectReadOrBusinessPermDep 双通道校验：
    - 持 project:read / project:write 权限可访问（admin/operator/有权限的 user）；
    - 被指派为该项目装修对接负责人或销售团队成员的用户可访问（业务身份优先级最高，
      不被角色权限覆盖——普通用户即使无 project:read 也能查看自己负责的项目）；
    - 业务身份标志 can_edit_* 基于当前用户计算，前端据此显隐操作按钮。
    """
    project = service.get_project(project_id, include_all=full, current_user=current_user)
    if not project:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
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
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
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
    status_update: ProjectStatusUpdate,
    service: ProjectServiceDep,
    _current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """更新项目状态.

    速率限制：100次/小时.
    """
    project = service.update_status(project_id, status_update)
    if not project:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
    return project


@router.post("/{project_id}/complete", status_code=status.HTTP_201_CREATED)
def complete_project(
    project_id: Annotated[str, Path(description="项目ID")],
    complete_data: ProjectCompleteRequest,
    service: ProjectServiceDep,
    current_user: CurrentInternalUserDep,
) -> ProjectResponse:
    """完成项目."""
    project = service.complete_project(project_id, complete_data, current_user=current_user)
    if not project:
        msg = "项目不存在"
        raise ResourceNotFoundError(msg)
    return project


@router.get("/{project_id}/report")
def get_project_report(
    project_id: Annotated[str, Path(description="项目ID")],
    service: ProjectServiceDep,
    _current_user: ProjectReadOrBusinessPermDep,
) -> ProjectReportResponse:
    """获取项目报告.

    使用 ProjectReadOrBusinessPermDep 双通道校验：持 project:read/write 或为该项目业务负责人.
    """
    report = service.get_project_report(project_id)
    if not report:
        msg = "报告不存在"
        raise ResourceNotFoundError(msg)
    return report
