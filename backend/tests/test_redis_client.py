"""Redis 客户端单例单元测试.

覆盖 _redact_redis_url 脱敏纯函数与 get_redis_client 单例工厂。
通过 mock Redis.from_url 验证调用参数与 ping 行为，不依赖真实 Redis 服务。
"""

from unittest.mock import MagicMock, patch

import pytest
from redis.exceptions import RedisError

from utils import redis_client as redis_client_module
from utils.redis_client import _redact_redis_url, get_redis_client


@pytest.fixture(autouse=True)
def reset_redis_singleton() -> None:
    """每个测试前后重置 Redis 客户端单例与冷却状态，避免测试间状态泄漏."""
    redis_client_module._redis_client = None
    redis_client_module._last_failure_time = 0.0
    redis_client_module._last_failure_exc = None


class TestRedactRedisUrl:
    """Redis URL 脱敏函数测试."""

    def test_with_username_and_password(self) -> None:
        """带用户名密码的 URL，凭据被替换为 ***."""
        result = _redact_redis_url("redis://user:pass@localhost:6379/0")
        assert result == "redis://***@localhost:6379/0"

    def test_with_username_only(self) -> None:
        """仅用户名无密码的 URL，userinfo 仍被脱敏."""
        result = _redact_redis_url("redis://user@localhost:6379/0")
        assert result == "redis://***@localhost:6379/0"

    def test_without_credentials(self) -> None:
        """无凭据的 URL 原样返回（host:port 保留以便排障）."""
        result = _redact_redis_url("redis://localhost:6379/0")
        assert result == "redis://localhost:6379/0"

    def test_without_port(self) -> None:
        """无端口的 URL，脱敏后不含端口."""
        result = _redact_redis_url("redis://user:pass@host/0")
        assert result == "redis://***@host/0"

    def test_rediss_protocol(self) -> None:
        """rediss:// (TLS) 协议同样脱敏."""
        result = _redact_redis_url("rediss://user:pass@host:6380/1")
        assert result == "rediss://***@host:6380/1"

    def test_with_path(self) -> None:
        """带路径的 URL，路径保留."""
        result = _redact_redis_url("redis://user:pass@host:6379/dbname")
        assert result == "redis://***@host:6379/dbname"


class TestGetRedisClient:
    """Redis 客户端单例工厂测试."""

    def test_first_call_creates_client(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """首次调用通过 Redis.from_url 创建客户端并 ping 验证."""
        monkeypatch.setattr(redis_client_module.settings, "redis_url", "redis://test:test@localhost:6379/0")

        mock_client = MagicMock()
        with patch("utils.redis_client.Redis.from_url", return_value=mock_client) as mock_from_url:
            result = get_redis_client()

        assert result is mock_client
        mock_from_url.assert_called_once_with(
            "redis://test:test@localhost:6379/0",
            decode_responses=False,
            socket_connect_timeout=5,
            socket_timeout=5,
        )
        mock_client.ping.assert_called_once()

    def test_singleton_returns_same_instance(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """第二次调用返回同一实例（单例缓存）."""
        monkeypatch.setattr(redis_client_module.settings, "redis_url", "redis://localhost:6379/0")

        mock_client = MagicMock()
        with patch("utils.redis_client.Redis.from_url", return_value=mock_client):
            first = get_redis_client()
            second = get_redis_client()

        assert first is second
        assert first is mock_client

    def test_ping_failure_resets_client(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Ping 失败时 _redis_client 被重置为 None，异常 re-raise."""
        monkeypatch.setattr(redis_client_module.settings, "redis_url", "redis://test:test@localhost:6379/0")

        mock_client = MagicMock()
        mock_client.ping.side_effect = RedisError("Connection refused")
        with (
            patch("utils.redis_client.Redis.from_url", return_value=mock_client),
            pytest.raises(RedisError, match="Connection refused"),
        ):
            get_redis_client()

        # 单例应被重置为 None，使后续调用可重试
        assert redis_client_module._redis_client is None

    def test_retry_after_failure(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """第一次 ping 失败后，冷却期过后第二次调用重新创建并成功."""
        monkeypatch.setattr(redis_client_module.settings, "redis_url", "redis://test:test@localhost:6379/0")

        fail_client = MagicMock()
        fail_client.ping.side_effect = RedisError("Connection refused")
        success_client = MagicMock()

        # 模拟时间：第一次调用 t=100，第二次调用 t=100+11（超过 10s 冷却期）
        with (
            patch("utils.redis_client.Redis.from_url", side_effect=[fail_client, success_client]),
            patch("utils.redis_client.time.monotonic", side_effect=[100.0, 111.0]),
        ):
            # 第一次：失败
            with pytest.raises(RedisError):
                get_redis_client()
            assert redis_client_module._redis_client is None

            # 第二次（冷却期已过）：重新创建并成功
            result = get_redis_client()
            assert result is success_client
            success_client.ping.assert_called_once()

    def test_cooldown_prevents_immediate_retry(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """冷却期内直接抛出缓存的异常，不尝试重新连接."""
        monkeypatch.setattr(redis_client_module.settings, "redis_url", "redis://test:test@localhost:6379/0")

        fail_client = MagicMock()
        fail_client.ping.side_effect = RedisError("Connection refused")

        # 模拟时间：第一次调用 t=100，第二次调用 t=105（在 10s 冷却期内）
        with (
            patch("utils.redis_client.Redis.from_url", return_value=fail_client) as mock_from_url,
            patch("utils.redis_client.time.monotonic", side_effect=[100.0, 105.0]),
        ):
            # 第一次：失败
            with pytest.raises(RedisError, match="Connection refused"):
                get_redis_client()

            # 第二次（冷却期内）：直接抛出缓存异常，不调用 Redis.from_url
            with pytest.raises(RedisError, match="Connection refused"):
                get_redis_client()

            # Redis.from_url 只被调用了一次（第二次被冷却期拦截）
            assert mock_from_url.call_count == 1

    def test_uses_settings_redis_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Redis.from_url 收到 settings.redis_url 的值."""
        test_url = "redis://custom:6390/2"
        monkeypatch.setattr(redis_client_module.settings, "redis_url", test_url)

        mock_client = MagicMock()
        with patch("utils.redis_client.Redis.from_url", return_value=mock_client) as mock_from_url:
            get_redis_client()

        assert mock_from_url.call_args[0][0] == test_url

    def test_log_contains_redacted_url(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Ping 失败时日志中的 URL 已脱敏（不含原始密码）."""
        monkeypatch.setattr(redis_client_module.settings, "redis_url", "redis://secretuser:secretpass@localhost:6379/0")

        mock_client = MagicMock()
        mock_client.ping.side_effect = RedisError("fail")
        with (
            patch("utils.redis_client.Redis.from_url", return_value=mock_client),
            patch.object(redis_client_module.logger, "error") as mock_logger_error,
            pytest.raises(RedisError),
        ):
            get_redis_client()

        mock_logger_error.assert_called_once()
        log_call_args = mock_logger_error.call_args
        # 日志格式："Redis 连接失败 (url=%s): %s"，url 参数在 args[1]
        logged_url = log_call_args[0][1]
        assert "secretpass" not in logged_url
        assert "secretuser" not in logged_url
        assert "***" in logged_url
