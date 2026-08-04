"""跟投管理（投资管理）路由层.

按 AGENTS.md 规范：
- Router 禁 SQLAlchemy 查询，全部通过 InvestmentService 编排
- 直接返回 Pydantic 模型，不包装 code/msg/data
- 写端点统一 RateLimits 限流；写操作统一 CurrentInternalUserDep（admin/operator）
- 404 由 ResourceNotFoundError 统一异常处理器返回
"""

import urllib.parse
from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, Path, Query, Request, status
from fastapi.responses import StreamingResponse
from pydantic import UUID4

from dependencies.auth import (
    CurrentInternalUserDep,
    DbSessionDep,
    InvestmentCopyPermDep,
    InvestmentReadPermDep,
    InvestmentWritePermDep,
)
from models.common import ProjectStatus, SettlementStatus
from schemas.investment import (
    CopyInvestmentRequest,
    InvestmentCreate,
    InvestmentListResponse,
    InvestmentResponse,
    InvestmentStatsResponse,
    InvestmentUpdate,
    InvestorCreate,
    InvestorResponse,
    InvestorUpdate,
    ReturnAdjustmentBatchRequest,
    ReturnAdjustmentResponse,
    SettlementChangeRequest,
    UnsettleRequest,
)
from services.investment import InvestmentService
from services.system.exceptions import ResourceNotFoundError
from utils.common import RateLimits, limiter

router = APIRouter(
    prefix="/admin/investments",
    tags=["investment"],
)


def get_investment_service(db: DbSessionDep) -> InvestmentService:
    """创建跟投管理服务实例."""
    return InvestmentService(db)


_InvestmentServiceDep = Annotated[InvestmentService, Depends(get_investment_service)]


# ==================== 列表 / 统计 / 导出 ====================


