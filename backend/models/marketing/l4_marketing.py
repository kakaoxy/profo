"""L4 市场营销层模型.

对应 mini_projects 小程序项目管理.

⚠️ 本文件超 500 行不拆分理由（AGENTS §1，M14）：订阅/通知域 4 张表
（订阅账本、留痕、调价历史、房源级订阅）与项目/媒体等既有模型同属一个
bounded context，外键关系与枚举（SendStatus 等）集中一处便于对照；拆分后
跨文件 import 链变长且现有 from models.marketing.l4_marketing import X 的
引用面需全部跟进，收益不抵成本，故沿用既有单文件惯例。
"""

import uuid
from datetime import datetime, timezone
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy import (
    Enum as SQLEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship, validates

from models.common.base import BaseModel, RenovationStage
from models.common.encrypted import EncryptedString


class PublishStatus(str, Enum):
    """发布状态枚举."""

    DRAFT = "草稿"
    PUBLISHED = "发布"


class NotifyType(str, Enum):
    """订阅通知类型枚举（l4_marketing_notify_logs.notify_type 取值）."""

    NEW_LISTING = "new_listing"  # 房源上新
    PRICE_CHANGE = "price_change"  # 房源调价


class SendStatus(str, Enum):
    """订阅消息发送状态枚举（l4_marketing_notify_logs.send_status 取值）."""

    SUCCESS = "success"  # 微信接口受理成功
    FAILED = "failed"  # 微信接口报错（非预期业务态）
    SKIPPED = "skipped"  # 跳过（额度不足/模板未配置/openid 缺失等）


class MarketingProjectStatus(str, Enum):
    """营销项目状态枚举."""

    IN_PROGRESS = "在途"  # 项目进行中，尚未挂牌
    FOR_SALE = "在售"  # 已挂牌销售
    SOLD = "已售"  # 已成交


class PhotoCategory(str, Enum):
    """照片分类枚举."""

    MARKETING = "marketing"  # 营销照片
    RENOVATION = "renovation"  # 改造照片


class L4MediaType(str, Enum):
    """L4 营销媒体类型枚举."""

    IMAGE = "image"  # 图片
    VIDEO = "video"  # 视频


class L4MarketingProject(BaseModel):
    """L4 营销项目表 (原 mini_projects).

    职责: 房源营销展示、历史案例作品集.
    """

    __tablename__ = "l4_marketing_projects"

    # 主键 - 整数类型，自增
    # 注意：继承的 BaseModel 主键为 Uuid（uuid.UUID），L4 营销项目使用自增 int 主键，需覆盖
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="营销项目ID")

    # 小区ID - UUID字符串类型，非空，逻辑外键
    community_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="关联小区ID(逻辑外键)")

    # 小区名称 - 冗余存储，避免跨层级JOIN查询
    community_name: Mapped[str | None] = mapped_column(String(200), nullable=True, comment="小区名称(冗余存储)")

    # 户型信息
    layout: Mapped[str] = mapped_column(String(100), nullable=False, comment="户型，如：三室两厅")
    orientation: Mapped[str] = mapped_column(String(50), nullable=False, comment="朝向，如：南北通透")
    floor_info: Mapped[str] = mapped_column(String(100), nullable=False, comment="楼层信息，如：15/28层")

    # 面积与价格
    area: Mapped[Decimal] = mapped_column(Numeric(10, 2), nullable=False, comment="面积(m²)，保留两位小数")
    total_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="总价(万元)，保留两位小数")
    unit_price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2),
        nullable=False,
        comment="单价(万元/m²)，自动计算，保留两位小数",
    )

    # 营销信息
    title: Mapped[str] = mapped_column(String(255), nullable=False, comment="标题，最大长度255")
    images: Mapped[list] = mapped_column(JSON, default=list, comment="图片URL列表，JSON数组")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="排序权重，默认0")
    tags: Mapped[list] = mapped_column(JSON, default=list, comment="标签列表，JSON数组")
    decoration_style: Mapped[str | None] = mapped_column(String(100), nullable=True, comment="装修风格，最大长度100")

    # 改造阶段完成时间 - JSON 格式 {stage: "YYYY-MM-DD"}，与 L3 ProjectRenovation.stage_completed_dates 同构
    stage_completed_dates: Mapped[dict | None] = mapped_column(
        JSON,
        nullable=True,
        comment="各改造阶段完成日期，格式: {stage: 'YYYY-MM-DD'}",
    )

    # 状态控制
    publish_status: Mapped[PublishStatus] = mapped_column(
        SQLEnum(PublishStatus, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        default=PublishStatus.DRAFT,
        comment="发布状态: 草稿/发布",
    )
    project_status: Mapped[MarketingProjectStatus] = mapped_column(
        SQLEnum(MarketingProjectStatus, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        default=MarketingProjectStatus.IN_PROGRESS,
        comment="项目状态: 在途/在售/已售",
    )

    # 软引用关联
    # 首次发布时间：仅首次 publish_status → 发布 时写入（防重复「上新」），
    # 上新通知上架时间 + C 端 is_new_listing 徽标的唯一事实源
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="首次发布时间(仅首次发布写入，用于上新判定)",
    )
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid,
        nullable=True,
        comment="关联L3项目ID(软引用)，可为空表示独立项目",
    )
    consultant_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="关联顾问ID(软引用User表)，User表id为String(36) UUID",
    )

    # 逻辑删除
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 时间戳（覆盖基类，使用数据库默认值）
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

    # 关联关系（逻辑外键，级联由Service处理）
    media_files = relationship(
        "L4MarketingMedia",
        back_populates="marketing_project",
        primaryjoin="L4MarketingProject.id == foreign(L4MarketingMedia.marketing_project_id)",
        # selectin 预加载避免列表/详情序列化时逐条查询媒体（消除 N+1）
        lazy="selectin",
    )

    __table_args__ = (
        Index("idx_l4_marketing_community", "community_id"),
        Index("idx_l4_marketing_status", "project_status"),
        Index("idx_l4_marketing_publish", "publish_status"),
        Index("idx_l4_marketing_consultant", "consultant_id"),
        Index("idx_l4_marketing_project_ref", "project_id"),
        Index("idx_l4_marketing_sort", "sort_order"),
        Index("idx_l4_marketing_deleted", "is_deleted"),
    )

    def __init__(self, **kwargs: object) -> None:
        """初始化营销项目，自动计算单价.

        Args:
            **kwargs: 模型字段参数

        """
        area = kwargs.get("area")
        total_price = kwargs.get("total_price")
        if area is not None and total_price is not None:
            if float(area) > 0:
                kwargs["unit_price"] = Decimal(str(total_price)) / Decimal(str(area))
            else:
                kwargs["unit_price"] = Decimal(0)
        super().__init__(**kwargs)

    def recalculate_unit_price(self) -> None:
        """重新计算单价."""
        if self.area and float(self.area) > 0:
            self.unit_price = Decimal(str(self.total_price)) / Decimal(str(self.area))
        else:
            self.unit_price = Decimal(0)

    @validates("total_price")
    def validate_total_price(self, _key: str, value: object) -> object:
        """总价变更时重新计算单价."""
        if value is not None and self.area is not None:
            if float(self.area) > 0:
                self.unit_price = Decimal(str(value)) / Decimal(str(self.area))
            else:
                self.unit_price = Decimal(0)
        return value

    @validates("area")
    def validate_area(self, _key: str, value: object) -> object:
        """面积变更时重新计算单价."""
        if value is not None and float(value) > 0 and self.total_price is not None:
            self.unit_price = Decimal(str(self.total_price)) / Decimal(str(value))
        else:
            self.unit_price = Decimal(0)
        return value


