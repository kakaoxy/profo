"""
认证相关依赖注入函数
"""
from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db import get_db
from models.user import User
from settings import settings
from utils.auth import validate_token

# OAuth2密码承载器，用于从请求头中获取token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/token")

# 类型别名定义
TokenDep = Annotated[str, Depends(oauth2_scheme)]
DbSessionDep = Annotated[Session, Depends(get_db)]


async def get_current_user(
    token: TokenDep,
    db: DbSessionDep,
) -> User:
    """
    获取当前用户

    Args:
        token: JWT令牌
        db: 数据库会话

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

    # 验证令牌
    payload = validate_token(token)
    if not payload:
        raise credentials_exception

    # 获取用户ID
    user_id = payload.get("sub")
    if not isinstance(user_id, str):
        raise credentials_exception

    # 从数据库获取用户
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception

    return user


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
    async def role_checker(user: CurrentActiveUserDep) -> User:
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


async def get_current_admin_user(
    current_user: CurrentAdminUserDep,
) -> User:
    """
    获取当前管理员用户

    Args:
        current_user: 当前管理员用户对象（通过 CurrentAdminUserDep 验证）

    Returns:
        User: 当前管理员用户对象
    """
    return current_user


async def get_current_operator_user(
    current_user: CurrentOperatorUserDep,
) -> User:
    """
    获取当前运营人员用户

    Args:
        current_user: 当前运营人员用户对象（通过 CurrentOperatorUserDep 验证）

    Returns:
        User: 当前运营人员用户对象
    """
    return current_user


async def get_current_normal_user(
    current_user: CurrentNormalUserDep,
) -> User:
    """
    获取当前普通用户

    Args:
        current_user: 当前普通用户对象（通过 CurrentNormalUserDep 验证）

    Returns:
        User: 当前普通用户对象
    """
    return current_user


async def get_current_internal_user(
    current_user: CurrentInternalUserDep,
) -> User:
    """
    获取当前内部管理用户（管理员或运营人员）
    用于所有内部管理API的统一权限验证

    Args:
        current_user: 当前内部管理用户对象（通过 CurrentInternalUserDep 验证）

    Returns:
        User: 当前内部管理用户对象
    """
    return current_user


__all__ = [
    # 类型别名
    "TokenDep",
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
