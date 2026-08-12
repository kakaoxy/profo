"""用户管理相关路由.

直接返回 Pydantic 模型，不使用 ApiResponse 包装器.
"""

from typing import Annotated

from fastapi import APIRouter, Query, Request
from fastapi.responses import JSONResponse

from dependencies.auth import (
    CurrentActiveUserDep,
    CurrentAdminUserDep,
    CurrentInternalUserDep,
    DbSessionDep,
    UserCreatePermDep,
    UserDeletePermDep,
    UserReadPermDep,
    UserResetPasswordPermDep,
    UserUnbindWechatPermDep,
    UserUpdatePermDep,
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
from services.system import user_lifecycle_service, user_service, user_wechat_service
from services.system.exceptions import ResourceNotFoundError, ServiceException, WeChatNotBoundError
from services.system.init_service import init_service
from utils.common import RateLimits, limiter

router = APIRouter(prefix="/users", tags=["users"])


@router.get("")
@limiter.limit(RateLimits.USER_LIST)
def get_users(
    request: Request,
    db: DbSessionDep,
    _current_user: UserReadPermDep,
    pagination: PaginationDep,
    username: Annotated[str | None, Query(max_length=100, description="用户名搜索")] = None,
    nickname: Annotated[str | None, Query(max_length=100, description="昵称搜索")] = None,
    role_id: Annotated[str | None, Query(max_length=100, description="角色ID筛选")] = None,
    status: Annotated[str | None, Query(max_length=100, description="用户状态筛选")] = None,
    sort: Annotated[
        str | None,
        Query(max_length=20, description="排序字段：nickname/role/leads_count/last_login_at/created_at"),
    ] = None,
    sort_dir: Annotated[
        str | None,
        Query(alias="dir", max_length=4, description="排序方向：asc/desc，默认 desc"),
    ] = None,
) -> UserListResponse:
    """获取用户列表，支持搜索、筛选和排序.

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
        sort=sort,
        sort_dir=sort_dir,
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
    nickname: Annotated[str | None, Query(max_length=100, description="昵称搜索")] = None,
    status: Annotated[str | None, Query(max_length=100, description="用户状态筛选")] = "active",
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
    db: DbSessionDep,
    current_user: CurrentActiveUserDep,
) -> UserResponse:
    """获取当前登录用户信息."""
    return user_service.attach_leads_count(db, current_user)


@router.get("/{user_id}")
def get_user(
    user_id: str,
    db: DbSessionDep,
    _current_user: UserReadPermDep,
) -> UserResponse:
    """获取指定用户信息."""
    user = user_service.get_user_by_id(db, user_id)
    if not user:
        msg = "用户不存在"
        raise ResourceNotFoundError(msg)
    return user


@router.post("", status_code=201)
@limiter.limit(RateLimits.USER_CREATE)
def create_user(
    request: Request,
    user_data: UserCreate,
    db: DbSessionDep,
    current_user: UserCreatePermDep,
) -> UserResponse:
    """创建新用户.

    速率限制：10次/小时（防止批量创建用户攻击）.
    """
    return user_service.create_user(
        db,
        user_data,
        additional_role_ids=user_data.additional_role_ids,
        operator_id=str(current_user.id),
        request=request,
    )


@router.put("/{user_id}")
@limiter.limit(RateLimits.USER_UPDATE)
def update_user(
    request: Request,
    user_id: str,
    user_data: UserUpdate,
    db: DbSessionDep,
    current_user: UserUpdatePermDep,
) -> UserResponse:
    """更新用户信息.

    速率限制：100次/小时.
    """
    return user_service.update_user(
        db,
        user_id,
        user_data,
        additional_role_ids=user_data.additional_role_ids,
        operator_id=str(current_user.id),
        request=request,
    )


@router.put("/{user_id}/reset-password")
@limiter.limit(RateLimits.USER_RESET_PASSWORD)
def reset_user_password(
    request: Request,
    user_id: str,
    password_data: PasswordResetRequest,
    db: DbSessionDep,
    current_user: UserResetPasswordPermDep,
) -> dict:
    """重置用户密码.

    速率限制：5次/小时（防止密码重置滥用）.
    """
    return user_lifecycle_service.reset_password(
        db,
        user_id,
        password_data,
        operator_id=str(current_user.id),
        request=request,
    )


@router.post("/{user_id}/unbind-wechat")
@limiter.limit(RateLimits.USER_UNBIND_WECHAT)
def unbind_wechat(
    request: Request,
    user_id: str,
    db: DbSessionDep,
    current_user: UserUnbindWechatPermDep,
) -> dict:
    """解绑用户微信账号.

    支持两种绑定场景：
    - 直接绑定：清空目标用户自身的 wechat_* 字段
    - 间接绑定（经合并临时账号）：清空指向目标用户的临时账号的 wechat_* 字段

    解绑后立即失效目标用户现有令牌（token_version 递增 + RefreshToken 撤销），
    并写入审计日志。

    速率限制：20次/小时.
    """
    try:
        return user_wechat_service.unbind_wechat(
            db,
            user_id,
            operator_id=str(current_user.id),
            request=request,
        )
    except WeChatNotBoundError:
        # 业务码 40904：目标账号未绑定微信（含并发解绑串行化后到事务放弃的场景）
        return JSONResponse(
            status_code=409,
            content={"code": 40904, "message": "WECHAT_NOT_BOUND"},
        )


@router.delete("/{user_id}", status_code=204)
@limiter.limit(RateLimits.USER_DELETE)
def delete_user(
    request: Request,
    user_id: str,
    db: DbSessionDep,
    current_user: UserDeletePermDep,
) -> None:
    """删除用户.

    速率限制：20次/小时.
    """
    user_lifecycle_service.delete_user(db, user_id, current_user.id, request=request)


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
    return user_lifecycle_service.change_password(db, current_user, password_data, request=request)


@router.post("/init-data")
@limiter.limit(RateLimits.USER_INIT_DATA)
def init_system_data(
    request: Request,
    db: DbSessionDep,
    _current_user: CurrentAdminUserDep,
) -> dict:
    """初始化系统数据，包括默认角色和管理员用户.

    需要管理员权限。首次初始化请使用 init_admin.py 脚本。
    注意：使用 def 避免 sync DB 阻塞
    速率限制：3次/小时.
    """
    result = init_service.initialize(db)
    if result.get("error"):
        raise ServiceException(result["error"])
    return result
