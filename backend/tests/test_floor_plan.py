"""``utils.floor_plan`` 单元测试.

验证后端 Python 移植版 ``get_floor_plan`` + ``is_valid_url`` 与前端
``getFloorPlan`` + ``isValidUrl`` 完全等价。

覆盖场景：
- ``is_valid_url``：相对路径 / 合法 http(s) URL / 脏数据（"q_80" / 空 / javascript:）
- ``get_floor_plan``：贝壳 / 我爱我家 / 其他数据源分支
- 空/全非法 links 返回 None
- CDN 参数追加幂等性
"""

from __future__ import annotations

from utils.floor_plan import get_floor_plan, is_valid_url
from utils.image_download import _LJCDN_CDN_PARAMS

# ==================== is_valid_url ====================


class TestIsValidUrl:
    def test_relative_path(self):
        """以 / 开头的相对路径视为有效."""
        assert is_valid_url("/static/uploads/test.jpg") is True

    def test_http_url(self):
        assert is_valid_url("http://example.com/img.jpg") is True

    def test_https_url(self):
        assert is_valid_url("https://example.com/img.jpg") is True

    def test_dirty_data_q_80(self):
        """脏数据 'q_80' 应被过滤."""
        assert is_valid_url("q_80") is False

    def test_empty_string(self):
        assert is_valid_url("") is False

    def test_javascript_protocol(self):
        assert is_valid_url("javascript:alert(1)") is False

    def test_ftp_protocol(self):
        assert is_valid_url("ftp://example.com/file") is False

    def test_non_string(self):
        assert is_valid_url(None) is False  # type: ignore[arg-type]
        assert is_valid_url(123) is False  # type: ignore[arg-type]


# ==================== get_floor_plan ====================


class TestGetFloorPlanEmpty:
    def test_none_links(self):
        assert get_floor_plan("贝壳", None) is None

    def test_empty_links(self):
        assert get_floor_plan("贝壳", []) is None

    def test_all_invalid_links(self):
        """全非法 URL 返回 None."""
        assert get_floor_plan("贝壳", ["q_80", "", "javascript:x"]) is None

    def test_none_data_source_with_links(self):
        """data_source 为空时走默认分支（返回第 1 张）."""
        result = get_floor_plan(None, ["https://example.com/a.jpg"])
        assert result == "https://example.com/a.jpg"


class TestGetFloorPlanBeike:
    def test_hdic_frame_priority(self):
        """贝壳分支：hdic-frame 优先."""
        links = [
            "https://image1.ljcdn.com/interior.jpg",
            "https://image1.ljcdn.com/hdic-frame-123.jpg",
            "https://image1.ljcdn.com/other.jpg",
        ]
        result = get_floor_plan("贝壳", links)
        assert result == "https://image1.ljcdn.com/hdic-frame-123.jpg" + _LJCDN_CDN_PARAMS

    def test_fallback_to_third(self):
        """贝壳分支无 hdic-frame：取第 3 张."""
        links = [
            "https://image1.ljcdn.com/a.jpg",
            "https://image1.ljcdn.com/b.jpg",
            "https://image1.ljcdn.com/c.jpg",
        ]
        result = get_floor_plan("贝壳", links)
        assert result == "https://image1.ljcdn.com/c.jpg" + _LJCDN_CDN_PARAMS

    def test_fallback_to_first_when_less_than_three(self):
        """贝壳分支无 hdic-frame 且不足 3 张：取第 1 张."""
        links = ["https://image1.ljcdn.com/a.jpg", "https://image1.ljcdn.com/b.jpg"]
        result = get_floor_plan("贝壳", links)
        assert result == "https://image1.ljcdn.com/a.jpg" + _LJCDN_CDN_PARAMS

    def test_cdn_params_idempotent(self):
        """URL 已含 !m_fill 时不再追加."""
        url_with_cdn = "https://image1.ljcdn.com/hdic-frame-123.jpg" + _LJCDN_CDN_PARAMS
        result = get_floor_plan("贝壳", [url_with_cdn])
        assert result == url_with_cdn  # 不重复追加


class TestGetFloorPlan5i5j:
    def test_floorplan_keyword(self):
        """我爱我家分支：floorplan 关键词优先."""
        links = [
            "https://5i5j.com/img/interior.jpg",
            "https://5i5j.com/img/floorplan-001.jpg",
            "https://5i5j.com/img/other.jpg",
        ]
        result = get_floor_plan("我爱我家", links)
        assert result == "https://5i5j.com/img/floorplan-001.jpg"

    def test_layout_keyword(self):
        """我爱我家分支：layout 关键词."""
        links = [
            "https://5i5j.com/img/layout-001.jpg",
            "https://5i5j.com/img/interior.jpg",
        ]
        result = get_floor_plan("我爱我家", links)
        assert result == "https://5i5j.com/img/layout-001.jpg"

    def test_fallback_to_last(self):
        """我爱我家分支无关键词：取最后一张."""
        links = [
            "https://5i5j.com/img/a.jpg",
            "https://5i5j.com/img/b.jpg",
            "https://5i5j.com/img/c.jpg",
        ]
        result = get_floor_plan("我爱我家", links)
        assert result == "https://5i5j.com/img/c.jpg"


class TestGetFloorPlanOtherSource:
    def test_default_first(self):
        """其他/空数据源：取第 1 张."""
        links = [
            "https://example.com/a.jpg",
            "https://example.com/b.jpg",
        ]
        assert get_floor_plan("链家", links) == "https://example.com/a.jpg"

    def test_empty_data_source(self):
        links = ["https://example.com/only.jpg"]
        assert get_floor_plan("", links) == "https://example.com/only.jpg"


class TestGetFloorPlanDirtyData:
    def test_filter_dirty_then_select(self):
        """脏数据过滤后再选择."""
        links = ["q_80", "https://image1.ljcdn.com/hdic-frame-123.jpg", ""]
        result = get_floor_plan("贝壳", links)
        assert result == "https://image1.ljcdn.com/hdic-frame-123.jpg" + _LJCDN_CDN_PARAMS

    def test_mixed_valid_and_invalid_5i5j(self):
        """我爱我家分支混合脏数据."""
        links = ["q_80", "https://5i5j.com/img/a.jpg", "https://5i5j.com/img/b.jpg"]
        result = get_floor_plan("我爱我家", links)
        # 有效 URL 为 a, b，无关键词，取最后一张
        assert result == "https://5i5j.com/img/b.jpg"
