"""
用户管理相关路由
使用统一的 ApiResponse 响应包装器
"""
from typing import Optional, Dict, Any
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from db import get_db
from models.user import User, Role
from schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    PasswordChange,
    PasswordResetRequest,
)
from schemas.response import ApiResponse
from utils.auth import get_password_hash
from dependencies.auth import get_current_admin_user, get_current_active_user
from services.user_service import user_service

router = APIRouter()


# ==================== 用户管理 ====================


@router.get("/users", response_model=UserListResponse)
def get_users(
    username: Optional[str] = Query(None, description="用户名搜索"),
    nickname: Optional[str] = Query(None, description="昵称搜索"),
    role_id: Optional[str] = Query(None, description="角色ID筛选"),
    status: Optional[str] = Query(None, description="用户状态筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取用户列表，支持搜索和筛选
    """
    total, users = user_service.get_users(
        db, username, nickname, role_id, status, page, page_size
    )
    
    return UserListResponse(
        total=total,
        items=users
    )


@router.get("/me", response_model=UserResponse)
def get_current_user(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    获取当前登录用户信息
    """
    return current_user


@router.get("/users/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取指定用户信息
    """
    user = user_service.get_user_by_id(db, user_id)
    if not user:
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return user


@router.post("/users", response_model=UserResponse)
def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    创建新用户
    """
    return user_service.create_user(db, user_data)


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    更新用户信息
    """
    return user_service.update_user(db, user_id, user_data)


@router.put("/users/{user_id}/reset-password", response_model=ApiResponse[Dict[str, Any]])
def reset_user_password(
    user_id: str,
    password_data: PasswordResetRequest,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    重置用户密码
    """
    result = user_service.reset_password(db, user_id, password_data)
    return ApiResponse.success(data=result)


@router.delete("/users/{user_id}", response_model=ApiResponse[Dict[str, Any]])
def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    删除用户
    """
    result = user_service.delete_user(db, user_id, current_user.id)
    return ApiResponse.success(data=result)


@router.post("/users/change-password", response_model=ApiResponse[Dict[str, Any]])
def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    修改当前用户密码
    """
    result = user_service.change_password(db, current_user, password_data)
    return ApiResponse.success(data=result)


# ==================== 初始化数据 ====================

@router.post("/init-data", response_model=ApiResponse[Dict[str, Any]])
def init_system_data(
    db: Session = Depends(get_db)
):
    """
    初始化系统数据，包括默认角色和管理员用户
    注意：使用 def 避免 sync DB 阻塞
    """
    # 检查是否已初始化
    existing_roles = db.query(Role).count()
    if existing_roles > 0:
        return ApiResponse.success(data={"message": "系统数据已初始化"})

    # 创建默认角色
    roles_data = [
        {
            "name": "管理员",
            "code": "admin",
            "description": "拥有所有权限，包括用户管理、权限配置",
            "permissions": ["view_data", "edit_data", "manage_users", "manage_roles"]
        },
        {
            "name": "运营人员",
            "code": "operator",
            "description": "拥有数据修改权限，包括项目、房源的增删改查",
            "permissions": ["view_data", "edit_data"]
        },
        {
            "name": "普通用户",
            "code": "user",
            "description": "仅拥有数据查看权限",
            "permissions": ["view_data"]
        }
    ]

    roles = []
    for role_data in roles_data:
        role = Role(**role_data)
        db.add(role)
        roles.append(role)

    db.commit()

    # 获取管理员角色
    admin_role = next(r for r in roles if r.code == "admin")

    # 生成临时密码（符合强密码策略）
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
    temp_password = ''.join(secrets.choice(alphabet) for _ in range(12))

    # 确保密码符合策略
    temp_password = "Temp" + temp_password + "9!"

    # 创建临时管理员用户
    admin_user = User(
        username="admin",
        password=get_password_hash(temp_password),
        nickname="系统管理员",
        role_id=admin_role.id,
        status="active",
        must_change_password=True  # 标记必须修改密码
    )

    db.add(admin_user)
    db.commit()

    return ApiResponse.success(data={
        "message": "系统数据初始化成功",
        "warning": "请立即使用临时密码登录并修改密码",
        "temp_admin": {
            "username": "admin",
            "temp_password": temp_password,
            "note": "此密码仅显示一次，请妥善保存。首次登录必须修改密码。"
        }
    })
