"""小区画像并集纯函数（合并「取最大合集」的唯一口径实现）.

**为什么独立成模块**：合并预览端点（``POST /admin/communities/merge/preview``）与
真正的合并写路径必须共用同一套判定，否则「预览说会补 3 项、实际补了 5 项」这类
漂移无法自证。纯函数（无 Session/无 IO）让两侧复用与单测覆盖都成立。

**口径**（SPEC `2026-10-26-楼盘字典-小区合并信息合集` §3 已裁决）：
- D1 主档非空值**永不覆盖**，只填空；逐字段判定；
- D3「空」= ``None`` / ``strip()`` 后空串 / 空数组（现网存在 ``business_circle=''``）；
- D4 ``property_types`` 取**并集**（主档在前，子档按序追加，去重保序）；
- Q1 地址两边非空且不同 → 按逗号切分去重合并；超列宽则保留主档并告警；
- Q2 年代「成对优先」：主档整对为空 → 整对取子档；主档只有一侧 → 补另一侧，
  补完若 ``from > to`` 则整对保留主档并告警；
- 坐标成对：任一侧缺失 → 整对取子档；取值需在 BD-09 中国境内值域内；
- ``source`` / ``avg_price_wan`` / ``total_properties`` **不参与**（见 SPEC §2.2）。

**未参与字段**：``name``（保留主档，SPEC D2）、``source``（保留主档录入端语义）、
``avg_price_wan``（现网全 NULL，无数据源，不凭空造）。
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from services.property.dict_parser import normalize_district_value

# 参与合并判定的画像字段（顺序即回执/审计的展示顺序）
PROFILE_FIELDS: tuple[str, ...] = (
    "district",
    "business_circle",
    "ring",
    "property_types",
    "era_from",
    "era_to",
    "developer",
    "property_mgmt",
    "address",
    "lng",
    "lat",
    "city_id",
)

# ``communities.address`` 列宽（String(500)）。合并结果超宽时保留主档，绝不截断
ADDRESS_MAX_LENGTH = 500

# 地址切分符：现网地址为多弄拼接（实测 1,845 行含半角逗号、45 行含全角逗号）
_ADDRESS_SEPARATORS = (",", "，")

# BD-09 中国境内值域（与 BdCommunityPatchRequest / dict_parser 同口径）
_LNG_RANGE = (73.0, 136.0)
_LAT_RANGE = (3.0, 54.0)

# source 枚举（预览端点与审计共用）
SOURCE_KEPT = "kept"
SOURCE_UNION = "union"


@dataclass(frozen=True)
class ProfileUnion:
    """画像并集结果.

    Attributes:
        values: 合并后的字段值（仅含 ``PROFILE_FIELDS`` 中的键）
        filled: 本次实际发生变化的字段名（回执/审计用）
        sources: 每字段取值来源（``kept`` / ``union`` / ``child:<id>``）
        warnings: 需运营知晓的降级说明（超长地址、年代交叉、坐标越界等）

    """

    values: dict[str, Any] = field(default_factory=dict)
    filled: list[str] = field(default_factory=list)
    sources: dict[str, str] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    # 审计快照（仅 ``filled`` 字段）。由写侧 ``_merge_community_profile`` 在**改写主档之前**
    # 填充：主档是就地修改的，调用方事后再读只会读到新值，before 就失真了。
    before: dict[str, Any] = field(default_factory=dict)
    after: dict[str, Any] = field(default_factory=dict)


def is_blank(value: Any) -> bool:
    """判定画像字段是否为空（D3 统一口径）.

    Args:
        value: 字段原值

    Returns:
        ``None`` / 空串（含纯空白）/ 空数组 → True

    """
    if value is None:
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, list | tuple | set):
        return all(is_blank(v) for v in value)
    return False


def _clean_text(value: Any) -> str | None:
    """把文本值归一为「去空白串或 None」."""
    if value is None:
        return None
    if not isinstance(value, str):
        value = str(value)
    stripped = value.strip()
    return stripped or None


def _clean_types(value: Any) -> list[str]:
    """把物业类型归一为非空去空白列表（保持原顺序）."""
    if value is None:
        return []
    items = value if isinstance(value, list | tuple | set) else [value]
    result: list[str] = []
    for item in items:
        text = _clean_text(item)
        if text:
            result.append(text)
    return result


def _dedupe(seq: Sequence[str]) -> list[str]:
    """去重保序."""
    seen: set[str] = set()
    out: list[str] = []
    for item in seq:
        if item not in seen:
            seen.add(item)
            out.append(item)
    return out


def _split_address(value: str) -> list[str]:
    """按逗号切分地址为去空白的段列表（保序、段内保留原文）."""
    segments = [value]
    for sep in _ADDRESS_SEPARATORS:
        expanded: list[str] = []
        for segment in segments:
            expanded.extend(segment.split(sep))
        segments = expanded
    return [s.strip() for s in segments if s.strip()]


def _in_range(value: float | None, bounds: tuple[float, float]) -> bool:
    """坐标是否落在合法值域内."""
    return value is not None and bounds[0] <= value <= bounds[1]


def _as_float(value: Any) -> float | None:
    """转 float（非法值 → None）."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _as_int(value: Any) -> int | None:
    """转 int（非法值 → None）."""
    if value is None or isinstance(value, bool):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def merge_community_profile(
    primary: Mapping[str, Any],
    children: Sequence[Mapping[str, Any]],
) -> ProfileUnion:
    """计算「主档 + 若干子档」的画像并集（主档优先，D1）.

    Args:
        primary: 主档现有画像（``PROFILE_FIELDS`` 的子集即可）
        children: 子档画像，按合并请求的 ``merge_ids`` 顺序；
            可选带 ``"id"`` 键，用于把 ``sources`` 标注为 ``child:<id>``

    Returns:
        ``ProfileUnion``（``values`` 含全部 ``PROFILE_FIELDS`` 键）

    """
    values: dict[str, Any] = {name: primary.get(name) for name in PROFILE_FIELDS}
    sources: dict[str, str] = dict.fromkeys(PROFILE_FIELDS, SOURCE_KEPT)
    warnings: list[str] = []

    # ---- 标量文本字段：空则取子档（D1）----
    for name in ("business_circle", "ring", "developer", "property_mgmt"):
        if not is_blank(values[name]):
            continue
        for child in children:
            candidate = _clean_text(child.get(name))
            if candidate:
                values[name] = candidate
                sources[name] = f"child:{child.get('id', '')}"
                break

    # ---- district：取子档后按写入侧口径归一（M3 同一函数）----
    if is_blank(values["district"]):
        for child in children:
            candidate = normalize_district_value(_clean_text(child.get("district")))
            if candidate:
                values["district"] = candidate
                sources["district"] = f"child:{child.get('id', '')}"
                break
    else:
        values["district"] = _clean_text(values["district"])

    # ---- city_id ----
    if values["city_id"] is None:
        for child in children:
            candidate = _as_int(child.get("city_id"))
            if candidate is not None:
                values["city_id"] = candidate
                sources["city_id"] = f"child:{child.get('id', '')}"
                break

    # ---- property_types：并集（D4）----
    merged_types = _clean_types(values["property_types"])
    for child in children:
        merged_types = _dedupe([*merged_types, *_clean_types(child.get("property_types"))])
    if merged_types != _clean_types(primary.get("property_types")):
        sources["property_types"] = SOURCE_UNION
    values["property_types"] = merged_types

    # ---- 建成年代：成对优先（Q2）----
    era = _merge_era(primary, children, warnings)
    values["era_from"], values["era_to"] = era
    if (era[0], era[1]) != (_as_int(primary.get("era_from")), _as_int(primary.get("era_to"))):
        for child in children:
            if _as_int(child.get("era_from")) is not None or _as_int(child.get("era_to")) is not None:
                sources["era_from"] = sources["era_to"] = f"child:{child.get('id', '')}"
                break

    # ---- 地址：去重合并（Q1）----
    address, address_source, address_warning = _merge_address(primary, children)
    values["address"] = address
    sources["address"] = address_source
    if address_warning:
        warnings.append(address_warning)

    # ---- 坐标：成对（任一侧缺失则整对取子档）----
    lng, lat, coord_source, coord_warning = _merge_coords(primary, children)
    values["lng"], values["lat"] = lng, lat
    sources["lng"] = sources["lat"] = coord_source
    if coord_warning:
        warnings.append(coord_warning)

    filled = [name for name in PROFILE_FIELDS if values[name] != primary.get(name)]
    return ProfileUnion(values=values, filled=filled, sources=sources, warnings=warnings)


