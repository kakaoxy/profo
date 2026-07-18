"""认证相关依赖注入函数."""

from collections.abc import Callable
from typing import Annotated

from fastapi import Depends, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from constants.role_codes import INTERNAL_ROLE_CODES, RoleCode
from db import get_db
from models import User
from services.system import ApiKeyService
from services.system.auth import AuthService
from services.system.exceptions import AuthenticationError, PermissionDeniedError
from settings import settings
from utils.auth import AUDIENCE_ADMIN, AUDIENCE_C

# OAuth2密码承载器，用于从请求头中获取token
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.api_prefix}/v1/auth/token",
    auto_error=False,  # 允许token缺失，以便我们从cookie中读取
)

# 类型别名定义
DbSessionDep = Annotated[Session, Depends(get_db)]

# 后台内部角色：API Key 生成与使用仅限这些角色
# 注意：与 services/system/auth.py 的 BACKEND_ROLE_CODES 不同。
#   BACKEND_ROLE_CODES = {admin, operator, user}  → 后台登录允许的角色（含 user）
#   INTERNAL_ROLE_CODES = {admin, operator}        → API Key 机器接口仅限内部角色（不含 user）
# C 端 user 角色可登录后台但不允许生成/使用 API Key 调用机器接口。
# 角色码集合定义在 constants.role_codes.INTERNAL_ROLE_CODES。


def _infer_audience_from_path(path: str) -> str:
    """根据请求路径推断期望的 Token 受众.

    /api/v1/public/* -> C 端 (aud=c)
    其他 -> 后台 (aud=admin)

    """
    if path.startswith(f"{settings.api_prefix}/v1/public"):
        return AUDIENCE_C
    return AUDIENCE_ADMIN


async def _authenticate_by_api_key(db: DbSessionDep, api_key: str) -> User:
    """通过 API Key 认证并校验后台内部角色（私有 helper）.

    供 require_api_key 与 get_current_user 的 API Key 回退分支共用，
    避免认证 + 角色校验逻辑重复。

    Raises:
        AuthenticationError: API Key 无效
        PermissionDeniedError: API Key 对应用户无权使用机器接口

    """
    try:
        # 使用run_in_threadpool调用同步的数据库操作
        user = await run_in_threadpool(ApiKeyService.authenticate_by_api_key, db, api_key)
    except Exception:  # noqa: BLE001
        msg = "API Key 无效"
        raise AuthenticationError(msg) from None
    # 角色二次校验：仅允许后台内部角色
    if not _user_has_any_role(user, set(INTERNAL_ROLE_CODES)):
        msg = "该账号无权使用 API Key 调用机器接口"
        raise PermissionDeniedError(msg)
    return user


async def require_api_key(
    request: Request,
    db: DbSessionDep,
) -> User:
    """仅通过 API Key 认证用户（且必须是后台内部角色）.

    不接受 JWT Token，专用于机器对机器的 API 调用.
    仅允许 admin/operator 角色的用户生成的 API Key 认证，避免 C 端用户通过 API Key 调用内部接口.

    Args:
        request: FastAPI请求对象
        db: 数据库会话

    Returns:
        User: 当前用户对象

    Raises:
        AuthenticationError: 401 Unauthorized - API Key 无效或缺失
        PermissionDeniedError: 403 Forbidden - API Key 对应用户无权使用机器接口

    """
    # 只接受 X-API-Key Header
    api_key = request.headers.get("X-API-Key")
    if not api_key:
        msg = "需要提供有效的 API Key"
        raise AuthenticationError(msg)
    return await _authenticate_by_api_key(db, api_key)


# API Key 认证依赖类型
ApiKeyAuthDep = Annotated[User, Depends(require_api_key)]


