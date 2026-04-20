"""
L4 市场营销层模型
对应 mini_projects 小程序项目管理
"""
from enum import Enum
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Integer, Numeric, Index, Boolean, JSON
from sqlalchemy.orm import relationship, validates
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional, List

from ..common.base import BaseModel


class PublishStatus(str, Enum):
    """发布状态枚举"""
    DRAFT = "草稿"
    PUBLISHED = "发布"


class MarketingProjectStatus(str, Enum):
    """营销项目状态枚举"""
    IN_PROGRESS = "在途"      # 项目进行中，尚未挂牌
    FOR_SALE = "在售"         # 已挂牌销售
    SOLD = "已售"             # 已成交


class PhotoCategory(str, Enum):
    """照片分类枚举"""
    MARKETING = "marketing"      # 营销照片
    RENOVATION = "renovation"    # 改造照片


class L4MarketingProject(BaseModel):
    """
    L4 营销项目表 (原 mini_projects)
    职责: 房源营销展示、历史案例作品集
    """
    __tablename__ = "l4_marketing_projects"

    # 主键 - 整数类型，自增
    # 注意：继承的BaseModel使用String(36) UUID，我们需要覆盖它
    id = Column(Integer, primary_key=True, autoincrement=True, comment="营销项目ID")

    # 小区ID - UUID字符串类型，非空，关联小区
    community_id = Column(String(36), ForeignKey('communities.id'), nullable=False, comment="关联小区ID（UUID字符串）")

    # 小区名称 - 冗余存储，避免跨层级JOIN查询
    community_name = Column(String(200), nullable=True, comment="小区名称(冗余存储)")

    # 户型信息
    layout = Column(String(100), nullable=False, comment="户型，如：三室两厅")
    orientation = Column(String(50), nullable=False, comment="朝向，如：南北通透")
    floor_info = Column(String(100), nullable=False, comment="楼层信息，如：15/28层")

    # 面积与价格
    area = Column(Numeric(10, 2), nullable=False, comment="面积(m²)，保留两位小数")
    total_price = Column(Numeric(12, 2), nullable=False, comment="总价(万元)，保留两位小数")
    unit_price = Column(Numeric(12, 2), nullable=False, comment="单价(万元/m²)，自动计算，保留两位小数")

    # 营销信息
    title = Column(String(255), nullable=False, comment="标题，最大长度255")
    images = Column(JSON, default=list, comment="图片URL列表，JSON数组")
    sort_order = Column(Integer, nullable=False, default=0, comment="排序权重，默认0")
    tags = Column(JSON, default=list, comment="标签列表，JSON数组")
    decoration_style = Column(String(100), nullable=True, comment="装修风格，最大长度100")

    # 状态控制
    publish_status = Column(
        String(20),
        nullable=False,
        default=PublishStatus.DRAFT,
        comment="发布状态: 草稿/发布"
    )
    project_status = Column(
        String(20),
        nullable=False,
        default=MarketingProjectStatus.IN_PROGRESS,
        comment="项目状态: 在途/在售/已售"
    )

    # 软引用关联
    project_id = Column(String(36), nullable=True, comment="关联L3项目ID(软引用)，可为空表示独立项目")
    consultant_id = Column(String(36), nullable=True, comment="关联顾问ID(软引用User表)，User表id为String(36) UUID")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 时间戳（覆盖基类，使用数据库默认值）
    created_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间"
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="更新时间"
    )

    # 关联关系
    media_files = relationship(
        "L4MarketingMedia",
        back_populates="marketing_project",
        cascade="all, delete-orphan",
        lazy="dynamic"
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

    def __init__(self, **kwargs):
        # 计算单价
        area = kwargs.get('area')
        total_price = kwargs.get('total_price')
        if area is not None and total_price is not None:
            if float(area) > 0:
                kwargs['unit_price'] = Decimal(str(total_price)) / Decimal(str(area))
            else:
                kwargs['unit_price'] = Decimal('0')
        super().__init__(**kwargs)

    def recalculate_unit_price(self):
        """重新计算单价"""
        if self.area and float(self.area) > 0:
            self.unit_price = Decimal(str(self.total_price)) / Decimal(str(self.area))
        else:
            self.unit_price = Decimal('0')

    @validates('total_price')
    def validate_total_price(self, key, value):
        """总价变更时重新计算单价"""
        if value is not None and self.area is not None:
            if float(self.area) > 0:
                self.unit_price = Decimal(str(value)) / Decimal(str(self.area))
            else:
                self.unit_price = Decimal('0')
        return value

    @validates('area')
    def validate_area(self, key, value):
        """面积变更时重新计算单价"""
        if value is not None and float(value) > 0 and self.total_price is not None:
            self.unit_price = Decimal(str(self.total_price)) / Decimal(str(value))
        else:
            self.unit_price = Decimal('0')
        return value


class L4MarketingMedia(BaseModel):
    """
    L4 营销媒体资源表 (原 mini_project_photos)
    存储营销项目相关的媒体资源
    """
    __tablename__ = "l4_marketing_media"

    # 主键 - 整数类型，自增
    id = Column(Integer, primary_key=True, autoincrement=True, comment="媒体ID")

    # 关联营销项目 - 整数外键
    marketing_project_id = Column(
        Integer,
        ForeignKey("l4_marketing_projects.id"),
        nullable=False,
        comment="营销项目ID"
    )

    # 媒体类型
    media_type = Column(
        String(20),
        nullable=False,
        default="image",
        comment="媒体类型: image/video"
    )

    # 照片分类
    photo_category = Column(
        String(20),
        nullable=False,
        default=PhotoCategory.MARKETING,
        comment="照片分类: marketing(营销照片)/renovation(改造照片)"
    )

    # 装修阶段标记（仅改造照片使用）
    renovation_stage = Column(String(50), nullable=True, comment="装修阶段: 拆除/水电/木瓦/油漆/安装/交付/other")

    # 来源 A: 关联 L3 项目照片 (标记机制，URL 实时查询)
    origin_media_id = Column(Integer, nullable=True, comment="来源媒体ID(L3层)")

    # 来源 B: 独立上传 (直接存储 URL)
    file_url = Column(Text, nullable=False, comment="文件URL")
    thumbnail_url = Column(Text, nullable=True, comment="缩略图URL")

    # 描述信息
    description = Column(Text, nullable=True, comment="描述")
    sort_order = Column(Integer, nullable=False, default=0, comment="排序")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 时间戳
    created_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        comment="创建时间"
    )
    updated_at = Column(
        DateTime,
        nullable=False,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        comment="更新时间"
    )

    # 关联关系
    marketing_project = relationship(
        "L4MarketingProject",
        back_populates="media_files"
    )

    __table_args__ = (
        Index("idx_l4_media_project", "marketing_project_id", "photo_category"),
        Index("idx_l4_media_stage", "marketing_project_id", "renovation_stage"),
        Index("idx_l4_media_origin", "origin_media_id"),
        Index("idx_l4_media_deleted", "is_deleted"),
    )
