"""
用户和认证相关的Pydantic模型
"""
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict

from ..response import PaginatedResponse


# =======================================
# 基础模型
# =======================================
class BaseUser(BaseModel):
    """用户基础模型"""
    username: str = Field(min_length=3, max_length=100, description="用户名")
    nickname: Optional[str] = Field(None, max_length=100, description="昵称")
    phone: Optional[str] = Field(None, max_length=20, description="手机号")
    avatar: Optional[str] = Field(None, max_length=500, description="头像")


class BaseRole(BaseModel):
    """角色基础模型"""
    name: str = Field(min_length=2, max_length=100, description="角色名称")
    code: str = Field(min_length=2, max_length=50, description="角色代码")
    description: Optional[str] = Field(None, description="角色描述")
    permissions: Optional[List[str]] = Field(None, description="权限列表")


# =======================================
# 创建和更新模型
# =======================================
class UserCreate(BaseUser):
    """用户创建模型"""
    password: str = Field(min_length=6, max_length=255, description="密码")
    role_id: str = Field(description="角色ID")


class UserUpdate(BaseModel):
    """用户更新模型"""
    nickname: Optional[str] = Field(None, max_length=100, description="昵称")
    phone: Optional[str] = Field(None, max_length=20, description="手机号")
    avatar: Optional[str] = Field(None, max_length=500, description="头像")
    role_id: Optional[str] = Field(None, description="角色ID")
    status: Optional[str] = Field(None, description="用户状态")


class RoleCreate(BaseRole):
    """角色创建模型"""
    pass


class RoleUpdate(BaseModel):
    """角色更新模型"""
    name: Optional[str] = Field(None, min_length=2, max_length=100, description="角色名称")
    code: Optional[str] = Field(None, min_length=2, max_length=50, description="角色代码")
    description: Optional[str] = Field(None, description="角色描述")
    permissions: Optional[List[str]] = Field(None, description="权限列表")
    is_active: Optional[bool] = Field(None, description="是否激活")


class PasswordChange(BaseModel):
    """密码修改模型"""
    current_password: str = Field(description="当前密码")
    new_password: str = Field(min_length=8, max_length=255, description="新密码")


class PasswordResetRequest(BaseModel):
    """密码重置请求模型"""
    password: str = Field(min_length=8, max_length=255, description="新密码")


# =======================================
# 登录和认证模型
# =======================================
class LoginRequest(BaseModel):
    """登录请求模型"""
    username: str = Field(description="用户名")
    password: str = Field(description="密码")


class TokenResponse(BaseModel):
    """令牌响应模型"""
    access_token: str = Field(description="访问令牌")
    refresh_token: str = Field(description="刷新令牌")
    token_type: str = Field(description="令牌类型")
    expires_in: int = Field(description="访问令牌过期时间(秒)")
    user: "UserResponse" = Field(description="用户信息")


class RefreshTokenRequest(BaseModel):
    """刷新令牌请求模型"""
    refresh_token: str = Field(description="刷新令牌")


class WechatLoginRequest(BaseModel):
    """微信登录请求模型"""
    code: str = Field(description="微信授权码")


# =======================================
# 响应模型
# =======================================
class RoleResponse(BaseRole):
    """角色响应模型"""
    id: str = Field(description="角色ID")
    is_active: bool = Field(description="是否激活")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseUser):
    """用户响应模型"""
    id: str = Field(description="用户ID")
    role_id: str = Field(description="角色ID")
    role: RoleResponse = Field(description="角色信息")
    status: str = Field(description="用户状态")
    last_login_at: Optional[datetime] = Field(None, description="最后登录时间")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class UserListResponse(PaginatedResponse[UserResponse]):
    """用户列表响应模型"""
    pass


class UserSimpleResponse(BaseModel):
    """简化用户响应模型 - 用于下拉选择"""
    id: str = Field(description="用户ID")
    nickname: Optional[str] = Field(None, description="昵称")
    username: str = Field(description="用户名")

    model_config = ConfigDict(from_attributes=True)


class UserSimpleListResponse(PaginatedResponse[UserSimpleResponse]):
    """简化用户列表响应模型"""
    pass


class RoleListResponse(PaginatedResponse[RoleResponse]):
    """角色列表响应模型"""
    pass


TokenResponse.model_rebuild()


__all__ = [
    'UserCreate',
    'UserUpdate',
    'UserResponse',
    'UserListResponse',
    'UserSimpleResponse',
    'UserSimpleListResponse',
    'PasswordChange',
    'PasswordResetRequest',
    'RoleCreate',
    'RoleUpdate',
    'RoleResponse',
    'RoleListResponse',
    'LoginRequest',
    'TokenResponse',
    'RefreshTokenRequest',
    'WechatLoginRequest',
]