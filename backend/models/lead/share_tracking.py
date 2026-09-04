"""估价页分享埋点模型.

估价页访问（PV/UV）与员工分享事件，支撑评估分享漏斗统计
（分享次数/PV/UV/留资，今日 + 累计）。UV 以前端生成并缓存于
storage 的匿名 visitor_id 去重（免登录口径，与招募的 openid_hash
口径不同，数值不可横向对比）.
"""

from datetime import datetime, timezone

from sqlalchemy import DateTime, Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import BaseModel


class ValuationVisit(BaseModel):
    """估价页访问埋点表（分享漏斗 PV/UV 数据源）."""

    __tablename__ = "valuation_visits"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="访问记录ID")

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
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="更新时间",
    )

    __table_args__ = (
        Index("idx_valuation_visits_visitor", "visitor_id"),
        # 「我的分享统计」按来源员工过滤 PV/UV，避免全表扫描
        Index("idx_valuation_visits_referrer", "referrer_employee_id"),
        Index("idx_valuation_visits_created_at", "created_at"),
    )


class ValuationShareEvent(BaseModel):
    """估价页分享事件表（分享漏斗第 1 级）."""

    __tablename__ = "valuation_share_events"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="分享事件ID")

    employee_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="分享员工ID(逻辑外键)")
    share_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="分享方式: card(转发)/timeline(朋友圈)",
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
        Index("idx_valuation_share_events_employee", "employee_id"),
        Index("idx_valuation_share_events_created_at", "created_at"),
    )
