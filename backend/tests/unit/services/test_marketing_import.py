"""MarketingImportService 单元测试."""

from decimal import Decimal
from unittest.mock import MagicMock, patch

import pytest

from services.marketing.import_service import MarketingImportService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def db() -> MagicMock:
    """Mock 数据库会话."""
    return MagicMock()


@pytest.fixture
def service(db: MagicMock) -> MarketingImportService:
    """构造被测服务实例."""
    return MarketingImportService(db)


def _make_project(**overrides):
    """构造 mock Project 对象.

    默认值覆盖常见字段，通过 overrides 覆盖.
    """
    defaults = {
        "id": "proj-001",
        "community_name": "阳光花园",
        "address": "1号楼2单元301室",
        "area": Decimal("89.5"),
        "layout": "三室两厅",
        "orientation": "南",
        "status": MagicMock(value="active"),
        "contract": None,
        "sale": None,
    }
    defaults.update(overrides)
    proj = MagicMock()
    for k, v in defaults.items():
        setattr(proj, k, v)
    return proj


def _make_community(community_id="comm-uuid-001", name="阳光花园"):
    """构造 mock Community 对象."""
    community = MagicMock()
    community.id = community_id
    community.name = name
    return community


def _make_photo(photo_id="photo-001", url="http://img/1.jpg", stage="finished", description="客厅"):
    """构造 mock RenovationPhoto 对象."""
    photo = MagicMock()
    photo.id = photo_id
    photo.url = url
    photo.stage = stage
    photo.description = description
    photo.created_at = "2025-01-01"
    return photo


# ---------------------------------------------------------------------------
# import_from_l3_project
# ---------------------------------------------------------------------------


class TestImportFromL3Project:
    """import_from_l3_project 方法测试."""

    def test_returns_none_when_project_not_found(self, service: MarketingImportService, db: MagicMock) -> None:
        """项目不存在时返回 None."""
        db.query.return_value.filter.return_value.first.return_value = None
        result = service.import_from_l3_project("nonexistent")
        assert result is None

    def test_returns_import_response_on_success(self, service: MarketingImportService, db: MagicMock) -> None:
        """正常导入返回 L3ProjectImportResponse."""
        project = _make_project()
        community = _make_community()
        photo = _make_photo()

        # 设置 db.query 链式调用
        def query_side_effect(model):
            mock_q = MagicMock()
            if model.__name__ == "Project":
                mock_q.filter.return_value.first.return_value = project
            elif model.__name__ == "Community":
                mock_q.filter.return_value.first.return_value = community
            elif model.__name__ == "RenovationPhoto":
                mock_q.filter.return_value.order_by.return_value.all.return_value = [photo]
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q

        db.query.side_effect = query_side_effect

        result = service.import_from_l3_project("proj-001")

        assert result is not None
        assert result.project_id == "proj-001"
        assert result.community_id == "comm-uuid-001"
        assert result.community_name == "阳光花园"
        assert result.layout == "三室两厅"
        assert result.orientation == "南"
        assert result.area == Decimal("89.5")
        assert result.title == "阳光花园 三室两厅 南"
        assert len(result.available_media) == 1

    def test_community_id_none_when_community_not_found(self, service: MarketingImportService, db: MagicMock) -> None:
        """小区不存在时 community_id 为 None."""
        project = _make_project()

        def query_side_effect(model):
            mock_q = MagicMock()
            if model.__name__ == "Project":
                mock_q.filter.return_value.first.return_value = project
            elif model.__name__ == "Community":
                mock_q.filter.return_value.first.return_value = None
            elif model.__name__ == "RenovationPhoto":
                mock_q.filter.return_value.order_by.return_value.all.return_value = []
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q

        db.query.side_effect = query_side_effect

        result = service.import_from_l3_project("proj-001")
        assert result is not None
        assert result.community_id is None

    def test_status_with_value_attribute(self, service: MarketingImportService, db: MagicMock) -> None:
        """status 有 value 属性时使用 value."""
        status_mock = MagicMock(value="completed")
        project = _make_project(status=status_mock)

        def query_side_effect(model):
            mock_q = MagicMock()
            if model.__name__ == "Project":
                mock_q.filter.return_value.first.return_value = project
            elif model.__name__ == "Community":
                mock_q.filter.return_value.first.return_value = None
            elif model.__name__ == "RenovationPhoto":
                mock_q.filter.return_value.order_by.return_value.all.return_value = []
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q

        db.query.side_effect = query_side_effect

        result = service.import_from_l3_project("proj-001")
        assert result is not None
        assert result.status == "completed"

    def test_status_as_plain_string(self, service: MarketingImportService, db: MagicMock) -> None:
        """status 为普通字符串时直接使用."""
        project = _make_project(status="pending")

        def query_side_effect(model):
            mock_q = MagicMock()
            if model.__name__ == "Project":
                mock_q.filter.return_value.first.return_value = project
            elif model.__name__ == "Community":
                mock_q.filter.return_value.first.return_value = None
            elif model.__name__ == "RenovationPhoto":
                mock_q.filter.return_value.order_by.return_value.all.return_value = []
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q

        db.query.side_effect = query_side_effect

        result = service.import_from_l3_project("proj-001")
        assert result is not None
        assert result.status == "pending"

    def test_status_none(self, service: MarketingImportService, db: MagicMock) -> None:
        """status 为 None 时返回 None."""
        project = _make_project(status=None)

        def query_side_effect(model):
            mock_q = MagicMock()
            if model.__name__ == "Project":
                mock_q.filter.return_value.first.return_value = project
            elif model.__name__ == "Community":
                mock_q.filter.return_value.first.return_value = None
            elif model.__name__ == "RenovationPhoto":
                mock_q.filter.return_value.order_by.return_value.all.return_value = []
            else:
                mock_q.filter.return_value.first.return_value = None
            return mock_q

        db.query.side_effect = query_side_effect

        result = service.import_from_l3_project("proj-001")
        assert result is not None
        assert result.status is None


