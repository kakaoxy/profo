"""PropertyImporter 单元测试."""

from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from sqlalchemy.exc import IntegrityError, SQLAlchemyError

from models import ChangeType, MediaType, PropertyStatus
from schemas import ImportResult, PropertyIngestionModel
from schemas.enums import IngestionStatus
from services.market.importer import PropertyImporter, _CommunityData


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


def _make_ingestion_data(**overrides) -> PropertyIngestionModel:
    """构造 PropertyIngestionModel 测试数据.

    默认构造在售房源，包含 model_validator 要求的 listed_date.
    传入 状态="成交" 时需同时提供 成交价 和 成交时间.
    """
    defaults = {
        "数据源": "lianjia",
        "房源ID": "SH12345",
        "状态": "在售",
        "小区名": "测试小区",
        "室": 2,
        "厅": 1,
        "卫": 1,
        "朝向": "南",
        "楼层": "中楼层/共18层",
        "面积": 89.5,
        "挂牌价": 500.0,
        "上架时间": "2025-01-01T00:00:00",
    }
    defaults.update(overrides)

    # 成交房源需要成交价和成交时间
    if defaults.get("状态") == "成交":
        defaults.setdefault("成交价", 460.0)
        defaults.setdefault("成交时间", "2025-06-01T00:00:00")

    return PropertyIngestionModel(**defaults)


@pytest.fixture
def importer() -> PropertyImporter:
    return PropertyImporter()


@pytest.fixture
def mock_db() -> MagicMock:
    db = MagicMock()
    # begin_nested 返回一个支持 commit/rollback 的上下文
    nested = MagicMock()
    nested.commit = MagicMock()
    nested.rollback = MagicMock()
    db.begin_nested.return_value = nested
    return db


@pytest.fixture
def mock_community() -> MagicMock:
    """模拟已存在的小区对象."""
    community = MagicMock()
    community.id = "community-001"
    community.name = "测试小区"
    community.city_id = 1
    community.district = "浦东"
    community.business_circle = "陆家嘴"
    community.is_active = True
    return community


@pytest.fixture
def mock_existing_property() -> MagicMock:
    """模拟已存在的房源对象."""
    prop = MagicMock()
    prop.id = 999
    prop.data_source = "lianjia"
    prop.source_property_id = "SH12345"
    prop.status = PropertyStatus.FOR_SALE
    prop.listed_price_wan = 500.0
    prop.sold_price_wan = None
    prop.community_id = "community-001"
    prop.rooms = 2
    prop.build_area = 89.5
    prop.listed_price_wan = 500.0
    prop.sold_price_wan = None
    prop.listed_date = None
    prop.sold_date = None
    prop.floor_original = "中楼层/共18层"
    prop.orientation = "南"
    prop.decoration = None
    return prop


# ===========================================================================
# import_property
# ===========================================================================


class TestImportProperty:
    """import_property 入口方法测试."""

    @patch("services.market.importer.save_failed_record")
    def test_create_new_property_success(self, mock_save, importer, mock_db):
        """新房源导入成功."""
        data = _make_ingestion_data()

        # 模拟小区不存在 -> 创建新小区
        mock_db.query.return_value.filter.return_value.first.return_value = None
        # 模拟 db.get (别名查找) 也返回 None
        mock_db.get.return_value = None

        # 新创建的 PropertyCurrent 需要 id
        def mock_flush():
            for obj in mock_db.add.call_args_list:
                item = obj[0][0]
                if not hasattr(item, "id") or item.id is None:
                    item.id = 42
        mock_db.flush.side_effect = mock_flush

        result = importer.import_property(data, mock_db, user_id="user1")

        assert result.success is True
        assert result.property_id is not None
        assert result.error is None
        # 验证 begin_nested 被调用且 commit
        mock_db.begin_nested.assert_called_once()
        mock_db.begin_nested.return_value.commit.assert_called_once()

    @patch("services.market.importer.save_failed_record")
    def test_update_existing_property_success(self, mock_save, importer, mock_db, mock_existing_property):
        """更新已有房源成功."""
        data = _make_ingestion_data()

        # _get_existing_property 返回已有房源
        def query_side_effect(model):
            q = MagicMock()
            q.filter.return_value.first.return_value = mock_existing_property
            return q
        mock_db.query.side_effect = query_side_effect

        result = importer.import_property(data, mock_db, user_id="user1")

        assert result.success is True
        assert result.property_id == 999

    @patch("services.market.importer.save_failed_record")
    def test_import_rollback_on_error(self, mock_save, importer, mock_db):
        """导入过程中异常触发 rollback."""
        data = _make_ingestion_data()
        mock_db.begin_nested.side_effect = SQLAlchemyError("db error")

        result = importer.import_property(data, mock_db)

        assert result.success is False
        assert result.error is not None
        mock_save.assert_called_once()

    @patch("services.market.importer.save_failed_record")
    def test_import_inner_exception_rollback(self, mock_save, importer, mock_db):
        """内层事务异常触发 nested.rollback."""
        data = _make_ingestion_data()

        # 让 _process_import_transaction 抛异常
        with patch.object(importer, "_process_import_transaction", side_effect=ValueError("bad data")):
            result = importer.import_property(data, mock_db)

        assert result.success is False
        mock_db.begin_nested.return_value.rollback.assert_called_once()

    @patch("services.market.importer.save_failed_record")
    def test_import_integrity_error(self, mock_save, importer, mock_db):
        """IntegrityError 被正确处理."""
        data = _make_ingestion_data()
        mock_db.begin_nested.side_effect = IntegrityError("stmt", "params", Exception("orig"))

        result = importer.import_property(data, mock_db)

        assert result.success is False
        # 验证 save_failed_record 的 failure_type
        call_kwargs = mock_save.call_args[1]
        assert call_kwargs["failure_type"] == "database_integrity_error"


