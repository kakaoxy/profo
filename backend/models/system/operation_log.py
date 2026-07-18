"""操作审计日志模型.

记录用户对系统资源的操作行为，支持合规审计。
"""

from sqlalchemy import (
    JSON,
    Index,
    String,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class OperationLog(BaseModel):
    """操作审计日志表.

    记录 create/update/delete/sensitive_data_access 等操作，
    保留变更前/后快照供审计追溯。审计日志通常只写不改，
    继承 BaseModel 会有 updated_at（写入时等于 created_at）。
    """

    __tablename__ = "operation_logs"

    user_id: Mapped[str | None] = mapped_column(
        String(36),
        index=True,
        nullable=True,
        comment="操作者用户ID(逻辑外键)",
    )
    action: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        comment="操作类型：create/update/delete/sensitive_data_access等",
    )
    resource_type: Mapped[str] = mapped_column(
        String(50),
        index=True,
        nullable=False,
        comment="资源类型：user/role/permission/project等",
    )
    resource_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="资源ID")
    ip: Mapped[str | None] = mapped_column(String(45), nullable=True, comment="操作者IP地址(IPv4/IPv6)")
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True, comment="User-Agent")
    before: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="变更前快照")
    after: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="变更后快照")

    __table_args__ = (
        Index("idx_operation_logs_created_at", "created_at"),
        Index("idx_operation_logs_user_action", "user_id", "action"),
        Index("idx_operation_logs_resource", "resource_type", "resource_id"),
    )

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<OperationLog(id='{self.id}', action='{self.action}', resource_type='{self.resource_type}')>"
