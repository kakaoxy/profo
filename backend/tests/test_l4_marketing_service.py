"""
L4 营销模块服务层单元测试
采用TDD方式重构服务层
"""
import pytest
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from models import Base
from models.l4_marketing import (
    L4MarketingProject,
    L4MarketingMedia,
    PublishStatus,
    MarketingProjectStatus
)
from schemas.l4_marketing import (
    L4MarketingProjectCreate,
    L4MarketingProjectUpdate,
    L4MarketingMediaCreate,
    L4MarketingMediaUpdate,
)
from services.l4_marketing_service import (
    L4MarketingProjectService,
    L4MarketingMediaService,
)


# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_l4_marketing_service.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    """创建测试数据库会话"""
    Base.metadata.create_all(bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def project_service(db: Session):
    """创建项目服务实例"""
    return L4MarketingProjectService(db)


@pytest.fixture
def media_service(db: Session):
    """创建媒体服务实例"""
    return L4MarketingMediaService(db)


@pytest.fixture
def sample_project_create_data():
    """样本项目创建数据"""
    return {
        "community_id": 1,
        "layout": "三室两厅",
        "orientation": "南北通透",
        "floor_info": "15/28层",
        "area": Decimal("120.50"),
        "total_price": Decimal("500.00"),
        "title": "精装修三居室，拎包入住",
        "images": "https://example.com/img1.jpg,https://example.com/img2.jpg",
        "sort_order": 0,
        "tags": "精装修,近地铁,学区房",
        "decoration_style": "现代简约",
        "publish_status": PublishStatus.DRAFT,
        "project_status": MarketingProjectStatus.IN_PROGRESS,
        "project_id": None,
        "consultant_id": 1
    }


@pytest.fixture
def sample_media_create_data():
    """样本媒体创建数据"""
    return {
        "media_type": "image",
        "renovation_stage": "水电",
        "file_url": "https://example.com/photo.jpg",
        "thumbnail_url": "https://example.com/photo_thumb.jpg",
        "description": "水电改造照片",
        "sort_order": 1
    }


# ============================================================================
# L4MarketingProjectService 测试
# ============================================================================

class TestL4MarketingProjectService:
    """测试营销项目服务"""

    def test_create_project(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试创建营销项目"""
        data = L4MarketingProjectCreate(**sample_project_create_data)
        project = project_service.create_project(data)

        assert project.id is not None
        assert project.title == sample_project_create_data["title"]
        assert project.community_id == sample_project_create_data["community_id"]
        assert project.layout == sample_project_create_data["layout"]
        assert project.unit_price is not None  # 自动计算
        assert project.publish_status == PublishStatus.DRAFT

    def test_get_project(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试获取单个项目"""
        # 先创建项目
        data = L4MarketingProjectCreate(**sample_project_create_data)
        created = project_service.create_project(data)

        # 获取项目
        project = project_service.get_project(created.id)

        assert project is not None
        assert project.id == created.id
        assert project.title == sample_project_create_data["title"]

    def test_get_project_not_found(self, db: Session, project_service: L4MarketingProjectService):
        """测试获取不存在的项目"""
        project = project_service.get_project(99999)
        assert project is None

    def test_get_projects_pagination(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试项目列表分页"""
        # 创建多个项目
        for i in range(5):
            data = sample_project_create_data.copy()
            data["title"] = f"测试项目{i}"
            project_service.create_project(L4MarketingProjectCreate(**data))

        # 获取第一页
        items, total = project_service.get_projects(skip=0, limit=3)

        assert total == 5
        assert len(items) == 3

    def test_get_projects_with_filters(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试带筛选条件的项目列表"""
        # 创建不同状态的项目
        data1 = sample_project_create_data.copy()
        data1["project_status"] = MarketingProjectStatus.FOR_SALE
        project_service.create_project(L4MarketingProjectCreate(**data1))

        data2 = sample_project_create_data.copy()
        data2["project_status"] = MarketingProjectStatus.SOLD
        project_service.create_project(L4MarketingProjectCreate(**data2))

        # 按状态筛选
        items, total = project_service.get_projects(
            skip=0, limit=10,
            project_status=MarketingProjectStatus.FOR_SALE
        )

        assert total == 1
        assert items[0].project_status == MarketingProjectStatus.FOR_SALE

    def test_update_project(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试更新项目"""
        # 创建项目
        data = L4MarketingProjectCreate(**sample_project_create_data)
        created = project_service.create_project(data)

        # 更新项目
        update_data = L4MarketingProjectUpdate(
            title="更新后的标题",
            total_price=Decimal("600.00")
        )
        updated = project_service.update_project(created.id, update_data)

        assert updated is not None
        assert updated.title == "更新后的标题"
        assert updated.total_price == Decimal("600.00")
        # 单价应该自动重新计算
        expected_unit_price = Decimal("600.00") / sample_project_create_data["area"]
        assert float(updated.unit_price) == pytest.approx(float(expected_unit_price), rel=1e-2)

    def test_update_project_not_found(self, db: Session, project_service: L4MarketingProjectService):
        """测试更新不存在的项目"""
        update_data = L4MarketingProjectUpdate(title="新标题")
        result = project_service.update_project(99999, update_data)
        assert result is None

    def test_delete_project(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试删除项目（逻辑删除）"""
        # 创建项目
        data = L4MarketingProjectCreate(**sample_project_create_data)
        created = project_service.create_project(data)

        # 删除项目
        result = project_service.delete_project(created.id)
        assert result is True

        # 验证项目已被逻辑删除
        project = project_service.get_project(created.id)
        assert project is None  # get_project 会过滤已删除的项目

        # 但数据库中记录仍然存在
        db_project = db.query(L4MarketingProject).filter(L4MarketingProject.id == created.id).first()
        assert db_project is not None
        assert db_project.is_deleted is True

    def test_delete_project_not_found(self, db: Session, project_service: L4MarketingProjectService):
        """测试删除不存在的项目"""
        result = project_service.delete_project(99999)
        assert result is False

    def test_publish_project(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试发布项目"""
        # 创建草稿项目
        data = L4MarketingProjectCreate(**sample_project_create_data)
        created = project_service.create_project(data)
        assert created.publish_status == PublishStatus.DRAFT

        # 发布项目
        update_data = L4MarketingProjectUpdate(publish_status=PublishStatus.PUBLISHED)
        updated = project_service.update_project(created.id, update_data)

        assert updated is not None
        assert updated.publish_status == PublishStatus.PUBLISHED

    def test_change_project_status(self, db: Session, project_service: L4MarketingProjectService, sample_project_create_data):
        """测试变更项目状态"""
        # 创建项目
        data = L4MarketingProjectCreate(**sample_project_create_data)
        created = project_service.create_project(data)
        assert created.project_status == MarketingProjectStatus.IN_PROGRESS

        # 变更为在售
        update_data = L4MarketingProjectUpdate(project_status=MarketingProjectStatus.FOR_SALE)
        updated = project_service.update_project(created.id, update_data)

        assert updated is not None
        assert updated.project_status == MarketingProjectStatus.FOR_SALE

        # 变更为已售
        update_data = L4MarketingProjectUpdate(project_status=MarketingProjectStatus.SOLD)
        updated = project_service.update_project(created.id, update_data)

        assert updated is not None
        assert updated.project_status == MarketingProjectStatus.SOLD


# ============================================================================
# L4MarketingMediaService 测试
# ============================================================================

class TestL4MarketingMediaService:
    """测试营销媒体服务"""

    def test_create_media(self, db: Session, project_service: L4MarketingProjectService,
                          media_service: L4MarketingMediaService,
                          sample_project_create_data, sample_media_create_data):
        """测试创建媒体"""
        # 先创建项目
        project_data = L4MarketingProjectCreate(**sample_project_create_data)
        project = project_service.create_project(project_data)

        # 创建媒体
        media_data = L4MarketingMediaCreate(**sample_media_create_data)
        media = media_service.create_media(media_data, project.id)

        assert media.id is not None
        assert media.marketing_project_id == project.id
        assert media.file_url == sample_media_create_data["file_url"]

    def test_get_media(self, db: Session, project_service: L4MarketingProjectService,
                       media_service: L4MarketingMediaService,
                       sample_project_create_data, sample_media_create_data):
        """测试获取单个媒体"""
        # 创建项目和媒体
        project_data = L4MarketingProjectCreate(**sample_project_create_data)
        project = project_service.create_project(project_data)

        media_data = L4MarketingMediaCreate(**sample_media_create_data)
        created = media_service.create_media(media_data, project.id)

        # 获取媒体
        media = media_service.get_media(created.id)

        assert media is not None
        assert media.id == created.id
        assert media.file_url == sample_media_create_data["file_url"]

    def test_get_media_not_found(self, db: Session, media_service: L4MarketingMediaService):
        """测试获取不存在的媒体"""
        media = media_service.get_media(99999)
        assert media is None

    def test_get_media_list(self, db: Session, project_service: L4MarketingProjectService,
                            media_service: L4MarketingMediaService,
                            sample_project_create_data, sample_media_create_data):
        """测试获取媒体列表"""
        # 创建项目
        project_data = L4MarketingProjectCreate(**sample_project_create_data)
        project = project_service.create_project(project_data)

        # 创建多个媒体
        for i in range(5):
            data = sample_media_create_data.copy()
            data["file_url"] = f"https://example.com/photo{i}.jpg"
            media_service.create_media(L4MarketingMediaCreate(**data), project.id)

        # 获取媒体列表
        items, total = media_service.get_media_list(project.id, skip=0, limit=10)

        assert total == 5
        assert len(items) == 5

    def test_update_media(self, db: Session, project_service: L4MarketingProjectService,
                          media_service: L4MarketingMediaService,
                          sample_project_create_data, sample_media_create_data):
        """测试更新媒体"""
        # 创建项目和媒体
        project_data = L4MarketingProjectCreate(**sample_project_create_data)
        project = project_service.create_project(project_data)

        media_data = L4MarketingMediaCreate(**sample_media_create_data)
        created = media_service.create_media(media_data, project.id)

        # 更新媒体
        update_data = L4MarketingMediaUpdate(
            description="更新后的描述",
            sort_order=10
        )
        updated = media_service.update_media(created.id, update_data)

        assert updated is not None
        assert updated.description == "更新后的描述"
        assert updated.sort_order == 10

    def test_delete_media(self, db: Session, project_service: L4MarketingProjectService,
                          media_service: L4MarketingMediaService,
                          sample_project_create_data, sample_media_create_data):
        """测试删除媒体（逻辑删除）"""
        # 创建项目和媒体
        project_data = L4MarketingProjectCreate(**sample_project_create_data)
        project = project_service.create_project(project_data)

        media_data = L4MarketingMediaCreate(**sample_media_create_data)
        created = media_service.create_media(media_data, project.id)

        # 删除媒体
        result = media_service.delete_media(created.id)
        assert result is True

        # 验证媒体已被逻辑删除
        media = media_service.get_media(created.id)
        assert media is None

        # 但数据库中记录仍然存在
        db_media = db.query(L4MarketingMedia).filter(L4MarketingMedia.id == created.id).first()
        assert db_media is not None
        assert db_media.is_deleted is True


# ============================================================================
# 软引用测试
# ============================================================================

class TestSoftReference:
    """测试软引用功能"""

    def test_project_id_soft_reference(self, db: Session, project_service: L4MarketingProjectService,
                                       sample_project_create_data):
        """测试project_id软引用（可引用不存在的L3项目）"""
        data = sample_project_create_data.copy()
        data["project_id"] = 99999  # 不存在的L3项目ID

        project_data = L4MarketingProjectCreate(**data)
        project = project_service.create_project(project_data)

        assert project.project_id == 99999

    def test_consultant_id_soft_reference(self, db: Session, project_service: L4MarketingProjectService,
                                          sample_project_create_data):
        """测试consultant_id软引用（可引用不存在的User）"""
        data = sample_project_create_data.copy()
        data["consultant_id"] = 99999  # 不存在的User ID

        project_data = L4MarketingProjectCreate(**data)
        project = project_service.create_project(project_data)

        assert project.consultant_id == 99999

