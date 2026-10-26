"""小区画像并集纯函数单测（SPEC `community-merge-union` §8.1 的 11 条用例）.

纯函数无 DB 依赖，故为单测（非 DB 集成测试）——画像并集的全部风险都在
「逐字段取值规则」上，用参数化用例把每条裁决口径（D1/D3/D4/Q1/Q2）钉死。
"""

import pytest

from services.market.community_profile_merge import (
    ADDRESS_MAX_LENGTH,
    PROFILE_FIELDS,
    SOURCE_KEPT,
    SOURCE_UNION,
    is_blank,
    merge_community_profile,
)

FULL_CHILD = {
    "id": "child-b",
    "district": "浦东新区",
    "business_circle": "金杨",
    "ring": "内环至中环",
    "property_types": ["住宅-公寓", "住宅-新里"],
    "era_from": 1993,
    "era_to": 1998,
    "developer": "上海锦和投资集团有限公司",
    "property_mgmt": "上海陆家嘴物业管理有限公司",
    "address": "金杨路660弄,金台路161弄",
    "lng": 121.591596,
    "lat": 31.25587,
    "city_id": 310115,
}


def test_case1_primary_empty_child_full() -> None:
    """用例 1：主档全空 / 子档全有 → 全部补入."""
    result = merge_community_profile({}, [FULL_CHILD])
    assert result.filled == list(PROFILE_FIELDS)
    for name in PROFILE_FIELDS:
        assert result.values[name] == FULL_CHILD[name], name
    assert result.warnings == []
    assert result.sources["ring"] == "child:child-b"
    assert result.sources["property_types"] == SOURCE_UNION


def test_case2_primary_full_child_different() -> None:
    """用例 2：主档全有 / 子档不同 → 一个字段都不变."""
    primary = {
        "district": "静安区",
        "business_circle": "南京西路",
        "ring": "内环内",
        "property_types": ["住宅-别墅"],
        "era_from": 2001,
        "era_to": 2005,
        "developer": "主档开发商",
        "property_mgmt": "主档物业",
        "address": "主档路1弄",
        "lng": 121.45,
        "lat": 31.22,
        "city_id": 310106,
    }
    result = merge_community_profile(primary, [FULL_CHILD])
    # 两处例外（均为已裁决口径，不是覆盖）：
    #   property_types = 并集（D4）；address = 去重合并（Q1）
    assert result.filled == ["property_types", "address"]
    assert result.values["property_types"] == ["住宅-别墅", "住宅-公寓", "住宅-新里"]
    assert result.values["address"] == "主档路1弄,金杨路660弄,金台路161弄"
    assert result.sources["address"] == SOURCE_UNION
    # 其余字段全部保留主档（D1 主档优先）
    for name in PROFILE_FIELDS:
        if name in ("property_types", "address"):
            continue
        assert result.values[name] == primary[name], name
        assert result.sources[name] == SOURCE_KEPT, name


def test_case3_property_types_union_dedupe() -> None:
    """用例 3：物业类型并集去重保序（主档在前）."""
    result = merge_community_profile(
        {"property_types": ["住宅-公寓"]},
        [{"id": "c1", "property_types": ["住宅-新里", "住宅-公寓"]}],
    )
    assert result.values["property_types"] == ["住宅-公寓", "住宅-新里"]
    assert result.sources["property_types"] == SOURCE_UNION


def test_case4_era_single_side_filled() -> None:
    """用例 4：主档只有 era_from，子档成对 → 补 era_to."""
    result = merge_community_profile({"era_from": 1990}, [{"id": "c", "era_from": 1993, "era_to": 1998}])
    assert (result.values["era_from"], result.values["era_to"]) == (1990, 1998)
    assert result.warnings == []


def test_case5_era_crossing_keeps_primary_with_warning() -> None:
    """用例 5：补入后 from > to → 整对保留主档 + warning."""
    result = merge_community_profile({"era_from": 2000}, [{"id": "c", "era_to": 1998}])
    assert (result.values["era_from"], result.values["era_to"]) == (2000, None)
    assert any("交叉" in w for w in result.warnings)


