"""楼盘字典原始 txt 解析器（SRS FR-08 / NFR-04）.

上海全域楼盘字典原始数据（37 批次 / 19,657 个 GBK txt）格式：

- 一个 txt = 一个小区；GBK 编码（UTF-8 自动识别回退）；
- **数据行**（户室）：``楼盘名;楼栋;室号;[经度];[纬度];`` —— 楼盘名与文件名一致（近似），
  楼栋/室号非空；经纬度常缺省；行尾可能带多余 ``;``；
- **属性段**（散布在数据行间的非数据行）：物业类型（``住宅-公寓、商业类``）、
  建成年代（``1982年`` / ``2009~2011年``）、物业公司、开发商、区域板块+地址
  （``;青浦盈浦;万寿新村;``）、环线（``内环内``/``外环外``/``内环至中环``）；
  段结构不固定（部分文件纯数据无属性段，如「阳城贵都」），必须按行格式分类解析；
- 容错：空行、单独 ``;`` 行、``errors="replace"`` 乱码替换；
- 「暂无信息」为占位值，一律置空。

异常口径（BR-02/05）：
- 年代超合理区间（如 1800、2301）→ 置空；
- 非标户室号（``0233-1``、``1-2楼``）→ 保留原串，floor=NULL；3 位纯数字（``202``）
  与 4 位标准号（``0401``）可解析楼层（utils.building_dict.parse_room_floor）；
- 地址缺失 → 计入异常清单（警告），仍入库；
- 首行无坐标小区 → 允许（约 536 个）。
"""

import logging
import re

logger = logging.getLogger(__name__)

# 「暂无信息」占位值
_PLACEHOLDER = "暂无信息"

# 建成年代合理区间（BR-05：1800/2301 等脏值置空）
_ERA_MIN = 1900
_ERA_MAX = 2100

# 环线值域（含「内环至中环」等区间表述，原样落库）
_RING_PATTERN = re.compile(r"^(内环内|内环至中环|中环内|中环至外环|外环内|外环外)$")

# 数据行判定：楼盘名;楼栋;室号;... 且楼栋/室号非空（属性行如 ";青浦盈浦;万寿新村;" 首段为空可排除）
_MIN_DATA_FIELDS = 3
# 数据行坐标段下标（楼盘名;楼栋;室号;经度;纬度）
_LNG_INDEX = 3
_LAT_INDEX = 4

# 属性行「;区域板块;地址;」
_AREA_ADDRESS_RE = re.compile(r"^;([^;]+);([^;]*);")


def _clean(value: str | None) -> str | None:
    """清理占位值与空白；空返回 None."""
    if value is None:
        return None
    v = value.strip()
    if not v or v == _PLACEHOLDER:
        return None
    return v


# 上海 16 区标准名（district 归一化基准，带「区」后缀，与存量主流值域一致）
SHANGHAI_DISTRICTS: tuple[str, ...] = (
    "黄浦区",
    "徐汇区",
    "长宁区",
    "静安区",
    "普陀区",
    "虹口区",
    "杨浦区",
    "闵行区",
    "宝山区",
    "嘉定区",
    "浦东新区",
    "金山区",
    "松江区",
    "青浦区",
    "奉贤区",
    "崇明区",
)

# 「浦东」在源数据里与「浦东新区」同义；「浦东区」是另一条导入链路
# （market/importer.py）落库的旧值域（生产库 1421 条），与官方标准名
# 「浦东新区」并存 → 同一行政区被拆成两个筛选值域，一并归到标准名。
# 闸北已于 2015 并入静安，但存量数据仍有该值，保留为独立值域。
_DISTRICT_ALIASES: dict[str, str] = {
    "浦东": "浦东新区",
    "浦东区": "浦东新区",
    "浦东新区": "浦东新区",
    "闸北": "闸北区",
    "闸北区": "闸北区",
}

# 源数据 district_area 形如「青浦盈浦」（区 + 板块直接拼接，无分隔符）。
# 切分候选 = 全称（带「区」）+ 简称（去「区」后）+ 别名（浦东/闸北 等）；
# 必须按长度倒序排列：
# - 「浦东新区张江」需先命中「浦东新区」而非「浦东新」/「浦东」，否则余串会残留「区张江」；
# - 「金山区石化」需先命中「金山区」而非「金山」，否则余串会残留「区石化」。
_DISTRICT_PREFIXES: tuple[str, ...] = tuple(
    sorted(
        set(SHANGHAI_DISTRICTS) | {d.removesuffix("区") for d in SHANGHAI_DISTRICTS} | set(_DISTRICT_ALIASES),
        key=len,
        reverse=True,
    )
)


def _normalize_district(prefix: str) -> str:
    """区名前缀 → 标准区名（统一带「区」后缀，别名优先命中映射表）."""
    if prefix in _DISTRICT_ALIASES:
        return _DISTRICT_ALIASES[prefix]
    if prefix in SHANGHAI_DISTRICTS:
        return prefix
    return f"{prefix}区"


