"""权限管理路由."""

from typing import Annotated, Literal

from fastapi import APIRouter, Query, status

from dependencies.auth import (
    DbSessionDep,
    PermissionManagePermDep,
    PermissionReadPermDep,
    RoleAssignPermissionsPermDep,
)
from dependencies.common import PaginationDep
from schemas.permission import (
    PermissionCreate,
    PermissionFilter,
    PermissionListResponse,
    PermissionModuleGroup,
    PermissionResponse,
    PermissionUpdate,
    RolePermissionsResponse,
    RolePermissionsUpdate,
)
from services.system import permission_service

router = APIRouter(prefix="/permissions", tags=["permissions"])


@router.get("")
def list_permissions(
    db: DbSessionDep,
    _current_user: PermissionReadPermDep,
    pagination: PaginationDep,
    module: Annotated[str | None, Query(max_length=50, description="按模块过滤")] = None,
    category: Annotated[
        Literal["menu", "button", "api"] | None,
        Query(description="按类别过滤: menu/button/api"),
    ] = None,
    is_system: Annotated[bool | None, Query(description="按是否系统权限过滤")] = None,
) -> PermissionListResponse:
    """获取权限点列表，支持按模块/类别/系统权限过滤."""
    has_filter = module is not None or category is not None or is_system is not None
    perm_filter = PermissionFilter(module=module, category=category, is_system=is_system) if has_filter else None
    total, perms = permission_service.list_permissions(
        db,
        filter=perm_filter,
        page=pagination.page,
        page_size=pagination.page_size,
    )
    return PermissionListResponse(
        items=[PermissionResponse.model_validate(p) for p in perms],
        total=total,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/modules")
def list_permissions_grouped_by_module(
    db: DbSessionDep,
    _current_user: PermissionReadPermDep,
) -> list[PermissionModuleGroup]:
    """获取按模块分组的权限字典（供前端权限选择器使用）."""
    grouped = permission_service.list_permissions_grouped_by_module(db)
    return [
        PermissionModuleGroup(
            module=module_name,
            permissions=[PermissionResponse.model_validate(p) for p in perms],
        )
        for module_name, perms in grouped.items()
    ]


@router.post("", status_code=status.HTTP_201_CREATED)
def create_permission(
    perm_data: PermissionCreate,
    db: DbSessionDep,
    _current_user: PermissionManagePermDep,
) -> PermissionResponse:
    """创建权限点."""
    perm = permission_service.create_permission(db, perm_data)
    return PermissionResponse.model_validate(perm)


@router.put("/{permission_id}")
def update_permission(
    permission_id: str,
    perm_data: PermissionUpdate,
    db: DbSessionDep,
    _current_user: PermissionManagePermDep,
) -> PermissionResponse:
    """更新权限点."""
    perm = permission_service.update_permission(db, permission_id, perm_data)
    return PermissionResponse.model_validate(perm)


@router.delete("/{permission_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_permission(
    permission_id: str,
    db: DbSessionDep,
    _current_user: PermissionManagePermDep,
) -> None:
    """删除权限点（系统权限点禁止删除）."""
    permission_service.delete_permission(db, permission_id)


@router.get("/roles/{role_id}")
def get_role_permissions(
    role_id: str,
    db: DbSessionDep,
    _current_user: PermissionReadPermDep,
) -> RolePermissionsResponse:
    """获取角色权限代码列表."""
    codes = permission_service.get_role_permission_codes(db, role_id)
    return RolePermissionsResponse(role_id=role_id, permission_codes=codes)


@router.put("/roles/{role_id}")
def set_role_permissions(
    role_id: str,
    data: RolePermissionsUpdate,
    db: DbSessionDep,
    current_user: RoleAssignPermissionsPermDep,
) -> RolePermissionsResponse:
    """全量替换角色权限."""
    codes = permission_service.set_role_permissions(
        db,
        role_id,
        data.permission_codes,
        operator_id=str(current_user.id),
    )
    return RolePermissionsResponse(role_id=role_id, permission_codes=codes)