class L4MarketingMedia(BaseModel):
    """L4 营销媒体资源表 (原 mini_project_photos).

    存储营销项目相关的媒体资源.
    """

    __tablename__ = "l4_marketing_media"

    # 主键 - 整数类型，自增
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="媒体ID")

    # 关联营销项目 - 整数逻辑外键
    marketing_project_id: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        comment="营销项目ID(逻辑外键)",
    )

    # 媒体类型
    media_type: Mapped[L4MediaType] = mapped_column(
        SQLEnum(L4MediaType, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        default=L4MediaType.IMAGE,
        comment="媒体类型: image/video",
    )

    # 照片分类
    photo_category: Mapped[PhotoCategory] = mapped_column(
        SQLEnum(PhotoCategory, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=False,
        default=PhotoCategory.MARKETING,
        comment="照片分类: marketing(营销照片)/renovation(改造照片)",
    )

    # 装修阶段标记（仅改造照片使用）
    renovation_stage: Mapped[RenovationStage | None] = mapped_column(
        SQLEnum(RenovationStage, values_callable=lambda x: [e.value for e in x], create_constraint=True),
        nullable=True,
        comment="装修阶段: 拆除/设计/水电/木瓦/油漆/交付/已完成",
    )

    # 来源 A: 关联 L3 项目照片 (标记机制，URL 实时查询)
    # 注意：L3 RenovationPhoto.id 为 String(36) UUID
    origin_media_id: Mapped[str | None] = mapped_column(String(36), nullable=True, comment="来源媒体ID(L3层UUID)")

    # 来源 B: 独立上传 (直接存储 URL)
    file_url: Mapped[str] = mapped_column(Text, nullable=False, comment="文件URL")
    thumbnail_url: Mapped[str | None] = mapped_column(Text, nullable=True, comment="缩略图URL")

    # 描述信息
    description: Mapped[str | None] = mapped_column(Text, nullable=True, comment="描述")
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="排序")

    # 逻辑删除
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 时间戳
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

    # 关联关系
    marketing_project = relationship(
        "L4MarketingProject",
        back_populates="media_files",
        foreign_keys=[marketing_project_id],
        primaryjoin="L4MarketingProject.id == foreign(L4MarketingMedia.marketing_project_id)",
    )

    __table_args__ = (
        Index("idx_l4_media_project", "marketing_project_id", "photo_category"),
        Index("idx_l4_media_stage", "marketing_project_id", "renovation_stage"),
        Index("idx_l4_media_origin", "origin_media_id"),
        Index("idx_l4_media_deleted", "is_deleted"),
    )


class ProjectBooking(BaseModel):
    """房源预约表.

    C 端登录用户在房源详情页点「想看房」后创建；(user_id, marketing_project_id)
    唯一约束在 DB 层实现幂等防重，重复预约由 Service 层捕获后返回既有记录.
    """

    __tablename__ = "project_bookings"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="预约ID")

    marketing_project_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源ID(逻辑外键)")
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="预约用户ID(逻辑外键)")
    # 预约时手机号快照（Fernet 加密，随机 IV 导致密文不可比，唯一性由 phone_hash 维持）
    phone: Mapped[str] = mapped_column(EncryptedString(20), nullable=False, comment="预约时手机号(加密快照)")
    phone_hash: Mapped[str] = mapped_column(String(64), nullable=False, comment="手机号哈希")
    referrer_user_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="归因内部员工ID(逻辑外键，取最近一次带referrer的访问)",
    )
    # 预约状态：存储统一 5 态值，展示层按模块映射标签（new→已预约/contacted→已联系/
    # high_intent→已带看/converted→已关闭/eliminated→已淘汰）
    status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default=lambda: "new",
        server_default="new",
        comment="预约状态(统一5态: new/contacted/high_intent/converted/eliminated)",
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
        # 幂等防重：同一用户对同一房源仅一条预约，重复预约复用既有记录
        UniqueConstraint("user_id", "marketing_project_id", name="uq_project_bookings_user_project"),
        Index("idx_project_bookings_user", "user_id"),
        Index("idx_project_bookings_referrer", "referrer_user_id"),
        Index("idx_project_bookings_project", "marketing_project_id"),
    )