def test_case6_coords_are_paired() -> None:
    """用例 6：主档只有 lng → 整对取子档（不混搭）."""
    result = merge_community_profile({"lng": 121.0}, [{"id": "c", "lng": 121.59, "lat": 31.25}])
    assert (result.values["lng"], result.values["lat"]) == (121.59, 31.25)
    assert result.sources["lat"] == "child:c"


def test_case7_coords_out_of_range_dropped() -> None:
    """用例 7：子档坐标越界 → 丢弃 + warning（主档仍为空）."""
    result = merge_community_profile({}, [{"id": "c", "lng": 999.0, "lat": 31.25}])
    assert (result.values["lng"], result.values["lat"]) == (None, None)
    assert any("越界" in w for w in result.warnings)


def test_case8_empty_string_is_blank() -> None:
    """用例 8：空串（现网 business_circle='' 121 行）视为空 → 取子档."""
    result = merge_community_profile({"business_circle": "   "}, [{"id": "c", "business_circle": "金杨"}])
    assert result.values["business_circle"] == "金杨"
    assert "business_circle" in result.filled


def test_case9_multiple_children_first_wins() -> None:
    """用例 9：多个子档依次叠加，先到先得（结果确定）."""
    result = merge_community_profile(
        {},
        [
            {"id": "c1", "ring": "内环内", "developer": "开发商1"},
            {"id": "c2", "ring": "外环外", "property_mgmt": "物业2"},
        ],
    )
    assert result.values["ring"] == "内环内"
    assert result.values["developer"] == "开发商1"
    assert result.values["property_mgmt"] == "物业2"
    assert result.sources["ring"] == "child:c1"


def test_case10_address_union() -> None:
    """用例 10：地址两边非空不同 → 按逗号去重合并（Q1）."""
    result = merge_community_profile(
        {"address": "金杨路660弄,金台路161弄"},
        [{"id": "c", "address": "金台路161弄, 金台路115弄"}],
    )
    assert result.values["address"] == "金杨路660弄,金台路161弄,金台路115弄"
    assert result.sources["address"] == SOURCE_UNION


def test_case10b_address_overflow_keeps_primary() -> None:
    """用例 10b：合并后超列宽 → 保留主档 + warning（绝不截断）."""
    # 用唯一段构造，避免去重把重复段折叠掉（那样永远测不到超宽分支）
    primary_address = ",".join(f"A{i}弄" for i in range(50))
    child_address = ",".join(f"B{i}弄" for i in range(120))
    result = merge_community_profile({"address": primary_address}, [{"id": "c", "address": child_address}])
    assert result.values["address"] == primary_address
    assert any(str(ADDRESS_MAX_LENGTH) in w for w in result.warnings)


def test_case11_source_never_taken_from_child() -> None:
    """用例 11：子档 source='review' → 主档 source 不受影响（且不参与并集）."""
    result = merge_community_profile({"source": "admin"}, [{"id": "c", "source": "review"}])
    assert "source" not in result.values
    assert "source" not in result.filled


def test_district_normalized_on_write() -> None:
    """District 取子档时按写入侧口径归一（「浦东」→「浦东新区」）."""
    result = merge_community_profile({}, [{"id": "c", "district": "浦东"}])
    assert result.values["district"] == "浦东新区"


def test_avg_price_and_total_not_merged() -> None:
    """avg_price_wan / total_properties 不参与（SPEC §2.2 非目标）."""
    result = merge_community_profile({}, [{"id": "c", "avg_price_wan": 5.0, "total_properties": 99}])
    assert "avg_price_wan" not in result.values
    assert "total_properties" not in result.values


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        (None, True),
        ("", True),
        ("   ", True),
        ([], True),
        ([""], True),
        ("x", False),
        (["住宅-公寓"], False),
        (0, False),
    ],
)
def test_is_blank(value: object, expected: bool) -> None:
    """is_blank 口径（D3）."""
    assert is_blank(value) is expected
