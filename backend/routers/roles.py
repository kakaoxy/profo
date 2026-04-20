"""
角色管理相关路由
"""
from typing import Annotated, Optional

from fastapi import APIRouter, HTTPException, Query, status

from schemas.user import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleListResponse,
)
from dependencies.auth import DbSessionDep, CurrentAdminUserDep
from services.role_service import role_service

router = APIRouter()


@router.get("/roles", response_model=RoleListResponse)
def get_roles(
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    name: Annotated[Optional[str], Query(description="角色名称搜索")] = None,
    code: Annotated[Optional[str], Query(description="角色代码搜索")] = None,
    is_active: Annotated[Optional[bool], Query(description="是否激活筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
):
    """
    获取角色列表，支持搜索和筛选
    """
    total, roles = role_service.get_roles(db, name, code, is_active, page, page_size)
    
    return RoleListResponse(
        total=total,
        items=roles,
        page=page,
        page_size=page_size
    )


@router.get("/roles/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: str,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> RoleResponse:
    """
    获取指定角色信息
    """
    role = role_service.get_role_by_id(db, role_id)
    if not role:
        raise HTTPException(status_code=404, detail="角色不存在")
    return role


@router.post("/roles", response_model=RoleResponse)
def create_role(
    role_data: RoleCreate,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> RoleResponse:
    """
    创建新角色
    """
    return role_service.create_role(db, role_data)


@router.put("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: str,
    role_data: RoleUpdate,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> RoleResponse:
    """
    更新角色信息
    """
    return role_service.update_role(db, role_id, role_data)


@router.delete("/roles/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(
    role_id: str,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> None:
    """
    删除角色
    """
    role_service.delete_role(db, role_id)
    return None
