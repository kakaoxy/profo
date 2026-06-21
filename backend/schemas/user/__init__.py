"""用户和认证相关的Pydantic模型."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from schemas.response import PaginatedResponse


# =======================================
# 基础模型
# =======================================
class BaseUser(BaseModel):
    """用户基础模型."""

    username: str = Field(min_length=3, max_length=100, description="用户名")
    nickname: str | None = Field(None, max_length=100, description="昵称")
    phone: str | None = Field(None, max_length=20, description="手机号")
    avatar: str | None = Field(None, max_length=500, description="头像")


class BaseRole(BaseModel):
    """角色基础模型."""

    name: str = Field(min_length=2, max_length=100, description="角色名称")
    code: str = Field(min_length=2, max_length=50, description="角色代码")
    description: str | None = Field(None, description="角色描述")
    permissions: list[str] | None = Field(None, description="权限列表")


# =======================================
# 创建和更新模型
# =======================================
class UserCreate(BaseUser):
    """用户创建模型."""

    password: str = Field(min_length=8, max_length=255, description="密码")
    role_id: str = Field(description="角色ID")


class UserUpdate(BaseModel):
    """用户更新模型."""

    nickname: str | None = Field(None, max_length=100, description="昵称")
    phone: str | None = Field(None, max_length=20, description="手机号")
    avatar: str | None = Field(None, max_length=500, description="头像")
    role_id: str | None = Field(None, description="角色ID")
    status: str | None = Field(None, description="用户状态")


class RoleCreate(BaseRole):
    """角色创建模型."""


class RoleUpdate(BaseModel):
    """角色更新模型."""

    name: str | None = Field(None, min_length=2, max_length=100, description="角色名称")
    code: str | None = Field(None, min_length=2, max_length=50, description="角色代码")
    description: str | None = Field(None, description="角色描述")
    permissions: list[str] | None = Field(None, description="权限列表")
    is_active: bool | None = Field(None, description="是否激活")


class PasswordChange(BaseModel):
    """密码修改模型."""

    current_password: str = Field(description="当前密码")
    new_password: str = Field(min_length=8, max_length=255, description="新密码")


class PasswordResetRequest(BaseModel):
    """密码重置请求模型."""

    password: str = Field(min_length=8, max_length=255, description="新密码")


# =======================================
# 登录和认证模型
# =======================================
class LoginRequest(BaseModel):
    """登录请求模型."""

    username: str = Field(description="用户名")
    password: str = Field(description="密码")


class TokenResponse(BaseModel):
    """令牌响应模型."""

    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: "UserResponse" = Field(description="用户信息")


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求模型."""

    refresh_token: str = Field(description="刷新令牌")


class WechatLoginRequest(BaseModel):
    """微信登录请求模型."""

    code: str = Field(description="微信授权码")


class WechatAuthUrlResponse(BaseModel):
    """微信授权 URL 响应模型."""

    auth_url: str = Field(description="微信授权URL")


class ExchangeTokenRequest(BaseModel):
    """临时授权码兑换 Token 请求模型."""

    code: str = Field(description="一次性授权码")


# =======================================
# 响应模型
# =======================================
class RoleResponse(BaseRole):
    """角色响应模型."""

    id: str = Field(description="角色ID")
    is_active: bool = Field(description="是否激活")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseUser):
    """用户响应模型."""

    id: str = Field(description="用户ID")
    role_id: str = Field(description="角色ID")
    role: RoleResponse = Field(description="角色信息")
    status: str = Field(description="用户状态")
    last_login_at: datetime | None = Field(None, description="最后登录时间")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(PaginatedResponse[UserResponse]):
    """用户列表响应模型."""


class UserSimpleResponse(BaseModel):
    """简化用户响应模型 - 用于下拉选择."""

    id: str = Field(description="用户ID")
    nickname: str | None = Field(None, description="昵称")
    username: str = Field(description="用户名")

    model_config = ConfigDict(from_attributes=True)


class UserSimpleListResponse(PaginatedResponse[UserSimpleResponse]):
    """简化用户列表响应模型."""


class RoleListResponse(PaginatedResponse[RoleResponse]):
    """角色列表响应模型."""


# =======================================
# API Key 模型
# =======================================
class ApiKeyCreateResponse(BaseModel):
    """API Key 创建响应模型."""

    api_key: str = Field(description="完整的 API Key（仅显示一次）")
    prefix: str = Field(description="Key 前缀")
    created_at: datetime = Field(description="创建时间")
    expires_at: datetime | None = Field(None, description="过期时间")

    model_config = ConfigDict(from_attributes=True)


class ApiKeyInfoResponse(BaseModel):
    """API Key 信息响应模型."""

    id: str = Field(description="Key ID")
    prefix: str = Field(description="Key 前缀")
    status: str = Field(description="Key 状态")
    created_at: datetime = Field(description="创建时间")
    last_used_at: datetime | None = Field(None, description="最后使用时间")
    expires_at: datetime | None = Field(None, description="过期时间")

    model_config = ConfigDict(from_attributes=True)


TokenResponse.model_rebuild()


__all__ = [
    "ApiKeyCreateResponse",
    "ApiKeyInfoResponse",
    "ExchangeTokenRequest",
    "LoginRequest",
    "PasswordChange",
    "PasswordResetRequest",
    "RefreshTokenRequest",
    "RoleCreate",
    "RoleListResponse",
    "RoleResponse",
    "RoleUpdate",
    "TokenResponse",
    "UserCreate",
    "UserListResponse",
    "UserResponse",
    "UserSimpleListResponse",
    "UserSimpleResponse",
    "UserUpdate",
    "WechatAuthUrlResponse",
    "WechatLoginRequest",
]
