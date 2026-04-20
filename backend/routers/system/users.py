"""
用户管理相关路由
直接返回 Pydantic 模型，不使用 ApiResponse 包装器
"""
import secrets
import string
from typing import Annotated

from fastapi import APIRouter, Query, HTTPException, status

from models import User, Role
from schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    UserSimpleListResponse,
    PasswordChange,
    PasswordResetRequest,
)
from utils.auth import get_password_hash
from dependencies.auth import (
    DbSessionDep,
    CurrentAdminUserDep,
    CurrentActiveUserDep,
    CurrentInternalUserDep,
)
from services.system import user_service

router = APIRouter(prefix="/users", tags=["users"])


# ==================== 用户管理 ====================


@router.get("/", response_model=UserListResponse)
def get_users(
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
    username: Annotated[str | None, Query(description="用户名搜索")] = None,
    nickname: Annotated[str | None, Query(description="昵称搜索")] = None,
    role_id: Annotated[str | None, Query(description="角色ID筛选")] = None,
    status: Annotated[str | None, Query(description="用户状态筛选")] = None,
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=200, description="每页数量")] = 50,
) -> UserListResponse:
    """
    获取用户列表，支持搜索和筛选
    """
    total, users = user_service.get_users(
        db, username, nickname, role_id, status, page, page_size
    )

    return UserListResponse(
        total=total,
        items=users,
        page=page,
        page_size=page_size
    )


@router.get("/simple", response_model=UserSimpleListResponse)
def get_users_simple(
    db: DbSessionDep,
    current_user: CurrentInternalUserDep,
    nickname: Annotated[str | None, Query(description="昵称搜索")] = None,
    status: Annotated[str | None, Query(description="用户状态筛选")] = "active",
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=500, description="每页数量")] = 100,
) -> UserSimpleListResponse:
    """
    获取简化用户列表（仅包含ID和昵称），用于下拉选择
    """
    from sqlalchemy import or_

    query = db.query(User.id, User.nickname, User.username)

    if status:
        query = query.filter(User.status == status)

    if nickname:
        query = query.filter(
            or_(
                User.nickname.ilike(f"%{nickname}%"),
                User.username.ilike(f"%{nickname}%")
            )
        )

    users = query.all()

    items = [
        {"id": u.id, "nickname": u.nickname, "username": u.username}
        for u in users
    ]

    return UserSimpleListResponse(
        total=len(items),
        items=items,
        page=page,
        page_size=page_size
    )


@router.get("/me", response_model=UserResponse)
def get_current_user(
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> UserResponse:
    """
    获取当前登录用户信息
    """
    return current_user


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: str,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> UserResponse:
    """
    获取指定用户信息
    """
    user = user_service.get_user_by_id(db, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
    return user


@router.post("/", response_model=UserResponse, status_code=201)
def create_user(
    user_data: UserCreate,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> UserResponse:
    """
    创建新用户
    """
    return user_service.create_user(db, user_data)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: str,
    user_data: UserUpdate,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> UserResponse:
    """
    更新用户信息
    """
    return user_service.update_user(db, user_id, user_data)


@router.put("/{user_id}/reset-password")
def reset_user_password(
    user_id: str,
    password_data: PasswordResetRequest,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> dict:
    """
    重置用户密码
    """
    result = user_service.reset_password(db, user_id, password_data)
    return result


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> None:
    """
    删除用户
    """
    user_service.delete_user(db, user_id, current_user.id)
    return None


@router.post("/change-password")
def change_password(
    password_data: PasswordChange,
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> dict:
    """
    修改当前用户密码
    """
    result = user_service.change_password(db, current_user, password_data)
    return result


# ==================== 初始化数据 ====================

@router.post("/init-data")
def init_system_data(
    db: DbSessionDep,
) -> dict:
    """
    初始化系统数据，包括默认角色和管理员用户
    注意：使用 def 避免 sync DB 阻塞
    """
    # 检查是否已初始化
    existing_roles = db.query(Role).count()
    if existing_roles > 0:
        return {"message": "系统数据已初始化"}

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

    return {
        "message": "系统数据初始化成功",
        "warning": "请立即使用临时密码登录并修改密码",
        "temp_admin": {
            "username": "admin",
            "temp_password": temp_password,
            "note": "此密码仅显示一次，请妥善保存。首次登录必须修改密码。"
        }
    }
