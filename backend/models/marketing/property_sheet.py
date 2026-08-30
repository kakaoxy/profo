"""房源单（多房源分享）模型.

房源单主表/明细/访问埋点/分享事件，支撑员工多房源一图分享与归因统计.
"""

from datetime import datetime, timezone

from sqlalchemy import (
    DateTime,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class PropertyShareSheet(BaseModel):
    """房源单主表（员工创建的多房源分享单，status 支持软删归档）."""

    __tablename__ = "property_share_sheets"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="房源单ID")

    employee_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="创建员工ID(逻辑外键)")
    code: Mapped[str] = mapped_column(String(8), nullable=False, comment="8位分享短码(全局唯一)")
    status: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="active",
        comment="状态: active(有效)/archived(已归档)",
    )

    # 时间戳（覆盖基类，加列注释）
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间",
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="更新时间",
    )

    __table_args__ = (
        Index("idx_property_sheet_employee", "employee_id"),
        Index("idx_property_sheet_code", "code", unique=True),
    )


class PropertyShareSheetItem(BaseModel):
    """房源单明细表（房源单内包含的房源及排序）."""

    __tablename__ = "property_share_sheet_items"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="明细ID")

    sheet_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源单ID(逻辑外键)")
    marketing_project_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源ID(逻辑外键)")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="排序(0起)")

    # 时间戳（覆盖基类，加列注释）
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间",
    )

    __table_args__ = (
        # 幂等防重：同一房源单内同一房源仅一条明细
        UniqueConstraint("sheet_id", "marketing_project_id", name="uq_property_sheet_items_sheet_project"),
        Index("idx_property_sheet_items_sheet", "sheet_id"),
    )


class PropertySheetVisit(BaseModel):
    """房源单落地页访问埋点表（免登录，UV 按 visitor_id 去重）."""

    __tablename__ = "property_sheet_visits"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="访问记录ID")

    sheet_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源单ID(逻辑外键)")
    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False, comment="匿名访客ID(UV去重键，前端生成)")
    referrer_employee_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="来源员工ID(分享参数透传)",
    )
    source: Mapped[str | None] = mapped_column(String(20), nullable=True, comment="进入渠道")

    # 时间戳（覆盖基类，加列注释）
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间",
    )

    __table_args__ = (
        Index("idx_property_sheet_visits_sheet", "sheet_id"),
        # 「我的分享统计」按来源员工过滤 PV/UV，避免全表扫描（对齐 project_visits）
        Index("ix_property_sheet_visits_referrer_employee_id", "referrer_employee_id"),
        Index("idx_property_sheet_visits_created_at", "created_at"),
    )


class PropertySheetShareEvent(BaseModel):
    """房源单分享事件表（分享漏斗第 1 级）."""

    __tablename__ = "property_sheet_share_events"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="分享事件ID")

    sheet_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源单ID(逻辑外键)")
    employee_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="分享员工ID(逻辑外键)")
    share_type: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="分享方式: poster(保存海报)",
    )

    # 时间戳（覆盖基类，加列注释）
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间",
    )

    __table_args__ = (
        Index("idx_property_sheet_share_events_sheet", "sheet_id"),
        Index("idx_property_sheet_share_events_employee", "employee_id"),
        Index("idx_property_sheet_share_events_created_at", "created_at"),
    )