def _merge_era(
    primary: Mapping[str, Any],
    children: Sequence[Mapping[str, Any]],
    warnings: list[str],
) -> tuple[int | None, int | None]:
    """建成年代并集（Q2 成对优先）.

    1. 主档整对为空 → 整对取第一个有值的子档；
    2. 主档只有一侧 → 用子档补另一侧；
    3. 补完 ``from > to`` → 整对保留主档并告警（不产生跨小区矛盾区间）。
    """
    p_from, p_to = _as_int(primary.get("era_from")), _as_int(primary.get("era_to"))
    if p_from is not None and p_to is not None:
        return p_from, p_to

    c_from: int | None = None
    c_to: int | None = None
    for child in children:
        candidate_from, candidate_to = _as_int(child.get("era_from")), _as_int(child.get("era_to"))
        if candidate_from is None and candidate_to is None:
            continue
        c_from, c_to = candidate_from, candidate_to
        break

    new_from = p_from if p_from is not None else c_from
    new_to = p_to if p_to is not None else c_to
    if new_from is not None and new_to is not None and new_from > new_to:
        warnings.append(f"建成年代补入后交叉（{new_from} > {new_to}），已保留主档年代")
        return p_from, p_to
    return new_from, new_to


def _merge_address(
    primary: Mapping[str, Any],
    children: Sequence[Mapping[str, Any]],
) -> tuple[str | None, str, str | None]:
    """地址并集（Q1：按逗号切分去重合并，超列宽保留主档）.

    Returns:
        (合并后地址, source, warning)

    """
    primary_address = _clean_text(primary.get("address"))
    segments = _split_address(primary_address) if primary_address else []
    taken_from: str | None = None
    for child in children:
        child_address = _clean_text(child.get("address"))
        if not child_address:
            continue
        before = len(segments)
        segments = _dedupe([*segments, *_split_address(child_address)])
        if len(segments) > before and taken_from is None:
            taken_from = f"child:{child.get('id', '')}"

    if not segments:
        return None, SOURCE_KEPT, None
    merged = ",".join(segments)
    if len(merged) > ADDRESS_MAX_LENGTH:
        return (
            primary_address,
            SOURCE_KEPT,
            f"地址合并后 {len(merged)} 字符超过列宽 {ADDRESS_MAX_LENGTH}，已保留主档地址（子档地址未并入）",
        )
    if taken_from is None:
        return primary_address, SOURCE_KEPT, None
    if primary_address is None:
        return merged, taken_from, None
    return merged, SOURCE_UNION, None


