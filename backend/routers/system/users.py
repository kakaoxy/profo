"""用户管理相关路由.

直接返回 Pydantic 模型，不使用 ApiResponse 包装器.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from utils.common import RateLimits, limiter
from dependencies.auth import (
    CurrentActiveUserDep,
    CurrentAdminUserDep,
    CurrentInternalUserDep,
    DbSessionDep,
)
from dependencies.common import PaginationDep
from schemas.user import (
    PasswordChange,
    PasswordResetRequest,
    UserCreate,
    UserListResponse,
    UserResponse,
    UserSimpleListResponse,
    UserUpdate,
)
from services.system import user_service
from services.system.exceptions import ResourceNotFoundError, ServiceException
from services.system.init_service import init_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/")
@limiter.limit(RateLimits.USER_LIST)
def get_users(  # noqa: PLR0913
    request: Request,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
    pagination: PaginationDep,
    username: Annotated[str | None, Query(description="用户名搜索")] = None,
    nickname: Annotated[str | None, Query(description="昵称搜索")] = None,
    role_id: Annotated[str | None, Query(description="角色ID筛选")] = None,
    status: Annotated[str | None, Query(description="用户状态筛选")] = None,
) -> UserListResponse:
    """获取用户列表，支持搜索和筛选.

    速率限制：60次/分钟.
    """
    total, users = user_service.get_users(
        db,
        username,
        nickname,
        role_id,
        status,
        pagination.page,
        pagination.page_size,
    )

    return UserListResponse(
        total=total,
        items=users,
        page=pagination.page,
        page_size=pagination.page_size,
    )


@router.get("/simple")
def get_users_simple(
    db: DbSessionDep,
    _current_user: CurrentInternalUserDep,
    nickname: Annotated[str | None, Query(description="昵称搜索")] = None,
    status: Annotated[str | None, Query(description="用户状态筛选")] = "active",
    page: Annotated[int, Query(ge=1, description="页码")] = 1,
    page_size: Annotated[int, Query(ge=1, le=500, description="每页数量")] = 100,
) -> UserSimpleListResponse:
    """获取简化用户列表（仅包含ID和昵称），用于下拉选择."""
    items = user_service.list_users_simple(db, nickname=nickname, status=status)

    return UserSimpleListResponse(
        total=len(items),
        items=items,
        page=page,
        page_size=page_size,
    )


@router.get("/me")
def get_current_user(
    _db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> UserResponse:
    """获取当前登录用户信息."""
    return current_user


@router.get("/{user_id}")
def get_user(
    user_id: str,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> UserResponse:
    """获取指定用户信息."""
    user = user_service.get_user_by_id(db, user_id)
    if not user:
        raise ResourceNotFoundError("用户不存在")
    return user


@router.post("/", status_code=201)
@limiter.limit(RateLimits.USER_CREATE)
def create_user(
    request: Request,
    user_data: UserCreate,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> UserResponse:
    """创建新用户.

    速率限制：10次/小时（防止批量创建用户攻击）.
    """
    return user_service.create_user(db, user_data)


@router.put("/{user_id}")
@limiter.limit(RateLimits.USER_UPDATE)
def update_user(
    request: Request,
    user_id: str,
    user_data: UserUpdate,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> UserResponse:
    """更新用户信息.

    速率限制：100次/小时.
    """
    return user_service.update_user(db, user_id, user_data)


@router.put("/{user_id}/reset-password")
@limiter.limit(RateLimits.USER_RESET_PASSWORD)
def reset_user_password(
    request: Request,
    user_id: str,
    password_data: PasswordResetRequest,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> dict:
    """重置用户密码.

    速率限制：5次/小时（防止密码重置滥用）.
    """
    return user_service.reset_password(db, user_id, password_data)


@router.delete("/{user_id}", status_code=204)
@limiter.limit(RateLimits.USER_DELETE)
def delete_user(
    request: Request,
    user_id: str,
    db: DbSessionDep,
    current_user: CurrentAdminUserDep,
) -> None:
    """删除用户.

    速率限制：20次/小时.
    """
    user_service.delete_user(db, user_id, current_user.id)


@router.post("/change-password")
@limiter.limit(RateLimits.USER_CHANGE_PASSWORD)
def change_password(
    request: Request,
    password_data: PasswordChange,
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> dict:
    """修改当前用户密码.

    速率限制：3次/分钟（防止暴力破解密码）.
    """
    return user_service.change_password(db, current_user, password_data)


@router.post("/init-data")
@limiter.limit(RateLimits.USER_INIT_DATA)
def init_system_data(
    request: Request,
    db: DbSessionDep,
) -> dict:
    """初始化系统数据，包括默认角色和管理员用户.

    注意：使用 def 避免 sync DB 阻塞
    速率限制：3次/小时.
    """
    result = init_service.initialize(db)
    if result.get("error"):
        raise ServiceException(result["error"])
    return result
