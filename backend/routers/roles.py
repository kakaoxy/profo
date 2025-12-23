"""
角色管理相关路由
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from typing import Optional

from db import get_db
from models.user import User
from schemas.user import (
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleListResponse,
)
from dependencies.auth import get_current_admin_user
from services.role_service import role_service

router = APIRouter()


@router.get("/roles", response_model=RoleListResponse)
def get_roles(
    name: Optional[str] = Query(None, description="角色名称搜索"),
    code: Optional[str] = Query(None, description="角色代码搜索"),
    is_active: Optional[bool] = Query(None, description="是否激活筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取角色列表，支持搜索和筛选
    """
    total, roles = role_service.get_roles(db, name, code, is_active, page, page_size)
    
    return RoleListResponse(
        total=total,
        items=roles
    )


@router.get("/roles/{role_id}", response_model=RoleResponse)
def get_role(
    role_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取指定角色信息
    """
    role = role_service.get_role_by_id(db, role_id)
    if not role:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="角色不存在")
    return role


@router.post("/roles", response_model=RoleResponse)
def create_role(
    role_data: RoleCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    创建新角色
    """
    return role_service.create_role(db, role_data)


@router.put("/roles/{role_id}", response_model=RoleResponse)
def update_role(
    role_id: str,
    role_data: RoleUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    更新角色信息
    """
    return role_service.update_role(db, role_id, role_data)


@router.delete("/roles/{role_id}")
def delete_role(
    role_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    删除角色
    """
    result = role_service.delete_role(db, role_id)
    return JSONResponse(status_code=200, content=result)