async def get_current_user(
    request: Request,
    db: DbSessionDep,
    token_from_header: str | None = Depends(oauth2_scheme),
) -> User:
    """获取当前用户.

    认证顺序：
    1. JWT Token (Authorization Header Bearer 或与目标系统匹配的 cookie)
    2. API Key (X-API-Key Header) — 仅当无 JWT 时

    按请求路径推断受众（C端 c / 后台 admin），仅读取对应系统的 cookie，
    避免浏览器同时登录两套系统时的交叉误认。

    Args:
        request: FastAPI请求对象
        db: 数据库会话
        token_from_header: 从Authorization Header获取的token

    Returns:
        User: 当前用户对象

    Raises:
        AuthenticationError: 401 Unauthorized - 令牌无效或用户不存在

    """
    expected_audience = _infer_audience_from_path(request.url.path)

    # 优先从Header获取JWT token
    token = token_from_header

    # 按目标系统选择对应 cookie，避免交叉误认
    if expected_audience == AUDIENCE_C:
        cookie_token = request.cookies.get("c_access_token")
    else:
        cookie_token = request.cookies.get("access_token")

    if token is None:
        if cookie_token is not None:
            try:
                # 按目标系统校验受众
                return await run_in_threadpool(
                    AuthService.authenticate_by_token,
                    db,
                    cookie_token,
                    expected_audience,
                )
            except AuthenticationError:
                msg = "无法验证凭据"
                raise AuthenticationError(msg) from None
    else:
        # Header token — 校验受众，避免C端Token用于后台或反之
        try:
            return await run_in_threadpool(
                AuthService.authenticate_by_token,
                db,
                token,
                expected_audience,
            )
        except AuthenticationError:
            msg = "无法验证凭据"
            raise AuthenticationError(msg) from None

    # 如果没有JWT token，尝试从X-API-Key Header获取API Key
    api_key = request.headers.get("X-API-Key")
    if api_key:
        return await _authenticate_by_api_key(db, api_key)

    # 没有任何认证信息
    msg = "无法验证凭据"
    raise AuthenticationError(msg)


# 当前用户依赖类型
CurrentUserDep = Annotated[User, Depends(get_current_user)]


def get_current_active_user(
    current_user: CurrentUserDep,
) -> User:
    """获取当前活跃用户.

    Args:
        current_user: 当前用户对象

    Returns:
        User: 当前活跃用户对象

    Raises:
        PermissionDeniedError: 403 Forbidden - 用户未激活

    """
    if current_user.status != "active":
        msg = "用户未激活"
        raise PermissionDeniedError(msg)

    return current_user


# 当前活跃用户依赖类型
CurrentActiveUserDep = Annotated[User, Depends(get_current_active_user)]


def _user_has_any_role(user: User, required: set[str]) -> bool:
    """判断用户主角色或附加角色是否命中任一 required 角色代码.

    Args:
        user: 用户对象（需有 role 与 roles 关系）
        required: 需要的角色代码集合

    Returns:
        True 表示任一角色命中，False 表示全部未命中

    """
    user_role_codes: set[str] = set()
    if user.role and user.role.code:
        user_role_codes.add(user.role.code)
    for r in user.roles or []:
        if r.code:
            user_role_codes.add(r.code)
    return bool(user_role_codes & required)


def require_roles(required_roles: list[str]) -> Callable[..., User]:
    """角色检查依赖工厂函数.

    Args:
        required_roles: 允许的角色列表

    Returns:
        依赖函数，用于检查用户角色

    """

    def role_checker(user: CurrentActiveUserDep) -> User:
        if not _user_has_any_role(user, set(required_roles)):
            msg = "权限不足"
            raise PermissionDeniedError(msg)
        return user

    return role_checker


# 预定义的角色依赖类型
CurrentAdminUserDep = Annotated[User, Depends(require_roles(["admin"]))]
CurrentOperatorUserDep = Annotated[User, Depends(require_roles(["admin", "operator"]))]
CurrentInternalUserDep = Annotated[User, Depends(require_roles(["admin", "operator"]))]
CurrentCustomerUserDep = Annotated[User, Depends(require_roles(["customer"]))]


# ==================== 权限校验（基于权限码） ====================


