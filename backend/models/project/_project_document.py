"""项目文书签收模型."""

import uuid

from sqlalchemy import Boolean, Index, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel, DocumentSignoffStatus


class ProjectDocument(BaseModel):
    """项目文书签收表."""

    __tablename__ = "project_documents"

    project_id: Mapped[uuid.UUID] = mapped_column(Uuid, nullable=False, index=True, comment="项目ID(逻辑外键)")
    document_name: Mapped[str] = mapped_column(String(200), nullable=False, comment="文书名称")
    signoff_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=DocumentSignoffStatus.UNSIGNED.value,
        comment="签收状态: unsigned/signed/archived",
    )
    archive_date: Mapped[str | None] = mapped_column(String(10), nullable=True, comment="归档日期 YYYY-MM-DD")
    display_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="显示顺序")
    category: Mapped[str] = mapped_column(String(50), nullable=False, default="other", comment="文书分类")
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (Index("idx_document_status", "signoff_status"),)
