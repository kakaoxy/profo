"""
认证相关依赖注入函数
"""
from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from db import get_db
from models.user import User
from settings import settings
from utils.auth import validate_token, get_user_id_from_token


# OAuth2密码承载器，用于从请求头中获取token
oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_prefix}/auth/token")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
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
    user_id: str = payload.get("sub")
    if user_id is None:
        raise credentials_exception
    
    # 从数据库获取用户
    user = db.query(User).filter(User.id == user_id).first()
    if user is None:
        raise credentials_exception
    
    return user


async def get_current_active_user(
    current_user: User = Depends(get_current_user)
) -> User:
    """
    获取当前活跃用户
    
    Args:
        current_user: 当前用户对象
        
    Returns:
        User: 当前活跃用户对象
        
    Raises:
        HTTPException: 400 Bad Request - 用户未激活
    """
    if current_user.status != "active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户未激活"
        )
    
    return current_user


async def get_current_user_with_role(
    required_roles: list[str],
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    获取具有特定角色的当前用户
    
    Args:
        required_roles: 允许的角色列表
        current_user: 当前活跃用户对象
        
    Returns:
        User: 当前用户对象
        
    Raises:
        HTTPException: 403 Forbidden - 用户角色不允许
    """
    if current_user.role.code not in required_roles:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="权限不足"
        )
    
    return current_user


# 预定义的角色依赖
async def get_current_admin_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    获取当前管理员用户
    
    Args:
        current_user: 当前活跃用户对象
        
    Returns:
        User: 当前管理员用户对象
        
    Raises:
        HTTPException: 403 Forbidden - 用户不是管理员
    """
    return await get_current_user_with_role(["admin"], current_user)


async def get_current_operator_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    获取当前运营人员用户
    
    Args:
        current_user: 当前活跃用户对象
        
    Returns:
        User: 当前运营人员用户对象
        
    Raises:
        HTTPException: 403 Forbidden - 用户不是运营人员
    """
    return await get_current_user_with_role(["admin", "operator"], current_user)


async def get_current_normal_user(
    current_user: User = Depends(get_current_active_user)
) -> User:
    """
    获取当前普通用户
    
    Args:
        current_user: 当前活跃用户对象
        
    Returns:
        User: 当前普通用户对象
        
    Raises:
        HTTPException: 403 Forbidden - 用户权限不足
    """
    return await get_current_user_with_role(["admin", "operator", "user"], current_user)
