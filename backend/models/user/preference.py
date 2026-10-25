"""用户偏好模型.

单表多命名空间 KV：一条记录 = (user_id, namespace) 的一份 JSON 配置。
本期唯一消费方是工作台的个人布局覆盖（``namespace='workbench.layout'``，SPEC K13）。
"""

from sqlalchemy import Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel

# 命名空间常量（新增命名空间须在此登记，避免散落魔法字符串）
NAMESPACE_WORKBENCH_LAYOUT = "workbench.layout"
NAMESPACE_NOTIFICATION_PREFS = "notification.preferences"


class UserPreference(BaseModel):
    """用户偏好（按命名空间隔离的 JSON 配置）."""

    __tablename__ = "user_preferences"

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="用户ID(逻辑外键)")
    namespace: Mapped[str] = mapped_column(String(50), nullable=False, comment="命名空间，如 workbench.layout")
    value: Mapped[dict] = mapped_column(JSONB, nullable=False, comment="配置内容（JSON 全量）")

    __table_args__ = (
        UniqueConstraint("user_id", "namespace", name="uq_user_preferences_user_ns"),
        Index("idx_user_preferences_user", "user_id"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<UserPreference(user_id='{self.user_id}', namespace='{self.namespace}')>"


__all__ = [
    "NAMESPACE_NOTIFICATION_PREFS",
    "NAMESPACE_WORKBENCH_LAYOUT",
    "UserPreference",
]
