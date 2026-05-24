"""
C端公开用户路由
修改资料、修改手机号
"""
from fastapi import APIRouter, Request

from dependencies.auth import DbSessionDep, CurrentCustomerUserDep
from models import User
from services.system.exceptions import AuthenticationError, ValidationError
from utils.auth import verify_password
from utils.formatters import mask_phone
from common import limiter
from schemas.public import (
    PublicProfileUpdate,
    PublicUserProfileResponse,
    PublicPhoneUpdate,
    PublicPhoneResponse,
)

router = APIRouter(prefix="/public/users", tags=["public-users"])


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
        raise AuthenticationError("密码错误")

    existing_phone = db.query(User).filter(
        User.phone == body.phone,
        User.id != current_user.id
    ).first()
    if existing_phone:
        raise ValidationError("手机号已被其他账号绑定")

    current_user.phone = body.phone
    db.commit()

    return PublicPhoneResponse(phone=mask_phone(current_user.phone))
