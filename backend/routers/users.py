"""
用户管理相关路由
"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from typing import Optional, List

from db import get_db
from models.user import User, Role
from schemas.user import (
    UserCreate,
    UserUpdate,
    UserResponse,
    UserListResponse,
    PasswordChange,
    PasswordResetRequest,
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    RoleListResponse,
)
from utils.auth import get_password_hash, verify_password, validate_password_strength
from dependencies.auth import get_current_admin_user, get_current_active_user


router = APIRouter()


# ==================== 用户管理 ====================


@router.get("/users", response_model=UserListResponse)
async def get_users(
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
    
    Args:
        username: 用户名搜索（模糊匹配）
        nickname: 昵称搜索（模糊匹配）
        role_id: 角色ID筛选
        status: 用户状态筛选
        page: 页码
        page_size: 每页数量
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        UserListResponse: 用户列表响应
    """
    # 构建查询
    query = db.query(User)
    
    # 应用搜索条件
    if username:
        query = query.filter(User.username.like(f"%{username}%"))
    if nickname:
        query = query.filter(User.nickname.like(f"%{nickname}%"))
    if role_id:
        query = query.filter(User.role_id == role_id)
    if status:
        query = query.filter(User.status == status)
    
    # 获取总数
    total = query.count()
    
    # 应用分页
    offset = (page - 1) * page_size
    users = query.order_by(User.created_at.desc()).offset(offset).limit(page_size).all()
    
    return UserListResponse(
        total=total,
        items=users
    )


@router.get("/me", response_model=UserResponse)
async def get_current_user(
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    获取当前登录用户信息
    
    Args:
        current_user: 当前活跃用户
        db: 数据库会话
        
    Returns:
        UserResponse: 当前用户信息
    """
    return current_user


@router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取指定用户信息
    
    Args:
        user_id: 用户ID
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        UserResponse: 用户信息
        
    Raises:
        HTTPException: 404 Not Found - 用户不存在
    """
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    return user


@router.post("/users", response_model=UserResponse)
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    创建新用户
    
    Args:
        user_data: 用户创建数据
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        UserResponse: 新创建的用户信息
        
    Raises:
        HTTPException: 400 Bad Request - 用户名已存在
    """
    # 检查用户名是否已存在
    existing_user = db.query(User).filter(User.username == user_data.username).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="用户名已存在"
        )
    
    # 检查手机号是否已存在（如果提供了手机号）
    if user_data.phone:
        existing_phone = db.query(User).filter(User.phone == user_data.phone).first()
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="手机号已被使用"
            )
    
    # 验证密码强度
    is_valid, error_msg = validate_password_strength(user_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 创建用户
    db_user = User(
        **user_data.model_dump(exclude={"password"}),
        password=get_password_hash(user_data.password)
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    return db_user


@router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    更新用户信息
    
    Args:
        user_id: 用户ID
        user_data: 用户更新数据
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        UserResponse: 更新后的用户信息
        
    Raises:
        HTTPException: 404 Not Found - 用户不存在
        HTTPException: 400 Bad Request - 手机号已被使用
    """
    # 获取用户
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 检查手机号是否已被其他用户使用
    if user_data.phone and user_data.phone != user.phone:
        existing_phone = db.query(User).filter(
            User.phone == user_data.phone,
            User.id != user_id
        ).first()
        if existing_phone:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="手机号已被使用"
            )
    
    # 更新用户信息
    update_data = user_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)
    
    db.commit()
    db.refresh(user)
    
    return user


@router.put("/users/{user_id}/reset-password")
async def reset_user_password(
    user_id: str,
    password_data: PasswordResetRequest,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    重置用户密码
    
    Args:
        user_id: 用户ID
        password_data: 密码重置请求数据
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        dict: 重置结果
        
    Raises:
        HTTPException: 404 Not Found - 用户不存在
        HTTPException: 400 Bad Request - 密码不符合强度要求
    """
    # 获取用户
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 验证密码强度
    is_valid, error_msg = validate_password_strength(password_data.password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 更新密码
    user.password = get_password_hash(password_data.password)
    db.commit()
    
    return {"message": "密码重置成功"}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    删除用户
    
    Args:
        user_id: 用户ID
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        dict: 删除结果
        
    Raises:
        HTTPException: 404 Not Found - 用户不存在
        HTTPException: 400 Bad Request - 不能删除自己
    """
    # 不能删除自己
    if user_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="不能删除自己"
        )
    
    # 获取用户
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="用户不存在"
        )
    
    # 删除用户
    db.delete(user)
    db.commit()
    
    return {"message": "用户删除成功"}


