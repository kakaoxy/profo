"""security_logger 单元测试."""

import json

from utils.security_logger import (
    SENSITIVE_FIELDS,
    _LARGE_BODY_THRESHOLD,
    _SHORT_VALUE_THRESHOLD,
    create_safe_log_message,
    is_sensitive_field,
    mask_sensitive_data,
    mask_value,
    safe_log_dict,
    safe_log_request_body,
)


# ── is_sensitive_field ──────────────────────────────────────────────


class TestIsSensitiveField:
    def test_exact_sensitive_names(self):
        for field in ("password", "token", "api_key", "api_secret", "secret",
                       "credit_card", "cvv", "ssn", "authorization", "cookie"):
            assert is_sensitive_field(field) is True

    def test_partial_match_prefix(self):
        assert is_sensitive_field("user_password") is True

    def test_partial_match_suffix(self):
        assert is_sensitive_field("access_token_v2") is True

    def test_partial_match_middle(self):
        assert is_sensitive_field("my_secret_value") is True

    def test_non_sensitive_fields(self):
        for field in ("username", "nickname", "email", "age", "id", "name"):
            assert is_sensitive_field(field) is False

    def test_case_insensitive(self):
        assert is_sensitive_field("Password") is True
        assert is_sensitive_field("TOKEN") is True
        assert is_sensitive_field("Api_Key") is True


# ── mask_value ──────────────────────────────────────────────────────


class TestMaskValue:
    def test_none(self):
        assert mask_value(None) == "null"

    def test_empty_string(self):
        assert mask_value("") == ""

    def test_short_string(self):
        assert mask_value("abc") == "***"
        assert mask_value("abcdef") == "***"  # 长度 == 阈值

    def test_long_string(self):
        val = "abcdefghij"
        result = mask_value(val)
        assert result == "abc***hij"

    def test_string_exactly_threshold_plus_one(self):
        val = "abcdefg"  # 长度 7, 刚好超过阈值 6
        assert mask_value(val) == "abc***efg"

    def test_non_string_int(self):
        assert mask_value(42) == "***"

    def test_non_string_list(self):
        assert mask_value([1, 2, 3]) == "***"


# ── mask_sensitive_data ─────────────────────────────────────────────


class TestMaskSensitiveData:
    def test_dict_sensitive_fields_masked(self):
        data = {"password": "mysecret123", "username": "alice"}
        result = mask_sensitive_data(data)
        assert result["username"] == "alice"
        assert result["password"] != "mysecret123"

    def test_dict_non_sensitive_unchanged(self):
        data = {"username": "bob", "age": 30}
        result = mask_sensitive_data(data)
        assert result == data

    def test_nested_dict(self):
        data = {"user": {"password": "nested_pw", "email": "a@b.com"}}
        result = mask_sensitive_data(data)
        assert result["user"]["email"] == "a@b.com"
        assert result["user"]["password"] != "nested_pw"

    def test_list_of_dicts(self):
        data = [
            {"password": "pw1", "name": "a"},
            {"token": "tk2", "name": "b"},
        ]
        result = mask_sensitive_data(data)
        assert len(result) == 2
        assert result[0]["name"] == "a"
        assert result[0]["password"] != "pw1"
        assert result[1]["name"] == "b"
        assert result[1]["token"] != "tk2"

    def test_non_dict_non_list_returned_as_is(self):
        assert mask_sensitive_data(42) == 42
        assert mask_sensitive_data("hello") == "hello"

    def test_empty_dict(self):
        assert mask_sensitive_data({}) == {}

    def test_empty_list(self):
        assert mask_sensitive_data([]) == []


# ── safe_log_request_body ──────────────────────────────────────────


class TestSafeLogRequestBody:
    def test_none_body(self):
        assert safe_log_request_body(None) is None

    def test_empty_bytes(self):
        assert safe_log_request_body(b"") is None

    def test_empty_string(self):
        assert safe_log_request_body("") is None

    def test_valid_json_bytes_with_sensitive(self):
        body = json.dumps({"username": "alice", "password": "secret"}).encode()
        result = safe_log_request_body(body)
        assert result is not None
        assert result["username"] == "alice"
        assert result["password"] != "secret"

    def test_valid_json_string_with_sensitive(self):
        body = json.dumps({"token": "abc123xyz", "name": "bob"})
        result = safe_log_request_body(body)
        assert result is not None
        assert result["name"] == "bob"
        assert result["token"] != "abc123xyz"

    def test_non_dict_json_wrapped(self):
        body = json.dumps([{"password": "pw", "id": 1}])
        result = safe_log_request_body(body)
        assert "data" in result
        assert result["data"][0]["id"] == 1
        assert result["data"][0]["password"] != "pw"

    def test_invalid_json_short_string(self):
        assert safe_log_request_body("not json") is None

    def test_invalid_json_short_bytes(self):
        assert safe_log_request_body(b"bad{}data") is None

    def test_large_binary_body(self):
        body = b"\x00" * (_LARGE_BODY_THRESHOLD + 1)
        result = safe_log_request_body(body)
        assert result is not None
        assert "raw_body" in result
        assert f"{len(body)} bytes" in result["raw_body"]

    def test_small_binary_body(self):
        body = b"\x00\x01\x02"
        result = safe_log_request_body(body)
        assert result is None


# ── safe_log_dict ───────────────────────────────────────────────────


class TestSafeLogDict:
    def test_none(self):
        assert safe_log_dict(None) is None

    def test_dict_masked(self):
        data = {"password": "secret", "username": "alice"}
        result = safe_log_dict(data)
        assert result["username"] == "alice"
        assert result["password"] != "secret"

    def test_empty_dict(self):
        assert safe_log_dict({}) == {}


# ── create_safe_log_message ────────────────────────────────────────


class TestCreateSafeLogMessage:
    def test_no_data(self):
        assert create_safe_log_message("hello") == "hello"

    def test_include_data_false(self):
        assert create_safe_log_message("hello", data={"x": 1}, include_data=False) == "hello"

    def test_with_data(self):
        result = create_safe_log_message("login", data={"username": "alice", "password": "pw"})
        assert result.startswith("login | data=")
        safe_part = result.split("data=", 1)[1]
        parsed = json.loads(safe_part)
        assert parsed["username"] == "alice"
        assert parsed["password"] != "pw"

    def test_non_serializable_data(self):
        class BadObj:
            pass
        result = create_safe_log_message("msg", data={"obj": BadObj()})
        assert "[无法序列化]" in result

    def test_data_none(self):
        assert create_safe_log_message("msg", data=None) == "msg"

    def test_data_none_include_data_true(self):
        assert create_safe_log_message("msg", data=None, include_data=True) == "msg"
