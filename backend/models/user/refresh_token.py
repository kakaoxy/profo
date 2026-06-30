"""Refresh Token 跟踪模型.

用于实现 refresh_token 轮换：每次刷新时撤销旧 jti 并签发新 jti，
避免同一 refresh_token 被重复利用（重放防护）。
"""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class RefreshToken(BaseModel):
    """Refresh Token 跟踪表.

    每条记录对应一个已签发的 refresh_token（通过 jti 标识）。
    刷新时校验 jti 存在且未撤销，随后撤销旧记录并插入新记录。
    """

    __tablename__ = "refresh_tokens"

    # 关联用户（逻辑外键，不设物理约束）
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="用户ID")

    # JWT ID：refresh_token 中的 jti 声明，唯一标识该 token
    jti: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, comment="JWT ID")

    # 受众标识：c / admin，用于区分两套系统
    audience: Mapped[str] = mapped_column(String(20), nullable=False, comment="受众(c/admin)")

    # 状态：True 表示已撤销，不可再用
    revoked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="是否已撤销")

    # 过期时间：到期后记录可清理；校验时也用于拒绝过期 token
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, comment="过期时间")

    __table_args__ = (
        Index("idx_refresh_token_user_id", "user_id"),
        Index("idx_refresh_token_jti", "jti"),
        Index("idx_refresh_token_user_revoked", "user_id", "revoked"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return (
            f"<RefreshToken(id='{self.id}', user_id='{self.user_id}', "
            f"jti='{self.jti[:8]}...', revoked={self.revoked})>"
        )
