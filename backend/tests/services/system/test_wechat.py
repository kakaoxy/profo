"""WeChat OAuth state/temp_code Redis 迁移单元测试.

验证：
1. generate_wechat_auth_url 将 state 写入 Redis（key=wechat:state:<state>, TTL=600），不再写 DB
2. consume_wechat_state 使用 GETDEL 原子消费，二次调用返回 None
3. store_temp_token 将 temp_code 写入 Redis（key=wechat:tempcode:<code>, TTL=60），不再写 DB
4. exchange_temp_code 使用 GETDEL 原子消费，二次调用返回 None
5. DB 表未被写入（无 db.add / db.commit / db.query 调用）

Redis 客户端通过 mock 注入（项目未安装 fakeredis），DB Session 用 MagicMock 断言未写入。
"""

import json
from unittest.mock import MagicMock, patch

import pytest

from services.system.wechat import WeChatAuthService


@pytest.fixture
def mock_redis() -> MagicMock:
    """提供 mock Redis 客户端，记录所有调用."""
    client = MagicMock()
    # getdel 默认返回 None（模拟 key 不存在）
    client.getdel.return_value = None
    return client


@pytest.fixture
def mock_db() -> MagicMock:
    """提供 mock SQLAlchemy Session，用于断言未被写入."""
    return MagicMock()


class TestGenerateWechatAuthUrl:
    """generate_wechat_auth_url: state 写入 Redis."""

    def test_writes_state_to_redis_with_ttl_600(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """应将 state 写入 wechat:state:<state>，TTL=600，值为 JSON 序列化的 session 数据."""
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            auth_url, state = WeChatAuthService.generate_wechat_auth_url(mock_db)

        # state 出现在 URL 中
        assert state in auth_url
        # 断言 Redis SET 被调用，key 前缀正确，TTL=600
        mock_redis.set.assert_called_once()
        args, kwargs = mock_redis.set.call_args
        key = args[0]
        value = args[1]
        assert key == f"wechat:state:{state}"
        assert kwargs.get("ex") == 600
        # 值应为 JSON 可解析的 bytes
        parsed = json.loads(value)
        assert parsed["state"] == state
        assert "created_at" in parsed
        assert "expires_at" in parsed
        # DB 未被写入
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_called()
        mock_db.query.assert_not_called()

    def test_state_is_random_per_call(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """每次调用生成不同的 state（防 CSRF）."""
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            _, state1 = WeChatAuthService.generate_wechat_auth_url(mock_db)
            _, state2 = WeChatAuthService.generate_wechat_auth_url(mock_db)
        assert state1 != state2


class TestConsumeWechatState:
    """consume_wechat_state: GETDEL 原子消费."""

    def test_uses_getdel_returns_data(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """首次消费应 GETDEL 并返回反序列化数据."""
        session_data = {
            "state": "abc123",
            "created_at": "2026-01-01T00:00:00+00:00",
            "expires_at": "2026-01-01T00:10:00+00:00",
        }
        mock_redis.getdel.return_value = json.dumps(session_data).encode("utf-8")

        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            result = WeChatAuthService.consume_wechat_state(mock_db, "abc123")

        mock_redis.getdel.assert_called_once_with("wechat:state:abc123")
        assert result == session_data
        # DB 未被写入
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_called()
        mock_db.query.assert_not_called()

    def test_second_call_returns_none(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """二次消费返回 None（key 已被 GETDEL 原子删除）."""
        # 第一次返回数据
        mock_redis.getdel.return_value = json.dumps({"state": "abc"}).encode("utf-8")
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            first = WeChatAuthService.consume_wechat_state(mock_db, "abc")
            # 第二次返回 None（模拟 key 已被删除）
            mock_redis.getdel.return_value = None
            second = WeChatAuthService.consume_wechat_state(mock_db, "abc")

        assert first is not None
        assert second is None

    def test_none_state_returns_none(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """当 state 为 None 时直接返回 None，不调用 Redis."""
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            result = WeChatAuthService.consume_wechat_state(mock_db, None)
        assert result is None
        mock_redis.getdel.assert_not_called()

    def test_empty_state_returns_none(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """空 state 视为无效，直接返回 None."""
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            result = WeChatAuthService.consume_wechat_state(mock_db, "")
        assert result is None
        mock_redis.getdel.assert_not_called()


class TestStoreTempToken:
    """store_temp_token: temp_code 写入 Redis."""

    def test_writes_tempcode_to_redis_with_ttl_60(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """temp_code 应写入 wechat:tempcode:<code>，TTL=60，值为 JSON 序列化的 token 数据."""
        atk = "atk"
        rtk = "rtk"
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            code = WeChatAuthService.store_temp_token(
                mock_db,
                access_token=atk,
                refresh_token=rtk,
            )

        mock_redis.set.assert_called_once()
        args, kwargs = mock_redis.set.call_args
        assert args[0] == f"wechat:tempcode:{code}"
        assert kwargs.get("ex") == 60
        parsed = json.loads(args[1])
        assert parsed["access_token"] == atk
        assert parsed["refresh_token"] == rtk
        assert "created_at" in parsed
        # DB 未被写入
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_called()
        mock_db.query.assert_not_called()

    def test_returns_unique_code_per_call(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """每次调用返回不同的临时码."""
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            code1 = WeChatAuthService.store_temp_token(mock_db, "a", "b")
            code2 = WeChatAuthService.store_temp_token(mock_db, "a", "b")
        assert code1 != code2


class TestExchangeTempCode:
    """exchange_temp_code: GETDEL 原子消费."""

    def test_uses_getdel_returns_data(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """首次兑换应 GETDEL 并返回反序列化数据."""
        token_data = {"access_token": "atk", "refresh_token": "rtk"}
        mock_redis.getdel.return_value = json.dumps(token_data).encode("utf-8")

        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            result = WeChatAuthService.exchange_temp_code(mock_db, "code123")

        mock_redis.getdel.assert_called_once_with("wechat:tempcode:code123")
        assert result == token_data
        # DB 未被写入
        mock_db.add.assert_not_called()
        mock_db.commit.assert_not_called()
        mock_db.query.assert_not_called()

    def test_second_call_returns_none(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """二次兑换返回 None（key 已被 GETDEL 原子删除）."""
        mock_redis.getdel.return_value = json.dumps({"access_token": "atk"}).encode("utf-8")
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            first = WeChatAuthService.exchange_temp_code(mock_db, "code123")
            mock_redis.getdel.return_value = None
            second = WeChatAuthService.exchange_temp_code(mock_db, "code123")

        assert first is not None
        assert second is None

    def test_missing_code_returns_none(
        self,
        mock_redis: MagicMock,
        mock_db: MagicMock,
    ) -> None:
        """授权码不存在时返回 None（不再抛 AuthenticationError）."""
        mock_redis.getdel.return_value = None
        with patch("services.system.wechat.get_redis_client", return_value=mock_redis):
            result = WeChatAuthService.exchange_temp_code(mock_db, "nonexistent")
        assert result is None
