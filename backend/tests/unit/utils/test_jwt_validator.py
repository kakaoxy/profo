"""JWT密钥验证工具单元测试."""

from unittest.mock import MagicMock

import pytest
from pytest_mock import MockerFixture

from utils.jwt_validator import (
    _DEFAULT_DEV_KEY,
    _MIN_KEY_LENGTH,
    check_jwt_configuration,
    generate_secure_jwt_key,
    validate_jwt_secret_key,
)


def _make_settings(**kwargs: object) -> MagicMock:
    """构造 mock settings 对象."""
    mock = MagicMock()
    mock.jwt_secret_key = kwargs.get("jwt_secret_key", "")
    mock.jwt_key_rotation_enabled = kwargs.get("jwt_key_rotation_enabled", False)
    mock.jwt_secret_key_old = kwargs.get("jwt_secret_key_old", None)
    return mock


def _patch_settings(mocker: MockerFixture, mock_settings: MagicMock) -> None:
    """Patch settings 模块使延迟导入 `from settings import settings` 返回 mock."""
    mock_mod = MagicMock()
    mock_mod.settings = mock_settings
    mocker.patch.dict("sys.modules", {"settings": mock_mod})


# ---------------------------------------------------------------------------
# validate_jwt_secret_key
# ---------------------------------------------------------------------------


class TestValidateJwtSecretKey:
    """validate_jwt_secret_key 测试."""

    def test_empty_key_returns_false(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key=""))
        assert validate_jwt_secret_key() is False

    def test_none_key_returns_false(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key=None))
        assert validate_jwt_secret_key() is False

    def test_whitespace_only_key_returns_false(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key="   "))
        assert validate_jwt_secret_key() is False

    def test_dev_default_key_returns_true(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key=_DEFAULT_DEV_KEY))
        assert validate_jwt_secret_key() is True

    def test_dev_default_key_logs_warning(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key=_DEFAULT_DEV_KEY))
        mock_logger = mocker.patch("utils.jwt_validator.logger")
        validate_jwt_secret_key()
        assert mock_logger.warning.call_count == 2

    def test_short_key_returns_false(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key="short_key_123"))
        assert validate_jwt_secret_key() is False

    def test_short_key_logs_error_with_length(self, mocker: MockerFixture) -> None:
        short_key = "a" * (_MIN_KEY_LENGTH - 1)
        _patch_settings(mocker, _make_settings(jwt_secret_key=short_key))
        mock_logger = mocker.patch("utils.jwt_validator.logger")
        assert validate_jwt_secret_key() is False
        mock_logger.error.assert_called_once()

    def test_valid_long_key_returns_true(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key="Abc123!@#Xyz789$%^Def456&*()Ghi012"))
        assert validate_jwt_secret_key() is True

    def test_key_without_complexity_returns_true_with_warning(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key="a" * _MIN_KEY_LENGTH))
        mock_logger = mocker.patch("utils.jwt_validator.logger")
        assert validate_jwt_secret_key() is True
        mock_logger.warning.assert_called_once()

    def test_exactly_min_length_key_returns_true(self, mocker: MockerFixture) -> None:
        # 构造恰好32字符且包含大小写+数字+特殊字符的密钥
        key = "Ab1!Xy2@Cd3#Ef4$Gh5%Ij6^Kl7&Mn8*"
        assert len(key) == _MIN_KEY_LENGTH
        _patch_settings(mocker, _make_settings(jwt_secret_key=key))
        assert validate_jwt_secret_key() is True


# ---------------------------------------------------------------------------
# generate_secure_jwt_key
# ---------------------------------------------------------------------------


class TestGenerateSecureJwtKey:
    """generate_secure_jwt_key 测试."""

    _ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"

    def test_default_length_is_64(self) -> None:
        assert len(generate_secure_jwt_key()) == 64

    def test_custom_length(self) -> None:
        assert len(generate_secure_jwt_key(length=128)) == 128

    def test_custom_length_short(self) -> None:
        assert len(generate_secure_jwt_key(length=10)) == 10

    def test_generated_key_contains_only_alphabet_chars(self) -> None:
        key = generate_secure_jwt_key(length=200)
        for char in key:
            assert char in self._ALPHABET

    def test_different_calls_produce_different_keys(self) -> None:
        assert generate_secure_jwt_key() != generate_secure_jwt_key()


# ---------------------------------------------------------------------------
# check_jwt_configuration
# ---------------------------------------------------------------------------


class TestCheckJwtConfiguration:
    """check_jwt_configuration 测试."""

    def test_invalid_key_causes_sys_exit(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(jwt_secret_key=""))
        mock_exit = mocker.patch("utils.jwt_validator.sys.exit")
        check_jwt_configuration()
        mock_exit.assert_called_once_with(1)

    def test_valid_key_completes_without_exit(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(
            jwt_secret_key="Abc123!@#Xyz789$%^Def456&*()Ghi012",
            jwt_key_rotation_enabled=False,
        ))
        mock_exit = mocker.patch("utils.jwt_validator.sys.exit")
        check_jwt_configuration()
        mock_exit.assert_not_called()

    def test_valid_key_logs_success(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(
            jwt_secret_key="Abc123!@#Xyz789$%^Def456&*()Ghi012",
            jwt_key_rotation_enabled=False,
        ))
        mock_logger = mocker.patch("utils.jwt_validator.logger")
        check_jwt_configuration()
        info_calls = [str(c) for c in mock_logger.info.call_args_list]
        assert any("JWT密钥配置验证通过" in c for c in info_calls)

    def test_rotation_enabled_without_old_key_warns(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(
            jwt_secret_key="Abc123!@#Xyz789$%^Def456&*()Ghi012",
            jwt_key_rotation_enabled=True,
            jwt_secret_key_old=None,
        ))
        mock_logger = mocker.patch("utils.jwt_validator.logger")
        check_jwt_configuration()
        warning_calls = [str(c) for c in mock_logger.warning.call_args_list]
        assert any("密钥轮换但未设置旧密钥" in c for c in warning_calls)

    def test_rotation_enabled_with_old_key_logs_info(self, mocker: MockerFixture) -> None:
        _patch_settings(mocker, _make_settings(
            jwt_secret_key="Abc123!@#Xyz789$%^Def456&*()Ghi012",
            jwt_key_rotation_enabled=True,
            jwt_secret_key_old="OldKey123!@#OldKey456$%^OldKey789",
        ))
        mock_logger = mocker.patch("utils.jwt_validator.logger")
        check_jwt_configuration()
        info_calls = [str(c) for c in mock_logger.info.call_args_list]
        assert any("JWT密钥轮换已启用" in c for c in info_calls)