# ===========================================================================
# find_or_create_community
# ===========================================================================


class TestFindOrCreateCommunity:
    """小区查找/创建测试."""

    def test_find_by_name(self, importer, mock_db, mock_community):
        """通过名称匹配到已有小区."""
        data = _make_ingestion_data()

        mock_db.query.return_value.filter.return_value.first.return_value = mock_community

        community_id = importer.find_or_create_community(data, mock_db)

        assert community_id == "community-001"

    def test_find_by_alias(self, importer, mock_db, mock_community):
        """通过别名匹配到已有小区."""
        data = _make_ingestion_data(小区名="测试小区别名")

        # 名称匹配返回 None
        name_query = MagicMock()
        name_query.filter.return_value.first.return_value = None

        # 别名匹配返回 alias 对象
        alias_obj = MagicMock()
        alias_obj.community_id = "community-001"

        alias_query = MagicMock()
        alias_query.filter.return_value.first.return_value = alias_obj

        mock_db.get.return_value = mock_community
        mock_db.query.side_effect = [name_query, alias_query]

        community_id = importer.find_or_create_community(data, mock_db)

        assert community_id == "community-001"
        mock_db.get.assert_called_once()

    def test_create_new_community(self, importer, mock_db):
        """小区不存在时创建新小区."""
        data = _make_ingestion_data()

        mock_db.query.return_value.filter.return_value.first.return_value = None

        def mock_flush():
            for call in mock_db.add.call_args_list:
                obj = call[0][0]
                obj.id = "new-community-id"
        mock_db.flush.side_effect = mock_flush

        community_id = importer.find_or_create_community(data, mock_db)

        assert community_id == "new-community-id"
        mock_db.add.assert_called_once()

    def test_string_data_backward_compat(self, importer, mock_db, mock_community):
        """传入字符串（向后兼容）时正确处理."""
        mock_db.query.return_value.filter.return_value.first.return_value = mock_community

        community_id = importer.find_or_create_community("测试小区", mock_db, city_id=2, district="静安")

        assert community_id == "community-001"

    def test_update_community_info_when_missing(self, importer, mock_db):
        """已有小区缺少信息时补充更新."""
        data = _make_ingestion_data(城市ID=3, 行政区="徐汇", 商圈="田林")

        community = MagicMock()
        community.id = "community-001"
        community.city_id = None
        community.district = None
        community.business_circle = None

        mock_db.query.return_value.filter.return_value.first.return_value = community

        importer.find_or_create_community(data, mock_db)

        assert community.city_id == 3
        assert community.district == "徐汇"
        assert community.business_circle == "田林"
        mock_db.flush.assert_called()

    def test_no_update_when_community_info_present(self, importer, mock_db):
        """已有小区信息完整时不更新."""
        data = _make_ingestion_data(城市ID=3, 行政区="徐汇", 商圈="田林")

        community = MagicMock()
        community.id = "community-001"
        community.city_id = 1
        community.district = "浦东"
        community.business_circle = "陆家嘴"

        mock_db.query.return_value.filter.return_value.first.return_value = community

        importer.find_or_create_community(data, mock_db)

        # 不应更新已有值
        assert community.city_id == 1
        assert community.district == "浦东"
        assert community.business_circle == "陆家嘴"


# ===========================================================================
# _determine_change_type
# ===========================================================================


