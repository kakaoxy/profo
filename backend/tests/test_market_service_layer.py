"""
TDD tests for Iteration 4: Market 模块 Router→Service 分层合规

Tests verify that new service layer methods work correctly before
migrating router code to use them.
"""
import pytest
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from models import Base, Community, PropertyCurrent, PropertyStatus, PropertyMedia
from models.common.base import MediaType
from schemas import PropertyDetailResponse, CommunitySearchResponse, CommunityListResponse


SQLALCHEMY_DATABASE_URL = "sqlite:///./test_market_service.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(scope="function")
def db():
    Base.metadata.create_all(bind=engine)
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.rollback()
        session.close()
        Base.metadata.drop_all(bind=engine)


@pytest.fixture
def sample_community(db):
    community = Community(
        name="测试小区A",
        district="朝阳区",
        business_circle="CBD",
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(community)
    db.commit()
    db.refresh(community)
    return community


@pytest.fixture
def sample_property(db, sample_community):
    prop = PropertyCurrent(
        data_source="链家",
        source_property_id="TEST001",
        community_id=sample_community.id,
        status=PropertyStatus.FOR_SALE,
        rooms=3,
        halls=2,
        baths=2,
        orientation="南",
        floor_original="15/28",
        floor_number=15,
        total_floors=28,
        floor_level="中楼层",
        build_area=120.5,
        listed_price_wan=800.0,
        listed_date=datetime(2024, 1, 1),
        property_type="住宅",
        build_year=2015,
        decoration="精装",
        elevator=True,
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


@pytest.fixture
def sample_media(db, sample_property):
    media = PropertyMedia(
        data_source=sample_property.data_source,
        source_property_id=sample_property.source_property_id,
        media_type=MediaType.INTERIOR,
        url="http://example.com/photo1.jpg",
        sort_order=1,
    )
    db.add(media)
    db.commit()
    db.refresh(media)
    return media


class TestPropertyServiceGetDetail:
    """Test PropertyService.get_detail() method"""

    def test_get_detail_returns_correct_property(self, db, sample_community, sample_property, sample_media):
        """PropertyService.get_detail() should return a PropertyDetailResponse with correct data"""
        from services.market.property_service import PropertyService

        service = PropertyService()
        detail = service.get_detail(db, sample_property.id)

        assert isinstance(detail, PropertyDetailResponse)
        assert detail.id == sample_property.id
        assert detail.community_name == "测试小区A"
        assert detail.district == "朝阳区"
        assert detail.layout_display == "3室2厅2卫"
        assert detail.unit_price > 0
        assert detail.picture_links == ["http://example.com/photo1.jpg"]

    def test_get_detail_nonexistent_property(self, db):
        """PropertyService.get_detail() should raise ValueError for non-existent property"""
        from services.market.property_service import PropertyService

        service = PropertyService()
        with pytest.raises(ValueError, match="房源不存在"):
            service.get_detail(db, 99999)

    def test_get_detail_inactive_property_not_returned(self, db, sample_community, sample_property):
        """PropertyService.get_detail() should not return inactive properties"""
        sample_property.is_active = False
        db.commit()

        from services.market.property_service import PropertyService

        service = PropertyService()
        with pytest.raises(ValueError, match="房源不存在"):
            service.get_detail(db, sample_property.id)


class TestPropertyServiceSearchCommunities:
    """Test PropertyService.search_communities() method"""

    def test_search_communities_by_name(self, db, sample_community):
        """search_communities should find communities by name"""
        from services.market.property_service import PropertyService

        service = PropertyService()
        results = service.search_communities(db, "测试")

        assert len(results) > 0
        assert isinstance(results[0], CommunitySearchResponse)
        assert results[0].name == "测试小区A"

    def test_search_communities_no_match(self, db):
        """search_communities should return empty list when no match"""
        from services.market.property_service import PropertyService

        service = PropertyService()
        results = service.search_communities(db, "不存在的小区XYZ")

        assert len(results) == 0

    def test_search_communities_limit(self, db):
        """search_communities should respect the 20 result limit"""
        for i in range(25):
            c = Community(
                name=f"测试小区{i:03d}",
                is_active=True,
                created_at=datetime.now(),
                updated_at=datetime.now()
            )
            db.add(c)
        db.commit()

        from services.market.property_service import PropertyService

        service = PropertyService()
        results = service.search_communities(db, "测试")

        assert len(results) <= 20


class TestCommunityQueryService:
    """Test CommunityQueryService moved to services layer"""

    def test_query_communities_returns_paginated(self, db, sample_community):
        """CommunityQueryService.query_communities() should return paginated results"""
        from services.market.community_service import CommunityQueryService

        service = CommunityQueryService()
        result = service.query_communities(db, page=1, page_size=50)

        assert isinstance(result, CommunityListResponse)
        assert result.total >= 1
        assert len(result.items) >= 1
        assert result.items[0].name == "测试小区A"

    def test_query_communities_with_search(self, db, sample_community):
        """CommunityQueryService should filter by search term"""
        from services.market.community_service import CommunityQueryService

        service = CommunityQueryService()
        result = service.query_communities(db, search="测试小区")

        assert result.total >= 1

        result_no_match = service.query_communities(db, search="XYZNOMATCH")
        assert result_no_match.total == 0

    def test_find_existing_community_by_name(self, db, sample_community):
        """_find_existing_community_by_name should find case-insensitive match"""
        from services.market.community_service import _find_existing_community_by_name

        found = _find_existing_community_by_name(db, "测试小区a")
        assert found is not None
        assert found.id == sample_community.id

        not_found = _find_existing_community_by_name(db, "不存在的小区")
        assert not_found is None