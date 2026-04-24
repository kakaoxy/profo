"""
认证相关依赖注入函数
"""
from typing import Annotated, Optional

from fastapi import Depends, HTTPException, status, Request
from fastapi.security import OAuth2PasswordBearer
from fastapi.concurrency import run_in_threadpool
from sqlalchemy.orm import Session, joinedload

from db import get_db
from models import User
from settings import settings
from utils.auth import validate_token
from services.system import ApiKeyService

# OAuth2密码承载器，用于从请求头中获取token
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.api_prefix}/v1/auth/token",
    auto_error=False,  # 允许token缺失，以便我们从cookie中读取
)

# 类型别名定义
DbSessionDep = Annotated[Session, Depends(get_db)]


async def get_current_user(
    request: Request,
    db: DbSessionDep,
    token_from_header: Optional[str] = Depends(oauth2_scheme),
) -> User:
    """
    获取当前用户
    支持多种认证方式（按优先级）：
    1. JWT Token (Authorization Header Bearer 或 access_token cookie)
    2. API Key (X-API-Key Header)

    Args:
        request: FastAPI请求对象
        db: 数据库会话
        token_from_header: 从Authorization Header获取的token

    Returns:
        User: 当前用户对象

    Raises:
        HTTPException: 401 Unauthorized - 令牌无效或用户不存在
    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="无法验证凭据",
        headers={"WWW-Authenticate": "Bearer"},
    )

    # 优先从Header获取JWT token
    token = token_from_header

    # 如果Header没有，从cookie中获取
    if token is None:
        token = request.cookies.get("access_token")

    # 如果存在JWT token，使用JWT认证
    if token is not None:
        payload = validate_token(token)
        if not payload:
            raise credentials_exception

        # 获取用户ID
        user_id = payload.get("sub")
        if not isinstance(user_id, str):
            raise credentials_exception

        # 从数据库获取用户，预加载角色关系
        user = db.query(User).options(joinedload(User.role)).filter(User.id == user_id).first()
        if user is None:
            raise credentials_exception

        return user

    # 如果没有JWT token，尝试从X-API-Key Header获取API Key
    api_key = request.headers.get("X-API-Key")
    if api_key:
        try:
            # 使用run_in_threadpool调用同步的数据库操作
            user = await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
            return user
        except Exception:
            raise credentials_exception

    # 没有任何认证信息
    raise credentials_exception


# 当前用户依赖类型
CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def get_current_active_user(
    current_user: CurrentUserDep,
) -> User:
    """
    获取当前活跃用户

    Args:
        current_user: 当前用户对象

    Returns:
        User: 当前活跃用户对象

    Raises:
        HTTPException: 403 Forbidden - 用户未激活
    """
    if current_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="用户未激活"
        )

    return current_user


# 当前活跃用户依赖类型
CurrentActiveUserDep = Annotated[User, Depends(get_current_active_user)]


def require_roles(required_roles: list[str]):
    """
    角色检查依赖工厂函数

    Args:
        required_roles: 允许的角色列表

    Returns:
        依赖函数，用于检查用户角色
    """
    def role_checker(user: CurrentActiveUserDep) -> User:
        if user.role.code not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足"
            )
        return user
    return role_checker


# 预定义的角色依赖类型
CurrentAdminUserDep = Annotated[User, Depends(require_roles(["admin"]))]
CurrentOperatorUserDep = Annotated[User, Depends(require_roles(["admin", "operator"]))]
CurrentNormalUserDep = Annotated[User, Depends(require_roles(["admin", "operator", "user"]))]
CurrentInternalUserDep = Annotated[User, Depends(require_roles(["admin", "operator"]))]


# 向后兼容的函数形式
# 这些函数统一使用 require_roles 工厂函数，保持逻辑一致性


def get_current_admin_user(
    current_user: CurrentAdminUserDep,
) -> User:
    """
    获取当前管理员用户

    Args:
        current_user: 当前管理员用户对象（通过 CurrentAdminUserDep 验证）

    Returns:
        User: 当前管理员用户对象

    Raises:
        HTTPException: 403 Forbidden - 权限不足（由 CurrentAdminUserDep 依赖验证）
    """
    return current_user


def get_current_operator_user(
    current_user: CurrentOperatorUserDep,
) -> User:
    """
    获取当前运营人员用户

    Args:
        current_user: 当前运营人员用户对象（通过 CurrentOperatorUserDep 验证）

    Returns:
        User: 当前运营人员用户对象

    Raises:
        HTTPException: 403 Forbidden - 权限不足（由 CurrentOperatorUserDep 依赖验证）
    """
    return current_user


def get_current_normal_user(
    current_user: CurrentNormalUserDep,
) -> User:
    """
    获取当前普通用户

    Args:
        current_user: 当前普通用户对象（通过 CurrentNormalUserDep 验证）

    Returns:
        User: 当前普通用户对象

    Raises:
        HTTPException: 403 Forbidden - 权限不足（由 CurrentNormalUserDep 依赖验证）
    """
    return current_user


def get_current_internal_user(
    current_user: CurrentInternalUserDep,
) -> User:
    """
    获取当前内部管理用户（管理员或运营人员）
    用于所有内部管理API的统一权限验证

    Args:
        current_user: 当前内部管理用户对象（通过 CurrentInternalUserDep 验证）

    Returns:
        User: 当前内部管理用户对象

    Raises:
        HTTPException: 403 Forbidden - 权限不足（由 CurrentInternalUserDep 依赖验证）
    """
    return current_user


__all__ = [
    # 类型别名
    "DbSessionDep",
    "CurrentUserDep",
    "CurrentActiveUserDep",
    "CurrentAdminUserDep",
    "CurrentOperatorUserDep",
    "CurrentNormalUserDep",
    "CurrentInternalUserDep",
    # 依赖函数
    "get_current_user",
    "get_current_active_user",
    "require_roles",
    # 向后兼容的函数
    "get_current_admin_user",
    "get_current_operator_user",
    "get_current_normal_user",
    "get_current_internal_user",
]
