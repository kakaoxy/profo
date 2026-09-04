"""限流 IP 解析测试：_get_client_ip 与可信代理 XFF 解析.

覆盖安全关键行为：
- 可信代理直连时读取 X-Forwarded-For
- 非可信直连时忽略 XFF（防绕过限流）
- **XFF 欺诈防护**：当 nginx 使用 $proxy_add_x_forwarded_for 时，
  攻击者可在 XFF 头塞入伪造 IP；取「最左侧 IP」会让攻击者绕过限流，
  必须从右向左跳过可信代理，返回第一个非可信 IP。

说明：默认 settings.trusted_proxies = ["127.0.0.1", "::1"]，
测试用 127.0.0.1 作为可信代理直连 host。
"""

from collections.abc import Mapping
from typing import ClassVar

from utils.common import _get_client_ip


class _FakeClient:
    """模拟 Starlette Request.client."""

    def __init__(self, host: str) -> None:
        self.host = host


class _FakeRequest:
    """最小化 Request 桩件，仅暴露 _get_client_ip 所需字段."""

    def __init__(self, client_host: str, headers: Mapping[str, str]) -> None:
        self.client = _FakeClient(client_host)
        self.headers = headers


def _make_request(client_host: str, xff: str | None = None) -> _FakeRequest:
    headers: dict[str, str] = {}
    if xff is not None:
        headers["X-Forwarded-For"] = xff
    return _FakeRequest(client_host, headers)


class TestGetClientIpTrustedProxy:
    """可信代理直连场景下读取 XFF."""

    def test_single_ip_xff(self) -> None:
        """XFF 仅一个 IP（无伪造）时应直接返回该 IP."""
        req = _make_request("127.0.0.1", xff="203.0.113.5")
        assert _get_client_ip(req) == "203.0.113.5"

    def test_no_xff_returns_client_host(self) -> None:
        """可信代理直连但无 XFF 头时返回直连 host."""
        req = _make_request("127.0.0.1", xff=None)
        assert _get_client_ip(req) == "127.0.0.1"


class TestGetClientIpUntrustedClient:
    """非可信直连时仍解析 XFF（commit 06875787 后行为）.

    说明：自 06875787 起，实现不再以 client_host 是否可信作为信任前置，
    只要 XFF 存在就从右向左解析并返回第一个非可信 IP。这是因为 Docker 生产
    环境 uvicorn --forwarded-allow-ips "*" 会用 XFF 最左侧值覆盖 client.host，
    基于 client_host 的门禁失效；部署保证 backend 仅绑定 127.0.0.1（nginx 独占
    可达），XFF 必经 nginx，故无需再以 client_host 判定信任。
    """

    def test_untrusted_client_parses_xff(self) -> None:
        """非可信 host 直连且带 XFF 时，返回 XFF 中第一个非可信 IP."""
        req = _make_request("198.51.100.7", xff="203.0.113.5")
        assert _get_client_ip(req) == "203.0.113.5"


class TestGetClientIpXffSpoofing:
    """XFF 欺诈防护：nginx $proxy_add_x_forwarded_for 场景.

    攻击向量：
        客户端发送 `X-Forwarded-For: 1.2.3.4` 头
        nginx 用 $proxy_add_x_forwarded_for 追加真实 IP：
            X-Forwarded-For: 1.2.3.4, <real_client_ip>
        若后端取最左侧 IP，攻击者每次请求换一个伪造 IP，限流永不触发。

    期望行为：
        从右向左跳过可信代理，第一个非可信 IP 即真实客户端。
    """

    def test_spoofed_leftmost_ip_must_be_ignored(self) -> None:
        """XFF 中左侧伪造 IP 不应被采用，应返回右侧真实客户端 IP.

        场景：nginx 追加真实 IP 到攻击者伪造的 XFF 末尾。
        """
        # 攻击者真实 IP 是 203.0.113.50，伪造 XFF 头为 1.2.3.4
        # nginx 追加后：X-Forwarded-For: 1.2.3.4, 203.0.113.50
        req = _make_request("127.0.0.1", xff="1.2.3.4, 203.0.113.50")
        # 旧逻辑（取最左侧）会返回 "1.2.3.4" — 限流可被绕过
        # 新逻辑应返回 "203.0.113.50"（右侧第一个非可信 IP）
        assert _get_client_ip(req) == "203.0.113.50"

    def test_multiple_proxies_skip_trusted_chain(self) -> None:
        """多级可信代理链：跳过所有可信代理，返回最右侧的非可信 IP.

        场景：Client(203.0.113.50) → TrustedProxyA(127.0.0.1) → TrustedProxyB(::1) → Backend
        XFF = "203.0.113.50, 127.0.0.1, ::1"
        注：此处仅验证 XFF 解析逻辑，实际部署中 ::1 与 127.0.0.1 都在可信列表。
        """
        req = _make_request("127.0.0.1", xff="203.0.113.50, 127.0.0.1, ::1")
        # 从右向左：::1 可信(跳过) → 127.0.0.1 可信(跳过) → 203.0.113.50 非可信(返回)
        assert _get_client_ip(req) == "203.0.113.50"

    def test_spoofed_with_multiple_fake_entries(self) -> None:
        """攻击者在 XFF 塞入多个伪造 IP，右侧真实 IP 仍应被采用."""
        # 攻击者塞入 10.0.0.1/2/3 三个伪造 IP，真实客户端 IP 是 203.0.113.99
        req = _make_request("127.0.0.1", xff="10.0.0.1, 10.0.0.2, 10.0.0.3, 203.0.113.99")
        assert _get_client_ip(req) == "203.0.113.99"


class TestGetClientIpEdgeCases:
    """边界场景."""

    def test_empty_xff_header(self) -> None:
        """空 XFF 头应回退到直连 host."""
        req = _make_request("127.0.0.1", xff="")
        assert _get_client_ip(req) == "127.0.0.1"

    def test_xff_with_empty_entries(self) -> None:
        """XFF 含空条目（如 ', 1.2.3.4'）应过滤空条目后解析."""
        req = _make_request("127.0.0.1", xff=", 1.2.3.4, , 5.6.7.8")
        # 过滤空条目后：["1.2.3.4", "5.6.7.8"]
        # 从右向左：5.6.7.8 非可信(返回)
        assert _get_client_ip(req) == "5.6.7.8"

    def test_no_client_returns_unknown(self) -> None:
        """request.client 为 None 时返回 'unknown'."""

        class _NoClientRequest:
            client = None
            headers: ClassVar[dict[str, str]] = {}

        assert _get_client_ip(_NoClientRequest()) == "unknown"  # type: ignore[arg-type]
