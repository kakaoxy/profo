"""C端公开用户路由.

修改资料、首次设置手机号、修改手机号、微信手机号绑定、临时账号合并.
"""

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse

from constants.role_codes import RoleCode
from dependencies.auth import CurrentCustomerUserDep, DbSessionDep
from models import User
from schemas.public import (
    PublicLoginResponse,
    PublicPhoneCreate,
    PublicPhoneResponse,
    PublicPhoneUpdate,
    PublicProfileUpdate,
    PublicUserInfo,
    PublicUserProfileResponse,
)
from schemas.user import MergeAccountRequest, PhoneWechatBindRequest
from services.system.auth import AuthService
from services.system.exceptions import (
    AccountAlreadyMergedError,
    AuthenticationError,
    PermissionDeniedError,
    PhoneTakenByMainAccountError,
    TargetHasWechatError,
)
from services.system.user import user_service
from utils.auth import AUDIENCE_C
from utils.common import RateLimits, limiter
from utils.formatters import mask_phone

router = APIRouter(prefix="/public/users", tags=["public-users"])


def _build_public_user_info(user: User) -> PublicUserInfo:
    """构建 C 端用户公开信息（permissions 默认空列表，与 register/login 行为一致）."""
    return PublicUserInfo(
        id=user.id,
        username=user.username,
        nickname=user.nickname,
        phone=mask_phone(user.phone),
        avatar=user.avatar,
        status=user.status,
        created_at=user.created_at,
    )


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
    response_model=PublicPhoneResponse,
    summary="首次设置手机号",
    description="C端用户首次绑定手机号，仅当用户尚未绑定手机号时可用；已绑定请使用 PUT /phone",
    responses={
        200: {"description": "绑定成功或手机号已被主账号占用（业务码 40901）"},
    },
)
@limiter.limit(RateLimits.PUBLIC_PHONE_CREATE)
def set_initial_phone(
    request: Request,
    body: PublicPhoneCreate,
    current_user: CurrentCustomerUserDep,
    db: DbSessionDep,
) -> PublicPhoneResponse | JSONResponse:
    """C端用户首次设置手机号.

    若手机号已被其他主账号（is_temporary=False）占用，返回 HTTP 200 + 业务码 40901，
    前端据此展示合并确认视图。这与 AGENTS.md「错误响应统一 {"code":≠0,...}」不冲突——
    业务冲突是「请求成功处理但发现业务冲突」，非「请求处理失败」，用 HTTP 200 + body.code
    让前端 request.ts 能按 body 解析业务码（非 2xx 会被 reject）。
    """
    try:
        updated_user = user_service.set_initial_phone(db, current_user, body.phone)
    except PhoneTakenByMainAccountError as e:
        return JSONResponse(
            status_code=200,
            content={
                "code": 40901,
                "message": "PHONE_TAKEN_BY_MAIN_ACCOUNT",
                "target_user_hint": e.target_user_hint,
            },
        )
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
        db,
        current_user,
        body.phone,
        body.password,
    )

    return PublicPhoneResponse(phone=mask_phone(updated_user.phone))


