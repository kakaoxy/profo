"""C端公开用户路由.

修改资料、修改手机号.
"""

from fastapi import APIRouter, Request

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.public import (
    PublicPhoneResponse,
    PublicPhoneUpdate,
    PublicProfileUpdate,
    PublicUserProfileResponse,
)
from services.system.exceptions import AuthenticationError
from services.system.user import user_service
from utils.auth import verify_password
from utils.formatters import mask_phone

router = APIRouter(prefix="/public/users", tags=["public-users"])


@router.put(
    "/profile",
    summary="修改用户资料",
    description="C端用户修改自己的昵称",
)
@limiter.limit(RateLimits.PUBLIC_PROFILE_UPDATE)
def update_profile(
    request: Request,
    body: PublicProfileUpdate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicUserProfileResponse:
    """C端用户修改昵称."""
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
    summary="修改手机号",
    description="C端用户修改手机号，需密码确认身份",
)
@limiter.limit(RateLimits.PUBLIC_PHONE_UPDATE)
def update_phone(
    request: Request,
    body: PublicPhoneUpdate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicPhoneResponse:
    """C端用户修改手机号，需密码确认身份."""
    if not verify_password(body.password, current_user.password):
        msg = "密码错误"
        raise AuthenticationError(msg)

    user_service.check_phone_taken_by_other(db, body.phone, current_user.id)

    current_user.phone = body.phone
    db.commit()

    return PublicPhoneResponse(phone=mask_phone(current_user.phone))
