"""
API Key 模型
用于用户通过 API Key 访问受保护接口
"""
from datetime import datetime, timezone, timedelta
from sqlalchemy import Column, String, DateTime, Index, ForeignKey
from sqlalchemy.orm import relationship

from ..common.base import BaseModel


class ApiKey(BaseModel):
    """
    API Key 模型
    每个用户只能有一个有效 Key
    Key 格式: profo_<prefix>_<random>
    存储 SHA-256 哈希值
    """
    __tablename__ = "api_keys"

    # 关联用户（软引用，不设物理外键约束）
    user_id = Column(String(36), nullable=False, comment="用户ID")

    # Key 信息
    key_prefix = Column(String(8), nullable=False, comment="Key前缀(显示用)")
    key_hash = Column(String(64), nullable=False, comment="Key的SHA-256哈希值")

    # 状态: active(有效), revoked(已撤销)
    status = Column(String(20), default="active", nullable=False, comment="Key状态")

    # 时间戳
    last_used_at = Column(DateTime, nullable=True, comment="最后使用时间")
    expires_at = Column(DateTime, nullable=True, comment="过期时间")
    deleted_at = Column(DateTime, nullable=True, comment="删除时间(软删除)")

    # 关联关系
    user = relationship("User", primaryjoin="ApiKey.user_id == User.id",
                        foreign_keys="[ApiKey.user_id]",
                        uselist=False, viewonly=True)

    # 索引
    __table_args__ = (
        # 用户ID查询索引
        Index("idx_api_key_user_id", "user_id"),
        # Key哈希查询索引
        Index("idx_api_key_hash", "key_hash"),
        # 状态查询索引
        Index("idx_api_key_status", "status"),
        # 复合索引：用户ID + 状态
        Index("idx_api_key_user_status", "user_id", "status"),
    )

    def is_active(self) -> bool:
        """检查 Key 是否有效"""
        if self.status != "active":
            return False
        if self.deleted_at is not None:
            return False
        if self.expires_at and self.expires_at < datetime.now(timezone.utc):
            return False
        return True

    def revoke(self) -> None:
        """撤销 Key（软删除）"""
        self.status = "revoked"
        self.deleted_at = datetime.now(timezone.utc)

    def mark_used(self) -> None:
        """记录使用时间"""
        self.last_used_at = datetime.now(timezone.utc)

    def __repr__(self) -> str:
        return f"<ApiKey(id='{self.id}', user_id='{self.user_id}', prefix='{self.key_prefix}', status='{self.status}')>"
