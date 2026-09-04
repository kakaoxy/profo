"""``utils.image_download`` 单元测试.

测试 SSRF 防护、图片校验、大小限制、超时、存储后端调用等场景。
所有外部依赖（httpx、storage backend）均通过 monkeypatch mock，
不依赖网络与数据库。
"""

import io
from unittest.mock import MagicMock

import httpx
import pytest
from PIL import Image

from utils.image_download import (
    _apply_cdn_params,
    _is_private_ip,
    _is_url_safe,
    download_external_image,
)

# --- 辅助 ---


def _make_jpeg_bytes() -> bytes:
    """用 Pillow 生成最小 JPEG 字节（filetype 可识别为 image/jpeg）."""
    buf = io.BytesIO()
    Image.new("RGB", (2, 2), "red").save(buf, "JPEG")
    return buf.getvalue()


def _make_png_bytes() -> bytes:
    """用 Pillow 生成最小 PNG 字节."""
    buf = io.BytesIO()
    Image.new("RGB", (2, 2), "blue").save(buf, "PNG")
    return buf.getvalue()


class _FakeResponse:
    """模拟 httpx.Response 的最小实现."""

    def __init__(
        self,
        content: bytes,
        content_type: str = "image/jpeg",
        *,
        is_redirect: bool = False,
        is_permanent_redirect: bool = False,
        location: str | None = None,
    ):
        self.content = content
        self.headers = {"content-type": content_type}
        self.is_redirect = is_redirect
        self.is_permanent_redirect = is_permanent_redirect
        if location is not None:
            self.headers["location"] = location

    def raise_for_status(self) -> None:
        pass


class _FakeClient:
    """模拟 httpx.Client 的最小实现."""

    def __init__(self, response: _FakeResponse | Exception, **kwargs):
        self._response = response

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def get(self, url: str, **kwargs):
        if isinstance(self._response, Exception):
            raise self._response
        return self._response


class _UrlMappedClient:
    """模拟 httpx.Client，按 URL 返回不同响应（用于重定向跟随测试）."""

    def __init__(self, url_map: dict[str, _FakeResponse], **kwargs):
        self._url_map = url_map

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return None

    def get(self, url: str, **kwargs):
        # 精确匹配优先；回退到去掉 CDN 参数后的原始 URL
        if url in self._url_map:
            return self._url_map[url]
        # 尝试匹配不含 query/CDN 参数的路径
        base = url.split("?", 1)[0].split("!m_", 1)[0]
        for key, resp in self._url_map.items():
            if key.split("?", 1)[0].split("!m_", 1)[0] == base:
                return resp
        msg = f"unexpected URL in mock: {url}"
        raise AssertionError(msg)


# --- _is_private_ip ---


class TestIsPrivateIp:
    def test_loopback(self):
        assert _is_private_ip("127.0.0.1")
        assert _is_private_ip("127.255.255.255")

    def test_class_a_private(self):
        assert _is_private_ip("10.0.0.1")
        assert _is_private_ip("10.255.255.255")

    def test_class_c_private(self):
        assert _is_private_ip("192.168.1.1")

    def test_class_b_private_range(self):
        assert _is_private_ip("172.16.0.1")
        assert _is_private_ip("172.31.255.255")

    def test_class_b_public_outside_range(self):
        assert not _is_private_ip("172.32.0.1")
        assert not _is_private_ip("172.15.0.1")
        assert not _is_private_ip("172.1.0.1")

    def test_link_local(self):
        assert _is_private_ip("169.254.1.1")

    def test_public_addresses(self):
        assert not _is_private_ip("8.8.8.8")
        assert not _is_private_ip("1.1.1.1")
        assert not _is_private_ip("114.114.114.114")


# --- _is_url_safe ---


