"""
C端公开认证路由
注册、退出登录
"""
from fastapi import APIRouter, Request, status

from dependencies.auth import DbSessionDep, CurrentCustomerUserDep
from models import User, Role
from services.system.auth import AuthService
from services.system.exceptions import ValidationError
from utils.auth import get_password_hash
from utils.formatters import mask_phone
from common import limiter
from schemas.public import (
    PublicRegisterRequest,
    PublicRegisterResponse,
    PublicUserInfo,
    PublicLogoutResponse,
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
        raise ValidationError("用户名已被占用")

    if body.phone:
        existing_phone = db.query(User).filter(User.phone == body.phone).first()
        if existing_phone:
            raise ValidationError("手机号已被绑定")

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