def normalize_district_value(raw: str | None) -> str | None:
    """写入侧区县名归一（M3 写入链路配套）.

    导入链路已由 ``split_district_area`` 归一，但 admin 新增小区 / 审核转正 /
    communities 新建接口直接落 ``district``，导致「浦东」「浦东区」这类值域
    又从 API 写入（实测 ``district`` 下拉里同时出现「浦东新区」与「浦东」）。

    归一规则：别名映射 → 标准区名（带「区」）→ 兜底去/加「区」后匹配 16 区。
    无法匹配的值（外地/脏值）原样返回，不丢数据。

    Args:
        raw: 原值（可空）

    Returns:
        归一后的区名；输入为空时返回 None

    """
    value = _clean(raw)
    if not value:
        return None
    if value in _DISTRICT_ALIASES:
        return _DISTRICT_ALIASES[value]
    if value in SHANGHAI_DISTRICTS:
        return value
    # 「浦东区」→ 浦东新区：「去后缀再加后缀」逆向匹配标准名
    for standard in SHANGHAI_DISTRICTS:
        bare = standard.removesuffix("区")
        if value in (bare, f"{bare}区"):
            return standard
    return value


def split_district_area(raw: str | None) -> tuple[str | None, str | None]:
    """把源数据「区域板块」拆成 (district, business_circle)（M3 修复）。

    源数据属性行 ``;青浦盈浦;万寿新村;`` —— 区域与板块直接拼接，原实现只当展示字段
    丢掉，导致导入的小区 79% 没有 district，总览页区域筛选报不出数据。

    切分规则：在「全称 ∪ 简称 ∪ 别名」候选中取**最长**前缀命中，余串即板块。
    别名必须参与前缀匹配而不是仅参与完整串相等判定，否则「浦东张江」「闸北彭浦」
    这类「不带后缀的别名 + 板块」会整体落入板块字段、district 为 None。

    示例::

        「青浦盈浦」     → ("青浦区", "盈浦")
        「浦东张江」     → ("浦东新区", "张江")
        「浦东新区张江」 → ("浦东新区", "张江")
        「金山区石化」   → ("金山区", "石化")
        「黄浦区」      → ("黄浦区", None)

    Args:
        raw: 源数据「区域板块」原串（如「青浦盈浦」，可空）

    Returns:
        (district, business_circle)；district 统一带「区」后缀，无法识别时为 None
        （此时整串归入 business_circle，保留原文不丢数据）

    """
    value = _clean(raw)
    if not value:
        return (None, None)
    for prefix in _DISTRICT_PREFIXES:
        if value.startswith(prefix):
            district = _normalize_district(prefix)
            # 余串可能以「区」残留开头（如命中简称但原名带「区」），防御性剥离
            circle = value[len(prefix) :].strip(" -—·、,").removeprefix("区").strip(" -—·、,")
            return (district, circle or None)
    return (None, value)


def _split_types(raw: str | None) -> list[str]:
    """物业类型串 → 列表（``住宅-公寓、商业类`` → [住宅-公寓, 商业类]）."""
    v = _clean(raw)
    if not v:
        return []
    return [t.strip() for t in v.replace("、", ";").split(";") if t.strip()]


def parse_era(raw: str | None) -> tuple[int | None, int | None]:
    """建成年代串 → (era_from, era_to)（脏值置空，BR-05）.

    ``1982年`` → (1982, None)；``2009~2011年`` → (2009, 2011)；
    超出 [1900, 2100] 的年份视为脏值置空。
    """
    v = _clean(raw)
    if not v:
        return (None, None)
    years = [int(x) for x in re.findall(r"\d{3,4}", v)]
    valid = [y for y in years if _ERA_MIN <= y <= _ERA_MAX]
    if not valid:
        return (None, None)
    if len(valid) == 1:
        return (valid[0], None)
    return (min(valid), max(valid))


def _is_room_line(line: str) -> bool:
    """判定是否数据行（户室行）.

    规则：以 ``楼盘名`` 开头（首段非空），分号 ≥ 2，且第 2 段（楼栋）与第 3 段（室号）非空。
    属性行 ``;区域;地址;`` 首段为空可排除；``楼盘名;`` 类短行（段数不足）排除。
    """
    parts = line.split(";")
    if len(parts) < _MIN_DATA_FIELDS:
        return False
    return bool(parts[0].strip()) and bool(parts[1].strip()) and bool(parts[2].strip())


