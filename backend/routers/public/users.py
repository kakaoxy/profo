"""C端公开用户路由.

修改资料、首次设置手机号、修改手机号.
"""

from fastapi import APIRouter, Request

from utils.common import RateLimits, limiter
from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from schemas.public import (
    PublicPhoneCreate,
    PublicPhoneResponse,
    PublicPhoneUpdate,
    PublicProfileUpdate,
    PublicUserProfileResponse,
)
from services.system.user import user_service
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
    updated_user = user_service.update_nickname(db, current_user, body.nickname)

    return PublicUserProfileResponse(
        id=updated_user.id,
        username=updated_user.username,
        nickname=updated_user.nickname,
        phone=mask_phone(updated_user.phone),
        avatar=updated_user.avatar,
        status=updated_user.status,
        created_at=updated_user.created_at,
        updated_at=updated_user.updated_at,
    )


@router.post(
    "/phone",
    summary="首次设置手机号",
    description="C端用户首次绑定手机号，仅当用户尚未绑定手机号时可用；已绑定请使用 PUT /phone",
)
@limiter.limit(RateLimits.PUBLIC_PHONE_CREATE)
def set_initial_phone(
    request: Request,
    body: PublicPhoneCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicPhoneResponse:
    """C端用户首次设置手机号."""
    updated_user = user_service.set_initial_phone(db, current_user, body.phone)

    return PublicPhoneResponse(phone=mask_phone(updated_user.phone))


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
    updated_user = user_service.update_phone_with_verification(
        db, current_user, body.phone, body.password
    )

    return PublicPhoneResponse(phone=mask_phone(updated_user.phone))
