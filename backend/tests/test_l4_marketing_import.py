"""
L4 营销项目导入功能单元测试
测试从L3项目导入数据到L4营销房源
"""
import pytest
import sys
import os
from decimal import Decimal

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, Project, ProjectContract, ProjectSale, RenovationPhoto
from models.common import ProjectStatus
from models.marketing import L4MarketingProject
from services.l4_marketing_query import L4MarketingQueryService
from services.l4_marketing_import import L4MarketingImportService

SQLALCHEMY_DATABASE_URL = "sqlite:///./test_l4_import.db"
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
def sample_l3_project(db):
    """创建样本L3项目"""
    project = Project(
        id="test-project-001",
        name="测试小区 - 1号楼1单元101",
        community_name="测试小区",
        address="1号楼1单元101",
        area=Decimal("120.50"),
        layout="三室两厅",
        orientation="南北通透",
        status=ProjectStatus.SIGNING
    )
    db.add(project)
    db.commit()

    # 添加合同
    contract = ProjectContract(
        project_id=project.id,
        signing_price=Decimal("500.00"),
        contract_status="生效"
    )
    db.add(contract)
    db.commit()

    return project


class TestL4MarketingQueryService:
    """测试L4营销查询服务"""

    def test_get_available_l3_projects_empty(self, db):
        """测试空列表查询"""
        service = L4MarketingQueryService(db)
        items, total = service.get_available_l3_projects()
        
        assert items == []
        assert total == 0

    def test_get_available_l3_projects_with_data(self, db, sample_l3_project):
        """测试有数据时的查询"""
        service = L4MarketingQueryService(db)
        items, total = service.get_available_l3_projects()
        
        assert total == 1
        assert len(items) == 1
        assert items[0].id == "test-project-001"
        assert items[0].community_name == "测试小区"

    def test_get_available_l3_projects_filter_by_community(self, db, sample_l3_project):
        """测试按小区名称筛选"""
        service = L4MarketingQueryService(db)
        items, total = service.get_available_l3_projects(community_name="测试")
        
        assert total == 1
        assert len(items) == 1

    def test_get_available_l3_projects_pagination(self, db):
        """测试分页功能"""
        # 创建多个项目
        for i in range(5):
            project = Project(
                id=f"test-project-{i:03d}",
                name=f"项目{i}",
                community_name=f"小区{i}",
                address=f"地址{i}",
                status=ProjectStatus.SIGNING
            )
            db.add(project)
        db.commit()

        service = L4MarketingQueryService(db)
        items, total = service.get_available_l3_projects(page=1, page_size=2)

        assert total == 5
        assert len(items) == 2

    def test_check_project_exists_true(self, db, sample_l3_project):
        """测试项目存在检查 - 存在"""
        service = L4MarketingQueryService(db)
        assert service.check_project_exists("test-project-001") is True

    def test_check_project_exists_false(self, db):
        """测试项目存在检查 - 不存在"""
        service = L4MarketingQueryService(db)
        assert service.check_project_exists("non-existent") is False


class TestL4MarketingImportService:
    """测试L4营销导入服务"""

    def test_import_from_nonexistent_project(self, db):
        """测试导入不存在的项目"""
        service = L4MarketingImportService(db)
        result = service.import_from_l3_project("non-existent")
        
        assert result is None

    def test_import_from_valid_project(self, db, sample_l3_project):
        """测试从有效项目导入"""
        service = L4MarketingImportService(db)
        result = service.import_from_l3_project("test-project-001")
        
        assert result is not None
        assert result.project_id == "test-project-001"
        assert result.community_name == "测试小区"
        assert result.layout == "三室两厅"
        assert result.orientation == "南北通透"
        assert result.area == Decimal("120.50")
        assert result.total_price == Decimal("500.00")
        assert result.unit_price == Decimal("500.00") / Decimal("120.50")

    def test_import_generates_title(self, db, sample_l3_project):
        """测试标题生成"""
        service = L4MarketingImportService(db)
        result = service.import_from_l3_project("test-project-001")
        
        assert "测试小区" in result.title
        assert "三室两厅" in result.title

    def test_import_with_media(self, db, sample_l3_project):
        """测试导入包含媒体资源"""
        # 添加媒体资源
        photo = RenovationPhoto(
            project_id=sample_l3_project.id,
            url="https://example.com/photo.jpg",
            stage="水电",
            description="测试照片"
        )
        db.add(photo)
        db.commit()

        service = L4MarketingImportService(db)
        result = service.import_from_l3_project("test-project-001")

        assert len(result.available_media) == 1
        assert result.available_media[0].file_url == "https://example.com/photo.jpg"

    def test_calculate_unit_price(self, db):
        """测试单价计算"""
        service = L4MarketingImportService(db)
        
        # 正常计算
        price = service._calculate_unit_price(Decimal("100"), Decimal("500"))
        assert price == Decimal("5")
        
        # 面积为空
        price = service._calculate_unit_price(None, Decimal("500"))
        assert price is None
        
        # 总价为空
        price = service._calculate_unit_price(Decimal("100"), None)
        assert price is None

    def test_generate_title(self, db):
        """测试标题生成逻辑"""
        service = L4MarketingImportService(db)

        # 完整信息
        project = Project(
            community_name="小区A",
            layout="三室",
            orientation="南北"
        )
        title = service._generate_title(project)
        assert "小区A" in title
        assert "三室" in title

        # 只有小区名
        project = Project(community_name="小区B")
        title = service._generate_title(project)
        assert title == "小区B"

        # 无信息
        project = Project()
        title = service._generate_title(project)
        assert title == "未命名房源"

    def test_extract_floor_info(self, db):
        """测试楼层信息提取"""
        service = L4MarketingImportService(db)

        # 标准格式：X号楼X单元XXX室
        assert service._extract_floor_info("1号楼2单元301室") == "3层"
        assert service._extract_floor_info("12号楼1单元1502室") == "15层"
        assert service._extract_floor_info("8号楼3单元0801室") == "8层"

        # 栋/号楼格式
        assert service._extract_floor_info("1栋2单元501室") == "5层"
        assert service._extract_floor_info("5号楼201室") == "2层"

        # 只有房间号
        assert service._extract_floor_info("301室") == "3层"
        assert service._extract_floor_info("1502室") == "15层"

        # 无法提取的情况
        assert service._extract_floor_info("") is None
        assert service._extract_floor_info(None) is None
        assert service._extract_floor_info("无具体地址") is None

    def test_import_with_floor_info(self, db):
        """测试导入时包含楼层信息"""
        project = Project(
            id="test-floor-project",
            name="测试楼层项目",
            community_name="测试小区",
            address="5号楼2单元1203室",
            area=Decimal("100.00"),
            layout="两室一厅",
            status=ProjectStatus.SIGNING
        )
        db.add(project)
        db.commit()

        service = L4MarketingImportService(db)
        result = service.import_from_l3_project("test-floor-project")

        assert result is not None
        assert result.floor_info == "12层"
