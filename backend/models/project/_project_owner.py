"""业主信息模型."""

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ProjectOwner(BaseModel):
    """业主信息表."""

    __tablename__ = "project_owners"

    project_id: Mapped[str] = mapped_column(String(36), ForeignKey("projects.id"), nullable=False, comment="项目ID")

    owner_name: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="业主姓名")
    owner_phone: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="业主联系方式")
    owner_id_card: Mapped[str | None] = mapped_column(String(18), nullable=True, comment="业主身份证号")
    relation_type: Mapped[str] = mapped_column(String(20), nullable=False, default="业主", comment="关系类型")
    owner_info: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注")

    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (Index("idx_owner_project", "project_id"),)
