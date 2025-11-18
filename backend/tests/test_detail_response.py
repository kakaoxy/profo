from datetime import datetime
from backend.models import PropertyCurrent, Community, PropertyStatus
from backend.schemas import PropertyDetailResponse, PropertyResponse


def test_detail_layout_and_floor_display_complete():
    community = Community(name="示例小区", district="徐汇", business_circle="万体馆", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
    prop = PropertyCurrent(
        id=101,
        data_source="api",
        source_property_id="D001",
        community_id=1,
        status=PropertyStatus.FOR_SALE,
        rooms=3,
        halls=2,
        baths=2,
        orientation="南",
        floor_original="3/15",
        floor_number=3,
        total_floors=15,
        build_area=100.0,
        listed_price_wan=500.0,
        listed_date=datetime(2024, 1, 1),
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    resp = PropertyDetailResponse.from_orm_with_calculations(prop, community)
    assert resp.layout_display == "3室2厅2卫"
    assert resp.floor_display == "3/15层"
    assert resp.unit_price == 500.0 * 10000 / 100.0


def test_detail_layout_degrade_when_missing():
    community = Community(name="示例小区", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
    prop = PropertyCurrent(
        id=102,
        data_source="api",
        source_property_id="D002",
        community_id=1,
        status=PropertyStatus.FOR_SALE,
        rooms=2,
        halls=0,
        baths=0,
        orientation="南",
        floor_original="高楼层/25",
        build_area=80.0,
        listed_price_wan=400.0,
        listed_date=datetime(2024, 1, 1),
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    resp = PropertyDetailResponse.from_orm_with_calculations(prop, community)
    assert resp.layout_display == "2室"
    assert resp.floor_display == "高楼层/25"


def test_detail_transaction_duration_and_discount_rate():
    community = Community(name="示例小区", is_active=True, created_at=datetime.now(), updated_at=datetime.now())
    prop = PropertyCurrent(
        id=103,
        data_source="api",
        source_property_id="D003",
        community_id=1,
        status=PropertyStatus.SOLD,
        rooms=3,
        halls=2,
        baths=2,
        orientation="南",
        floor_original="15/28",
        build_area=120.0,
        listed_price_wan=500.0,
        sold_price_wan=480.0,
        listed_date=datetime(2024, 1, 1),
        sold_date=datetime(2024, 1, 31),
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    resp = PropertyDetailResponse.from_orm_with_calculations(prop, community)
    assert resp.transaction_duration_days == 30
    assert resp.transaction_duration_display == "30天"
    assert resp.discount_rate_display == "4.0%" or resp.discount_rate_display == "4.00%"


def test_list_response_floor_display_suffix():
    community_name = "示例小区"
    prop = PropertyCurrent(
        id=104,
        data_source="api",
        source_property_id="L001",
        community_id=1,
        status=PropertyStatus.FOR_SALE,
        rooms=3,
        halls=2,
        baths=2,
        orientation="南",
        floor_original="3/15",
        floor_number=3,
        total_floors=15,
        build_area=100.0,
        listed_price_wan=500.0,
        listed_date=datetime(2024, 1, 1),
        is_active=True,
        created_at=datetime.now(),
        updated_at=datetime.now()
    )

    resp = PropertyResponse.from_orm_with_calculations(prop, community_name)
    assert resp.floor_display.endswith("层")
    assert resp.layout_display == "3室2厅2卫"