"""
安全日志工具测试
测试敏感数据脱敏功能
"""
import pytest
import json

from utils.security_logger import (
    is_sensitive_field,
    mask_value,
    mask_sensitive_data,
    safe_log_request_body,
    safe_log_dict,
    SENSITIVE_FIELDS,
)


class TestIsSensitiveField:
    """测试敏感字段检测功能"""

    def test_detect_password_fields(self):
        """测试密码字段检测"""
        assert is_sensitive_field("password") is True
        assert is_sensitive_field("current_password") is True
        assert is_sensitive_field("new_password") is True
        assert is_sensitive_field("user_password") is True

    def test_detect_token_fields(self):
        """测试 Token 字段检测"""
        assert is_sensitive_field("token") is True
        assert is_sensitive_field("access_token") is True
        assert is_sensitive_field("refresh_token") is True
        assert is_sensitive_field("temp_token") is True
        assert is_sensitive_field("api_token") is True

    def test_detect_api_key_fields(self):
        """测试 API Key 字段检测"""
        assert is_sensitive_field("api_key") is True
        assert is_sensitive_field("api_secret") is True
        assert is_sensitive_field("secret_key") is True

    def test_non_sensitive_fields(self):
        """测试非敏感字段"""
        assert is_sensitive_field("username") is False
        assert is_sensitive_field("email") is False
        assert is_sensitive_field("name") is False
        assert is_sensitive_field("age") is False
        assert is_sensitive_field("status") is False

    def test_case_insensitive(self):
        """测试大小写不敏感检测"""
        assert is_sensitive_field("PASSWORD") is True
        assert is_sensitive_field("Token") is True
        assert is_sensitive_field("Api_Key") is True


class TestMaskValue:
    """测试值脱敏功能"""

    def test_mask_long_string(self):
        """测试长字符串脱敏 - 显示前3和后3字符"""
        result = mask_value("secret123456")
        assert "***" in result
        assert result.startswith("sec")
        assert result.endswith("456")

    def test_mask_short_string(self):
        """测试短字符串脱敏 - 完全掩码"""
        assert mask_value("abc") == "***"
        assert mask_value("ab") == "***"
        assert mask_value("a") == "***"

    def test_mask_empty_string(self):
        """测试空字符串"""
        assert mask_value("") == ""

    def test_mask_none(self):
        """测试 None 值"""
        assert mask_value(None) == "null"

    def test_mask_non_string(self):
        """测试非字符串值"""
        assert mask_value(12345) == "***"
        assert mask_value([1, 2, 3]) == "***"
        assert mask_value({"key": "value"}) == "***"


class TestMaskSensitiveData:
    """测试数据脱敏功能"""

    def test_mask_simple_dict(self):
        """测试简单字典脱敏"""
        data = {"username": "admin", "password": "secret123"}
        result = mask_sensitive_data(data)
        assert result["username"] == "admin"
        # 密码应该被脱敏
        assert "***" in result["password"]
        assert result["password"] != "secret123"

    def test_mask_nested_dict(self):
        """测试嵌套字典脱敏"""
        data = {
            "user": {
                "name": "test",
                "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "password": "secret123"
            },
            "api_key": "sk-1234567890abcdef"
        }
        result = mask_sensitive_data(data)
        assert result["user"]["name"] == "test"
        # 敏感字段应该被脱敏
        assert "***" in result["user"]["token"]
        assert "***" in result["user"]["password"]
        assert "***" in result["api_key"]
        # 原始值不应该存在
        assert "eyJhbGci" not in result["user"]["token"]
        assert "secret123" not in result["user"]["password"]

    def test_mask_list_in_dict(self):
        """测试字典中包含列表的脱敏"""
        data = {
            "users": [
                {"name": "user1", "password": "pass1"},
                {"name": "user2", "password": "pass2"}
            ]
        }
        result = mask_sensitive_data(data)
        assert result["users"][0]["name"] == "user1"
        # 密码应该被脱敏
        assert "***" in result["users"][0]["password"]
        assert "***" in result["users"][1]["password"]

    def test_mask_list(self):
        """测试列表脱敏"""
        data = [
            {"username": "user1", "password": "secret1"},
            {"username": "user2", "password": "secret2"}
        ]
        result = mask_sensitive_data(data)
        assert result[0]["username"] == "user1"
        assert "***" in result[0]["password"]
        assert result[1]["username"] == "user2"
        assert "***" in result[1]["password"]

    def test_mask_no_sensitive_data(self):
        """测试没有敏感数据的字典"""
        data = {"username": "admin", "email": "admin@example.com", "age": 30}
        result = mask_sensitive_data(data)
        assert result == data

    def test_mask_primitive_values(self):
        """测试原始值"""
        assert mask_sensitive_data("string") == "string"
        assert mask_sensitive_data(123) == 123
        assert mask_sensitive_data(None) is None