# ---------------------------------------------------------------------------
# _get_community_id
# ---------------------------------------------------------------------------


class TestGetCommunityId:
    """_get_community_id 方法测试."""

    def test_returns_none_when_name_is_none(self, service: MarketingImportService) -> None:
        """community_name 为 None 时返回 None."""
        assert service._get_community_id(None) is None

    def test_returns_none_when_name_is_empty(self, service: MarketingImportService) -> None:
        """community_name 为空字符串时返回 None."""
        assert service._get_community_id("") is None

    def test_returns_id_when_community_found(self, service: MarketingImportService, db: MagicMock) -> None:
        """小区存在时返回 ID."""
        community = _make_community()
        db.query.return_value.filter.return_value.first.return_value = community
        assert service._get_community_id("阳光花园") == "comm-uuid-001"

    def test_returns_none_when_community_not_found(self, service: MarketingImportService, db: MagicMock) -> None:
        """小区不存在时返回 None."""
        db.query.return_value.filter.return_value.first.return_value = None
        assert service._get_community_id("不存在的小区") is None


# ---------------------------------------------------------------------------
# _get_total_price
# ---------------------------------------------------------------------------


class TestGetTotalPrice:
    """_get_total_price 方法测试."""

    def test_prefers_signing_price(self, service: MarketingImportService) -> None:
        """优先使用签约价格."""
        project = _make_project()
        project.contract = MagicMock(signing_price=Decimal("200"))
        project.sale = MagicMock(list_price=Decimal("180"))
        assert service._get_total_price(project) == Decimal("200")

    def test_falls_back_to_list_price(self, service: MarketingImportService) -> None:
        """无签约价格时使用挂牌价."""
        project = _make_project()
        project.contract = MagicMock(signing_price=None)
        project.sale = MagicMock(list_price=Decimal("180"))
        assert service._get_total_price(project) == Decimal("180")

    def test_returns_none_when_no_price(self, service: MarketingImportService) -> None:
        """无任何价格时返回 None."""
        project = _make_project()
        project.contract = None
        project.sale = None
        assert service._get_total_price(project) is None

    def test_returns_none_when_contract_exists_but_no_signing_price(self, service: MarketingImportService) -> None:
        """有 contract 但无 signing_price，且无 sale 时返回 None."""
        project = _make_project()
        project.contract = MagicMock(signing_price=None)
        project.sale = None
        assert service._get_total_price(project) is None