class ProjectVisit(BaseModel):
    """房源详情页访问埋点表（分享漏斗 PV/UV 数据源）.

    免登录埋点：UV 以前端生成并缓存于 storage 的匿名 visitor_id 去重
    （与招募的 openid_hash 口径不同，数值不可横向对比）.
    """

    __tablename__ = "project_visits"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="访问记录ID")

    visitor_id: Mapped[str] = mapped_column(String(64), nullable=False, comment="匿名访客ID(UV去重键，前端生成)")
    referrer_employee_id: Mapped[str | None] = mapped_column(
        String(36),
        nullable=True,
        comment="来源员工ID(分享参数透传)",
    )
    marketing_project_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源ID(逻辑外键)")
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
        Index("idx_project_visits_visitor", "visitor_id"),
        # 「我的分享统计」按来源员工过滤 PV/UV，避免全表扫描
        Index("idx_project_visits_referrer", "referrer_employee_id"),
        Index("idx_project_visits_created_at", "created_at"),
    )


class ProjectShareEvent(BaseModel):
    """房源分享事件表（分享漏斗第 1 级）."""

    __tablename__ = "project_share_events"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="分享事件ID")

    employee_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="分享员工ID(逻辑外键)")
    marketing_project_id: Mapped[int | None] = mapped_column(Integer, nullable=True, comment="房源ID(逻辑外键)")
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
        Index("idx_project_share_events_employee", "employee_id"),
        Index("idx_project_share_events_created_at", "created_at"),
    )


