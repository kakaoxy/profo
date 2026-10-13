"""楼盘字典导入任务模型（SRS FR-08）.

复用 PropertyImportTask 任务模式：异步任务、状态/进度、对账三计数、失败明细。
独立表（不与房源 CSV 导入混用），归档 90 天由文件系统 + 定期清理承担。
"""

import uuid
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Float, Integer, String, Text
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base, ImportTaskStatus


class BdImportTask(Base):
    """楼盘字典导入任务表.

    status 流转（SRS §6.3）：
    pending（解析校验完成待执行）→ processing（COPY 装载中，进度/对账实时更新）
    → completed（完成）｜failed（失败）；error_message 承载失败原因。

    对账三计数：communities_loaded / buildings_loaded / rooms_loaded。
    """

    __tablename__ = "bd_import_tasks"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True, comment="创建用户ID")

    status: Mapped[ImportTaskStatus] = mapped_column(
        SQLEnum(ImportTaskStatus, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=ImportTaskStatus.PENDING,
        nullable=False,
        comment="任务状态",
    )

    # 文件信息（zip 包或单 txt）
    filename: Mapped[str] = mapped_column(String(255), nullable=False, comment="原始文件名")
    file_path: Mapped[str] = mapped_column(String(500), nullable=False, comment="文件存储路径")
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="文件大小(字节)")

    # 解析校验（预扫描）结果
    total_communities: Mapped[int] = mapped_column(Integer, default=0, comment="解析出的小区数")
    total_buildings: Mapped[int] = mapped_column(Integer, default=0, comment="预扫描楼栋数")
    total_rooms: Mapped[int] = mapped_column(Integer, default=0, comment="预扫描户室行数")
    warnings_count: Mapped[int] = mapped_column(Integer, default=0, comment="异常清单条数(地址缺失/年代脏值等)")

    # 装载进度
    processed_communities: Mapped[int] = mapped_column(Integer, default=0, comment="已装载小区数")
    progress_percent: Mapped[float] = mapped_column(Float, default=0.0, comment="进度百分比(0-100)")

    # 对账三计数（BR-16：重跑幂等后计数不变）
    communities_loaded: Mapped[int] = mapped_column(BigInteger, default=0, comment="已入库小区数(对账)")
    buildings_loaded: Mapped[int] = mapped_column(BigInteger, default=0, comment="已入库楼栋数(对账)")
    rooms_loaded: Mapped[int] = mapped_column(BigInteger, default=0, comment="已入库户室数(对账)")

    # 失败明细（csv 留档 90 天，URL 供下载）
    failed_file_url: Mapped[str | None] = mapped_column(Text, nullable=True, comment="失败明细 csv 下载URL")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True, comment="错误信息(失败时)")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=datetime.now,
        nullable=False,
        comment="创建时间",
    )
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="开始处理时间")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="完成时间")
    processing_duration: Mapped[float | None] = mapped_column(Float, nullable=True, comment="处理时长(秒)")

    def __repr__(self) -> str:
        """返回字符串表示."""
        return f"<BdImportTask(id='{self.id}', status='{self.status}', communities={self.communities_loaded})>"