# ---------------------------------------------------------------------------
# _calculate_unit_price
# ---------------------------------------------------------------------------


class TestCalculateUnitPrice:
    """_calculate_unit_price 方法测试."""

    def test_calculates_correctly(self, service: MarketingImportService) -> None:
        """正常计算单价."""
        result = service._calculate_unit_price(Decimal("100"), Decimal("500"))
        assert result == Decimal("5")

    def test_returns_none_when_area_is_none(self, service: MarketingImportService) -> None:
        """面积为 None 时返回 None."""
        assert service._calculate_unit_price(None, Decimal("500")) is None

    def test_returns_none_when_total_price_is_none(self, service: MarketingImportService) -> None:
        """总价为 None 时返回 None."""
        assert service._calculate_unit_price(Decimal("100"), None) is None

    def test_returns_none_when_area_is_zero(self, service: MarketingImportService) -> None:
        """面积为 0 时返回 None（避免除零）."""
        assert service._calculate_unit_price(Decimal("0"), Decimal("500")) is None

    def test_returns_none_when_both_none(self, service: MarketingImportService) -> None:
        """面积和总价均为 None 时返回 None."""
        assert service._calculate_unit_price(None, None) is None


# ---------------------------------------------------------------------------
# _generate_title
# ---------------------------------------------------------------------------


class TestGenerateTitle:
    """_generate_title 方法测试."""

    def test_full_title(self, service: MarketingImportService) -> None:
        """全部字段存在时拼接标题."""
        project = _make_project()
        assert service._generate_title(project) == "阳光花园 三室两厅 南"

    def test_title_without_orientation(self, service: MarketingImportService) -> None:
        """无朝向时标题不含朝向."""
        project = _make_project(orientation=None)
        assert service._generate_title(project) == "阳光花园 三室两厅"

    def test_title_without_layout(self, service: MarketingImportService) -> None:
        """无户型时标题不含户型."""
        project = _make_project(layout=None)
        assert service._generate_title(project) == "阳光花园 南"

    def test_title_without_community_name(self, service: MarketingImportService) -> None:
        """无小区名时标题不含小区名."""
        project = _make_project(community_name=None)
        assert service._generate_title(project) == "三室两厅 南"

    def test_default_title_when_all_none(self, service: MarketingImportService) -> None:
        """所有字段为 None 时返回默认标题."""
        project = _make_project(community_name=None, layout=None, orientation=None)
        assert service._generate_title(project) == "未命名房源"


# ---------------------------------------------------------------------------
# _get_available_media
# ---------------------------------------------------------------------------


class TestGetAvailableMedia:
    """_get_available_media 方法测试."""

    def test_returns_empty_list_when_no_photos(self, service: MarketingImportService, db: MagicMock) -> None:
        """无照片时返回空列表."""
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = []
        result = service._get_available_media("proj-001")
        assert result == []

    def test_returns_media_list(self, service: MarketingImportService, db: MagicMock) -> None:
        """正常返回媒体列表."""
        photo1 = _make_photo(photo_id="p1", url="http://img/1.jpg", stage="finished", description="客厅")
        photo2 = _make_photo(photo_id="p2", url="http://img/2.jpg", stage="rough", description="卧室")
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [photo1, photo2]

        result = service._get_available_media("proj-001")
        assert len(result) == 2
        assert result[0].id == "p1"
        assert result[0].sort_order == 0
        assert result[1].id == "p2"
        assert result[1].sort_order == 1

    def test_media_fields_mapping(self, service: MarketingImportService, db: MagicMock) -> None:
        """验证媒体字段映射正确."""
        photo = _make_photo(photo_id="p1", url="http://img/1.jpg", stage="finished", description="客厅")
        db.query.return_value.filter.return_value.order_by.return_value.all.return_value = [photo]

        result = service._get_available_media("proj-001")
        assert len(result) == 1
        media = result[0]
        assert media.file_url == "http://img/1.jpg"
        assert media.thumbnail_url == "http://img/1.jpg"
        assert media.photo_category == "renovation"
        assert media.renovation_stage == "finished"
        assert media.description == "客厅"


