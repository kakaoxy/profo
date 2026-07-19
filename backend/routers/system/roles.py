"""C端角色管理路由."""

from typing import Annotated

from fastapi import APIRouter, Query, Request, status
from sqlalchemy.orm import Session

from dependencies.auth import (
    DbSessionDep,
    RoleCreatePermDep,
    RoleDeletePermDep,
    RoleReadPermDep,
    RoleUpdatePermDep,
)
from dependencies.common import PaginationDep
from models import Role
from schemas.user import (
    RoleCreate,
    RoleListResponse,
    RoleResponse,
    RoleUpdate,
)
from services.system import permission_service, role_service
from services.system.exceptions import ResourceNotFoundError
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/roles", tags=["roles"])


def _role_response_with_permissions(db: Session, role: Role) -> RoleResponse:
    """构建带 permission_codes 的角色响应（从 role_permissions 关联表派生）."""
    resp = RoleResponse.model_validate(role)
    resp.permission_codes = permission_service.get_role_permission_codes(db, str(role.id))
    return resp


@router.get("")
def get_roles(
    db: DbSessionDep,
    _current_user: RoleReadPermDep,
    pagination: PaginationDep,
    name: Annotated[str | None, Query(max_length=100, description="角色名称搜索")] = None,
    code: Annotated[str | None, Query(max_length=100, description="角色代码搜索")] = None,
    is_active: Annotated[bool | None, Query(description="是否激活筛选")] = None,
) -> RoleListResponse:
    """获取角色列表，支持搜索和筛选.

    列表项也填充 permission_codes，供前端编辑弹窗初始化勾选状态
    及角色表格的权限 Badge 展示（避免单独 GET /{id} 的 N+1 调用）。
    """
    total, roles = role_service.get_roles(db, name, code, is_active, pagination.page, pagination.page_size)

    # 批量获取所有角色的权限码（单次查询，消除 N+1）
    role_ids = [str(role.id) for role in roles]
    perms_map = permission_service.get_roles_permission_codes(db, role_ids)

    items = []
    for role in roles:
        resp = RoleResponse.model_validate(role)
        resp.permission_codes = perms_map.get(str(role.id), [])
        items.append(resp)

    return RoleListResponse(
        total=total,
        items=items,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/{role_id}")
def get_role(
    role_id: str,
    db: DbSessionDep,
    _current_user: RoleReadPermDep,
) -> RoleResponse:
    """获取指定角色信息."""
    role = role_service.get_role_by_id(db, role_id)
    if not role:
        msg = "角色不存在"
        raise ResourceNotFoundError(msg)
    return _role_response_with_permissions(db, role)


@router.post("")
def create_role(
    request: Request,
    role_data: RoleCreate,
    db: DbSessionDep,
    current_user: RoleCreatePermDep,
) -> RoleResponse:
    """创建新角色."""
    role = role_service.create_role(
        db,
        role_data,
        operator_id=str(current_user.id),
        request=request,
    )
    return _role_response_with_permissions(db, role)


@router.put("/{role_id}")
@limiter.limit(RateLimits.ROLE_UPDATE)
def update_role(
    request: Request,
    role_id: str,
    role_data: RoleUpdate,
    db: DbSessionDep,
    current_user: RoleUpdatePermDep,
) -> RoleResponse:
    """更新角色信息.

    速率限制：100次/小时.
    """
    role = role_service.update_role(
        db,
        role_id,
        role_data,
        operator_id=str(current_user.id),
        request=request,
    )
    return _role_response_with_permissions(db, role)


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit(RateLimits.ROLE_DELETE)
def delete_role(
    request: Request,
    role_id: str,
    db: DbSessionDep,
    current_user: RoleDeletePermDep,
) -> None:
    """删除角色.

    速率限制：20次/小时.
    """
    role_service.delete_role(
        db,
        role_id,
        operator_id=str(current_user.id),
        request=request,
    )
