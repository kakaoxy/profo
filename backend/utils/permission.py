"""
权限管理工具函数
"""
from typing import List, Callable, Optional
from fastapi import Depends, HTTPException, status
from functools import wraps

from models.user import User


def check_permissions(
    required_permissions: List[str],
    permission_type: str = "any"  # "any" 或 "all"，表示需要满足任一权限或所有权限
) -> Callable:
    """
    权限检查装饰器，用于检查用户是否具有所需的权限
    
    Args:
        required_permissions: 所需的权限列表
        permission_type: 权限检查类型，"any" 表示满足任一权限即可，"all" 表示需要满足所有权限
        
    Returns:
        Callable: 装饰器函数
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 从kwargs中获取current_user
            current_user: User = kwargs.get("current_user")
            
            # 如果current_user不存在，尝试从依赖中获取
            if not current_user:
                from dependencies.auth import get_current_active_user
                current_user = await get_current_active_user()
            
            # 获取用户的权限列表
            user_permissions = current_user.role.permissions or []
            
            # 检查权限
            if permission_type == "any":
                # 检查是否具有任一所需权限
                has_permission = any(perm in user_permissions for perm in required_permissions)
            else:
                # 检查是否具有所有所需权限
                has_permission = all(perm in user_permissions for perm in required_permissions)
            
            # 如果没有权限，抛出HTTP异常
            if not has_permission:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="权限不足"
                )
            
            # 执行原始函数
            return await func(*args, **kwargs)
        return wrapper
    return decorator


def check_role(
    required_roles: List[str]
) -> Callable:
    """
    角色检查装饰器，用于检查用户是否具有所需的角色
    
    Args:
        required_roles: 所需的角色列表
        
    Returns:
        Callable: 装饰器函数
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 从kwargs中获取current_user
            current_user: User = kwargs.get("current_user")
            
            # 如果current_user不存在，尝试从依赖中获取
            if not current_user:
                from dependencies.auth import get_current_active_user
                current_user = await get_current_active_user()
            
            # 检查角色
            has_role = current_user.role.code in required_roles
            
            # 如果没有所需角色，抛出HTTP异常
            if not has_role:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="权限不足"
                )
            
            # 执行原始函数
            return await func(*args, **kwargs)
        return wrapper
    return decorator


# 预定义的权限装饰器

def require_admin() -> Callable:
    """
    要求用户为管理员角色
    
    Returns:
        Callable: 装饰器函数
    """
    return check_role(["admin"])


def require_operator() -> Callable:
    """
    要求用户为管理员或运营人员角色
    
    Returns:
        Callable: 装饰器函数
    """
    return check_role(["admin", "operator"])


def require_view_data() -> Callable:
    """
    要求用户具有查看数据权限
    
    Returns:
        Callable: 装饰器函数
    """
    return check_permissions(["view_data"])


def require_edit_data() -> Callable:
    """
    要求用户具有编辑数据权限
    
    Returns:
        Callable: 装饰器函数
    """
    return check_permissions(["edit_data"])


def require_manage_users() -> Callable:
    """
    要求用户具有管理用户权限
    
    Returns:
        Callable: 装饰器函数
    """
    return check_permissions(["manage_users"])


def require_manage_roles() -> Callable:
    """
    要求用户具有管理角色权限
    
    Returns:
        Callable: 装饰器函数
    """
    return check_permissions(["manage_roles"])


def has_permission(
    user: User,
    required_permission: str
) -> bool:
    """
    检查用户是否具有特定权限
    
    Args:
        user: 用户对象
        required_permission: 所需权限
        
    Returns:
        bool: 用户是否具有该权限
    """
    user_permissions = user.role.permissions or []
    return required_permission in user_permissions


def has_role(
    user: User,
    required_role: str
) -> bool:
    """
    检查用户是否具有特定角色
    
    Args:
        user: 用户对象
        required_role: 所需角色
        
    Returns:
        bool: 用户是否具有该角色
    """
    return user.role.code == required_role