def has_permission(user: User, code: str, db: Session) -> bool:
    """判断用户是否拥有指定权限（非抛异常版）.

    每次请求直接查数据库计算用户有效权限集合（主角色 + 附加角色权限并集）。

    Args:
        user: 用户对象
        code: 权限代码（如 "user:delete"）
        db: 数据库会话

    Returns:
        True 表示拥有权限，False 表示无权限

    """
    from services.system.permission import permission_service  # noqa: PLC0415

    perms = permission_service.get_user_permission_codes(db, user)
    return code in perms


def require_permission(code: str) -> Callable[..., User]:
    """权限检查依赖工厂函数.

    与 ``require_roles`` 类似，但基于权限码而非角色码。
    每次请求查数据库计算用户有效权限集合（主角色 + 附加角色权限并集）。

    Args:
        code: 需要的权限代码（如 "user:delete"）

    Returns:
        依赖函数，用于检查用户权限

    Raises:
        PermissionDeniedError: 403 Forbidden - 用户无该权限

    """

    def permission_checker(
        user: CurrentActiveUserDep,
        db: DbSessionDep,
    ) -> User:
        if not has_permission(user, code, db):
            msg = f"权限不足：缺少权限 {code}"
            raise PermissionDeniedError(msg)
        return user

    return permission_checker


# 预定义的权限依赖类型（按需扩展，Task 9 将逐步替换 CurrentAdminUserDep）
# user 模块
UserReadPermDep = Annotated[User, Depends(require_permission("user:read"))]
UserCreatePermDep = Annotated[User, Depends(require_permission("user:create"))]
UserUpdatePermDep = Annotated[User, Depends(require_permission("user:update"))]
UserDeletePermDep = Annotated[User, Depends(require_permission("user:delete"))]
UserResetPasswordPermDep = Annotated[User, Depends(require_permission("user:reset_password"))]
# role 模块
RoleReadPermDep = Annotated[User, Depends(require_permission("role:read"))]
RoleUpdatePermDep = Annotated[User, Depends(require_permission("role:update"))]
RoleCreatePermDep = Annotated[User, Depends(require_permission("role:create"))]
RoleDeletePermDep = Annotated[User, Depends(require_permission("role:delete"))]
RoleAssignPermissionsPermDep = Annotated[User, Depends(require_permission("role:assign_permissions"))]
# permission 模块
PermissionReadPermDep = Annotated[User, Depends(require_permission("permission:read"))]
PermissionManagePermDep = Annotated[User, Depends(require_permission("permission:manage"))]
# property 模块
PropertyReadPermDep = Annotated[User, Depends(require_permission("property:read"))]
PropertyWritePermDep = Annotated[User, Depends(require_permission("property:write"))]
PropertyUploadPermDep = Annotated[User, Depends(require_permission("property:upload"))]
# project 模块
ProjectReadPermDep = Annotated[User, Depends(require_permission("project:read"))]
ProjectWritePermDep = Annotated[User, Depends(require_permission("project:write"))]
# project 业务身份子权限码（仅 admin/operator 持有，user 由业务身份豁免）
ProjectSalesManageTeamPermDep = Annotated[User, Depends(require_permission("project:sales:manage_team"))]
# operation_log 模块
OperationLogReadPermDep = Annotated[User, Depends(require_permission("operation_log:read"))]


# ==================== 业务身份双通道校验 ====================


def _check_business_identity(
    db: Session,
    project_id: str,
    code: str,
    user_id: str,
) -> bool:
    """业务身份校验：根据权限码前缀路由到不同的身份检查逻辑.

    Args:
        db: 数据库会话
        project_id: 项目ID（来自路径参数）
        code: 权限码（用于路由身份检查类型）
        user_id: 当前用户ID

    Returns:
        True 表示业务身份匹配，False 表示不匹配

    """
    # lazy import 规避 dependencies.auth → models.project → models 循环依赖
    from models import ProjectRenovation, ProjectSale  # noqa: PLC0415

    if code.startswith("project:renovation:"):
        renovation = (
            db.query(ProjectRenovation)
            .filter(
                ProjectRenovation.project_id == project_id,
                ProjectRenovation.is_deleted.is_(False),
            )
            .first()
        )
        return renovation is not None and renovation.contact_person_id == user_id
    if code.startswith("project:sales:"):
        sale = (
            db.query(ProjectSale)
            .filter(
                ProjectSale.project_id == project_id,
                ProjectSale.is_deleted.is_(False),
            )
            .first()
        )
        if sale is None:
            return False
        return user_id in {sale.channel_manager_id, sale.property_agent_id, sale.negotiator_id}
    return False


