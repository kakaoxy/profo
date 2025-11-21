"""
日期规范化函数测试
测试_normalize_date_string函数的各种场景
"""
import pytest
from datetime import datetime
from routers.upload import CSVBatchImporter


class TestDateNormalization:
    """日期规范化测试类"""

    def setup_method(self):
        """设置测试方法"""
        self.importer = CSVBatchImporter()

    def test_normalize_date_string_standard_formats(self):
        """测试标准日期格式"""
        # 测试中文格式
        result = self.importer._normalize_date_string("2023年12月25日")
        assert result == "2023-12-25"

        # 测试ISO格式
        result = self.importer._normalize_date_string("2023-12-25")
        assert result == "2023-12-25"

        # 测试斜杠格式
        result = self.importer._normalize_date_string("2023/12/25")
        assert result == "2023-12-25"

        # 测试点格式
        result = self.importer._normalize_date_string("2023.12.25")
        assert result == "2023-12-25"

    def test_normalize_date_string_various_separators(self):
        """测试不同的分隔符"""
        # 测试年月日不同分隔符
        result = self.importer._normalize_date_string("2023年12月25日")
        assert result == "2023-12-25"

        result = self.importer._normalize_date_string("2023/12/25")
        assert result == "2023-12-25"

        result = self.importer._normalize_date_string("2023.12.25")
        assert result == "2023-12-25"

        # 测试混合分隔符
        result = self.importer._normalize_date_string("2023年12/25")
        assert result == "2023-12-25"

    def test_normalize_date_string_single_digit_month_day(self):
        """测试单数字月份和日期的补零"""
        result = self.importer._normalize_date_string("2023年1月5日")
        assert result == "2023-01-05"

        result = self.importer._normalize_date_string("2023-1-5")
        assert result == "2023-01-05"

        result = self.importer._normalize_date_string("2023/1/5")
        assert result == "2023-01-05"

    def test_normalize_date_string_edge_cases(self):
        """测试边界情况"""
        # 测试闰年
        result = self.importer._normalize_date_string("2024年2月29日")
        assert result == "2024-02-29"

        # 测试12月31日
        result = self.importer._normalize_date_string("2023年12月31日")
        assert result == "2023-12-31"

        # 测试1月1日
        result = self.importer._normalize_date_string("2023年1月1日")
        assert result == "2023-01-01"

    def test_normalize_date_string_invalid_formats(self):
        """测试无效日期格式的处理"""
        # 测试不完整的日期
        result = self.importer._normalize_date_string("2023年12月")
        # 这应该返回原始字符串，因为缺少日
        assert result == "2023年12月"

        # 测试只有年份
        result = self.importer._normalize_date_string("2023年")
        assert result == "2023年"

        # 测试完全无效的格式
        result = self.importer._normalize_date_string("invalid-date")
        assert result == "invalid-date"

        # 测试空字符串
        result = self.importer._normalize_date_string("")
        assert result == ""

    def test_normalize_date_string_malformed_dates(self):
        """测试畸形日期的处理"""
        # 测试不存在的日期
        result = self.importer._normalize_date_string("2023年2月30日")
        # 应该返回原始字符串，因为2月没有30日
        assert result == "2023年2月30日"

        # 测试不存在的月份
        result = self.importer._normalize_date_string("2023年13月1日")
        assert result == "2023年13月1日"

        # 测试负数日期
        result = self.importer._normalize_date_string("2023年-1月1日")
        assert result == "2023年-1月1日"

    def test_normalize_date_string_with_whitespace(self):
        """测试带空格的日期字符串"""
        # 测试前后空格 - 应该能正确处理
        result = self.importer._normalize_date_string(" 2023年12月25日 ")
        assert result == "2023-12-25"

        # 测试数字和中文之间的空格 - 函数无法处理这种格式
        result = self.importer._normalize_date_string("2023 年 12 月 25 日")
        # 这种格式应该返回原始字符串，因为无法正确解析
        assert result == "2023 年 12 月 25 日"

    def test_normalize_date_string_chinese_dates(self):
        """测试中文日期格式"""
        result = self.importer._normalize_date_string("二零二三年十二月二十五日")
        # 这种格式应该被原样返回，因为无法解析
        assert result == "二零二三年十二月二十五日"

    def test_normalize_date_string_time_components(self):
        """测试包含时间部分的日期"""
        result = self.importer._normalize_date_string("2023年12月25日 14:30:00")
        # 应该能正确解析日期部分
        assert result == "2023-12-25"

    def test_normalize_date_string_various_years(self):
        """测试不同年份的处理"""
        # 测试20世纪
        result = self.importer._normalize_date_string("1999年12月31日")
        assert result == "1999-12-31"

        # 测试21世纪
        result = self.importer._normalize_date_string("2023年6月15日")
        assert result == "2023-06-15"

        # 测试未来年份
        result = self.importer._normalize_date_string("2050年1月1日")
        assert result == "2050-01-01"

    def test_normalize_date_string_error_handling(self):
        """测试错误处理"""
        # 测试None值（虽然实际代码中不会传入None）
        # 这里测试的是如果传入None会发生什么
        try:
            result = self.importer._normalize_date_string(None)
            # 如果代码能处理None，应该返回None或空字符串
            assert result is None or result == ""
        except (AttributeError, TypeError):
            # 如果抛出异常，这也是可以接受的
            pass

    def test_normalize_date_string_special_characters(self):
        """测试特殊字符的处理"""
        # 测试包含其他字符的日期
        result = self.importer._normalize_date_string("日期：2023年12月25日")
        assert result == "日期：2023年12月25日"  # 应该返回原始字符串

        # 测试包含字母的日期
        result = self.importer._normalize_date_string("abc2023年12月25日def")
        assert result == "abc2023年12月25日def"  # 应该返回原始字符串

    def test_normalize_date_string_consistency(self):
        """测试一致性 - 相同的输入应该产生相同的输出"""
        test_date = "2023年12月25日"
        result1 = self.importer._normalize_date_string(test_date)
        result2 = self.importer._normalize_date_string(test_date)
        assert result1 == result2

    def test_normalize_date_string_format_preservation(self):
        """测试ISO格式日期的保持"""
        iso_date = "2023-12-25"
        result = self.importer._normalize_date_string(iso_date)
        assert result == iso_date  # ISO格式应该保持不变