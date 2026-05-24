"""
C端公开认证路由
注册、退出登录、修改资料、修改手机号
"""
from typing import Optional

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.orm import joinedload

from dependencies.auth import DbSessionDep, CurrentCustomerUserDep
from models import User, Role
from services.system.auth import AuthService
from services.system.exceptions import ConflictError, ValidationError
from utils.auth import get_password_hash, verify_password
from utils.formatters import mask_phone
from common import limiter
from schemas.public import (
    PublicRegisterRequest,
    PublicRegisterResponse,
    PublicUserInfo,
    PublicLogoutResponse,
    PublicProfileUpdate,
    PublicUserProfileResponse,
    PublicPhoneUpdate,
    PublicPhoneResponse,
)

router = APIRouter(prefix="/public/auth", tags=["public-auth"])


def _build_user_info(user: User) -> PublicUserInfo:
    return PublicUserInfo(
        id=user.id,
        username=user.username,
        nickname=user.nickname,
        phone=mask_phone(user.phone),
        avatar=user.avatar,
        status=user.status,
        created_at=user.created_at,
    )


@router.post(
    "/register",
    response_model=PublicRegisterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="C端用户注册",
    description="注册C端用户账号，自动分配customer角色",
)
@limiter.limit("10/hour")
def register(request: Request, body: PublicRegisterRequest, db: DbSessionDep):
    """C端用户注册，自动分配customer角色"""
    existing_user = db.query(User).filter(User.username == body.username).first()
    if existing_user:
        raise ConflictError("用户名已被占用")

    if body.phone:
        existing_phone = db.query(User).filter(User.phone == body.phone).first()
        if existing_phone:
            raise ConflictError("手机号已被绑定")

    customer_role = db.query(Role).filter(Role.code == "customer").first()
    if not customer_role:
        raise ValidationError("系统未初始化customer角色")

    db_user = User(
        username=body.username,
        password=get_password_hash(body.password),
        nickname=body.nickname or body.username,
        phone=body.phone,
        role_id=customer_role.id,
        status="active",
    )
    db.add(db_user)
    db.commit()
    db.refresh(db_user)

    token_data = AuthService.create_tokens_for_user(db, db_user)

    return PublicRegisterResponse(
        access_token=token_data["access_token"],
        refresh_token=token_data["refresh_token"],
        token_type=token_data["token_type"],
        expires_in=token_data["expires_in"],
        user=_build_user_info(db_user),
    )


@router.post(
    "/logout",
    response_model=PublicLogoutResponse,
    summary="C端退出登录",
    description="C端用户退出登录（当前JWT无状态机制下，服务端不撤销token，客户端应删除本地存储的token）",
)
@limiter.limit("60/minute")
def logout(request: Request, current_user: CurrentCustomerUserDep):
    """C端退出登录，客户端应清除本地存储的token"""
    return PublicLogoutResponse(message="退出登录成功")


@router.put(
    "/profile",
    response_model=PublicUserProfileResponse,
    summary="修改用户资料",
    description="C端用户修改自己的昵称",
)
@limiter.limit("20/minute")
def update_profile(
    request: Request,
    body: PublicProfileUpdate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
):
    """C端用户修改昵称"""
    current_user.nickname = body.nickname
    db.commit()
    db.refresh(current_user)

    return PublicUserProfileResponse(
        id=current_user.id,
        username=current_user.username,
        nickname=current_user.nickname,
        phone=mask_phone(current_user.phone),
        avatar=current_user.avatar,
        status=current_user.status,
        created_at=current_user.created_at,
        updated_at=current_user.updated_at,
    )


@router.put(
    "/phone",
    response_model=PublicPhoneResponse,
    summary="修改手机号",
    description="C端用户修改手机号，需密码确认身份",
)
@limiter.limit("10/hour")
def update_phone(
    request: Request,
    body: PublicPhoneUpdate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
):
    """C端用户修改手机号，需密码确认身份"""
    if not verify_password(body.password, current_user.password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="密码错误"
        )

    existing_phone = db.query(User).filter(
        User.phone == body.phone,
        User.id != current_user.id
    ).first()
    if existing_phone:
        raise ConflictError("手机号已被其他账号绑定")

    current_user.phone = body.phone
    db.commit()
    db.refresh(current_user)

    return PublicPhoneResponse(phone=mask_phone(current_user.phone))
