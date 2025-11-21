"""
自定义异常测试
测试项目中的自定义异常类型
"""
import pytest
from exceptions import (
    ProfoException,
    ValidationException,
    DatabaseException,
    DateProcessingException,
    DateFormatException,
    DateParsingException,
    FileProcessingException
)


class TestProfoException:
    """基础异常类测试"""

    def test_profo_exception_basic(self):
        """测试基础异常类"""
        exc = ProfoException("测试错误消息")
        assert str(exc) == "测试错误消息"
        assert exc.message == "测试错误消息"
        assert exc.code == "PROFO_ERROR"
        assert exc.details is None

    def test_profo_exception_with_details(self):
        """测试带详细信息的异常"""
        details = {"field": "test_field", "value": "invalid_value"}
        exc = ProfoException("验证失败", code="TEST_ERROR", details=details)
        assert exc.message == "验证失败"
        assert exc.code == "TEST_ERROR"
        assert exc.details == details

    def test_profo_exception_inheritance(self):
        """测试异常继承关系"""
        exc = ProfoException("基础异常")
        assert isinstance(exc, Exception)


class TestValidationException:
    """验证异常测试"""

    def test_validation_exception_default(self):
        """测试默认的验证异常"""
        exc = ValidationException("字段验证失败")
        assert exc.message == "字段验证失败"
        assert exc.code == "VALIDATION_ERROR"
        assert exc.details is None

    def test_validation_exception_with_details(self):
        """测试带详细信息的验证异常"""
        details = {"field": "price", "expected": "positive_number", "actual": -10}
        exc = ValidationException("价格必须为正数", details=details)
        assert exc.details == details


class TestDatabaseException:
    """数据库异常测试"""

    def test_database_exception_default(self):
        """测试默认的数据库异常"""
        exc = DatabaseException("数据库连接失败")
        assert exc.message == "数据库连接失败"
        assert exc.code == "DATABASE_ERROR"

    def test_database_exception_with_query(self):
        """测试带查询信息的数据库异常"""
        query = "SELECT * FROM properties WHERE id = ?"
        exc = DatabaseException("查询执行失败", details={"query": query, "params": [123]})
        assert exc.details["query"] == query


class TestDateProcessingExceptions:
    """日期处理异常测试"""

    def test_date_processing_exception(self):
        """测试日期处理基础异常"""
        exc = DateProcessingException("日期处理失败")
        assert exc.code == "DATE_PROCESSING_ERROR"

    def test_date_format_exception(self):
        """测试日期格式异常"""
        exc = DateFormatException("无效的日期格式")
        assert exc.code == "DATE_FORMAT_ERROR"
        assert exc.message == "无效的日期格式"

        # 测试默认消息
        exc_default = DateFormatException()
        assert exc_default.message == "日期格式无效"

    def test_date_parsing_exception(self):
        """测试日期解析异常"""
        exc = DateParsingException("无法解析日期字符串")
        assert exc.code == "DATE_PARSING_ERROR"
        assert exc.message == "无法解析日期字符串"

        # 测试默认消息
        exc_default = DateParsingException()
        assert exc_default.message == "日期解析失败"

    def test_date_exception_inheritance(self):
        """测试日期异常的继承关系"""
        format_exc = DateFormatException()
        parsing_exc = DateParsingException()

        assert isinstance(format_exc, DateProcessingException)
        assert isinstance(parsing_exc, DateProcessingException)
        assert isinstance(format_exc, ProfoException)
        assert isinstance(parsing_exc, ProfoException)


class TestFileProcessingException:
    """文件处理异常测试"""

    def test_file_processing_exception_basic(self):
        """测试文件处理异常"""
        exc = FileProcessingException("文件编码解码失败")
        assert exc.message == "文件编码解码失败"
        assert exc.code == "FILE_PROCESSING_ERROR"

    def test_file_processing_exception_with_encoding_details(self):
        """测试带编码详情的文件处理异常"""
        details = {
            "encoding_attempts": ["utf-8-sig", "utf-8", "gbk"],
            "file_size": 1024,
            "error": "UnicodeDecodeError"
        }
        exc = FileProcessingException("无法解码文件", details=details)
        assert exc.details["encoding_attempts"] == ["utf-8-sig", "utf-8", "gbk"]
        assert exc.details["file_size"] == 1024


class TestExceptionChaining:
    """异常链测试"""

    def test_exception_with_cause(self):
        """测试带原因的异常链"""
        original_error = ValueError("原始错误")

        try:
            raise ValidationException("验证失败") from original_error
        except ValidationException as exc:
            assert exc.__cause__ is original_error
            assert str(exc) == "验证失败"

    def test_nested_exceptions(self):
        """测试嵌套异常"""
        try:
            try:
                raise DateFormatException("日期格式错误")
            except DateFormatException as date_exc:
                raise ValidationException("数据验证失败") from date_exc
        except ValidationException as val_exc:
            assert isinstance(val_exc.__cause__, DateFormatException)


class TestExceptionSerialization:
    """异常序列化测试"""

    def test_exception_to_dict(self):
        """测试异常转换为字典"""
        exc = ValidationException(
            "字段验证失败",
            details={"field": "price", "expected": "positive"}
        )

        exc_dict = {
            "message": exc.message,
            "code": exc.code,
            "details": exc.details
        }

        assert exc_dict["message"] == "字段验证失败"
        assert exc_dict["code"] == "VALIDATION_ERROR"
        assert exc_dict["details"]["field"] == "price"

    def test_exception_repr(self):
        """测试异常的字符串表示"""
        exc = ProfoException("测试消息", code="TEST_CODE")
        repr_str = repr(exc)
        assert "ProfoException" in repr_str
        assert "测试消息" in repr_str
        # repr()默认只显示消息，不显示code，这是Python的默认行为
        # 我们可以直接验证code属性
        assert exc.code == "TEST_CODE"