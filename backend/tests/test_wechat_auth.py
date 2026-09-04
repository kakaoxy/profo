"""微信集成测试.

验证：
1. 模拟微信授权失败（errcode != 0），确认错误提示正确
2. 模拟获取微信用户信息失败，确认错误提示正确
"""

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from services.system.exceptions import ValidationError
from services.system.wechat import WeChatAuthService


def _mock_response(data: dict) -> MagicMock:
    """构造同步 json() 方法的 mock response."""
    response = MagicMock()
    response.json.return_value = data
    return response


class TestWechatAuthFailures:
    """微信 OAuth 流程失败场景测试."""

    @pytest.mark.asyncio
    async def test_fetch_wechat_access_token_failure(self) -> None:
        """模拟微信授权失败，应抛出 ValidationError 并包含微信错误信息."""
        mock_response = _mock_response(
            {
                "errcode": 40029,
                "errmsg": "invalid code",
            }
        )

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.get.return_value = mock_response
            mock_client_class.return_value = mock_client

            with pytest.raises(ValidationError, match="微信授权失败: invalid code"):
                await WeChatAuthService.fetch_wechat_access_token("fake_code")

    @pytest.mark.asyncio
    async def test_fetch_wechat_user_info_failure(self) -> None:
        """模拟获取微信用户信息失败，应抛出 ValidationError 并包含微信错误信息."""
        mock_response = _mock_response(
            {
                "errcode": 41001,
                "errmsg": "access_token missing",
            }
        )

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.get.return_value = mock_response
            mock_client_class.return_value = mock_client

            with pytest.raises(ValidationError, match="获取微信用户信息失败: access_token missing"):
                await WeChatAuthService.fetch_wechat_user_info("fake_access_token", "fake_openid")

    @pytest.mark.asyncio
    async def test_fetch_wechat_access_token_success(self) -> None:
        """正向验证：微信授权成功返回数据."""
        mock_response = _mock_response(
            {
                "access_token": "test_access_token",
                "expires_in": 7200,
                "refresh_token": "test_refresh_token",
                "openid": "test_openid",
                "scope": "snsapi_userinfo",
            }
        )

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.get.return_value = mock_response
            mock_client_class.return_value = mock_client

            result = await WeChatAuthService.fetch_wechat_access_token("valid_code")
            assert result["openid"] == "test_openid"
            assert result["access_token"] == "test_access_token"

    @pytest.mark.asyncio
    async def test_fetch_wechat_user_info_success(self) -> None:
        """正向验证：获取微信用户信息成功返回数据."""
        mock_response = _mock_response(
            {
                "openid": "test_openid",
                "nickname": "微信用户",
                "headimgurl": "https://example.com/avatar.jpg",
            }
        )

        with patch("httpx.AsyncClient") as mock_client_class:
            mock_client = AsyncMock()
            mock_client.__aenter__.return_value = mock_client
            mock_client.get.return_value = mock_response
            mock_client_class.return_value = mock_client

            result = await WeChatAuthService.fetch_wechat_user_info("valid_token", "test_openid")
            assert result["nickname"] == "微信用户"