@router.post("/users/change-password")
async def change_password(
    password_data: PasswordChange,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    修改当前用户密码
    
    Args:
        password_data: 密码修改数据
        current_user: 当前活跃用户
        db: 数据库会话
        
    Returns:
        dict: 修改结果
        
    Raises:
        HTTPException: 400 Bad Request - 当前密码错误
    """
    # 验证当前密码
    if not verify_password(password_data.current_password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="当前密码错误"
        )
    
    # 验证新密码强度
    is_valid, error_msg = validate_password_strength(password_data.new_password)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error_msg
        )
    
    # 更新密码
    current_user.password = get_password_hash(password_data.new_password)

    current_user.must_change_password = False
    
    db.commit()
    
    return {"message": "密码修改成功"}


# ==================== 角色管理 ====================


@router.get("/roles", response_model=RoleListResponse)
async def get_roles(
    name: Optional[str] = Query(None, description="角色名称搜索"),
    code: Optional[str] = Query(None, description="角色代码搜索"),
    is_active: Optional[bool] = Query(None, description="是否激活筛选"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(50, ge=1, le=200, description="每页数量"),
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取角色列表，支持搜索和筛选
    
    Args:
        name: 角色名称搜索（模糊匹配）
        code: 角色代码搜索（模糊匹配）
        is_active: 是否激活筛选
        page: 页码
        page_size: 每页数量
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        RoleListResponse: 角色列表响应
    """
    # 构建查询
    query = db.query(Role)
    
    # 应用搜索条件
    if name:
        query = query.filter(Role.name.like(f"%{name}%"))
    if code:
        query = query.filter(Role.code.like(f"%{code}%"))
    if is_active is not None:
        query = query.filter(Role.is_active == is_active)
    
    # 获取总数
    total = query.count()
    
    # 应用分页
    offset = (page - 1) * page_size
    roles = query.order_by(Role.name).offset(offset).limit(page_size).all()
    
    return RoleListResponse(
        total=total,
        items=roles
    )


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role(
    role_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    获取指定角色信息
    
    Args:
        role_id: 角色ID
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        RoleResponse: 角色信息
        
    Raises:
        HTTPException: 404 Not Found - 角色不存在
    """
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    return role


@router.post("/roles", response_model=RoleResponse)
async def create_role(
    role_data: RoleCreate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    创建新角色
    
    Args:
        role_data: 角色创建数据
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        RoleResponse: 新创建的角色信息
        
    Raises:
        HTTPException: 400 Bad Request - 角色名称或代码已存在
    """
    # 检查角色名称是否已存在
    existing_name = db.query(Role).filter(Role.name == role_data.name).first()
    if existing_name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="角色名称已存在"
        )
    
    # 检查角色代码是否已存在
    existing_code = db.query(Role).filter(Role.code == role_data.code).first()
    if existing_code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="角色代码已存在"
        )
    
    # 创建角色
    db_role = Role(**role_data.model_dump())
    db.add(db_role)
    db.commit()
    db.refresh(db_role)
    
    return db_role


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: str,
    role_data: RoleUpdate,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    更新角色信息
    
    Args:
        role_id: 角色ID
        role_data: 角色更新数据
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        RoleResponse: 更新后的角色信息
        
    Raises:
        HTTPException: 404 Not Found - 角色不存在
        HTTPException: 400 Bad Request - 角色名称或代码已存在
    """
    # 获取角色
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    
    # 检查角色名称是否已被其他角色使用
    if role_data.name and role_data.name != role.name:
        existing_name = db.query(Role).filter(
            Role.name == role_data.name,
            Role.id != role_id
        ).first()
        if existing_name:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="角色名称已存在"
            )
    
    # 检查角色代码是否已被其他角色使用
    if role_data.code and role_data.code != role.code:
        existing_code = db.query(Role).filter(
            Role.code == role_data.code,
            Role.id != role_id
        ).first()
        if existing_code:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="角色代码已存在"
            )
    
    # 更新角色信息
    update_data = role_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(role, field, value)
    
    db.commit()
    db.refresh(role)
    
    return role


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: str,
    current_user: User = Depends(get_current_admin_user),
    db: Session = Depends(get_db)
):
    """
    删除角色
    
    Args:
        role_id: 角色ID
        current_user: 当前管理员用户
        db: 数据库会话
        
    Returns:
        dict: 删除结果
        
    Raises:
        HTTPException: 404 Not Found - 角色不存在
        HTTPException: 400 Bad Request - 角色下存在用户，无法删除
    """
    # 获取角色
    role = db.query(Role).filter(Role.id == role_id).first()
    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="角色不存在"
        )
    
    # 检查角色下是否有用户
    if role.users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="角色下存在用户，无法删除"
        )
    
    # 删除角色
    db.delete(role)
    db.commit()
    
    return {"message": "角色删除成功"}


# ==================== 初始化数据 ====================

@router.post("/init-data")
async def init_system_data(
    db: Session = Depends(get_db)
):
    """
    初始化系统数据，包括默认角色和管理员用户
    
    首次部署时调用此接口创建初始数据。
    系统会创建默认角色和一个临时管理员账户。
    
    Args:
        db: 数据库会话
        
    Returns:
        dict: 初始化结果，包含临时管理员密码
        
    Security:
        - 此接口仅在系统未初始化时可调用
        - 临时密码仅显示一次，请妥善保存
        - 首次登录必须修改密码
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
    
    return {
        "message": "系统数据初始化成功",
        "warning": "请立即使用临时密码登录并修改密码",
        "temp_admin": {
            "username": "admin",
            "temp_password": temp_password,
            "note": "此密码仅显示一次，请妥善保存。首次登录必须修改密码。"
        }
    }