@router.post(
    "/merge",
    response_model=PublicLoginResponse,
    summary="合并临时账号到主账号",
    description="将当前临时账号合并到目标主账号，迁移业务数据并签发主账号令牌",
    responses={
        400: {"description": "非临时账号或目标账号不符合合并条件"},
        401: {"description": "凭证错误"},
        409: {"description": "目标账号已绑定其他微信"},
    },
)
@limiter.limit(RateLimits.PUBLIC_USER_MERGE)
async def merge_account(
    request: Request,
    payload: MergeAccountRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> PublicLoginResponse | JSONResponse:
    """将当前临时账号合并到目标主账号.

    流程：
    1. 校验当前用户 is_temporary=True
    2. 按 type 验证凭证（internal=工号+密码；phone=短信验证码 ⚠️未实现）
    3. 检查目标账号 status='active' 且 is_temporary=False
    4. 调 merge_accounts 迁移业务数据（捕获 TargetHasWechatError → 40902）
    5. 签发主账号令牌（内部员工双端 admin+c，外部用户仅 C 端）
    """
    # 1. 校验当前用户为临时账号
    if not current_user.is_temporary:
        return JSONResponse(
            status_code=400,
            content={"code": 40003, "message": "NOT_TEMPORARY_ACCOUNT"},
        )

    # 2. 按 type 验证凭证
    if payload.type == "internal":
        try:
            target_user = await run_in_threadpool(
                AuthService.authenticate_user,
                db,
                payload.username,
                payload.password,
            )
        except (AuthenticationError, PermissionDeniedError):
            return JSONResponse(
                status_code=401,
                content={"code": 40001, "message": "INVALID_CREDENTIALS"},
            )
    else:
        # ⚠️ 短信验证码校验逻辑尚未实现（代码库中无 SMS 服务）
        # 临时返回 400，前端暂不支持 phone 分支
        return JSONResponse(
            status_code=400,
            content={"code": 40002, "message": "SMS_VERIFICATION_NOT_IMPLEMENTED"},
        )

    # 3. 检查目标账号状态
    if target_user.status != "active" or target_user.is_temporary:
        return JSONResponse(
            status_code=400,
            content={"code": 40004, "message": "TARGET_ACCOUNT_NOT_ELIGIBLE"},
        )

    # 不能合并到自己
    if target_user.id == current_user.id:
        return JSONResponse(
            status_code=400,
            content={"code": 40005, "message": "CANNOT_MERGE_TO_SELF"},
        )

    # 4. 调 merge_accounts 迁移业务数据
    try:
        await run_in_threadpool(user_service.merge_accounts, db, current_user, target_user)
    except TargetHasWechatError:
        return JSONResponse(
            status_code=409,
            content={"code": 40902, "message": "TARGET_ACCOUNT_HAS_OTHER_WECHAT"},
        )
    except AccountAlreadyMergedError:
        # 并发合并：另一事务已先完成合并，当前请求放弃以避免数据/重定向不一致
        return JSONResponse(
            status_code=409,
            content={"code": 40903, "message": "ACCOUNT_ALREADY_MERGED"},
        )

    # 5. 签发主账号令牌
    if AuthService.has_backend_identity(target_user):
        # 内部员工：签发 admin 令牌 + C 端令牌（双端）
        # admin 令牌供后台接口使用，C 端令牌供 /public/* 接口使用
        admin_result = await run_in_threadpool(
            AuthService.create_tokens_for_user,
            db,
            target_user,
            force_temp_token=False,
        )
        c_result = await run_in_threadpool(
            AuthService.create_tokens_for_user,
            db,
            target_user,
            audience=AUDIENCE_C,
            role_claim=RoleCode.CUSTOMER.value,
            update_login_time=False,
        )
        return PublicLoginResponse(
            access_token=admin_result["access_token"],
            refresh_token=admin_result["refresh_token"],
            token_type=admin_result["token_type"],
            expires_in=admin_result["expires_in"],
            c_access_token=c_result["access_token"],
            c_refresh_token=c_result["refresh_token"],
            user=_build_public_user_info(target_user),
        )

    # 外部用户：仅签发 C 端令牌
    c_result = await run_in_threadpool(
        AuthService.create_tokens_for_user,
        db,
        target_user,
        audience=AUDIENCE_C,
        role_claim=RoleCode.CUSTOMER.value,
    )
    return PublicLoginResponse(
        access_token=c_result["access_token"],
        refresh_token=c_result["refresh_token"],
        token_type=c_result["token_type"],
        expires_in=c_result["expires_in"],
        user=_build_public_user_info(target_user),
    )


@router.post(
    "/phone/wechat",
    response_model=None,
    summary="微信手机号授权绑定",
    description="用 wx.getPhoneNumber 的 code 换取手机号并绑定；若手机号已被主账号占用返回业务码 40901",
    responses={
        200: {"description": "绑定成功或手机号已被主账号占用（业务码 40901）"},
    },
)
@limiter.limit(RateLimits.PUBLIC_PHONE_WECHAT)
async def bind_phone_via_wechat(
    request: Request,
    payload: PhoneWechatBindRequest,
    db: DbSessionDep,
    current_user: CurrentCustomerUserDep,
) -> dict | JSONResponse:
    """微信手机号授权绑定.

    bind_phone_via_wechat 是同步阻塞方法（调微信 API），必须放线程池。
    手机号被主账号占用时返回 HTTP 200 + 业务码 40901（与 /phone 端点策略一致）。
    """
    try:
        result = await run_in_threadpool(
            user_service.bind_phone_via_wechat,
            db,
            current_user,
            payload.code,
        )
    except PhoneTakenByMainAccountError as e:
        return JSONResponse(
            status_code=200,
            content={
                "code": 40901,
                "message": "PHONE_TAKEN_BY_MAIN_ACCOUNT",
                "target_user_hint": e.target_user_hint,
            },
        )
    return result
