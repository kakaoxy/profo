"""
Unit tests for FloorParser
Tests requirements 9.1, 9.2, 9.3, 9.4, 9.5
"""
import pytest
from services.parser import FloorParser, FloorInfo


class TestFloorParserParsing:
    """Test FloorParser.parse_floor() method"""
    
    def test_parse_standard_format(self):
        """Test standard format: 15/28"""
        result = FloorParser.parse_floor("15/28")
        assert result.floor_number == 15
        assert result.total_floors == 28
        assert result.floor_level == "中楼层"
    
    def test_parse_chinese_level_with_total(self):
        """Test Chinese level format: 高楼层/18"""
        result = FloorParser.parse_floor("高楼层/18")
        assert result.floor_number is None
        assert result.total_floors == 18
        assert result.floor_level == "高楼层"
    
    def test_parse_chinese_level_with_gong(self):
        """Test format: 中楼层/共28层"""
        result = FloorParser.parse_floor("中楼层/共28层")
        assert result.floor_number is None
        assert result.total_floors == 28
        assert result.floor_level == "中楼层"
    
    def test_parse_chinese_level_with_parentheses(self):
        """Test format: 低楼层(共18层)"""
        result = FloorParser.parse_floor("低楼层(共18层)")
        assert result.floor_number is None
        assert result.total_floors == 18
        assert result.floor_level == "低楼层"
    
    def test_parse_simple_fraction(self):
        """Test simple fraction: 3/6"""
        result = FloorParser.parse_floor("3/6")
        assert result.floor_number == 3
        assert result.total_floors == 6
        assert result.floor_level == "中楼层"
    
    def test_parse_low_floor(self):
        """Test low floor calculation: 1/10"""
        result = FloorParser.parse_floor("1/10")
        assert result.floor_number == 1
        assert result.total_floors == 10
        assert result.floor_level == "低楼层"
    
    def test_parse_high_floor(self):
        """Test high floor calculation: 9/10"""
        result = FloorParser.parse_floor("9/10")
        assert result.floor_number == 9
        assert result.total_floors == 10
        assert result.floor_level == "高楼层"
    
    def test_parse_empty_string(self):
        """Test empty string returns empty FloorInfo"""
        result = FloorParser.parse_floor("")
        assert result.floor_number is None
        assert result.total_floors is None
        assert result.floor_level is None
    
    def test_parse_none_input(self):
        """Test None input returns empty FloorInfo"""
        result = FloorParser.parse_floor(None)
        assert result.floor_number is None
        assert result.total_floors is None
        assert result.floor_level is None
    
    def test_parse_whitespace_only(self):
        """Test whitespace-only string returns empty FloorInfo"""
        result = FloorParser.parse_floor("   ")
        assert result.floor_number is None
        assert result.total_floors is None
        assert result.floor_level is None
    
    def test_parse_invalid_format(self):
        """Test invalid format returns partial or empty FloorInfo"""
        result = FloorParser.parse_floor("无效格式")
        assert result.floor_number is None
        assert result.total_floors is None
        assert result.floor_level is None
    
    def test_parse_with_extra_whitespace(self):
        """Test parsing with extra whitespace"""
        result = FloorParser.parse_floor("  15 / 28  ")
        assert result.floor_number == 15
        assert result.total_floors == 28
        assert result.floor_level == "中楼层"
    
    def test_parse_floor_with_ceng_character(self):
        """Test format with 层 character: 3层/共6层"""
        result = FloorParser.parse_floor("3层/共6层")
        assert result.floor_number == 3
        assert result.total_floors == 6
        assert result.floor_level == "中楼层"