class TestSafeLogRequestBody:
    """测试请求体安全解析功能"""

    def test_parse_json_body(self):
        """测试 JSON 请求体解析"""
        body = json.dumps({
            "username": "admin",
            "password": "secret123"
        }).encode()
        result = safe_log_request_body(body)
        assert result["username"] == "admin"
        # 密码应该被脱敏
        assert "***" in result["password"]
        assert result["password"] != "secret123"

    def test_parse_string_body(self):
        """测试字符串请求体解析"""
        body = json.dumps({"token": "abc123"})
        result = safe_log_request_body(body)
        # 短 token 应该被完全脱敏
        assert "***" in result["token"]
        assert result["token"] != "abc123"

    def test_parse_nested_json(self):
        """测试嵌套 JSON 解析"""
        body = json.dumps({
            "user": {
                "name": "test",
                "password": "secret"
            },
            "api_key": "key123"
        }).encode()
        result = safe_log_request_body(body)
        assert result["user"]["name"] == "test"
        # 短密码应该被完全脱敏
        assert result["user"]["password"] == "***"
        assert "***" in result["api_key"]

    def test_parse_invalid_json(self):
        """测试无效 JSON 处理"""
        body = b"not valid json"
        result = safe_log_request_body(body)
        assert result is None

    def test_parse_empty_body(self):
        """测试空请求体"""
        assert safe_log_request_body(b"") is None
        assert safe_log_request_body(None) is None

    def test_parse_binary_data(self):
        """测试二进制数据处理"""
        body = b"\x00\x01\x02\x03" * 50  # 200 bytes of binary data
        result = safe_log_request_body(body)
        assert result == {"raw_body": "[Binary data: 200 bytes]"}


class TestSafeLogDict:
    """测试安全字典日志功能"""

    def test_safe_log_dict(self):
        """测试字典安全日志"""
        data = {"username": "admin", "password": "secret"}
        result = safe_log_dict(data)
        assert result["username"] == "admin"
        assert "***" in result["password"]

    def test_safe_log_dict_none(self):
        """测试 None 输入"""
        assert safe_log_dict(None) is None


class TestIntegration:
    """集成测试"""

    def test_real_world_login_request(self):
        """测试真实登录请求脱敏"""
        login_request = {
            "username": "admin@example.com",
            "password": "SuperSecret123!",
            "remember_me": True
        }
        masked = mask_sensitive_data(login_request)
        assert masked["username"] == "admin@example.com"
        # 密码应该被脱敏
        assert "***" in masked["password"]
        assert masked["password"] != "SuperSecret123!"
        assert masked["remember_me"] is True

    def test_real_world_api_response(self):
        """测试真实 API 响应脱敏"""
        api_response = {
            "user": {
                "id": "12345",
                "name": "John Doe",
                "email": "john@example.com"
            },
            "auth_data": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
                "refresh_token": "dGhpcyBpcyBhIHJlZnJlc2ggdG9rZW4"
            },
            "api_key": "sk-live-1234567890"
        }
        masked = mask_sensitive_data(api_response)
        assert masked["user"]["id"] == "12345"
        assert masked["user"]["name"] == "John Doe"
        # Token 应该被脱敏
        assert "***" in masked["auth_data"]["access_token"]
        assert "***" in masked["auth_data"]["refresh_token"]
        assert "***" in masked["api_key"]
        # 原始敏感数据不应该存在
        assert "eyJhbGci" not in masked["auth_data"]["access_token"]

    def test_password_change_request(self):
        """测试密码修改请求脱敏"""
        request = {
            "current_password": "OldPass123!",
            "new_password": "NewPass456!"
        }
        masked = mask_sensitive_data(request)
        # 两个密码都应该被脱敏
        assert "***" in masked["current_password"]
        assert "***" in masked["new_password"]
        assert masked["current_password"] != "OldPass123!"
        assert masked["new_password"] != "NewPass456!"