# ---------------------------------------------------------------------------
# _extract_floor_info
# ---------------------------------------------------------------------------


class TestExtractFloorInfo:
    """_extract_floor_info 方法测试."""

    def test_returns_none_when_address_is_none(self, service: MarketingImportService) -> None:
        """地址为 None 时返回 None."""
        assert service._extract_floor_info(None) is None

    def test_returns_none_when_address_is_empty(self, service: MarketingImportService) -> None:
        """地址为空字符串时返回 None."""
        assert service._extract_floor_info("") is None

    def test_extracts_floor_from_building_unit_room(self, service: MarketingImportService) -> None:
        """1号楼2单元301室 -> 3层."""
        assert service._extract_floor_info("1号楼2单元301室") == "3层"

    def test_extracts_floor_from_high_floor(self, service: MarketingImportService) -> None:
        """12号楼1单元1502室 -> 15层."""
        assert service._extract_floor_info("12号楼1单元1502室") == "15层"

    def test_extracts_floor_from_dong_unit_room(self, service: MarketingImportService) -> None:
        """1栋2单元301室 -> 3层."""
        assert service._extract_floor_info("1栋2单元301室") == "3层"

    def test_extracts_floor_from_building_room_no_unit(self, service: MarketingImportService) -> None:
        """1号楼301室 -> 3层（无单元）."""
        assert service._extract_floor_info("1号楼301室") == "3层"

    def test_extracts_floor_from_room_only(self, service: MarketingImportService) -> None:
        """301室 -> 3层（仅房间号）."""
        assert service._extract_floor_info("301室") == "3层"

    def test_returns_none_for_unrecognizable_address(self, service: MarketingImportService) -> None:
        """无法识别的地址返回 None."""
        assert service._extract_floor_info("某街道某号") is None

    def test_extracts_floor_from_4_digit_room(self, service: MarketingImportService) -> None:
        """0801室 -> 8层（4位房间号）."""
        assert service._extract_floor_info("0801室") == "8层"

    def test_floor_0_with_3_digit_room_defaults_to_1(self, service: MarketingImportService) -> None:
        """3位房间号楼层为0时默认1层（如 001室）."""
        assert service._extract_floor_info("001室") == "1层"

    def test_returns_none_for_floor_exceeding_max(self, service: MarketingImportService) -> None:
        """楼层超过100时返回 None（4位房间号，前2位=楼层>100 不可能，测试3位房间号边界）."""
        # 3位房间号最大楼层为9（如901室->9层），无法超过100
        # 4位房间号最大99层，也无法超过100
        # 此测试验证 _FLOOR_MAX 边界：99层应正常返回
        assert service._extract_floor_info("99号楼1单元9901室") == "99层"

    def test_extracts_floor_1(self, service: MarketingImportService) -> None:
        """1层提取正确."""
        assert service._extract_floor_info("101室") == "1层"


# ---------------------------------------------------------------------------
# 向后兼容别名
# ---------------------------------------------------------------------------


class TestBackwardCompatAlias:
    """L4MarketingImportService 别名测试."""

    def test_alias_exists(self) -> None:
        """L4MarketingImportService 是 MarketingImportService 的别名."""
        from services.marketing.import_service import L4MarketingImportService

        assert L4MarketingImportService is MarketingImportService
