"""C端角色管理路由."""

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentAdminUserDep, DbSessionDep
from dependencies.common import PaginationDep
from schemas.user import (
    RoleCreate,
    RoleListResponse,
    RoleResponse,
    RoleUpdate,
)
from services.system import role_service

router = APIRouter(prefix="/roles", tags=["roles"])


@router.get("/")
def get_roles(  # noqa: PLR0913
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
    pagination: PaginationDep,
    name: Annotated[str | None, Query(description="角色名称搜索")] = None,
    code: Annotated[str | None, Query(description="角色代码搜索")] = None,
    is_active: Annotated[bool | None, Query(description="是否激活筛选")] = None,
) -> RoleListResponse:
    """获取角色列表，支持搜索和筛选."""
    total, roles = role_service.get_roles(db, name, code, is_active, pagination["page"], pagination["page_size"])

    return RoleListResponse(
        total=total,
        items=roles,
        page=pagination["page"],
        page_size=pagination["page_size"],
    )


@router.get("/{role_id}")
def get_role(
    role_id: str,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> RoleResponse:
    """获取指定角色信息."""
    role = role_service.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return role


@router.post("/")
def create_role(
    role_data: RoleCreate,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> RoleResponse:
    """创建新角色."""
    return role_service.create_role(db, role_data)


@router.put("/{role_id}")
@limiter.limit(RateLimits.ROLE_UPDATE)
def update_role(
    request: Request,
    role_id: str,
    role_data: RoleUpdate,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> RoleResponse:
    """更新角色信息.

    速率限制：100次/小时.
    """
    return role_service.update_role(db, role_id, role_data)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(RateLimits.ROLE_DELETE)
def delete_role(
    request: Request,
    role_id: str,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> None:
    """删除角色.

    速率限制：20次/小时.
    """
    role_service.delete_role(db, role_id)
