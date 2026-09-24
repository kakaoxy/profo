"""系统配置 KV 模型.

存储全局单值配置（如获客中心全局兜底负责人），key 唯一、value 可空
（value 为 NULL 表示该配置项未设置/已清除）。
"""

from sqlalchemy import (
    Index,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class SystemConfig(BaseModel):
    """系统配置表（key-value 单值配置）."""

    __tablename__ = "system_configs"

    key: Mapped[str] = mapped_column(String(100), nullable=False, comment="配置键")
    value: Mapped[str | None] = mapped_column(Text, nullable=True, comment="配置值(NULL=未设置)")
    updated_by_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="最后修改人ID(逻辑外键)",
    )

    __table_args__ = (Index("uq_system_configs_key", "key", unique=True),)

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<SystemConfig(key='{self.key}')>"