class TestIsUrlSafe:
    def test_http(self):
        assert _is_url_safe("http://img.ljcdn.com/test.jpg")

    def test_https(self):
        assert _is_url_safe("https://img.ljcdn.com/test.jpg")

    def test_localhost(self):
        assert not _is_url_safe("http://localhost:8000/img.jpg")

    def test_loopback_ip(self):
        assert not _is_url_safe("http://127.0.0.1:8000/img.jpg")

    def test_private_10(self):
        assert not _is_url_safe("http://10.0.0.1/img.jpg")

    def test_private_192_168(self):
        assert not _is_url_safe("http://192.168.1.1/img.jpg")

    def test_private_172_16(self):
        assert not _is_url_safe("http://172.16.0.1/img.jpg")

    def test_ftp_rejected(self):
        assert not _is_url_safe("ftp://example.com/img.jpg")

    def test_invalid_string(self):
        assert not _is_url_safe("not a url")

    def test_empty(self):
        assert not _is_url_safe("")


# --- _apply_cdn_params ---


class TestApplyCdnParams:
    def test_ljcdn_appends_params(self):
        url = "https://image1.ljcdn.com/110000-inspection/test.jpg"
        result = _apply_cdn_params(url)
        assert result == url + "!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50"

    def test_ljcdn_idempotent(self):
        url = "https://image1.ljcdn.com/hdic-frame/test.png!m_fill,w_1000,h_750,l_bk,f_jpg,ls_50"
        assert _apply_cdn_params(url) == url

    def test_non_ljcdn_unchanged(self):
        url = "https://img.5i5j.com/test.jpg"
        assert _apply_cdn_params(url) == url

    def test_relative_path_unchanged(self):
        url = "/static/uploads/properties/test.jpg"
        assert _apply_cdn_params(url) == url


# --- download_external_image ---


