"""
L4 市场营销层模型
对应 mini_projects 小程序项目管理
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Integer, Numeric, Index, Boolean, Enum as SQLEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from typing import Optional

from .base import BaseModel


class MarketingProjectStatus(str):
    """营销项目状态枚举"""
    IN_PROGRESS = "在途"      # 项目进行中，尚未挂牌
    FOR_SALE = "在售"         # 已挂牌销售
    SOLD = "已售"             # 已成交


class L4MarketingProject(BaseModel):
    """
    L4 营销项目表 (原 mini_projects)
    职责: 房源营销展示、历史案例作品集
    """
    __tablename__ = "l4_marketing_projects"

    # 关联 L3 项目层 (软引用，允许为空表示独立静态项目)
    project_id = Column(String(36), nullable=True, comment="关联L3项目ID(软引用)")

    # 关联顾问 (软引用)
    consultant_id = Column(String(36), nullable=True, comment="关联顾问ID(软引用)")

    # 营销信息 (运营维护，同步不覆盖)
    title = Column(String(200), nullable=False, comment="营销标题")
    cover_image = Column(Text, comment="封面图URL")
    style = Column(String(50), comment="装修风格")
    description = Column(Text, comment="项目描述")
    marketing_tags = Column(String(500), comment="营销标签，逗号分隔")

    # SEO 与分享 (运营维护，同步不覆盖)
    share_title = Column(String(100), comment="分享标题")
    share_image = Column(Text, comment="分享图片URL")
    view_count = Column(Integer, default=0, nullable=False, comment="浏览量")

    # 硬字段 (来自L3项目，刷新时覆盖)
    address = Column(String(500), comment="物业地址")
    area = Column(Numeric(10, 2), comment="面积(m²)")
    price = Column(Numeric(15, 2), comment="预估售价(万)")
    layout = Column(String(50), comment="户型")
    orientation = Column(String(20), comment="朝向")
    floor_info = Column(String(100), comment="楼层信息")

    # 状态控制
    project_status = Column(
        String(20),
        nullable=False,
        default=MarketingProjectStatus.IN_PROGRESS,
        comment="项目状态: 在途/在售/已售"
    )
    sort_order = Column(Integer, default=0, nullable=False, comment="排序权重")
    is_published = Column(Boolean, default=False, nullable=False, comment="是否发布")
    published_at = Column(DateTime, comment="发布时间")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 关联关系
    media_files = relationship(
        "L4MarketingMedia",
        back_populates="marketing_project",
        cascade="all, delete-orphan"
    )

    # 关联顾问（软引用，通过 consultant_id 关联）
    consultant = relationship(
        "L4Consultant",
        primaryjoin="L4MarketingProject.consultant_id == L4Consultant.id",
        foreign_keys="L4MarketingProject.consultant_id",
        uselist=False,
        viewonly=True
    )

    __table_args__ = (
        Index("idx_l4_marketing_published", "is_published", "sort_order"),
        Index("idx_l4_marketing_project", "project_id"),
        Index("idx_l4_marketing_consultant", "consultant_id"),
        Index("idx_l4_marketing_status", "project_status"),
        Index("idx_l4_marketing_deleted", "is_deleted"),
    )


class L4MarketingMedia(BaseModel):
    """
    L4 营销媒体资源表 (原 mini_project_photos)
    存储营销项目相关的媒体资源
    """
    __tablename__ = "l4_marketing_media"

    # 关联营销项目
    marketing_project_id = Column(
        String(36),
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

    # 装修阶段标记
    renovation_stage = Column(String(50), comment="装修阶段")

    # 来源 A: 关联 L3 项目照片 (标记机制，URL 实时查询)
    origin_media_id = Column(String(36), comment="来源媒体ID(L3层)")

    # 来源 B: 独立上传 (直接存储 URL)
    file_url = Column(Text, nullable=False, comment="文件URL")
    thumbnail_url = Column(Text, comment="缩略图URL")

    # 描述信息
    description = Column(Text, comment="描述")
    sort_order = Column(Integer, default=0, nullable=False, comment="排序")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    # 关联关系
    marketing_project = relationship(
        "L4MarketingProject",
        back_populates="media_files"
    )

    __table_args__ = (
        Index("idx_l4_media_project", "marketing_project_id", "renovation_stage"),
        Index("idx_l4_media_origin", "origin_media_id"),
        Index("idx_l4_media_deleted", "is_deleted"),
    )


class L4Consultant(BaseModel):
    """
    L4 营销顾问表 (原 consultants)
    小程序端展示的顾问信息
    """
    __tablename__ = "l4_consultants"

    name = Column(String(100), nullable=False, comment="姓名")
    avatar_url = Column(Text, comment="头像URL")
    role = Column(String(100), comment="职位")
    phone = Column(String(20), comment="联系电话")
    wx_qr_code = Column(Text, comment="微信二维码")
    intro = Column(Text, comment="个人简介")
    rating = Column(Numeric(2, 1), default=5.0, comment="评分")
    completed_projects = Column(Integer, default=0, comment="完成项目数")
    is_active = Column(Boolean, default=True, nullable=False, comment="是否在职")

    # 逻辑删除
    is_deleted = Column(Boolean, default=False, nullable=False, comment="逻辑删除标记")

    __table_args__ = (
        Index("idx_l4_consultants_active", "is_active"),
        Index("idx_l4_consultants_deleted", "is_deleted"),
    )