class ParsedCommunity:
    """单个 txt（小区）解析结果.

    Attributes:
        name: 小区名（取自文件名，跨批次重名按最新批次 upsert）
        property_types: 物业类型列表
        era_from / era_to: 建成年代区间（脏值置空后）
        property_mgmt: 物业公司
        developer: 开发商
        district_area: 区域板块（如「青浦盈浦」）
        address: 地址（如「万寿新村」；缺失时为 None，计入异常清单）
        ring: 环线（可空）
        rooms: 户室行列表 [(楼栋号, 室号, lng, lat)]（坐标可空）
        warnings: 异常/警告清单（地址缺失、脏年代等，供预扫描异常清单）

    """

    __slots__ = (
        "address",
        "business_circle",
        "developer",
        "district",
        "district_area",
        "era_from",
        "era_to",
        "name",
        "property_mgmt",
        "property_types",
        "ring",
        "rooms",
        "warnings",
    )

    def __init__(self, name: str) -> None:
        """初始化解析结果容器."""
        self.name = name
        self.property_types: list[str] = []
        self.era_from: int | None = None
        self.era_to: int | None = None
        self.property_mgmt: str | None = None
        self.developer: str | None = None
        self.district_area: str | None = None
        self.district: str | None = None
        self.business_circle: str | None = None
        self.address: str | None = None
        self.ring: str | None = None
        self.rooms: list[tuple[str, str, float | None, float | None]] = []
        self.warnings: list[str] = []


def parse_community_txt(text: str, community_name: str) -> ParsedCommunity:
    """解析单个小市 txt 全文（已解码为 str）.

    Args:
        text: 解码后的文件全文
        community_name: 小区名（txt 文件名去扩展名）

    Returns:
        ParsedCommunity 解析结果（含 warnings 异常清单）

    """
    result = ParsedCommunity(community_name)
    era_raw: str | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line == ";":
            continue  # 空行/单独分号行容错

        if _is_room_line(line):
            parts = line.split(";")
            building_no = parts[1].strip()
            room_no = parts[2].strip()
            lng: float | None = None
            lat: float | None = None
            # 坐标在第 4/5 段（可能缺省或为非数值占位）
            if len(parts) > _LNG_INDEX:
                try:
                    lng = float(parts[_LNG_INDEX])
                except (ValueError, IndexError):
                    lng = None
            if len(parts) > _LAT_INDEX:
                try:
                    lat = float(parts[_LAT_INDEX])
                except (ValueError, IndexError):
                    lat = None
            result.rooms.append((building_no, room_no, lng, lat))
            continue

        # ---- 属性行分类 ----
        if not result.property_types and ("住宅" in line or "商业" in line or "别墅" in line):
            result.property_types = _split_types(line)
            continue

        if "年" in line and era_raw is None and re.search(r"\d{3,4}", line):
            era_raw = line
            continue

        # 区域板块 + 地址行（以分号开头）
        m = _AREA_ADDRESS_RE.match(line)
        if m and result.district_area is None:
            result.district_area = _clean(m.group(1))
            result.address = _clean(m.group(2))
            # M3：拆为可筛选的 district/business_circle（否则总览区域筛选无数据）
            result.district, result.business_circle = split_district_area(result.district_area)
            continue

        # 环线行
        if _RING_PATTERN.match(line) and result.ring is None:
            result.ring = line
            continue

        # 物业公司 / 开发商：段结构不固定，按「出现顺序 + 关键词」启发式
        cleaned = _clean(line)
        if not cleaned:
            continue
        if result.property_mgmt is None and ("物业" in cleaned):
            result.property_mgmt = cleaned
            continue
        if result.developer is None and (
            "置业" in cleaned or "房产" in cleaned or "地产" in cleaned or "开发" in cleaned or "有限公司" in cleaned
        ):
            result.developer = cleaned

    result.era_from, result.era_to = parse_era(era_raw)
    if era_raw and result.era_from is None:
        result.warnings.append(f"建成年代脏值置空: {era_raw}")
    if not result.address:
        result.warnings.append("地址缺失")
    if result.district_area and not result.district:
        result.warnings.append(f"区域无法识别（仅存板块）: {result.district_area}")
    logger.debug(
        "解析小区 %s: 楼栋数据 %d 行, 物业类型 %s, 年代 %s~%s, 环线 %s, 区域 %s/%s",
        community_name,
        len(result.rooms),
        result.property_types,
        result.era_from,
        result.era_to,
        result.ring,
        result.district,
        result.business_circle,
    )
    return result


def detect_encoding(data: bytes) -> str:
    """自动识别编码：GBK / UTF-8（NFR-04）.

    依次尝试 UTF-8（含 BOM）→ GB18030（GBK 超集，覆盖全部原始数据）。
    decode 严格模式失败时回退 GBK + errors="replace"（NFR-04 容错）。

    Returns:
        解码后的全文

    """
    if data.startswith(b"\xef\xbb\xbf"):
        return data.decode("utf-8-sig", errors="replace")
    try:
        return data.decode("utf-8")
    except UnicodeDecodeError:
        pass
    try:
        return data.decode("gb18030")
    except UnicodeDecodeError:
        return data.decode("gbk", errors="replace")
