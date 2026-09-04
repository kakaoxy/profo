"""PublicLeadCreate.images 字段校验测试.

回归缺陷：上传接口返回相对路径 /static/uploads/xxx.jpg，
而 images 字段曾要求 HttpUrl 导致 lead 创建失败。
验证 images 接受相对路径与 http(s) URL，拒绝脏数据。
"""

import pytest
from pydantic import ValidationError

from schemas.public import PublicLeadCreate


class TestPublicLeadCreateImages:
    """images 字段校验测试."""

    def _make(self, images: list[str]) -> PublicLeadCreate:
        return PublicLeadCreate(
            community_name="测试小区",
            floor_info="1/6层",
            expected_price=100.0,
            images=images,
        )

    def test_accepts_relative_path(self) -> None:
        """上传接口返回的相对路径应被接受（核心回归点）."""
        lead = self._make(["/static/uploads/20260702_abc12345.jpg"])
        assert lead.images == ["/static/uploads/20260702_abc12345.jpg"]

    def test_accepts_https_url(self) -> None:
        """合法 https URL 应被接受."""
        lead = self._make(["https://example.com/img.png"])
        assert lead.images == ["https://example.com/img.png"]

    def test_accepts_http_url(self) -> None:
        """合法 http URL 应被接受."""
        lead = self._make(["http://127.0.0.1:8000/static/uploads/x.png"])
        assert len(lead.images) == 1

    def test_accepts_mixed_relative_and_absolute(self) -> None:
        """混合相对路径与绝对 URL 应被接受."""
        lead = self._make(["/static/uploads/a.jpg", "https://cdn.com/b.png"])
        assert len(lead.images) == 2

    def test_rejects_dirty_string(self) -> None:
        """非 URL 脏数据（如 q_80）应被拒绝."""
        with pytest.raises(ValidationError, match="无效的图片 URL"):
            self._make(["q_80"])

    def test_rejects_empty_string(self) -> None:
        """空字符串应被拒绝."""
        with pytest.raises(ValidationError, match="不能为空"):
            self._make([""])

    def test_rejects_javascript_scheme(self) -> None:
        """javascript: 伪协议应被拒绝."""
        with pytest.raises(ValidationError, match="无效的图片 URL"):
            self._make(["javascript:alert(1)"])

    def test_rejects_more_than_six(self) -> None:
        """超过 6 张应被拒绝."""
        with pytest.raises(ValidationError):
            self._make([f"/static/uploads/{i}.jpg" for i in range(7)])

    def test_accepts_empty_list(self) -> None:
        """空列表应被接受（默认值）."""
        lead = self._make([])
        assert lead.images == []
