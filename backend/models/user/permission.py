"""权限模型.

定义权限点（菜单/按钮/接口）及角色-权限关联表。
"""

import enum

from sqlalchemy import (
    Boolean,
    Column,
    DateTime,
    Integer,
    String,
    Table,
    func,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base, BaseModel


class PermissionCategory(str, enum.Enum):
    """权限类别枚举."""

    MENU = "menu"  # 菜单
    BUTTON = "button"  # 按钮
    API = "api"  # 接口


class Permission(BaseModel):
    """权限模型.

    定义系统中的权限点，按 module:action 格式编码，
    支持菜单/按钮/接口三种类别。
    """

    __tablename__ = "permissions"

    code: Mapped[str] = mapped_column(
        String(100),
        unique=True,
        index=True,
        nullable=False,
        comment="权限代码，格式 module:action",
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="权限名称")
    module: Mapped[str] = mapped_column(String(50), index=True, nullable=False, comment="所属模块")
    category: Mapped[PermissionCategory] = mapped_column(
        # 使用 .value（小写 menu/button/api）作为 DB 存储值，与迁移脚本插入的小写字面量保持一致
        # 默认 SQLEnum 使用枚举 name（大写 MENU/BUTTON/API），会导致 LookupError
        SQLEnum(PermissionCategory, length=20, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        comment="权限类别：菜单/按钮/接口",
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False, comment="排序序号")
    is_system: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="是否系统内置权限点（不可删除）",
    )
    description: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="权限描述")

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<Permission(id='{self.id}', code='{self.code}', name='{self.name}')>"


# 角色-权限关联表（逻辑外键，级联由 Service 层处理，与 user_roles 约定一致）
role_permissions = Table(
    "role_permissions",
    Base.metadata,
    Column("role_id", String(36), primary_key=True, comment="角色ID(逻辑外键)"),
    Column("permission_id", String(36), primary_key=True, comment="权限ID(逻辑外键)"),
    Column("created_at", DateTime(timezone=True), server_default=func.now()),
)