def _merge_coords(
    primary: Mapping[str, Any],
    children: Sequence[Mapping[str, Any]],
) -> tuple[float | None, float | None, str, str | None]:
    """坐标并集（成对，任一缺失则整对取子档，含值域过滤）.

    Returns:
        (lng, lat, source, warning)

    """
    p_lng, p_lat = _as_float(primary.get("lng")), _as_float(primary.get("lat"))
    if p_lng is not None and p_lat is not None:
        return p_lng, p_lat, SOURCE_KEPT, None

    warning: str | None = None
    for child in children:
        c_lng, c_lat = _as_float(child.get("lng")), _as_float(child.get("lat"))
        if c_lng is None and c_lat is None:
            continue
        if not (_in_range(c_lng, _LNG_RANGE) and _in_range(c_lat, _LAT_RANGE)):
            warning = f"子档坐标越界（lng={c_lng}, lat={c_lat}），已丢弃"
            continue
        return c_lng, c_lat, f"child:{child.get('id', '')}", None
    return p_lng, p_lat, SOURCE_KEPT, warning


__all__ = [
    "ADDRESS_MAX_LENGTH",
    "PROFILE_FIELDS",
    "SOURCE_KEPT",
    "SOURCE_UNION",
    "ProfileUnion",
    "is_blank",
    "merge_community_profile",
]
