"""业务字典管理路由（dict:manage 全量；merchant:read/write 仅商户域字典组）.

按 AGENTS.md 规范：Router 禁 SQLAlchemy 查询，全部经 ``services/system/biz_dict`` 编排；
错误走 ``ServiceException`` 统一处理器（重复 code → 409，未登记组/条目不存在 → 404）。
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Request, status

from dependencies.auth import CurrentActiveUserDep, DbSessionDep
from models.user.user import User
from schemas.biz_dict import (
    BizDictGroupResponse,
    BizDictItemCreate,
    BizDictItemDeleteResponse,
    BizDictItemResponse,
    BizDictItemUpdate,
    BizDictReorderRequest,
    BizDictUnmanagedResponse,
)
from services.system import biz_dict
from services.system.exceptions import PermissionDeniedError
from services.system.permission import permission_service
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/admin/dicts", tags=["system-dicts"])

_DICT_ADMIN_ROLES = frozenset({"admin", "operator"})


def _dict_admin_checker(user: CurrentActiveUserDep, db: DbSessionDep) -> User:
    """字典管理入口：仅 admin/operator，且需 dict:manage 或 merchant:write.

    V01 M13 明确字典维护仅 admin/operator；普通 user 虽默认有 merchant:write
    （用于门店维护），不得进入字典管理。
    """
    role_codes = set()
    if user.role and user.role.code:
        role_codes.add(user.role.code)
    for item in user.roles or []:
        if item.code:
            role_codes.add(item.code)
    if not role_codes & _DICT_ADMIN_ROLES:
        msg = "仅管理员/运营可维护字典"
        raise PermissionDeniedError(msg)

    perms = permission_service.get_user_permission_codes(db, user)
    if "dict:manage" not in perms and "merchant:write" not in perms:
        msg = "权限不足：缺少 dict:manage 或 merchant:write"
        raise PermissionDeniedError(msg)
    return user


DictAdminAccessDep = Annotated[User, Depends(_dict_admin_checker)]


def _has_full_dict_access(db: DbSessionDep, user: User) -> bool:
    """是否拥有全量字典管理权（dict:manage）；否则仅可访问商户域字典组."""
    return "dict:manage" in permission_service.get_user_permission_codes(db, user)


@router.get("", summary="字典组概览")
@limiter.limit(RateLimits.DICT_ADMIN_READ)
def list_dict_groups(
    request: Request,
    db: DbSessionDep,
    current_user: DictAdminAccessDep,
) -> list[BizDictGroupResponse]:
    """列出本期支持的字典组（含条目总数与启用数）.

    dict:manage 返回全量；仅商户权限时只返回 4 个商户域字典组。
    """
    allowed = None if _has_full_dict_access(db, current_user) else biz_dict.MERCHANT_DICT_CODES
    return biz_dict.list_groups(db, allowed_dict_codes=allowed)


@router.get("/{dict_code}/items", summary="字典条目列表")
@limiter.limit(RateLimits.DICT_ADMIN_READ)
def list_dict_items(
    request: Request,
    dict_code: str,
    db: DbSessionDep,
    current_user: DictAdminAccessDep,
    include_disabled: Annotated[bool, Query(description="是否包含已停用项(默认包含)")] = True,
) -> list[BizDictItemResponse]:
    """读取字典组内条目（默认含停用项，便于重新启用）."""
    biz_dict.ensure_dict_access(dict_code, has_full_access=_has_full_dict_access(db, current_user))
    return biz_dict.list_items(db, dict_code, include_disabled=include_disabled)


@router.get("/{dict_code}/unmanaged", summary="未纳管的归因渠道值")
@limiter.limit(RateLimits.DICT_ADMIN_READ)
def list_unmanaged_channels(
    request: Request,
    dict_code: str,
    db: DbSessionDep,
    current_user: DictAdminAccessDep,
) -> BizDictUnmanagedResponse:
    """字典外的存量渠道值（按出现次数降序），供一键转正."""
    biz_dict.ensure_dict_access(dict_code, has_full_access=_has_full_dict_access(db, current_user))
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
    current_user: DictAdminAccessDep,
) -> BizDictItemResponse:
    """新增条目（组内 code 唯一，重复 → 409）."""
    return biz_dict.create_item(
        db,
        dict_code,
        req,
        operator_id=str(current_user.id),
        request=request,
        has_full_access=_has_full_dict_access(db, current_user),
    )


@router.put("/{dict_code}/items/{item_id}", summary="修改字典条目")
@limiter.limit(RateLimits.DICT_WRITE)
def update_dict_item(
    request: Request,
    dict_code: str,
    item_id: str,
    req: BizDictItemUpdate,
    db: DbSessionDep,
    current_user: DictAdminAccessDep,
) -> BizDictItemResponse:
    """修改展示名/排序/启用状态/备注（code 不可改，避免破坏落库值引用）."""
    return biz_dict.update_item(
        db,
        dict_code,
        item_id,
        req,
        operator_id=str(current_user.id),
        request=request,
        has_full_access=_has_full_dict_access(db, current_user),
    )


@router.post("/{dict_code}/reorder", summary="字典条目批量排序")
@limiter.limit(RateLimits.DICT_WRITE)
def reorder_dict_items(
    request: Request,
    dict_code: str,
    req: BizDictReorderRequest,
    db: DbSessionDep,
    current_user: DictAdminAccessDep,
) -> list[BizDictItemResponse]:
    """按 item_ids 顺序重排 sort_order（步长 10）."""
    return biz_dict.reorder_items(
        db,
        dict_code,
        req,
        operator_id=str(current_user.id),
        request=request,
        has_full_access=_has_full_dict_access(db, current_user),
    )


@router.delete("/{dict_code}/items/{item_id}", summary="删除字典条目（仅未被引用）")
@limiter.limit(RateLimits.DICT_WRITE)
def delete_dict_item(
    request: Request,
    dict_code: str,
    item_id: str,
    db: DbSessionDep,
    current_user: DictAdminAccessDep,
) -> BizDictItemDeleteResponse:
    """删除商户域字典项；已被业务数据引用时拒绝，提示改为停用."""
    return biz_dict.delete_item(
        db,
        dict_code,
        item_id,
        operator_id=str(current_user.id),
        request=request,
        has_full_access=_has_full_dict_access(db, current_user),
    )