class TestDownloadExternalImage:
    def test_download_jpeg_success(self, tmp_path, monkeypatch):
        jpeg = _make_jpeg_bytes()
        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        mock_storage.upload_file.return_value = "/static/uploads/properties/stored.jpg"
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(_FakeResponse(jpeg, "image/jpeg")),
        )

        result = download_external_image("https://img.ljcdn.com/test.jpg")

        assert result == "/static/uploads/properties/stored.jpg"
        mock_storage.upload_file.assert_called_once()
        # 本地临时文件应已写入
        args, _ = mock_storage.upload_file.call_args
        local_path = args[0]
        assert local_path.read_bytes() == jpeg

    def test_download_png_success(self, tmp_path, monkeypatch):
        png = _make_png_bytes()
        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        mock_storage.upload_file.return_value = "/static/uploads/properties/stored.png"
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(_FakeResponse(png, "image/png")),
        )

        result = download_external_image("https://img.5i5j.com/test.png")

        assert result == "/static/uploads/properties/stored.png"

    def test_download_ssrf_localhost_rejected(self, monkeypatch):
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        client_created = MagicMock(side_effect=AssertionError("不应创建 httpx.Client"))
        monkeypatch.setattr("utils.image_download.httpx.Client", client_created)

        result = download_external_image("http://localhost:8000/img.jpg")

        assert result is None
        mock_storage.upload_file.assert_not_called()

    def test_download_ssrf_private_ip_rejected(self, monkeypatch):
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: pytest.fail("不应创建 httpx.Client"),
        )

        result = download_external_image("http://10.0.0.1/img.jpg")

        assert result is None

    def test_download_non_image_content(self, tmp_path, monkeypatch):
        html_bytes = b"<html><body>not an image</body></html>"
        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(_FakeResponse(html_bytes, "text/html")),
        )

        result = download_external_image("https://example.com/not-image.jpg")

        assert result is None
        mock_storage.upload_file.assert_not_called()

    def test_download_oversize_rejected(self, tmp_path, monkeypatch):
        # 构造超过 10MB 的内容
        big_bytes = b"\x00" * (10 * 1024 * 1024 + 1)
        # 在前面加上 JPEG magic bytes 让 filetype 能识别，但内容过大
        big_bytes = _make_jpeg_bytes() + big_bytes
        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(_FakeResponse(big_bytes, "image/jpeg")),
        )

        result = download_external_image("https://img.ljcdn.com/huge.jpg")

        assert result is None
        mock_storage.upload_file.assert_not_called()

    def test_download_http_error_returns_none(self, monkeypatch):
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(httpx.ConnectError("connection refused")),
        )

        result = download_external_image("https://img.ljcdn.com/fail.jpg")

        assert result is None
        mock_storage.upload_file.assert_not_called()

    def test_download_redirect_to_private_rejected(self, tmp_path, monkeypatch):
        # 首跳返回 302 指向内网元数据地址，应被逐跳 SSRF 校验拦截
        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(
                _FakeResponse(
                    b"",
                    "text/html",
                    is_redirect=True,
                    is_permanent_redirect=False,
                    location="http://169.254.169.254/latest/meta-data/",
                ),
            ),
        )

        result = download_external_image("https://img.ljcdn.com/redirect.jpg")

        assert result is None
        mock_storage.upload_file.assert_not_called()

    def test_download_follows_safe_redirect(self, tmp_path, monkeypatch):
        # 首跳返回 302 指向安全的绝对 URL，应跟随重定向并下载最终图片
        jpeg = _make_jpeg_bytes()
        redirect_resp = _FakeResponse(
            b"",
            "text/html",
            is_redirect=True,
            is_permanent_redirect=False,
            location="https://cdn.5i5j.com/final.jpg",
        )
        image_resp = _FakeResponse(jpeg, "image/jpeg")
        url_map = {
            "https://img.5i5j.com/redirect.jpg": redirect_resp,
            "https://cdn.5i5j.com/final.jpg": image_resp,
        }

        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        mock_storage.upload_file.return_value = "/static/uploads/properties/stored.jpg"
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _UrlMappedClient(url_map),
        )

        result = download_external_image("https://img.5i5j.com/redirect.jpg")

        assert result == "/static/uploads/properties/stored.jpg"
        mock_storage.upload_file.assert_called_once()

    def test_download_follows_relative_redirect(self, tmp_path, monkeypatch):
        # 首跳返回 302 指向相对路径，应基于原始 URL 解析为绝对 URL 后跟随
        jpeg = _make_jpeg_bytes()
        redirect_resp = _FakeResponse(
            b"",
            "text/html",
            is_redirect=True,
            is_permanent_redirect=False,
            location="/cdn/final.jpg",
        )
        image_resp = _FakeResponse(jpeg, "image/jpeg")
        url_map = {
            "https://img.5i5j.com/redirect.jpg": redirect_resp,
            "https://img.5i5j.com/cdn/final.jpg": image_resp,
        }

        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        mock_storage = MagicMock()
        mock_storage.upload_file.return_value = "/static/uploads/properties/stored.jpg"
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _UrlMappedClient(url_map),
        )

        result = download_external_image("https://img.5i5j.com/redirect.jpg")

        assert result == "/static/uploads/properties/stored.jpg"
        mock_storage.upload_file.assert_called_once()

    def test_download_timeout_returns_none(self, monkeypatch):
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(httpx.ReadTimeout("timeout")),
        )

        result = download_external_image("https://img.ljcdn.com/slow.jpg")

        assert result is None

    def test_download_relative_path_not_processed(self, monkeypatch):
        # 相对路径不应触发下载（调用方不应传入，但防御性处理）
        mock_storage = MagicMock()
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        client_created = MagicMock(side_effect=AssertionError("不应创建 httpx.Client"))
        monkeypatch.setattr("utils.image_download.httpx.Client", client_created)

        result = download_external_image("/static/uploads/properties/existing.jpg")

        assert result is None

    def test_download_oss_mode_cleans_temp_file(self, tmp_path, monkeypatch):
        jpeg = _make_jpeg_bytes()
        monkeypatch.setattr("utils.image_download.settings.upload_dir", str(tmp_path))
        monkeypatch.setattr("utils.image_download.settings.storage_backend", "oss")
        mock_storage = MagicMock()
        mock_storage.upload_file.return_value = "https://cdn.example.com/properties/stored.jpg"
        monkeypatch.setattr("utils.image_download.get_storage_backend", lambda: mock_storage)
        monkeypatch.setattr(
            "utils.image_download.httpx.Client",
            lambda **kwargs: _FakeClient(_FakeResponse(jpeg, "image/jpeg")),
        )

        result = download_external_image("https://img.ljcdn.com/test.jpg")

        assert result == "https://cdn.example.com/properties/stored.jpg"
        # OSS 模式应清理本地临时文件
        args, _ = mock_storage.upload_file.call_args
        local_path = args[0]
        assert not local_path.exists(), "OSS 模式应删除本地临时文件"
