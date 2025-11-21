"""
参数解析工具函数测试
测试parse_comma_separated_list函数的各种场景
"""
import pytest
from utils.param_parser import parse_comma_separated_list


class TestParamParser:
    """参数解析工具函数测试类"""

    def test_parse_comma_separated_list_normal(self):
        """测试正常的逗号分隔字符串解析"""
        # 测试基本功能
        result = parse_comma_separated_list("a,b,c")
        assert result == ["a", "b", "c"]

        # 测试带空格的字符串
        result = parse_comma_separated_list("  x , y , z  ")
        assert result == ["x", "y", "z"]

        # 测试单个元素
        result = parse_comma_separated_list("single")
        assert result == ["single"]

    def test_parse_comma_separated_list_empty_values(self):
        """测试空值和None的处理"""
        # 测试空字符串
        result = parse_comma_separated_list("")
        assert result is None

        # 测试None值
        result = parse_comma_separated_list(None)
        assert result is None

        # 测试只有空格的字符串 - 实际返回空列表
        result = parse_comma_separated_list("   ")
        assert result == []  # 实际函数返回空列表而非None

    def test_parse_comma_separated_list_edge_cases(self):
        """测试边界情况"""
        # 测试连续逗号
        result = parse_comma_separated_list("a,,b,c")
        assert result == ["a", "b", "c"]

        # 测试开头和结尾的逗号
        result = parse_comma_separated_list(",a,b,c,")
        assert result == ["a", "b", "c"]

        # 测试只有逗号 - 实际返回空列表
        result = parse_comma_separated_list(",,,")
        assert result == []  # 实际函数返回空列表而非None

        # 测试混合空格和逗号
        result = parse_comma_separated_list("  a  ,  ,  b  ,  c  ")
        assert result == ["a", "b", "c"]

    def test_parse_comma_separated_list_special_characters(self):
        """测试特殊字符的处理"""
        # 测试包含空格的元素
        result = parse_comma_separated_list("New York,Los Angeles")
        assert result == ["New York", "Los Angeles"]

        # 测试中文
        result = parse_comma_separated_list("北京,上海,广州")
        assert result == ["北京", "上海", "广州"]

        # 测试数字字符串
        result = parse_comma_separated_list("1,2,3")
        assert result == ["1", "2", "3"]

    def test_parse_comma_separated_list_real_world_scenarios(self):
        """测试实际应用场景"""
        # 模拟区域筛选
        districts = parse_comma_separated_list("海淀区,朝阳区,西城区")
        assert districts == ["海淀区", "朝阳区", "西城区"]

        # 模拟朝向筛选（带空格）
        orientations = parse_comma_separated_list(" 南 , 北 , 东南 ")
        assert orientations == ["南", "北", "东南"]

        # 模拟楼层级别筛选
        floor_levels = parse_comma_separated_list("低楼层,中楼层,高楼层")
        assert floor_levels == ["低楼层", "中楼层", "高楼层"]