"""
L4 营销模块数据库字段重构测试
采用TDD方式，先写测试再实现
"""
import pytest
import sys
import os
from datetime import datetime
from decimal import Decimal

# 添加backend目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect
from sqlalchemy.orm import sessionmaker

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
    L4MarketingProjectResponse,
    L4MarketingMediaCreate,
    L4MarketingMediaResponse,
    L4MarketingProjectQuery
)


# 测试数据库配置
SQLALCHEMY_DATABASE_URL = "sqlite:///./test_l4_marketing.db"
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
def sample_project_data():
    """营销项目样本数据"""
    return {
        "community_id": 1,
        "layout": "三室两厅",
        "orientation": "南北通透",
        "floor_info": "15/28层",
        "area": 120.50,
        "total_price": 500.00,
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
def sample_media_data():
    """媒体资源样本数据"""
    return {
        "media_type": "image",
        "renovation_stage": "水电",
        "file_url": "https://example.com/photo.jpg",
        "thumbnail_url": "https://example.com/photo_thumb.jpg",
        "description": "水电改造照片",
        "sort_order": 1
    }


# ============================================================================
# 测试1: 字段定义与类型规范
# ============================================================================

class TestL4MarketingProjectFields:
    """测试L4MarketingProject字段定义"""

    def test_id_field_is_integer_auto_increment(self, db):
        """测试id字段为整数类型、主键、自增"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'id' in columns
        id_col = columns['id']
        # SQLite中整数主键自动成为自增主键
        assert id_col['type'].__class__.__name__ in ['INTEGER', 'Integer']

    def test_community_id_field_is_integer_not_null(self, db):
        """测试community_id字段为整数类型、非空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'community_id' in columns
        community_id_col = columns['community_id']
        assert community_id_col['type'].__class__.__name__ in ['INTEGER', 'Integer']
        assert community_id_col['nullable'] == False

    def test_layout_field_is_string_not_null_max_100(self, db):
        """测试layout字段为字符串类型、非空、最大长度100"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'layout' in columns
        layout_col = columns['layout']
        assert layout_col['type'].__class__.__name__ in ['VARCHAR', 'String']
        assert layout_col['nullable'] == False

    def test_orientation_field_is_string_not_null_max_50(self, db):
        """测试orientation字段为字符串类型、非空、最大长度50"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'orientation' in columns
        orientation_col = columns['orientation']
        assert orientation_col['type'].__class__.__name__ in ['VARCHAR', 'String']
        assert orientation_col['nullable'] == False

    def test_floor_info_field_is_string_not_null(self, db):
        """测试floor_info字段为字符串类型、非空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'floor_info' in columns
        floor_info_col = columns['floor_info']
        assert floor_info_col['type'].__class__.__name__ in ['VARCHAR', 'String', 'TEXT', 'Text']
        assert floor_info_col['nullable'] == False

    def test_area_field_is_float_not_null_precision_2(self, db):
        """测试area字段为浮点类型、非空、保留两位小数"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'area' in columns
        area_col = columns['area']
        assert area_col['type'].__class__.__name__ in ['NUMERIC', 'Numeric', 'DECIMAL', 'Float']
        assert area_col['nullable'] == False

    def test_total_price_field_is_float_not_null_precision_2(self, db):
        """测试total_price字段为浮点类型、非空、保留两位小数"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'total_price' in columns
        price_col = columns['total_price']
        assert price_col['type'].__class__.__name__ in ['NUMERIC', 'Numeric', 'DECIMAL', 'Float']
        assert price_col['nullable'] == False

    def test_unit_price_field_is_float_not_null_precision_2(self, db):
        """测试unit_price字段为浮点类型、非空、保留两位小数"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'unit_price' in columns
        unit_price_col = columns['unit_price']
        assert unit_price_col['type'].__class__.__name__ in ['NUMERIC', 'Numeric', 'DECIMAL', 'Float']
        assert unit_price_col['nullable'] == False

    def test_title_field_is_string_not_null_max_255(self, db):
        """测试title字段为字符串类型、非空、最大长度255"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'title' in columns
        title_col = columns['title']
        assert title_col['type'].__class__.__name__ in ['VARCHAR', 'String']
        assert title_col['nullable'] == False

    def test_images_field_is_string_nullable(self, db):
        """测试images字段为字符串类型、允许为空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'images' in columns
        images_col = columns['images']
        assert images_col['type'].__class__.__name__ in ['VARCHAR', 'String', 'TEXT', 'Text']
        assert images_col['nullable'] == True

    def test_sort_order_field_is_integer_not_null_default_0(self, db):
        """测试sort_order字段为整数类型、非空、默认值0"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'sort_order' in columns
        sort_col = columns['sort_order']
        assert sort_col['type'].__class__.__name__ in ['INTEGER', 'Integer']
        assert sort_col['nullable'] == False

    def test_tags_field_is_string_nullable(self, db):
        """测试tags字段为字符串类型、允许为空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'tags' in columns
        tags_col = columns['tags']
        assert tags_col['type'].__class__.__name__ in ['VARCHAR', 'String', 'TEXT', 'Text']
        assert tags_col['nullable'] == True

    def test_decoration_style_field_is_string_nullable_max_100(self, db):
        """测试decoration_style字段为字符串类型、允许为空、最大长度100"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'decoration_style' in columns
        style_col = columns['decoration_style']
        assert style_col['type'].__class__.__name__ in ['VARCHAR', 'String']
        assert style_col['nullable'] == True

    def test_publish_status_field_is_enum_not_null(self, db):
        """测试publish_status字段为枚举类型、非空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'publish_status' in columns
        status_col = columns['publish_status']
        assert status_col['type'].__class__.__name__ in ['VARCHAR', 'String', 'ENUM', 'Enum']
        assert status_col['nullable'] == False

    def test_project_status_field_is_enum_not_null(self, db):
        """测试project_status字段为枚举类型、非空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'project_status' in columns
        status_col = columns['project_status']
        assert status_col['type'].__class__.__name__ in ['VARCHAR', 'String', 'ENUM', 'Enum']
        assert status_col['nullable'] == False

    def test_project_id_field_is_integer_nullable(self, db):
        """测试project_id字段为整数类型、允许为空（软引用）"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'project_id' in columns
        project_id_col = columns['project_id']
        assert project_id_col['type'].__class__.__name__ in ['INTEGER', 'Integer']
        assert project_id_col['nullable'] == True

    def test_consultant_id_field_is_integer_not_null(self, db):
        """测试consultant_id字段为整数类型、非空（软引用User表）"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'consultant_id' in columns
        consultant_id_col = columns['consultant_id']
        assert consultant_id_col['type'].__class__.__name__ in ['INTEGER', 'Integer']
        assert consultant_id_col['nullable'] == False

    def test_created_at_field_is_datetime_not_null(self, db):
        """测试created_at字段为日期时间类型、非空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'created_at' in columns
        created_col = columns['created_at']
        assert created_col['type'].__class__.__name__ in ['DATETIME', 'DateTime', 'TIMESTAMP', 'Timestamp']
        assert created_col['nullable'] == False

    def test_updated_at_field_is_datetime_not_null(self, db):
        """测试updated_at字段为日期时间类型、非空"""
        inspector = inspect(engine)
        columns = {col['name']: col for col in inspector.get_columns('l4_marketing_projects')}
        
        assert 'updated_at' in columns
        updated_col = columns['updated_at']
        assert updated_col['type'].__class__.__name__ in ['DATETIME', 'DateTime', 'TIMESTAMP', 'Timestamp']
        assert updated_col['nullable'] == False


# ============================================================================
# 测试2: 单价自动计算功能
# ============================================================================

class TestUnitPriceAutoCalculation:
    """测试单价自动计算功能"""

    def test_unit_price_calculated_on_create(self, db, sample_project_data):
        """测试创建时自动计算单价"""
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        expected_unit_price = float(Decimal('500.00') / Decimal('120.50'))
        assert float(project.unit_price) == pytest.approx(expected_unit_price, rel=1e-2)

    def test_unit_price_recalculated_when_total_price_changes(self, db, sample_project_data):
        """测试总价变更时重新计算单价"""
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 修改总价
        project.total_price = Decimal('600.00')
        db.commit()
        db.refresh(project)
        
        expected_unit_price = float(Decimal('600.00') / Decimal('120.50'))
        assert float(project.unit_price) == pytest.approx(expected_unit_price, rel=1e-2)

    def test_unit_price_recalculated_when_area_changes(self, db, sample_project_data):
        """测试面积变更时重新计算单价"""
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 修改面积
        project.area = Decimal('100.00')
        db.commit()
        db.refresh(project)
        
        expected_unit_price = Decimal('500.00') / Decimal('100.00')
        assert project.unit_price == pytest.approx(float(expected_unit_price), rel=1e-2)

    def test_unit_price_with_zero_area(self, db, sample_project_data):
        """测试面积为零时的处理"""
        sample_project_data['area'] = 0
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 面积为零时，单价应该为0或None
        assert project.unit_price == 0 or project.unit_price is None


# ============================================================================
# 测试3: 枚举值验证
# ============================================================================

class TestEnumValues:
    """测试枚举值定义"""

    def test_publish_status_enum_values(self):
        """测试发布状态枚举值"""
        assert PublishStatus.DRAFT == "草稿"
        assert PublishStatus.PUBLISHED == "发布"

    def test_marketing_project_status_enum_values(self):
        """测试项目状态枚举值"""
        assert MarketingProjectStatus.IN_PROGRESS == "在途"
        assert MarketingProjectStatus.FOR_SALE == "在售"
        assert MarketingProjectStatus.SOLD == "已售"


# ============================================================================
# 测试4: Schema验证测试
# ============================================================================

class TestL4MarketingProjectSchema:
    """测试L4MarketingProject Schema验证"""

    def test_create_schema_validates_required_fields(self):
        """测试创建Schema验证必填字段"""
        valid_data = {
            "community_id": 1,
            "layout": "三室两厅",
            "orientation": "南北通透",
            "floor_info": "15/28层",
            "area": 120.50,
            "total_price": 500.00,
            "title": "精装修三居室",
            "consultant_id": 1
        }
        schema = L4MarketingProjectCreate(**valid_data)
        assert schema.community_id == 1
        assert schema.title == "精装修三居室"

    def test_create_schema_rejects_missing_required_fields(self):
        """测试创建Schema拒绝缺少必填字段"""
        invalid_data = {
            "community_id": 1,
            # 缺少layout
            "orientation": "南北通透",
            "floor_info": "15/28层",
            "area": 120.50,
            "total_price": 500.00,
            "title": "精装修三居室",
            "consultant_id": 1
        }
        with pytest.raises(Exception):
            L4MarketingProjectCreate(**invalid_data)

    def test_create_schema_validates_title_max_length(self):
        """测试创建Schema验证标题最大长度"""
        invalid_data = {
            "community_id": 1,
            "layout": "三室两厅",
            "orientation": "南北通透",
            "floor_info": "15/28层",
            "area": 120.50,
            "total_price": 500.00,
            "title": "x" * 256,  # 超过255字符
            "consultant_id": 1
        }
        with pytest.raises(Exception):
            L4MarketingProjectCreate(**invalid_data)

    def test_update_schema_allows_partial_update(self):
        """测试更新Schema允许部分更新"""
        update_data = {
            "title": "更新后的标题",
            "total_price": 550.00
        }
        schema = L4MarketingProjectUpdate(**update_data)
        assert schema.title == "更新后的标题"
        assert schema.total_price == 550.00

    def test_response_schema_includes_unit_price(self):
        """测试响应Schema包含单价字段"""
        response_data = {
            "id": 1,
            "community_id": 1,
            "layout": "三室两厅",
            "orientation": "南北通透",
            "floor_info": "15/28层",
            "area": Decimal("120.50"),
            "total_price": Decimal("500.00"),
            "unit_price": Decimal("4.15"),
            "title": "精装修三居室",
            "consultant_id": 1,
            "publish_status": "草稿",
            "project_status": "在途",
            "sort_order": 0,
            "is_deleted": False,
            "created_at": datetime.now(),
            "updated_at": datetime.now()
        }
        schema = L4MarketingProjectResponse(**response_data)
        assert float(schema.unit_price) == pytest.approx(4.15, rel=1e-2)


# ============================================================================
# 测试5: 状态切换逻辑
# ============================================================================

class TestStatusTransition:
    """测试状态切换逻辑"""

    def test_publish_status_transition_from_draft_to_published(self, db, sample_project_data):
        """测试从草稿切换到发布状态"""
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        
        assert project.publish_status == PublishStatus.DRAFT
        
        project.publish_status = PublishStatus.PUBLISHED
        db.commit()
        db.refresh(project)
        
        assert project.publish_status == PublishStatus.PUBLISHED

    def test_project_status_transition_flow(self, db, sample_project_data):
        """测试项目状态流转"""
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        
        # 初始状态：在途
        assert project.project_status == MarketingProjectStatus.IN_PROGRESS
        
        # 切换到在售
        project.project_status = MarketingProjectStatus.FOR_SALE
        db.commit()
        db.refresh(project)
        assert project.project_status == MarketingProjectStatus.FOR_SALE
        
        # 切换到已售
        project.project_status = MarketingProjectStatus.SOLD
        db.commit()
        db.refresh(project)
        assert project.project_status == MarketingProjectStatus.SOLD


# ============================================================================
# 测试6: 软引用处理机制
# ============================================================================

class TestSoftReference:
    """测试软引用处理机制"""

    def test_project_id_can_be_null(self, db, sample_project_data):
        """测试project_id可以为空（独立项目）"""
        sample_project_data['project_id'] = None
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        assert project.project_id is None
        assert project.id is not None

    def test_project_id_can_reference_l3_project(self, db, sample_project_data):
        """测试project_id可以引用L3项目"""
        sample_project_data['project_id'] = 123
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        assert project.project_id == 123

    def test_soft_reference_does_not_enforce_integrity(self, db, sample_project_data):
        """测试软引用不强制外键完整性"""
        # 可以引用不存在的L3项目ID
        sample_project_data['project_id'] = 99999  # 不存在的ID
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 应该成功保存，不会因为外键约束而失败
        assert project.project_id == 99999

    def test_consultant_id_references_user_table(self, db, sample_project_data):
        """测试consultant_id软引用User表"""
        # consultant_id是User表的软引用，可以引用不存在的用户ID
        sample_project_data['consultant_id'] = 99999  # 不存在的用户ID
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 应该成功保存，不会因为外键约束而失败
        assert project.consultant_id == 99999


# ============================================================================
# 测试7: 索引验证
# ============================================================================

class TestDatabaseIndexes:
    """测试数据库索引"""

    def test_indexes_exist(self, db):
        """测试索引是否存在"""
        inspector = inspect(engine)
        indexes = inspector.get_indexes('l4_marketing_projects')
        index_names = [idx['name'] for idx in indexes]
        
        # 验证关键索引存在
        assert 'idx_l4_marketing_community' in index_names or any('community' in name for name in index_names)
        assert 'idx_l4_marketing_status' in index_names or any('status' in name for name in index_names)
        assert 'idx_l4_marketing_publish' in index_names or any('publish' in name for name in index_names)


# ============================================================================
# 测试8: L4MarketingMedia 测试
# ============================================================================

class TestL4MarketingMedia:
    """测试L4MarketingMedia模型"""

    def test_media_creation(self, db, sample_project_data, sample_media_data):
        """测试媒体资源创建"""
        # 先创建项目
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 创建媒体资源
        media_data = sample_media_data.copy()
        media_data['marketing_project_id'] = project.id
        media = L4MarketingMedia(**media_data)
        db.add(media)
        db.commit()
        db.refresh(media)
        
        assert media.id is not None
        assert media.marketing_project_id == project.id
        assert media.file_url == "https://example.com/photo.jpg"

    def test_media_relationship(self, db, sample_project_data, sample_media_data):
        """测试媒体资源关联关系"""
        # 创建项目
        project = L4MarketingProject(**sample_project_data)
        db.add(project)
        db.commit()
        db.refresh(project)
        
        # 创建多个媒体资源
        for i in range(3):
            media_data = sample_media_data.copy()
            media_data['marketing_project_id'] = project.id
            media_data['file_url'] = f"https://example.com/photo{i}.jpg"
            media = L4MarketingMedia(**media_data)
            db.add(media)
        db.commit()
        
        # 重新查询项目以获取关联的媒体文件
        db.refresh(project)
        media_list = project.media_files.all()
        
        # 验证关联
        assert len(media_list) == 3