def require_project_business_permission(
    code: str,
    project_id_param: str = "project_id",
) -> Callable[..., User]:
    """业务身份双通道权限校验工厂.

    校验链路：
    1. 权限码校验：admin 通过 project:write 放行；operator 通过子权限码放行；
    2. 业务身份校验：user 角色通过 contact_person_id / 销售团队成员字段放行；
    3. 都不通过 → 403 PermissionDeniedError.

    Args:
        code: 业务子权限码（如 "project:renovation:upload_photo"）
        project_id_param: 路径参数名（默认 "project_id"）

    Returns:
        依赖函数，返回当前用户

    Raises:
        PermissionDeniedError: 403 Forbidden - 权限不足且非项目业务身份

    """

    def permission_checker(
        request: Request,
        db: DbSessionDep,
        current_user: Annotated[User, Depends(get_current_active_user)],
    ) -> User:
        # 1. 权限码校验：子权限码 或 project:write 任一通过即放行
        if has_permission(current_user, code, db) or has_permission(current_user, "project:write", db):
            return current_user

        # 2. user 角色业务身份校验（admin/operator 已通过权限码放行，此处仅 user 命中）
        if current_user.role and current_user.role.code == RoleCode.USER.value:
            project_id = request.path_params.get(project_id_param)
            if project_id and _check_business_identity(db, str(project_id), code, str(current_user.id)):
                return current_user

        # 3. 都不通过 → 403
        msg = f"权限不足：缺少权限 {code} 且非项目业务身份"
        raise PermissionDeniedError(msg)

    return permission_checker


# project 业务身份权限依赖类型（基于 require_project_business_permission 工厂）
ProjectRenovationUploadPhotoPermDep = Annotated[
    User, Depends(require_project_business_permission("project:renovation:upload_photo", "project_id"))
]
ProjectRenovationCompleteStagePermDep = Annotated[
    User, Depends(require_project_business_permission("project:renovation:complete_stage", "project_id"))
]
ProjectSalesAddRecordPermDep = Annotated[
    User, Depends(require_project_business_permission("project:sales:add_record", "project_id"))
]


__all__ = [
    "ApiKeyAuthDep",
    "CurrentActiveUserDep",
    "CurrentAdminUserDep",
    "CurrentCustomerUserDep",
    "CurrentInternalUserDep",
    "CurrentOperatorUserDep",
    "CurrentUserDep",
    # 类型别名
    "DbSessionDep",
    "OperationLogReadPermDep",
    "PermissionManagePermDep",
    "PermissionReadPermDep",
    "ProjectReadPermDep",
    "ProjectRenovationCompleteStagePermDep",
    "ProjectRenovationUploadPhotoPermDep",
    "ProjectSalesAddRecordPermDep",
    "ProjectSalesManageTeamPermDep",
    "ProjectWritePermDep",
    "PropertyReadPermDep",
    "PropertyUploadPermDep",
    "PropertyWritePermDep",
    "RoleAssignPermissionsPermDep",
    "RoleCreatePermDep",
    "RoleDeletePermDep",
    "RoleReadPermDep",
    "RoleUpdatePermDep",
    "UserCreatePermDep",
    "UserDeletePermDep",
    "UserReadPermDep",
    "UserResetPasswordPermDep",
    "UserUpdatePermDep",
    # 依赖函数
    "get_current_active_user",
    "get_current_user",
    "has_permission",
    "require_api_key",
    "require_permission",
    "require_project_business_permission",
    "require_roles",
]
