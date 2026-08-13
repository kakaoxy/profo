"""区域伙伴招募计划数据模型.

包含 4 张表：
- ``RecruitCampaign``   招募活动/分享素材配置
- ``RecruitLead``       招募客户线索（核心归因表，手机号为主键语义）
- ``RecruitVisit``      访问埋点（漏斗 2/3/4 级数据源）
- ``RecruitShareEvent`` 分享事件（漏斗 1 级）

字段与索引对齐 ``docs/To-Do/区域伙伴招募计划.md`` 9.3 设计。
id 采用 String(36) + 字符串 UUID 默认值，与 ``Lead`` 模型一致；
逻辑外键（campaign_id / referrer_employee_id / employee_id / visitor_id）
均使用 String(36)，级联由 Service 层处理，不由数据库 FK 强制。
"""

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Index,
    Integer,
    String,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.orm import Mapped, mapped_column

from models.common.base import Base
from models.common.encrypted import EncryptedString


class RecruitCampaignStatus(str, enum.Enum):
    """招募活动启用状态枚举."""

    ENABLED = "enabled"
    DISABLED = "disabled"


class RecruitLeadSource(str, enum.Enum):
    """招募线索/访问来源渠道枚举."""

    CARD = "card"  # 小程序卡片分享
    POSTER = "poster"  # 海报分享


class RecruitLeadStatus(str, enum.Enum):
    """招募线索跟进状态枚举."""

    NEW = "new"  # 新线索
    CONTACTED = "contacted"  # 已联系
    HIGH_INTENT = "high_intent"  # 意向高
    CONVERTED = "converted"  # 已转化
    ELIMINATED = "eliminated"  # 已淘汰


class RecruitShareType(str, enum.Enum):
    """分享方式枚举."""

    CARD = "card"  # 卡片分享至好友/群聊
    POSTER = "poster"  # 海报分享至朋友圈


def _new_id() -> str:
    """生成字符串 UUID 主键."""
    return str(uuid.uuid4())


def _now() -> datetime:
    """生成带时区的当前时间."""
    return datetime.now(timezone.utc)


class RecruitCampaign(Base):
    """招募活动/分享素材配置表（运营统一配置，员工不可自定义）."""

    __tablename__ = "recruit_campaigns"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id, comment="UUID")

    name: Mapped[str] = mapped_column(String(100), nullable=False, comment="活动名称")
    title: Mapped[str] = mapped_column(String(200), nullable=False, comment="分享卡片标题")
    image_url: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="分享配图 URL（5:4）")
    content: Mapped[dict | None] = mapped_column(JSON, nullable=True, comment="详情页内容（权益/要求/福利）")
    poster_bg_url: Mapped[str | None] = mapped_column(String(500), nullable=True, comment="海报背景图 URL（二期预留）")
    status: Mapped[RecruitCampaignStatus] = mapped_column(
        SQLEnum(RecruitCampaignStatus, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=RecruitCampaignStatus.ENABLED,
        nullable=False,
        comment="活动启用状态",
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, comment="创建时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_now,
        onupdate=_now,
        nullable=False,
        comment="更新时间",
    )


class RecruitLead(Base):
    """招募客户线索表（核心归因表，手机号为主键语义）."""

    __tablename__ = "recruit_leads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id, comment="UUID")

    # phone 使用 Fernet 加密存储；由于加密使用随机 IV，唯一性由 phone_hash 维持
    phone: Mapped[str] = mapped_column(EncryptedString(20), nullable=False, comment="手机号(加密存储)")
    phone_hash: Mapped[str] = mapped_column(String(64), nullable=False, comment="手机号HMAC哈希(归因查重)")

    main_business_area: Mapped[str] = mapped_column(String(50), nullable=False, comment="主营商圈")
    campaign_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="所属活动ID(逻辑外键)")
    source: Mapped[RecruitLeadSource] = mapped_column(
        SQLEnum(RecruitLeadSource, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=RecruitLeadSource.CARD,
        nullable=False,
        comment="来源渠道",
    )
    referrer_employee_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="归属员工ID（首次留资写入，此后永不更新）",
    )
    status: Mapped[RecruitLeadStatus] = mapped_column(
        SQLEnum(RecruitLeadStatus, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=RecruitLeadStatus.NEW,
        nullable=False,
        comment="跟进状态",
    )
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="是否内部员工误点")

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, comment="首次留资时间"
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=_now,
        onupdate=_now,
        nullable=False,
        comment="更新时间",
    )

    __table_args__ = (
        # phone_hash 唯一索引：并发留资时由 DB 强制去重，配合 service 层 IntegrityError 重查
        Index("idx_recruit_lead_phone_hash", "phone_hash", unique=True),
        Index("idx_recruit_lead_referrer", "referrer_employee_id"),
        Index("idx_recruit_lead_status", "status"),
    )


class RecruitVisit(Base):
    """访问埋点表（漏斗第 2/3/4 级数据源）."""

    __tablename__ = "recruit_visits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id, comment="UUID")

    campaign_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="活动ID(逻辑外键)")
    visitor_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="C端用户ID（游客为空）")
    openid_hash: Mapped[str] = mapped_column(String(64), nullable=False, comment="OpenID哈希（UV去重键）")
    referrer_employee_id: Mapped[str | None] = mapped_column(
        String(36), nullable=True, comment="来源员工ID（分享参数透传）"
    )
    source: Mapped[RecruitLeadSource] = mapped_column(
        SQLEnum(RecruitLeadSource, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=RecruitLeadSource.CARD,
        nullable=False,
        comment="进入渠道",
    )

    entered_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, comment="进入时间"
    )
    exited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, comment="离开时间")
    stayed_ms: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="停留毫秒")
    is_deep_view: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False, comment="是否深度浏览（stayed_ms>=3000）"
    )
    clicked_auth: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="是否点击报名且通过校验")
    authed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="是否授权成功留资")

    __table_args__ = (
        Index("idx_recruit_visit_campaign_time", "campaign_id", "entered_at"),
        Index("idx_recruit_visit_openid", "openid_hash"),
    )


class RecruitShareEvent(Base):
    """分享事件表（漏斗第 1 级）."""

    __tablename__ = "recruit_share_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_new_id, comment="UUID")

    campaign_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="活动ID(逻辑外键)")
    employee_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="分享员工ID(逻辑外键)")
    share_type: Mapped[RecruitShareType] = mapped_column(
        SQLEnum(RecruitShareType, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        default=RecruitShareType.CARD,
        nullable=False,
        comment="分享方式",
    )
    shared_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_now, nullable=False, comment="分享时间"
    )

    __table_args__ = (
        Index("idx_recruit_share_campaign_time", "campaign_id", "shared_at"),
        Index("idx_recruit_share_employee", "employee_id"),
    )
