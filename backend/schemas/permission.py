"""权限相关 Pydantic 模型."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from schemas.response import PaginatedResponse


class PermissionBase(BaseModel):
    """权限基础模型."""

    code: str = Field(min_length=2, max_length=100, description="权限代码，格式 module:action")
    name: str = Field(min_length=1, max_length=100, description="权限名称")
    module: str = Field(min_length=1, max_length=50, description="所属模块")
    category: Literal["menu", "button", "api"] = Field(description="权限类别")
    sort_order: int = Field(default=0, ge=0, description="排序序号")
    description: str | None = Field(None, max_length=255, description="权限描述")


class PermissionCreate(PermissionBase):
    """权限创建模型.

    注意：is_system 不暴露给 API 调用方，由服务层强制设为 False，
    防止通过 API 注入不可删除的系统权限点。
    """


class PermissionUpdate(BaseModel):
    """权限更新模型（所有字段可选）."""

    name: str | None = Field(None, min_length=1, max_length=100, description="权限名称")
    module: str | None = Field(None, min_length=1, max_length=50, description="所属模块")
    category: Literal["menu", "button", "api"] | None = Field(None, description="权限类别")
    sort_order: int | None = Field(None, ge=0, description="排序序号")
    description: str | None = Field(None, max_length=255, description="权限描述")


class PermissionResponse(PermissionBase):
    """权限响应模型."""

    id: str = Field(description="权限ID")
    is_system: bool = Field(description="是否系统内置权限点")
    created_at: datetime = Field(description="创建时间")
    updated_at: datetime = Field(description="更新时间")

    model_config = ConfigDict(from_attributes=True)


class PermissionFilter(BaseModel):
    """权限查询过滤模型."""

    module: str | None = Field(None, description="按模块过滤")
    category: Literal["menu", "button", "api"] | None = Field(None, description="按类别过滤")
    is_system: bool | None = Field(None, description="按是否系统权限过滤")


class PermissionModuleGroup(BaseModel):
    """按模块分组的权限响应模型."""

    module: str = Field(description="模块名称")
    permissions: list[PermissionResponse] = Field(description="该模块下的权限列表")


class PermissionListResponse(PaginatedResponse[PermissionResponse]):
    """权限列表响应模型."""


class RolePermissionsUpdate(BaseModel):
    """角色权限更新模型."""

    permission_codes: list[str] = Field(description="权限代码列表（全量替换）")


class RolePermissionsResponse(BaseModel):
    """角色权限响应模型."""

    role_id: str = Field(description="角色ID")
    permission_codes: list[str] = Field(description="权限代码列表")


__all__ = [
    "PermissionBase",
    "PermissionCreate",
    "PermissionFilter",
    "PermissionListResponse",
    "PermissionModuleGroup",
    "PermissionResponse",
    "PermissionUpdate",
    "RolePermissionsResponse",
    "RolePermissionsUpdate",
]
