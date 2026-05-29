"""认证相关依赖注入函数."""  # noqa: INP001

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.concurrency import run_in_threadpool
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session, joinedload

from db import get_db
from models import User
from services.system import ApiKeyService
from settings import settings
from utils.auth import validate_token

# OAuth2密码承载器，用于从请求头中获取token
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.api_prefix}/v1/auth/token",
    auto_error=False,  # 允许token缺失，以便我们从cookie中读取
)

# 类型别名定义
DbSessionDep = Annotated[Session, Depends(get_db)]


async def require_api_key(
    request: Request,
    db: DbSessionDep,
) -> User:
    """仅通过 API Key 认证用户.

    不接受 JWT Token，专用于机器对机器的 API 调用.

    Args:
        request: FastAPI请求对象
        db: 数据库会话

    Returns:
        User: 当前用户对象

    Raises:
        HTTPException: 401 Unauthorized - API Key 无效或缺失

    """
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="需要提供有效的 API Key",
        headers={"WWW-Authenticate": "ApiKey"},
    )

    # 只接受 X-API-Key Header
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        raise credentials_exception

    try:
        # 使用run_in_threadpool调用同步的数据库操作
        return await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
    except Exception:  # noqa: BLE001
        raise credentials_exception from None


# API Key 认证依赖类型
ApiKeyAuthDep = Annotated[User, Depends(require_api_key)]


async def get_current_user(
    request: Request,
    db: DbSessionDep,
    token_from_header: str | None = Depends(oauth2_scheme),
) -> User:
    """获取当前用户.

    支持多种认证方式（按优先级）：
    1. JWT Token (Authorization Header Bearer 或 access_token cookie)
    2. API Key (X-API-Key Header).

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

    # 如果Header没有，从cookie中获取（支持管理端和C端两种cookie名）
    if token is None:
        token = request.cookies.get("access_token") or request.cookies.get("c_access_token")

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
            return await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
        except Exception:  # noqa: BLE001
            raise credentials_exception from None

    # 没有任何认证信息
    raise credentials_exception


# 当前用户依赖类型
CurrentUserDep = Annotated[User, Depends(get_current_user)]


async def get_current_active_user(
    current_user: CurrentUserDep,
) -> User:
    """获取当前活跃用户.

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
            detail="用户未激活",
        )

    return current_user


# 当前活跃用户依赖类型
CurrentActiveUserDep = Annotated[User, Depends(get_current_active_user)]


def require_roles(required_roles: list[str]) -> Callable[..., User]:
    """角色检查依赖工厂函数.

    Args:
        required_roles: 允许的角色列表

    Returns:
        依赖函数，用于检查用户角色

    """

    async def role_checker(user: CurrentActiveUserDep) -> User:
        if user.role.code not in required_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="权限不足",
            )
        return user

    return role_checker


# 预定义的角色依赖类型
CurrentAdminUserDep = Annotated[User, Depends(require_roles(["admin"]))]
CurrentOperatorUserDep = Annotated[User, Depends(require_roles(["admin", "operator"]))]
CurrentNormalUserDep = Annotated[User, Depends(require_roles(["admin", "operator", "user"]))]
CurrentInternalUserDep = Annotated[User, Depends(require_roles(["admin", "operator"]))]
CurrentCustomerUserDep = Annotated[User, Depends(require_roles(["customer"]))]


__all__ = [
    "ApiKeyAuthDep",
    "CurrentActiveUserDep",
    "CurrentAdminUserDep",
    "CurrentCustomerUserDep",
    "CurrentInternalUserDep",
    "CurrentNormalUserDep",
    "CurrentOperatorUserDep",
    "CurrentUserDep",
    # 类型别名
    "DbSessionDep",
    "get_current_active_user",
    # 依赖函数
    "get_current_user",
    "require_api_key",
    "require_roles",
]
