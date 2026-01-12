"""
小程序项目管理相关模型
"""
from sqlalchemy import Column, String, DateTime, Text, ForeignKey, Integer, Numeric, Index, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.sqlite import JSON
from .base import BaseModel

class Consultant(BaseModel):
    """顾问表"""
    __tablename__ = "consultants"

    name = Column(String(100), nullable=False, comment="姓名")
    avatar_url = Column(Text, comment="头像URL")
    role = Column(String(100), comment="职位")
    phone = Column(String(20), comment="联系电话")
    wx_qr_code = Column(Text, comment="微信二维码")
    intro = Column(Text, comment="个人简介")
    rating = Column(Numeric(2, 1), default=5.0, comment="评分")
    completed_projects = Column(Integer, default=0, comment="完成项目数")
    is_active = Column(Boolean, default=True, comment="是否在职")

    # 关联关系
    mini_projects = relationship("MiniProject", back_populates="consultant")

    __table_args__ = (
        Index("idx_consultants_active", "is_active"),
    )


class MiniProject(BaseModel):
    """小程序项目表"""
    __tablename__ = "mini_projects"

    project_id = Column(String(36), ForeignKey("projects.id"), nullable=True, comment="关联主项目ID")
    consultant_id = Column(String(36), ForeignKey("consultants.id"), comment="关联顾问ID")

    # 营销信息 (运营维护，同步不覆盖)
    title = Column(String(200), nullable=False, comment="营销标题")
    cover_image = Column(Text, comment="封面图")
    style = Column(String(50), comment="装修风格")
    description = Column(Text, comment="项目描述")
    marketing_tags = Column(JSON, comment="营销标签")

    # SEO 与分享 (运营维护，同步不覆盖)
    share_title = Column(String(100), comment="分享标题")
    share_image = Column(Text, comment="分享图片")
    view_count = Column(Integer, default=0, comment="浏览量")

    # 硬字段 (来自主项目，刷新时覆盖)
    address = Column(String(500), comment="物业地址")
    area = Column(Numeric(10, 2), comment="面积")
    price = Column(Numeric(15, 2), comment="预估售价")
    layout = Column(String(50), comment="户型")
    orientation = Column(String(20), comment="朝向")
    floor_info = Column(String(100), comment="楼层信息")

    # 状态控制
    sort_order = Column(Integer, default=0, comment="排序权重")
    is_published = Column(Boolean, default=False, comment="是否发布")
    published_at = Column(DateTime, comment="发布时间")

    # 关联关系
    # 注意：这里是单向关联，Project模型不需要感知MiniProject的存在
    project = relationship("Project")
    consultant = relationship("Consultant", back_populates="mini_projects")
    photos = relationship("MiniProjectPhoto", back_populates="mini_project", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_mini_projects_published", "is_published", "sort_order"),
        Index("idx_mini_projects_project", "project_id"),
        Index("idx_mini_projects_consultant", "consultant_id"),
    )


class MiniProjectPhoto(BaseModel):
    """小程序项目照片表"""
    __tablename__ = "mini_project_photos"

    mini_project_id = Column(String(36), ForeignKey("mini_projects.id"), nullable=False, comment="小程序项目ID")
    
    renovation_stage = Column(String(50), comment="改造阶段")

    # 来源 A：关联主项目照片（标记机制，URL 实时查询）
    origin_photo_id = Column(String(36), comment="原项目照片ID")

    # 来源 B：独立上传照片（直接存储 URL）
    image_url = Column(Text, comment="图片URL")

    description = Column(Text, comment="描述")
    sort_order = Column(Integer, default=0, comment="排序")

    # 关联关系
    mini_project = relationship("MiniProject", back_populates="photos")

    __table_args__ = (
        Index("idx_photos_mini_project", "mini_project_id", "renovation_stage"),
        Index("idx_photos_origin", "origin_photo_id"),
    )