@router.get(
    "",
    summary="获取跟投记录列表",
)
def list_investments(
    service: _InvestmentServiceDep,
    _current_user: InvestmentReadPermDep,
    search: Annotated[str | None, Query(max_length=100, description="模糊搜索: 项目编号/小区/地址")] = None,
    project_status: Annotated[ProjectStatus | None, Query(description="项目状态筛选")] = None,
    settlement_status: Annotated[SettlementStatus | None, Query(description="跟投状态筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=1000, description="每页数量")] = 50,
) -> InvestmentListResponse:
    """分页查询跟投记录列表（含项目状态关联、回报率、投资方数量）."""
    items, total = service.list_investments(
        search=search,
        project_status=project_status,
        settlement_status=settlement_status,
        page=page,
        page_size=page_size,
    )
    return InvestmentListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get(
    "/stats",
    summary="获取跟投汇总卡片",
)
def get_investment_stats(
    service: _InvestmentServiceDep,
    _current_user: InvestmentReadPermDep,
) -> InvestmentStatsResponse:
    """5 张汇总卡片统计：总项目 / 投资总额 / 收益总额 / 平均回报率 / 未结算数."""
    return service.get_stats()


@router.get(
    "/export",
    summary="导出跟投列表 Excel",
)
@limiter.limit(RateLimits.INVESTMENT_EXPORT)
def export_investments(
    request: Request,
    service: _InvestmentServiceDep,
    _current_user: InvestmentReadPermDep,
    search: Annotated[str | None, Query(max_length=100, description="模糊搜索")] = None,
    project_status: Annotated[ProjectStatus | None, Query(description="项目状态筛选")] = None,
    settlement_status: Annotated[SettlementStatus | None, Query(description="跟投状态筛选")] = None,
) -> StreamingResponse:
    """导出全量跟投列表为 .xlsx（openpyxl）。文件名 跟投列表_YYYYMMDD.xlsx.

    速率限制：10次/小时.
    """
    content = service.export_excel(
        search=search,
        project_status=project_status,
        settlement_status=settlement_status,
    )
    filename = f"跟投列表_{datetime.now(tz=timezone.utc).strftime('%Y%m%d')}.xlsx"
    # 中文文件名需 RFC5987 编码
    filename_encoded = urllib.parse.quote(filename)
    return StreamingResponse(
        iter([content]),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={
            "Content-Disposition": (f"attachment; filename*=UTF-8''{filename_encoded}"),
        },
    )


# ==================== 跟投记录 CRUD ====================


@router.post(
    "",
    status_code=status.HTTP_201_CREATED,
    summary="创建跟投记录",
)
@limiter.limit(RateLimits.INVESTMENT_CREATE)
def create_investment(
    request: Request,
    data: InvestmentCreate,
    service: _InvestmentServiceDep,
    current_user: InvestmentWritePermDep,
) -> InvestmentResponse:
    """创建跟投记录：校验项目存在、未软删、无重复跟投；写日志.

    速率限制：100次/小时.
    """
    return service.create_investment(data, current_user.id)


@router.get(
    "/{investment_id}",
    summary="获取跟投记录详情",
)
def get_investment(
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    service: _InvestmentServiceDep,
    _current_user: InvestmentReadPermDep,
) -> InvestmentResponse:
    """获取跟投记录详情（含投资方树 + 操作日志）."""
    item = service.get_investment(investment_id)
    if item is None:
        msg = "跟投记录不存在"
        raise ResourceNotFoundError(msg)
    return item


@router.get(
    "/by-project/{project_id}",
    summary="按项目ID获取跟投详情",
)
def get_investment_by_project(
    project_id: Annotated[UUID4, Path(description="项目ID")],
    service: _InvestmentServiceDep,
    _current_user: InvestmentReadPermDep,
) -> InvestmentResponse:
    """按项目ID查询跟投记录详情（每个项目最多一条跟投记录）.

    返回 404 当项目不存在跟投记录。
    """
    item = service.get_investment_by_project(project_id)
    if item is None:
        msg = "该项目暂无跟投记录"
        raise ResourceNotFoundError(msg)
    return item


@router.put(
    "/{investment_id}",
    summary="更新跟投记录",
)
@limiter.limit(RateLimits.INVESTMENT_UPDATE)
def update_investment(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    data: InvestmentUpdate,
    service: _InvestmentServiceDep,
    current_user: InvestmentWritePermDep,
) -> InvestmentResponse:
    """更新跟投记录：仅 unsettled 可改；修改总额触发投资方金额重算并写日志.

    速率限制：100次/小时.
    """
    return service.update_investment(investment_id, data, current_user.id)


@router.delete(
    "/{investment_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除跟投记录",
)
@limiter.limit(RateLimits.INVESTMENT_DELETE)
def delete_investment(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> None:
    """软删除跟投记录（设 deleted_at），子表保留.

    速率限制：20次/小时.
    """
    service.delete_investment(investment_id, current_user.id)


# ==================== 投资方 CRUD ====================


@router.post(
    "/{investment_id}/investors",
    status_code=status.HTTP_201_CREATED,
    summary="添加投资方",
)
@limiter.limit(RateLimits.INVESTMENT_INVESTOR_WRITE)
def add_investor(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    data: InvestorCreate,
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> InvestorResponse:
    """添加投资方（含子投资人）：校验名称唯一、比例合计、子投资人内部占比.

    速率限制：200次/小时.
    """
    return service.add_investor(investment_id, data, current_user.id)


@router.put(
    "/{investment_id}/investors/{investor_id}",
    summary="更新投资方",
)
@limiter.limit(RateLimits.INVESTMENT_INVESTOR_WRITE)
def update_investor(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    investor_id: Annotated[str, Path(description="投资方ID")],
    data: InvestorUpdate,
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> InvestorResponse:
    """更新投资方：sub_investors 整体替换；仅 unsettled 可改.

    速率限制：200次/小时.
    """
    return service.update_investor(investment_id, investor_id, data, current_user.id)


@router.delete(
    "/{investment_id}/investors/{investor_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="删除投资方",
)
@limiter.limit(RateLimits.INVESTMENT_INVESTOR_WRITE)
def delete_investor(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    investor_id: Annotated[str, Path(description="投资方ID")],
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> None:
    """删除投资方：母投资方级联删除子投资人；仅 unsettled 可改.

    速率限制：200次/小时.
    """
    service.delete_investor(investment_id, investor_id, current_user.id)


# ==================== 收益分配比例调整 ====================


@router.get(
    "/{investment_id}/distribution-adjustments",
    summary="查询分配比例调整记录",
)
def list_distribution_adjustments(
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    service: _InvestmentServiceDep,
    _current_user: InvestmentReadPermDep,
) -> list[ReturnAdjustmentResponse]:
    """查询指定跟投记录的分配比例调整记录（最新一批）."""
    return service.list_distribution_adjustments(investment_id)


@router.put(
    "/{investment_id}/distribution-adjustments",
    summary="批量保存分配比例调整",
)
@limiter.limit(RateLimits.INVESTMENT_INVESTOR_WRITE)
def adjust_distribution_ratios(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    data: ReturnAdjustmentBatchRequest,
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> list[ReturnAdjustmentResponse]:
    """批量调整分配比例：校验分配比例合计 = 100%；写记录与日志.

    分配比例 = 占 total_return 的百分比，默认等于投资占比。
    速率限制：200次/小时.
    """
    return service.adjust_distribution_ratios(investment_id, data, current_user.id)


# ==================== 结算 / 反结算 ====================


@router.post(
    "/{investment_id}/settle",
    summary="结算跟投记录",
)
@limiter.limit(RateLimits.INVESTMENT_SETTLE)
def settle_investment(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    data: SettlementChangeRequest,
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> InvestmentResponse:
    """结算：unsettled → settled，记录日期与说明，写日志.

    速率限制：50次/小时.
    """
    return service.settle(investment_id, data, current_user.id)


@router.post(
    "/{investment_id}/unsettle",
    summary="反结算跟投记录",
)
@limiter.limit(RateLimits.INVESTMENT_SETTLE)
def unsettle_investment(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    data: UnsettleRequest,
    service: _InvestmentServiceDep,
    current_user: CurrentInternalUserDep,
) -> InvestmentResponse:
    """反结算：settled → unsettled，清空结算字段，写日志.

    速率限制：50次/小时.
    """
    return service.unsettle(investment_id, data, current_user.id)


# ==================== 复制跟投配置 ====================


@router.post(
    "/{investment_id}/copy",
    status_code=status.HTTP_201_CREATED,
    summary="复制跟投配置到目标项目",
)
@limiter.limit(RateLimits.INVESTMENT_CREATE)
def copy_investment(
    request: Request,
    investment_id: Annotated[str, Path(description="跟投记录ID")],
    data: CopyInvestmentRequest,
    service: _InvestmentServiceDep,
    current_user: InvestmentCopyPermDep,
) -> InvestmentResponse:
    """复制投资方结构到目标项目（仅 name/type/share_ratio/子投资人，金额重算，状态重置）.

    速率限制：100次/小时.
    """
    return service.copy_investment(investment_id, data, current_user.id)
