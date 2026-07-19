"""用户和角色相关模型."""

from datetime import datetime

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.common.base import Base, BaseModel
from models.common.encrypted import EncryptedString


class UserRole(Base):
    """用户-角色关联模型（附加角色）.

    通过 user_roles 关联表存储用户的「附加角色」，与 User.role_id 主角色
    关系向后兼容。user_id / role_id 均为逻辑外键，级联由 Service 层处理
    （与 User.role_id 一致，不由数据库 FK 约束强制）。
    """

    __tablename__ = "user_roles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="用户ID(逻辑外键)")
    role_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, comment="角色ID(逻辑外键)")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    __table_args__ = (UniqueConstraint("user_id", "role_id", name="uq_user_roles_user_role"),)


# 关联表对象（与 UserRole.__table__ 同源），供 relationship secondary= 引用
user_roles = UserRole.__table__


class Role(BaseModel):
    """角色模型."""

    __tablename__ = "roles"

    # 基本信息
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, comment="角色名称")
    code: Mapped[str] = mapped_column(String(50), nullable=False, unique=True, comment="角色代码")
    description: Mapped[str | None] = mapped_column(Text, nullable=True, comment="角色描述")

    # 权限配置
    permissions: Mapped[list | None] = mapped_column(JSON, nullable=True, comment="权限列表")

    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, comment="是否激活")

    # 关联关系（逻辑外键，级联由Service处理）
    users = relationship("User", back_populates="role", primaryjoin="foreign(User.role_id) == Role.id")
    # 附加角色反向关系：通过 user_roles 关联表关联的「非主角色」用户
    additional_users: Mapped[list["User"]] = relationship(
        secondary=user_roles,
        primaryjoin="foreign(user_roles.c.role_id) == Role.id",
        secondaryjoin="foreign(user_roles.c.user_id) == User.id",
        back_populates="roles",
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<Role(id='{self.id}', name='{self.name}', code='{self.code}')>"


class User(BaseModel):
    """用户模型."""

    __tablename__ = "users"

    # 基本信息
    username: Mapped[str] = mapped_column(String(100), nullable=False, unique=True, comment="用户名")
    password: Mapped[str] = mapped_column(String(255), nullable=False, comment="密码")
    nickname: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="昵称")
    avatar: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="头像")
    # phone 使用 Fernet 加密存储；由于加密使用随机 IV，唯一性由 phone_hash 维持
    phone: Mapped[str | None] = mapped_column(EncryptedString(20), nullable=True, comment="手机号(加密存储)")
    phone_hash: Mapped[str | None] = mapped_column(
        String(64),
        nullable=True,
        unique=True,
        comment="手机号HMAC哈希(用于唯一性约束)",
    )

    # 微信相关信息
    wechat_openid: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, comment="微信OpenID")
    wechat_unionid: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, comment="微信UnionID")
    wechat_session_key: Mapped[str | None] = mapped_column(EncryptedString(500), nullable=True, comment="微信会话密钥")

    # 角色关联（逻辑外键，级联由Service处理）
    role_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="角色ID(逻辑外键)")

    # 状态
    status: Mapped[str] = mapped_column(String(20), default="active", comment="用户状态: active/inactive/banned")
    last_login_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最后登录时间",
    )
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否必须修改密码")
    # Token 版本号：用于服务端撤销已签发 JWT（修改密码/禁用/删除用户时递增）
    # authenticate_by_token 会校验 Token 中的 ver 与当前值是否一致
    token_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        nullable=False,
        comment="Token版本号，递增以撤销已签发Token",
    )

    # 关联关系
    role = relationship(
        "Role",
        back_populates="users",
        foreign_keys=[role_id],
        primaryjoin="foreign(User.role_id) == Role.id",
    )
    # 附加角色（与主角色 role 并存），通过 user_roles 关联表
    roles: Mapped[list["Role"]] = relationship(
        secondary=user_roles,
        primaryjoin="foreign(user_roles.c.user_id) == User.id",
        secondaryjoin="foreign(user_roles.c.role_id) == Role.id",
        back_populates="additional_users",
        lazy="selectin",
    )

    # 索引
    __table_args__ = (
        # 用户状态查询索引
        Index("idx_user_status", "status"),
        # 手机号唯一性：phone_hash 列已声明 unique=True，由 SQLAlchemy 自动创建唯一索引；
        # 迁移（migrations.py）以 idx_users_phone_hash 命名创建，此处不再重复声明。
        # 微信信息查询索引
        Index("idx_user_wechat", "wechat_openid", "wechat_unionid"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<User(id='{self.id}', username='{self.username}', nickname='{self.nickname}')>"