class L4MarketingSubscription(BaseModel):
    """房源动态订阅额度账本.

    微信一次性订阅模型：用户每次在订阅弹层「允许」后额度 +1（accept 上报），
    推送成功后对应频道额度 -1（with_for_update 扣减）；额度 0 后静默停止推送。
    频道型公共通知：不筛预约/浏览关系，所有剩余额度 > 0 的订阅行均在推送范围。
    """

    __tablename__ = "l4_marketing_subscriptions"

    # 主键 - 整数类型，自增（覆盖基类 Uuid 主键，对齐本文件既有表惯例）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="订阅记录ID")

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="订阅用户ID(逻辑外键User)")
    # 订阅授权时快照的微信 openid（发送免回查；用户主账号合并后仍按快照发送）
    # M11：列宽与来源 users.wechat_openid（String(100)）对齐，防超长 openid（unionid 体系/
    # 历史异常数据）上报时触发 PG value too long → 500。宽度迁移见 migrations/_marketing_notify
    openid: Mapped[str] = mapped_column(String(100), nullable=False, comment="微信openid(授权时快照)")
    # 两频道剩余额度（一次性订阅：每次「允许」可收 1 条）
    new_listing_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="上新提醒剩余额度")
    price_change_quota: Mapped[int] = mapped_column(Integer, nullable=False, default=0, comment="调价提醒剩余额度")
    last_subscribed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最近一次订阅授权时间",
    )

    __table_args__ = (
        # 一人一行（upsert 语义由 Service 层保证）
        UniqueConstraint("user_id", name="uq_l4_marketing_subscriptions_user"),
        Index("idx_l4_marketing_subs_new_quota", "new_listing_quota"),
        Index("idx_l4_marketing_subs_price_quota", "price_change_quota"),
    )


class L4MarketingNotifyLog(BaseModel):
    """订阅消息发送留痕.

    每次 notify_* 逐用户发送后写入一条：admin 统计数据源 + P1 日志页数据源 + 排障。
    """

    __tablename__ = "l4_marketing_notify_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="通知日志ID")

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="接收用户ID(逻辑外键User)")
    marketing_project_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源ID(逻辑外键)")
    notify_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="通知类型: new_listing/price_change",
    )
    template_id: Mapped[str] = mapped_column(String(64), nullable=False, comment="使用的模板ID")
    send_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        comment="发送状态: success/failed/skipped",
    )
    # 关联本次推送对应的调价记录（new_listing 类型恒 NULL；逻辑外键不建物理 FK）
    price_change_id: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
        comment="关联调价记录ID(逻辑外键l4_marketing_price_changes，new_listing类型恒NULL)",
    )
    # 订阅来源（channel=频道级账本 / project=房源级订阅），为房源级订阅预留；频道级通知恒写 NULL
    sub_source: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
        comment="订阅来源: channel(频道级)/project(房源级)，NULL为存量行",
    )
    error_msg: Mapped[str | None] = mapped_column(Text, nullable=True, comment="失败/跳过原因(发送异常时留痕)")

    __table_args__ = (
        Index("idx_l4_marketing_notify_logs_project", "marketing_project_id", "notify_type"),
        # P1-2 调价历史时间线：按 price_change_id 分组统计分次送达数
        Index("idx_l4_marketing_notify_logs_price_change", "price_change_id"),
        Index("idx_l4_marketing_notify_logs_user", "user_id"),
    )


