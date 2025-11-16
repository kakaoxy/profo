"""
Unit tests for PropertyImporter
Tests requirements 2.4, 2.5, 2.6, 2.7, 2.8, 10.1, 10.2
"""
import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, Community, CommunityAlias, PropertyCurrent, PropertyHistory, PropertyStatus, ChangeType
from schemas import PropertyIngestionModel
from services.importer import PropertyImporter


@pytest.fixture
def db_session():
    """Create in-memory database for testing"""
    engine = create_engine("sqlite:///:memory:", echo=False)
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def importer():
    """Create PropertyImporter instance"""
    return PropertyImporter()


class TestFindOrCreateCommunity:
    """Test find_or_create_community() method - Requirements 2.4, 2.5"""
    
    def test_create_new_community(self, importer, db_session):
        """Test creating a new community when it doesn't exist"""
        community_id = importer.find_or_create_community("测试小区A", db_session)
        
        assert community_id is not None
        community = db_session.query(Community).filter_by(id=community_id).first()
        assert community is not None
        assert community.name == "测试小区A"
        assert community.is_active is True
    
    def test_find_existing_community(self, importer, db_session):
        """Test finding an existing community"""
        # Create community first
        community = Community(name="测试小区B", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
        db_session.add(community)
        db_session.commit()
        
        # Try to find it
        community_id = importer.find_or_create_community("测试小区B", db_session)
        
        assert community_id == community.id
        # Verify only one community exists
        count = db_session.query(Community).filter_by(name="测试小区B").count()
        assert count == 1
    
    def test_find_community_by_alias(self, importer, db_session):
        """Test finding community through alias table"""
        # Create primary community
        community = Community(name="主小区", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
        db_session.add(community)
        db_session.commit()
        
        # Create alias
        alias = CommunityAlias(community_id=community.id, alias_name="别名小区", data_source="链家", created_at=datetime.now())
        db_session.add(alias)
        db_session.commit()
        
        # Find by alias
        community_id = importer.find_or_create_community("别名小区", db_session)
        
        assert community_id == community.id
    
    def test_create_community_with_optional_fields(self, importer, db_session):
        """Test creating community with optional fields"""
        community_id = importer.find_or_create_community(
            "测试小区C",
            db_session,
            city_id=1,
            district="朝阳区",
            business_circle="CBD"
        )
        
        community = db_session.query(Community).filter_by(id=community_id).first()
        assert community.city_id == 1
        assert community.district == "朝阳区"
        assert community.business_circle == "CBD"
    
    def test_strip_whitespace_in_community_name(self, importer, db_session):
        """Test that whitespace is stripped from community name"""
        community_id = importer.find_or_create_community("  测试小区D  ", db_session)
        
        community = db_session.query(Community).filter_by(id=community_id).first()
        assert community.name == "测试小区D"


class TestCreateHistorySnapshot:
    """Test create_history_snapshot() method - Requirements 2.7, 10.1"""
    
    def test_create_history_snapshot_basic(self, importer, db_session):
        """Test creating a basic history snapshot"""
        # Create community and property
        community = Community(name="测试小区", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
        db_session.add(community)
        db_session.commit()
        
        property_obj = PropertyCurrent(
            data_source="链家",
            source_property_id="TEST001",
            community_id=community.id,
            status=PropertyStatus.FOR_SALE,
            rooms=3,
            halls=2,
            baths=2,
            orientation="南",
            floor_original="15/28",
            build_area=120.5,
            listed_price_wan=800.0,
            listed_date=datetime(2024, 1, 1),
            is_active=True,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db_session.add(property_obj)
        db_session.commit()
        
        # Create history snapshot
        importer.create_history_snapshot(property_obj, ChangeType.PRICE_CHANGE, db_session)
        db_session.commit()
        
        # Verify history was created
        history = db_session.query(PropertyHistory).filter_by(source_property_id="TEST001").first()
        assert history is not None
        assert history.data_source == "链家"
        assert history.change_type == ChangeType.PRICE_CHANGE
        assert history.status == PropertyStatus.FOR_SALE
        assert history.listed_price_wan == 800.0
        assert history.rooms == 3
        assert history.build_area == 120.5
    
    def test_create_history_snapshot_for_sold_property(self, importer, db_session):
        """Test creating history snapshot for sold property"""
        community = Community(name="测试小区", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
        db_session.add(community)
        db_session.commit()
        
        property_obj = PropertyCurrent(
            data_source="贝壳",
            source_property_id="TEST002",
            community_id=community.id,
            status=PropertyStatus.SOLD,
            rooms=2,
            orientation="东",
            floor_original="10/20",
            build_area=85.0,
            sold_price_wan=550.0,
            sold_date=datetime(2024, 2, 15),
            is_active=True,
            created_at=datetime.now(),
            updated_at=datetime.now()
        )
        db_session.add(property_obj)
        db_session.commit()
        
        # Create history snapshot
        importer.create_history_snapshot(property_obj, ChangeType.STATUS_CHANGE, db_session)
        db_session.commit()
        
        # Verify history
        history = db_session.query(PropertyHistory).filter_by(source_property_id="TEST002").first()
        assert history is not None
        assert history.status == PropertyStatus.SOLD
        assert history.sold_price_wan == 550.0
        assert history.change_type == ChangeType.STATUS_CHANGE


class TestImportProperty:
    """Test import_property() method - Requirements 2.6, 2.7, 2.8, 10.2"""
    
    def test_import_new_property_for_sale(self, importer, db_session):
        """Test importing a new property (for sale)"""
        data = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST001",
            状态="在售",
            小区名="测试小区A",
            室=3,
            厅=2,
            卫=2,
            朝向="南",
            楼层="15/28",
            面积=120.5,
            挂牌价=800.0,
            上架时间=datetime(2024, 1, 1, 10, 0, 0)
        )
        
        result = importer.import_property(data, db_session)
        
        assert result.success is True
        assert result.property_id is not None
        assert result.error is None
        
        # Verify property was created
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST001").first()
        assert property_obj is not None
        assert property_obj.data_source == "链家"
        assert property_obj.status == PropertyStatus.FOR_SALE
        assert property_obj.rooms == 3
        assert property_obj.listed_price_wan == 800.0
        assert property_obj.floor_number == 15
        assert property_obj.total_floors == 28
        assert property_obj.floor_level == "中楼层"
    
    def test_import_new_property_sold(self, importer, db_session):
        """Test importing a new sold property"""
        data = PropertyIngestionModel(
            数据源="贝壳",
            房源ID="TEST002",
            状态="成交",
            小区名="测试小区B",
            室=2,
            厅=1,
            卫=1,
            朝向="东南",
            楼层="高楼层/18",
            面积=85.0,
            成交价=550.0,
            成交时间=datetime(2024, 2, 15, 14, 30, 0),
            上架时间=datetime(2024, 1, 10, 9, 0, 0)
        )
        
        result = importer.import_property(data, db_session)
        
        assert result.success is True
        
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST002").first()
        assert property_obj.status == PropertyStatus.SOLD
        assert property_obj.sold_price_wan == 550.0
        assert property_obj.floor_level == "高楼层"
    
    def test_update_existing_property_price_change(self, importer, db_session):
        """Test updating existing property with price change"""
        # Import initial property
        data1 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST003",
            状态="在售",
            小区名="测试小区C",
            室=3,
            朝向="南",
            楼层="10/20",
            面积=100.0,
            挂牌价=600.0,
            上架时间=datetime(2024, 1, 1)
        )
        result1 = importer.import_property(data1, db_session)
        assert result1.success is True
        
        # Update with new price
        data2 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST003",
            状态="在售",
            小区名="测试小区C",
            室=3,
            朝向="南",
            楼层="10/20",
            面积=100.0,
            挂牌价=550.0,
            上架时间=datetime(2024, 1, 1)
        )
        result2 = importer.import_property(data2, db_session)
        
        assert result2.success is True
        
        # Verify property was updated
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST003").first()
        assert property_obj.listed_price_wan == 550.0
        
        # Verify history was created
        history = db_session.query(PropertyHistory).filter_by(source_property_id="TEST003").first()
        assert history is not None
        assert history.listed_price_wan == 600.0
        assert history.change_type == ChangeType.PRICE_CHANGE
    
    def test_update_existing_property_status_change(self, importer, db_session):
        """Test updating property status from for sale to sold"""
        # Import as for sale
        data1 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST004",
            状态="在售",
            小区名="测试小区D",
            室=2,
            朝向="北",
            楼层="5/10",
            面积=80.0,
            挂牌价=500.0,
            上架时间=datetime(2024, 1, 1)
        )
        importer.import_property(data1, db_session)
        
        # Update to sold
        data2 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST004",
            状态="成交",
            小区名="测试小区D",
            室=2,
            朝向="北",
            楼层="5/10",
            面积=80.0,
            成交价=480.0,
            成交时间=datetime(2024, 3, 15),
            上架时间=datetime(2024, 1, 1)
        )
        result = importer.import_property(data2, db_session)
        
        assert result.success is True
        
        # Verify status changed
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST004").first()
        assert property_obj.status == PropertyStatus.SOLD
        assert property_obj.sold_price_wan == 480.0
        
        # Verify history with status change
        history = db_session.query(PropertyHistory).filter_by(source_property_id="TEST004").first()
        assert history is not None
        assert history.change_type == ChangeType.STATUS_CHANGE
        assert history.status == PropertyStatus.FOR_SALE
    
    def test_import_property_creates_community(self, importer, db_session):
        """Test that importing property creates community if not exists"""
        data = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST005",
            状态="在售",
            小区名="新小区",
            室=2,
            朝向="南",
            楼层="8/16",
            面积=90.0,
            挂牌价=700.0,
            上架时间=datetime(2024, 1, 1)
        )
        
        result = importer.import_property(data, db_session)
        
        assert result.success is True
        
        # Verify community was created
        community = db_session.query(Community).filter_by(name="新小区").first()
        assert community is not None
        
        # Verify property is linked to community
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST005").first()
        assert property_obj.community_id == community.id
    
    def test_import_property_reuses_existing_community(self, importer, db_session):
        """Test that importing property reuses existing community"""
        # Import first property
        data1 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST006",
            状态="在售",
            小区名="共享小区",
            室=2,
            朝向="南",
            楼层="5/10",
            面积=80.0,
            挂牌价=500.0,
            上架时间=datetime(2024, 1, 1)
        )
        importer.import_property(data1, db_session)
        
        # Import second property with same community
        data2 = PropertyIngestionModel(
            数据源="贝壳",
            房源ID="TEST007",
            状态="在售",
            小区名="共享小区",
            室=3,
            朝向="东",
            楼层="8/10",
            面积=100.0,
            挂牌价=650.0,
            上架时间=datetime(2024, 1, 1)
        )
        importer.import_property(data2, db_session)
        
        # Verify only one community exists
        communities = db_session.query(Community).filter_by(name="共享小区").all()
        assert len(communities) == 1
        
        # Verify both properties use same community
        prop1 = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST006").first()
        prop2 = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST007").first()
        assert prop1.community_id == prop2.community_id
    
    def test_import_property_with_floor_parsing(self, importer, db_session):
        """Test that floor information is correctly parsed during import"""
        data = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST008",
            状态="在售",
            小区名="测试小区",
            室=2,
            朝向="南",
            楼层="3/6",
            面积=75.0,
            挂牌价=450.0,
            上架时间=datetime(2024, 1, 1)
        )
        
        result = importer.import_property(data, db_session)
        
        assert result.success is True
        
        property_obj = db_session.query(PropertyCurrent).filter_by(source_property_id="TEST008").first()
        assert property_obj.floor_number == 3
        assert property_obj.total_floors == 6
        assert property_obj.floor_level == "中楼层"
    
    def test_import_property_multiple_updates(self, importer, db_session):
        """Test multiple updates create multiple history records"""
        # Initial import
        data1 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST009",
            状态="在售",
            小区名="测试小区",
            室=2,
            朝向="南",
            楼层="5/10",
            面积=80.0,
            挂牌价=500.0,
            上架时间=datetime(2024, 1, 1)
        )
        importer.import_property(data1, db_session)
        
        # First update - price change
        data2 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST009",
            状态="在售",
            小区名="测试小区",
            室=2,
            朝向="南",
            楼层="5/10",
            面积=80.0,
            挂牌价=480.0,
            上架时间=datetime(2024, 1, 1)
        )
        importer.import_property(data2, db_session)
        
        # Second update - status change
        data3 = PropertyIngestionModel(
            数据源="链家",
            房源ID="TEST009",
            状态="成交",
            小区名="测试小区",
            室=2,
            朝向="南",
            楼层="5/10",
            面积=80.0,
            成交价=470.0,
            成交时间=datetime(2024, 3, 15),
            上架时间=datetime(2024, 1, 1)
        )
        importer.import_property(data3, db_session)
        
        # Verify multiple history records
        history_count = db_session.query(PropertyHistory).filter_by(source_property_id="TEST009").count()
        assert history_count == 2
        
        # Verify change types
        histories = db_session.query(PropertyHistory).filter_by(
            source_property_id="TEST009"
        ).order_by(PropertyHistory.captured_at).all()
        assert histories[0].change_type == ChangeType.PRICE_CHANGE
        assert histories[1].change_type == ChangeType.STATUS_CHANGE