class TestFloorLevelCalculation:
    """Test FloorParser.calculate_floor_level() method"""
    
    def test_calculate_low_floor_boundary(self):
        """Test low floor at 33% boundary"""
        # 3/10 = 30% -> low floor
        assert FloorParser.calculate_floor_level(3, 10) == "低楼层"
        # 3/9 = 33.33% -> mid floor (just above boundary)
        assert FloorParser.calculate_floor_level(3, 9) == "中楼层"
    
    def test_calculate_mid_floor_range(self):
        """Test mid floor range (33% - 67%)"""
        # 4/10 = 40% -> mid floor
        assert FloorParser.calculate_floor_level(4, 10) == "中楼层"
        # 5/10 = 50% -> mid floor
        assert FloorParser.calculate_floor_level(5, 10) == "中楼层"
        # 6/10 = 60% -> mid floor
        assert FloorParser.calculate_floor_level(6, 10) == "中楼层"
    
    def test_calculate_high_floor_boundary(self):
        """Test high floor above 67% boundary"""
        # 7/10 = 70% -> high floor
        assert FloorParser.calculate_floor_level(7, 10) == "高楼层"
        # 10/10 = 100% -> high floor
        assert FloorParser.calculate_floor_level(10, 10) == "高楼层"
    
    def test_calculate_with_large_building(self):
        """Test calculation with large building (28 floors)"""
        # 9/28 = 32% -> low floor
        assert FloorParser.calculate_floor_level(9, 28) == "低楼层"
        # 15/28 = 54% -> mid floor
        assert FloorParser.calculate_floor_level(15, 28) == "中楼层"
        # 20/28 = 71% -> high floor
        assert FloorParser.calculate_floor_level(20, 28) == "高楼层"
    
    def test_calculate_first_floor(self):
        """Test first floor is always low"""
        assert FloorParser.calculate_floor_level(1, 10) == "低楼层"
        assert FloorParser.calculate_floor_level(1, 100) == "低楼层"
    
    def test_calculate_top_floor(self):
        """Test top floor is always high"""
        assert FloorParser.calculate_floor_level(10, 10) == "高楼层"
        assert FloorParser.calculate_floor_level(28, 28) == "高楼层"
    
    def test_calculate_with_zero_floor(self):
        """Test with zero floor number returns default"""
        result = FloorParser.calculate_floor_level(0, 10)
        assert result == "中楼层"  # Default value
    
    def test_calculate_with_zero_total(self):
        """Test with zero total floors returns default"""
        result = FloorParser.calculate_floor_level(5, 0)
        assert result == "中楼层"  # Default value
    
    def test_calculate_with_negative_values(self):
        """Test with negative values returns default"""
        result = FloorParser.calculate_floor_level(-1, 10)
        assert result == "中楼层"  # Default value


class TestFloorInfoDataClass:
    """Test FloorInfo dataclass"""
    
    def test_floor_info_default_values(self):
        """Test FloorInfo default initialization"""
        info = FloorInfo()
        assert info.floor_number is None
        assert info.total_floors is None
        assert info.floor_level is None
    
    def test_floor_info_with_values(self):
        """Test FloorInfo with explicit values"""
        info = FloorInfo(
            floor_number=15,
            total_floors=28,
            floor_level="中楼层"
        )
        assert info.floor_number == 15
        assert info.total_floors == 28
        assert info.floor_level == "中楼层"
    
    def test_floor_info_partial_values(self):
        """Test FloorInfo with partial values"""
        info = FloorInfo(total_floors=18, floor_level="高楼层")
        assert info.floor_number is None
        assert info.total_floors == 18
        assert info.floor_level == "高楼层"


class TestFloorParserEdgeCases:
    """Test edge cases and error handling"""
    
    def test_parse_with_non_string_input(self):
        """Test parsing with non-string input"""
        result = FloorParser.parse_floor(123)
        assert result.floor_number is None
        assert result.total_floors is None
        assert result.floor_level is None
    
    def test_parse_only_total_floors(self):
        """Test parsing string with only total floors"""
        result = FloorParser.parse_floor("共18层")
        assert result.floor_number is None
        assert result.total_floors == 18
        assert result.floor_level is None
    
    def test_parse_only_chinese_level(self):
        """Test parsing string with only Chinese level"""
        result = FloorParser.parse_floor("高楼层")
        assert result.floor_number is None
        assert result.total_floors is None
        assert result.floor_level == "高楼层"
    
    def test_parse_mixed_format(self):
        """Test parsing mixed format with both number and Chinese level"""
        result = FloorParser.parse_floor("15/28 高楼层")
        # Should extract both numeric and Chinese level
        assert result.floor_number == 15
        assert result.total_floors == 28
        # Chinese level takes precedence if present
        assert result.floor_level == "高楼层"
    
    def test_parse_preserves_chinese_level_over_calculation(self):
        """Test that explicit Chinese level is preserved over calculation"""
        # Even though 1/10 would calculate to "低楼层", 
        # if "高楼层" is explicitly stated, it should be preserved
        result = FloorParser.parse_floor("高楼层 1/10")
        assert result.floor_level == "高楼层"
