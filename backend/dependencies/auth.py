"""认证相关依赖注入函数."""  # noqa: INP001

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db import get_db
from models import User
from services.system import ApiKeyService
from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError, PermissionDeniedError
from settings import settings
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C

# OAuth2密码承载器，用于从请求头中获取token
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.api_prefix}/v1/auth/token",
    auto_error=False,  # 允许token缺失，以便我们从cookie中读取
)

# 类型别名定义
DbSessionDep = Annotated[Session, Depends(get_db)]

# 后台内部角色：API Key 生成与使用仅限这些角色
_INTERNAL_ROLE_CODES = {"admin", "operator"}


def _infer_audience_from_path(path: str) -> str:
    """根据请求路径推断期望的 Token 受众.

    /api/v1/public/* -> C 端 (aud=c)
    其他 -> 后台 (aud=admin)

    """
    if path.startswith(f"{settings.api_prefix}/v1/public"):
        return AUDIENCE_C
    return AUDIENCE_ADMIN


async def require_api_key(
    request: Request,
    db: DbSessionDep,
) -> User:
    """仅通过 API Key 认证用户（且必须是后台内部角色）.

    不接受 JWT Token，专用于机器对机器的 API 调用.
    仅允许 admin/operator 角色的用户生成的 API Key 认证，避免 C 端用户通过 API Key 调用内部接口.

    Args:
        request: FastAPI请求对象
        db: 数据库会话

    Returns:
        User: 当前用户对象

    Raises:
        AuthenticationError: 401 Unauthorized - API Key 无效或缺失
        PermissionDeniedError: 403 Forbidden - API Key 对应用户无权使用机器接口

    """
    # 只接受 X-API-Key Header
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        raise AuthenticationError("需要提供有效的 API Key")

    try:
        # 使用run_in_threadpool调用同步的数据库操作
        user = await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
    except Exception:  # noqa: BLE001
        raise AuthenticationError("API Key 无效") from None

    # 角色二次校验：仅允许后台内部角色
    if user.role is None or user.role.code not in _INTERNAL_ROLE_CODES:
        raise PermissionDeniedError("该账号无权使用 API Key 调用机器接口")
    return user


# API Key 认证依赖类型
ApiKeyAuthDep = Annotated[User, Depends(require_api_key)]


async def get_current_user(
    request: Request,
    db: DbSessionDep,
    token_from_header: str | None = Depends(oauth2_scheme),
) -> User:
    """获取当前用户.

    认证顺序：
    1. JWT Token (Authorization Header Bearer 或与目标系统匹配的 cookie)
    2. API Key (X-API-Key Header) — 仅当无 JWT 时

    按请求路径推断受众（C端 c / 后台 admin），仅读取对应系统的 cookie，
    避免浏览器同时登录两套系统时的交叉误认。

    Args:
        request: FastAPI请求对象
        db: 数据库会话
        token_from_header: 从Authorization Header获取的token

    Returns:
        User: 当前用户对象

    Raises:
        AuthenticationError: 401 Unauthorized - 令牌无效或用户不存在

    """
    expected_audience = _infer_audience_from_path(request.url.path)

    # 优先从Header获取JWT token
    token = token_from_header

    # 按目标系统选择对应 cookie，避免交叉误认
    if expected_audience == AUDIENCE_C:
        cookie_token = request.cookies.get("c_access_token")
    else:
        cookie_token = request.cookies.get("access_token")

    if token is None:
        if cookie_token is not None:
            try:
                # 按目标系统校验受众
                return await run_in_threadpool(
                    AuthService.authenticate_by_token, db, cookie_token, expected_audience
                )
            except AuthenticationError:
                raise AuthenticationError("无法验证凭据") from None
    else:
        # Header token — 校验受众，避免C端Token用于后台或反之
        try:
            return await run_in_threadpool(
                AuthService.authenticate_by_token, db, token, expected_audience
            )
        except AuthenticationError:
            raise AuthenticationError("无法验证凭据") from None

    # 如果没有JWT token，尝试从X-API-Key Header获取API Key
    api_key = request.headers.get("X-API-Key")
    if api_key:
        try:
            # 使用run_in_threadpool调用同步的数据库操作
            user = await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
        except Exception:  # noqa: BLE001
            raise AuthenticationError("API Key 无效") from None
        # API Key 同样要求内部角色
        if user.role is None or user.role.code not in _INTERNAL_ROLE_CODES:
            raise PermissionDeniedError("该账号无权使用 API Key 调用机器接口")
        return user

    # 没有任何认证信息
    raise AuthenticationError("无法验证凭据")


# 当前用户依赖类型
CurrentUserDep = Annotated[User, Depends(get_current_user)]


def get_current_active_user(
    current_user: CurrentUserDep,
) -> User:
    """获取当前活跃用户.

    Args:
        current_user: 当前用户对象

    Returns:
        User: 当前活跃用户对象

    Raises:
        PermissionDeniedError: 403 Forbidden - 用户未激活

    """
    if current_user.status != "active":
        raise PermissionDeniedError("用户未激活")

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

    def role_checker(user: CurrentActiveUserDep) -> User:
        if user.role is None or user.role.code not in required_roles:
            raise PermissionDeniedError("权限不足")
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