class TestDetermineChangeType:
    """变更类型判定测试."""

    def test_status_change(self, importer, mock_existing_property):
        """状态变更 -> STATUS_CHANGE."""
        mock_existing_property.status = PropertyStatus.FOR_SALE
        data = _make_ingestion_data(状态="成交")

        result = importer._determine_change_type(mock_existing_property, data)
        assert result == ChangeType.STATUS_CHANGE

    def test_price_change_for_sale(self, importer, mock_existing_property):
        """在售房源价格变更 -> PRICE_CHANGE."""
        mock_existing_property.status = PropertyStatus.FOR_SALE
        mock_existing_property.listed_price_wan = 500.0
        data = _make_ingestion_data(状态="在售", 挂牌价=480.0)

        result = importer._determine_change_type(mock_existing_property, data)
        assert result == ChangeType.PRICE_CHANGE

    def test_price_change_sold(self, importer, mock_existing_property):
        """成交房源价格变更 -> PRICE_CHANGE."""
        mock_existing_property.status = PropertyStatus.SOLD
        mock_existing_property.sold_price_wan = 450.0
        data = _make_ingestion_data(状态="成交", 成交价=460.0)

        result = importer._determine_change_type(mock_existing_property, data)
        assert result == ChangeType.PRICE_CHANGE

    def test_info_change(self, importer, mock_existing_property):
        """无状态和价格变化 -> INFO_CHANGE."""
        mock_existing_property.status = PropertyStatus.FOR_SALE
        mock_existing_property.listed_price_wan = 500.0
        data = _make_ingestion_data(状态="在售", 挂牌价=500.0)

        result = importer._determine_change_type(mock_existing_property, data)
        assert result == ChangeType.INFO_CHANGE


# ===========================================================================
# _handle_import_error
# ===========================================================================


class TestHandleImportError:
    """异常处理测试."""

    @patch("services.market.importer.save_failed_record")
    def test_generic_error(self, mock_save, importer):
        """普通异常返回 import_error 类型."""
        data = _make_ingestion_data()
        err = ValueError("something wrong")

        result = importer._handle_import_error(err, data)

        assert result.success is False
        assert result.error == "something wrong"
        mock_save.assert_called_once()
        assert mock_save.call_args[1]["failure_type"] == "import_error"

    @patch("services.market.importer.save_failed_record")
    def test_sqlalchemy_error(self, mock_save, importer):
        """SQLAlchemy 异常返回 database_error 类型."""
        data = _make_ingestion_data()
        err = SQLAlchemyError("db fail")

        result = importer._handle_import_error(err, data)

        assert result.success is False
        assert mock_save.call_args[1]["failure_type"] == "database_error"

    @patch("services.market.importer.save_failed_record")
    def test_integrity_error(self, mock_save, importer):
        """IntegrityError 返回 database_integrity_error 类型."""
        data = _make_ingestion_data()
        err = IntegrityError("stmt", "params", Exception("orig"))

        result = importer._handle_import_error(err, data)

        assert result.success is False
        assert mock_save.call_args[1]["failure_type"] == "database_integrity_error"


# ===========================================================================
# _save_property_media
# ===========================================================================


class TestSavePropertyMedia:
    """媒体资源保存测试."""

    def test_skip_when_no_images(self, importer, mock_db):
        """无图片链接时跳过保存."""
        data = _make_ingestion_data()
        data.image_urls = None

        importer._save_property_media(data, mock_db)

        mock_db.query.assert_not_called()

    def test_save_unique_urls(self, importer, mock_db):
        """保存去重后的图片链接."""
        data = _make_ingestion_data()
        data.image_urls = ["http://a.jpg", "http://b.jpg", "http://a.jpg"]

        delete_query = MagicMock()
        delete_query.filter.return_value.delete.return_value = None
        mock_db.query.return_value = delete_query

        importer._save_property_media(data, mock_db)

        mock_db.bulk_save_objects.assert_called_once()
        records = mock_db.bulk_save_objects.call_args[0][0]
        assert len(records) == 2
        assert records[0].url == "http://a.jpg"
        assert records[1].url == "http://b.jpg"

    def test_skip_empty_urls(self, importer, mock_db):
        """空 URL 被过滤掉."""
        data = _make_ingestion_data()
        data.image_urls = ["http://a.jpg", "", "  ", "http://b.jpg"]

        delete_query = MagicMock()
        delete_query.filter.return_value.delete.return_value = None
        mock_db.query.return_value = delete_query

        importer._save_property_media(data, mock_db)

        records = mock_db.bulk_save_objects.call_args[0][0]
        assert len(records) == 2

    def test_media_save_failure_does_not_raise(self, importer, mock_db):
        """图片保存失败不抛异常."""
        data = _make_ingestion_data()
        data.image_urls = ["http://a.jpg"]

        mock_db.query.side_effect = Exception("media error")

        # 不应抛出异常
        importer._save_property_media(data, mock_db)

    def test_empty_list_after_dedup_no_bulk_save(self, importer, mock_db):
        """去重后无有效 URL 时不执行 bulk_save_objects."""
        data = _make_ingestion_data()
        data.image_urls = ["", "  "]

        delete_query = MagicMock()
        delete_query.filter.return_value.delete.return_value = None
        mock_db.query.return_value = delete_query

        importer._save_property_media(data, mock_db)

        mock_db.bulk_save_objects.assert_not_called()


