"""
查询参数对象测试
测试PropertyQueryParams和PropertyExportParams类
"""
import pytest
from utils.query_params import PropertyQueryParams, PropertyExportParams


class TestPropertyQueryParams:
    """房源查询参数对象测试类"""

    def test_query_params_default_values(self):
        """测试查询参数的默认值"""
        params = PropertyQueryParams()

        assert params.status is None
        assert params.community_name is None
        assert params.districts is None
        assert params.business_circles is None
        assert params.orientations is None
        assert params.floor_levels is None
        assert params.rooms is None
        assert params.rooms_gte is None
        assert params.min_price is None
        assert params.max_price is None
        assert params.min_area is None
        assert params.max_area is None
        assert params.sort_by == "updated_at"
        assert params.sort_order == "desc"
        assert params.page == 1
        assert params.page_size == 50

    def test_query_params_custom_values(self):
        """测试查询参数的自定义值"""
        params = PropertyQueryParams(
            status="在售",
            community_name="测试小区",
            districts=["海淀区", "朝阳区"],
            min_price=100.0,
            max_price=500.0,
            page=2,
            page_size=20
        )

        assert params.status == "在售"
        assert params.community_name == "测试小区"
        assert params.districts == ["海淀区", "朝阳区"]
        assert params.min_price == 100.0
        assert params.max_price == 500.0
        assert params.page == 2
        assert params.page_size == 20

    def test_query_params_filter_methods(self):
        """测试查询参数的筛选方法"""
        # 测试价格筛选
        params_with_price = PropertyQueryParams(min_price=100, max_price=500)
        assert params_with_price.has_price_filter() is True

        params_without_price = PropertyQueryParams()
        assert params_without_price.has_price_filter() is False

        # 测试面积筛选
        params_with_area = PropertyQueryParams(min_area=50, max_area=150)
        assert params_with_area.has_area_filter() is True

        # 测试位置筛选
        params_with_location = PropertyQueryParams(districts=["海淀区"])
        assert params_with_location.has_location_filter() is True

        params_with_business = PropertyQueryParams(business_circles=["中关村"])
        assert params_with_business.has_location_filter() is True

        # 测试户型筛选
        params_with_rooms = PropertyQueryParams(rooms=[2, 3])
        assert params_with_rooms.has_room_filter() is True

        params_with_rooms_gte = PropertyQueryParams(rooms_gte=4)
        assert params_with_rooms_gte.has_room_filter() is True

        # 测试朝向筛选
        params_with_orientation = PropertyQueryParams(orientations=["南", "北"])
        assert params_with_orientation.has_orientation_filter() is True

        # 测试楼层级别筛选
        params_with_floor = PropertyQueryParams(floor_levels=["低楼层", "中楼层"])
        assert params_with_floor.has_floor_level_filter() is True


class TestPropertyExportParams:
    """房源导出参数对象测试类"""

    def test_export_params_default_values(self):
        """测试导出参数的默认值"""
        params = PropertyExportParams()

        assert params.status is None
        assert params.community_name is None
        assert params.districts is None
        assert params.business_circles is None
        assert params.orientations is None
        assert params.floor_levels is None
        assert params.rooms is None
        assert params.rooms_gte is None
        assert params.min_price is None
        assert params.max_price is None
        assert params.min_area is None
        assert params.max_area is None
        assert params.sort_by == "updated_at"
        assert params.sort_order == "desc"

    def test_export_params_from_query_params(self):
        """测试从各个参数创建导出参数对象"""
        params = PropertyExportParams.from_query_params(
            status="在售",
            community_name="测试小区",
            districts=["海淀区"],
            min_price=100.0,
            max_price=500.0,
            rooms=[2, 3],
            sort_by="created_at",
            sort_order="asc"
        )

        assert params.status == "在售"
        assert params.community_name == "测试小区"
        assert params.districts == ["海淀区"]
        assert params.min_price == 100.0
        assert params.max_price == 500.0
        assert params.rooms == [2, 3]
        assert params.sort_by == "created_at"
        assert params.sort_order == "asc"

    def test_export_params_real_world_scenario(self):
        """测试实际应用场景"""
        # 模拟一个典型的导出场景
        params = PropertyExportParams(
            status="在售",
            districts=["海淀区", "朝阳区", "西城区"],
            min_price=200.0,
            max_price=800.0,
            min_area=50.0,
            max_area=150.0,
            rooms=[2, 3, 4],
            orientations=["南", "东南", "西南"],
            floor_levels=["中楼层", "高楼层"],
            sort_by="listed_date",
            sort_order="desc"
        )

        # 验证所有参数都正确设置
        assert params.status == "在售"
        assert len(params.districts) == 3
        assert params.min_price == 200.0
        assert params.max_price == 800.0
        assert len(params.rooms) == 3
        assert len(params.orientations) == 3
        assert len(params.floor_levels) == 2
        assert params.sort_by == "listed_date"
        assert params.sort_order == "desc"

    def test_export_params_edge_cases(self):
        """测试边界情况"""
        # 测试空列表
        params = PropertyExportParams(
            districts=[],
            rooms=[],
            orientations=None,
            floor_levels=None
        )

        assert params.districts == []
        assert params.rooms == []
        assert params.orientations is None
        assert params.floor_levels is None

        # 测试零值
        params_zero = PropertyExportParams(
            min_price=0.0,
            max_price=0.0,
            min_area=0.0,
            max_area=0.0
        )

        assert params_zero.min_price == 0.0
        assert params_zero.max_price == 0.0
        assert params_zero.min_area == 0.0
        assert params_zero.max_area == 0.0