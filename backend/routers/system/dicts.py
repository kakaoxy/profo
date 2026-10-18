"""业务字典管理路由（仅 admin，权限码 dict:manage）.

按 AGENTS.md 规范：Router 禁 SQLAlchemy 查询，全部经 ``services/system/biz_dict`` 编排；
错误走 ``ServiceException`` 统一处理器（重复 code → 409，未登记组/条目不存在 → 404）。
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from dependencies.auth import DbSessionDep, DictManagePermDep
from schemas.biz_dict import (
    BizDictGroupResponse,
    BizDictItemCreate,
    BizDictItemResponse,
    BizDictItemUpdate,
    BizDictReorderRequest,
    BizDictUnmanagedResponse,
)
from services.system import biz_dict
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/admin/dicts", tags=["system-dicts"])


@router.get("", summary="字典组概览")
@limiter.limit(RateLimits.DICT_ADMIN_READ)
def list_dict_groups(
    request: Request,
    db: DbSessionDep,
    _current_user: DictManagePermDep,
) -> list[BizDictGroupResponse]:
    """列出本期支持的字典组（含条目总数与启用数）."""
    return biz_dict.list_groups(db)


@router.get("/{dict_code}/items", summary="字典条目列表")
@limiter.limit(RateLimits.DICT_ADMIN_READ)
def list_dict_items(
    request: Request,
    dict_code: str,
    db: DbSessionDep,
    _current_user: DictManagePermDep,
    include_disabled: Annotated[bool, Query(description="是否包含已停用项(默认包含)")] = True,
) -> list[BizDictItemResponse]:
    """读取字典组内条目（默认含停用项，便于重新启用）."""
    return biz_dict.list_items(db, dict_code, include_disabled=include_disabled)


@router.get("/{dict_code}/unmanaged", summary="未纳管的归因渠道值")
@limiter.limit(RateLimits.DICT_ADMIN_READ)
def list_unmanaged_channels(
    request: Request,
    dict_code: str,
    db: DbSessionDep,
    _current_user: DictManagePermDep,
) -> BizDictUnmanagedResponse:
    """字典外的存量渠道值（按出现次数降序），供一键转正."""
    return biz_dict.list_unmanaged(db, dict_code)


@router.post(
    "/{dict_code}/items",
    status_code=status.HTTP_201_CREATED,
    summary="新增字典条目",
)
@limiter.limit(RateLimits.DICT_WRITE)
def create_dict_item(
    request: Request,
    dict_code: str,
    req: BizDictItemCreate,
    db: DbSessionDep,
    current_user: DictManagePermDep,
) -> BizDictItemResponse:
    """新增条目（组内 code 唯一，重复 → 409）."""
    return biz_dict.create_item(db, dict_code, req, operator_id=str(current_user.id), request=request)


@router.put("/{dict_code}/items/{item_id}", summary="修改字典条目")
@limiter.limit(RateLimits.DICT_WRITE)
def update_dict_item(
    request: Request,
    dict_code: str,
    item_id: str,
    req: BizDictItemUpdate,
    db: DbSessionDep,
    current_user: DictManagePermDep,
) -> BizDictItemResponse:
    """修改展示名/排序/启用状态/备注（code 不可改，避免破坏落库值引用）."""
    return biz_dict.update_item(
        db,
        dict_code,
        item_id,
        req,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/{dict_code}/reorder", summary="字典条目批量排序")
@limiter.limit(RateLimits.DICT_WRITE)
def reorder_dict_items(
    request: Request,
    dict_code: str,
    req: BizDictReorderRequest,
    db: DbSessionDep,
    current_user: DictManagePermDep,
) -> list[BizDictItemResponse]:
    """按 item_ids 顺序重排 sort_order（步长 10）."""
    return biz_dict.reorder_items(db, dict_code, req, operator_id=str(current_user.id), request=request)
