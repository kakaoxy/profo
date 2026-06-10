"""密码工具函数单元测试."""

from unittest.mock import patch

import bcrypt
import pytest

from utils.auth.password import (
    _truncate_password_safely,
    get_password_hash,
    validate_password_strength,
    verify_password,
)


class TestValidatePasswordStrength:
    """validate_password_strength 测试."""

    def test_non_string_input(self):
        ok, msg = validate_password_strength(123)
        assert ok is False
        assert msg == "密码必须是字符串类型"

    def test_non_string_none(self):
        ok, msg = validate_password_strength(None)
        assert ok is False
        assert msg == "密码必须是字符串类型"

    def test_too_short(self):
        ok, msg = validate_password_strength("Ab1!xxxx")
        # 8 chars exactly should pass
        assert ok is True
        ok, msg = validate_password_strength("Ab1!xx")
        assert ok is False
        assert "至少为8个字符" in msg

    def test_missing_uppercase(self):
        ok, msg = validate_password_strength("abcdef1!")
        assert ok is False
        assert "大写字母" in msg

    def test_missing_lowercase(self):
        ok, msg = validate_password_strength("ABCDEF1!")
        assert ok is False
        assert "小写字母" in msg

    def test_missing_digit(self):
        ok, msg = validate_password_strength("Abcdefg!")
        assert ok is False
        assert "数字" in msg

    def test_missing_special_char(self):
        ok, msg = validate_password_strength("Abcdefg1")
        assert ok is False
        assert "特殊字符" in msg

    def test_valid_password(self):
        ok, msg = validate_password_strength("Abcdef1!")
        assert ok is True
        assert msg == ""

    def test_valid_password_various_specials(self):
        for ch in "!@#$%^&*(),.?\":{}|<>":
            pw = f"Abcdef1{ch}"
            ok, msg = validate_password_strength(pw)
            assert ok is True, f"特殊字符 {ch!r} 应通过验证"


class TestVerifyPassword:
    """verify_password 测试."""

    def test_correct_password(self):
        hashed = bcrypt.hashpw(b"Abcdef1!", bcrypt.gensalt()).decode("utf-8")
        assert verify_password("Abcdef1!", hashed) is True

    def test_wrong_password(self):
        hashed = bcrypt.hashpw(b"Abcdef1!", bcrypt.gensalt()).decode("utf-8")
        assert verify_password("WrongPw1!", hashed) is False


class TestGetPasswordHash:
    """get_password_hash 测试."""

    def test_valid_password_returns_hash(self):
        result = get_password_hash("Abcdef1!")
        assert isinstance(result, str)
        assert result.startswith("$2")

    def test_hash_is_verifiable(self):
        hashed = get_password_hash("Abcdef1!")
        assert verify_password("Abcdef1!", hashed) is True

    def test_non_string_raises_type_error(self):
        with pytest.raises(TypeError, match="密码必须是字符串类型"):
            get_password_hash(123)

    @patch("utils.auth.password.bcrypt.hashpw", side_effect=Exception("boom"))
    def test_bcrypt_failure_raises_runtime_error(self, mock_hashpw):
        with pytest.raises(RuntimeError, match="密码哈希生成失败"):
            get_password_hash("Abcdef1!")


class TestTruncatePasswordSafely:
    """_truncate_password_safely 测试."""

    def test_short_password_unchanged(self):
        assert _truncate_password_safely("Abcdef1!") == "Abcdef1!"

    def test_long_password_truncated(self):
        # 73 ASCII bytes → must be truncated to ≤72 bytes
        long_pw = "A" * 73
        result = _truncate_password_safely(long_pw)
        assert len(result.encode("utf-8")) <= 72

    def test_multibyte_safe_truncation(self):
        # 每个 '你' 是 3 字节 UTF-8，构造超 72 字节的字符串
        # 25 * 3 = 75 bytes
        pw = "你" * 25
        result = _truncate_password_safely(pw)
        assert len(result.encode("utf-8")) <= 72
        # 结果应该是合法 UTF-8（不截断在字符中间）
        result.encode("utf-8").decode("utf-8")  # 不抛异常即可

    def test_exactly_72_bytes_unchanged(self):
        pw = "A" * 72
        assert _truncate_password_safely(pw) == pw