class L4MarketingProjectSubscription(BaseModel):
    """房源级调价订阅（「只盯这一套」，P2-1）.

    与频道级账本（l4_marketing_subscriptions）相互独立：用户在房源详情页
    授权「调价提醒」后房源级额度 +1（accept 上报），该房源推送成功 -1
    （原子条件更新）；skipped/failed 不扣。推送范围为频道级 ∪ 房源级
    （按 user_id 去重优先房源级，同一用户同一房源只发一条、只扣一处额度）。
    """

    __tablename__ = "l4_marketing_project_subscriptions"

    # 主键 - 整数类型，自增（对齐本文件既有表惯例，覆盖基类 Uuid 主键）
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="房源级订阅ID")

    user_id: Mapped[str] = mapped_column(String(36), nullable=False, comment="订阅用户ID(逻辑外键User)")
    marketing_project_id: Mapped[int] = mapped_column(
        Integer, nullable=False, comment="房源ID(逻辑外键l4_marketing_projects)"
    )
    # 授权时快照的微信 openid（发送免回查，与频道级账本同构）
    # M11：列宽与来源 users.wechat_openid（String(100)）对齐，防超长 openid（unionid 体系/
    # 历史异常数据）上报时触发 PG value too long → 500。宽度迁移见 migrations/_marketing_notify
    openid: Mapped[str] = mapped_column(String(100), nullable=False, comment="微信openid(授权时快照)")
    # 房源级一次性订阅额度（accept 上报 +1，推送成功 -1）
    price_change_quota: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
        server_default="0",
        comment="调价提醒剩余额度(房源级一次性订阅)",
    )
    # 最近一次授权订阅时间（与频道级账本同构；首次上报 accept 时写入）
    last_subscribed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="最近一次订阅授权时间",
    )
    # 显式取消时间（「服务端尊重取消」的唯一事实源）：非空 = 用户已关闭该房源调价提醒，
    # 调价推送收件人需从频道级中排除该用户（频道额度保留，其他房源仍可推）。
    # ⚠️ 不可用「额度=0」代替判定：一次性额度推送送达后同样归 0，会误伤未取消的用户。
    # 取消时写入；用户再次 accept 上报续订时置回 NULL。
    cancelled_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        comment="显式取消提醒时间(非空=已取消;accept 续订时置 NULL)",
    )

    # 时间戳（覆盖基类，使用数据库默认值）
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
        # 一人一房源一行（upsert 语义由 Service 层保证）
        UniqueConstraint(
            "user_id",
            "marketing_project_id",
            name="uq_l4_project_subs_user_project",
        ),
        # 推送查询索引：按房源取剩余额度 >0 的订阅行
        Index("idx_l4_project_subs_project", "marketing_project_id", "price_change_quota"),
    )


class L4MarketingPriceChange(BaseModel):
    """房源调价历史.

    已发布房源 total_price 变更时由 Service 写入一条：
    C 端降价/涨价徽标（latest_price_change）+ admin 调价历史时间线数据源。
    """

    __tablename__ = "l4_marketing_price_changes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True, comment="调价记录ID")

    marketing_project_id: Mapped[int] = mapped_column(Integer, nullable=False, comment="房源ID(逻辑外键)")
    old_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="调价前总价(万元)")
    new_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False, comment="调价后总价(万元)")
    direction: Mapped[str] = mapped_column(String(10), nullable=False, comment="调价方向: down/up")

    __table_args__ = (Index("idx_l4_marketing_price_changes_project", "marketing_project_id", "created_at"),)