# ===========================================================================
# create_history_snapshot (公有方法)
# ===========================================================================


class TestCreateHistorySnapshot:
    """历史快照测试."""

    def test_create_snapshot(self, importer, mock_db, mock_existing_property):
        """创建历史快照成功."""
        mock_existing_property.data_source = "lianjia"
        mock_existing_property.source_property_id = "SH12345"
        mock_existing_property.status = PropertyStatus.FOR_SALE
        mock_existing_property.community_id = "community-001"
        mock_existing_property.rooms = 2
        mock_existing_property.build_area = 89.5
        mock_existing_property.listed_price_wan = 500.0
        mock_existing_property.sold_price_wan = None
        mock_existing_property.listed_date = None
        mock_existing_property.sold_date = None
        mock_existing_property.floor_original = "中楼层/共18层"
        mock_existing_property.orientation = "南"
        mock_existing_property.decoration = None

        importer.create_history_snapshot(mock_existing_property, ChangeType.PRICE_CHANGE, mock_db)

        mock_db.add.assert_called_once()
        history_obj = mock_db.add.call_args[0][0]
        assert history_obj.change_type == ChangeType.PRICE_CHANGE
        assert history_obj.data_source == "lianjia"
        assert history_obj.source_property_id == "SH12345"


# ===========================================================================
# _handle_creation / _handle_update
# ===========================================================================


class TestHandleCreation:
    """创建房源测试."""

    def test_handle_creation_sets_fields(self, importer, mock_db):
        """_handle_creation 正确映射字段并 flush."""
        data = _make_ingestion_data()

        created_ids = {}

        def mock_flush():
            for call in mock_db.add.call_args_list:
                obj = call[0][0]
                if not hasattr(obj, "id") or obj.id is None:
                    obj.id = 100
                    created_ids["property_id"] = 100
        mock_db.flush.side_effect = mock_flush

        result = importer._handle_creation(data, "community-001", mock_db, "user1")

        assert result.id == 100
        assert result.community_id == "community-001"
        assert result.data_source == "lianjia"
        assert result.source_property_id == "SH12345"


class TestHandleUpdate:
    """更新房源测试."""

    def test_handle_update_creates_snapshot_and_maps(self, importer, mock_db, mock_existing_property):
        """_handle_update 创建历史快照并更新字段."""
        data = _make_ingestion_data(挂牌价=480.0)

        importer._handle_update(mock_existing_property, data, "community-001", mock_db, "user1")

        # 验证快照被创建（db.add 被调用）
        assert mock_db.add.called
        # 验证字段被更新
        assert mock_existing_property.listed_price_wan == 480.0


# ===========================================================================
# _map_data_to_property
# ===========================================================================


class TestMapDataToProperty:
    """数据映射测试."""

    def test_map_all_fields(self, importer):
        """所有字段正确映射到 PropertyCurrent."""
        data = _make_ingestion_data(
            物业类型="住宅",
            建筑年代=2010,
            建筑结构="钢混",
            装修情况="精装",
            电梯=True,
            产权性质="商品房",
            产权年限=70,
            上次交易="2020年",
            供暖方式="集中供暖",
            房源描述="好房子",
        )

        prop = MagicMock()
        importer._map_data_to_property(prop, data, "community-001", "user1")

        assert prop.community_id == "community-001"
        assert prop.status == PropertyStatus.FOR_SALE
        assert prop.property_type == "住宅"
        assert prop.rooms == 2
        assert prop.halls == 1
        assert prop.baths == 1
        assert prop.orientation == "南"
        assert prop.build_area == 89.5
        assert prop.listed_price_wan == 500.0
        assert prop.build_year == 2010
        assert prop.building_structure == "钢混"
        assert prop.decoration == "精装"
        assert prop.elevator is True
        assert prop.ownership_type == "商品房"
        assert prop.ownership_years == 70
        assert prop.last_transaction == "2020年"
        assert prop.heating_method == "集中供暖"
        assert prop.listing_remarks == "好房子"
        assert prop.owner_id == "user1"
        assert prop.updated_at is not None


# ===========================================================================
# _CommunityData dataclass
# ===========================================================================


class TestCommunityData:
    """_CommunityData 数据类测试."""

    def test_defaults(self):
        """默认值为 None."""
        cd = _CommunityData(community_name="测试")
        assert cd.community_name == "测试"
        assert cd.city_id is None
        assert cd.district is None
        assert cd.business_circle is None

    def test_with_values(self):
        """赋值正确."""
        cd = _CommunityData(community_name="测试", city_id=1, district="浦东", business_circle="陆家嘴")
        assert cd.city_id == 1
        assert cd.district == "浦东"
        assert cd.business_circle == "陆家嘴"
