"""用户和角色相关模型."""

from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.common.base import BaseModel


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

    # 关联关系
    users = relationship("User", back_populates="role", cascade="all, delete-orphan")

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
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True, unique=True, comment="手机号")

    # 微信相关信息
    wechat_openid: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, comment="微信OpenID")
    wechat_unionid: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, comment="微信UnionID")
    wechat_session_key: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="微信会话密钥")

    # 角色关联
    role_id: Mapped[str] = mapped_column(String(36), ForeignKey("roles.id"), nullable=False, comment="角色ID")

    # 状态
    status: Mapped[str] = mapped_column(String(20), default="active", comment="用户状态: active/inactive/banned")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, comment="最后登录时间")
    must_change_password: Mapped[bool] = mapped_column(Boolean, default=False, comment="是否必须修改密码")

    # 关联关系
    role = relationship("Role", back_populates="users")

    # 索引
    __table_args__ = (
        # 用户状态查询索引
        Index("idx_user_status", "status"),
        # 电话查询索引
        Index("idx_user_phone", "phone"),
        # 微信信息查询索引
        Index("idx_user_wechat", "wechat_openid", "wechat_unionid"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<User(id='{self.id}', username='{self.username}', nickname='{self.nickname}')>"
