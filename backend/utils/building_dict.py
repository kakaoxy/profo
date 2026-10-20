"""楼盘字典共享工具函数.

被导入服务 / admin 补录 / 审核池 create 等多处复用的纯函数：
- ``parse_room_floor``：户室号 → 楼层解析（BR-02）
- ``normalize_community_name``：小区名归一化（FR-19 uq_pending_open 依据）
- ``format_plate_no``：门牌自动拼装映射（0401 → 401，FR-09）
- ``normalize_building_no``：楼栋号量词归一（BR-29：尾部单个「号」剥离）
- ``has_building_suffix``：楼栋号是否已自带量词（展示层拼装用）
"""

import re

# 标准户室号：恰好 4 位数字（前两位楼层 + 后两位户号），如 0401/1001
_STANDARD_ROOM_NO_RE = re.compile(r"^\d{4}$")
# 3 位数字户室号（首位楼层 1-9 + 后两位户号），如 202 = 2 层 02 户
_TRIPLE_DIGIT_ROOM_NO_RE = re.compile(r"^\d{3}$")

# 全角 ASCII 区边界（全角转半角，FR-19 归一化）
_FULLWIDTH_ASCII_START = 0xFF01
_FULLWIDTH_ASCII_END = 0xFF5E
_FULLWIDTH_OFFSET = 0xFEE0
# 全角空格
_FULLWIDTH_SPACE = "\u3000"

# 楼栋号尾部量词（BR-29）：只认单个「号」。刻意不含「号楼/栋/幢/单元」——
# 「2号楼」剥成「2」会让原文语义丢失，且展示层后缀感知已能正确呈现。
_TRAILING_HAO_RE = re.compile(r"号$")
# 展示层「已自带量词」判定（与前端 lib/dict-display.ts 的 hasBuildingSuffix 同源）
_BUILDING_SUFFIX_RE = re.compile(r"(号|号楼|栋|幢|单元|弄)$")


def parse_room_floor(room_no: str | None) -> int | None:
    """解析户室号对应楼层（SRS FR-04 / BR-02）.

    楼层不是地址的组成部分，一律从户室号派生（批量导入亦无楼层字段）：

    - 标准户室号（恰好 4 位数字）：floor = 前两位数字（``0401`` → 4、``1001`` → 10）
    - 3 位数字户室号：floor = 首位数字（``202`` → 2、``305`` → 3，即 1-9 层低层惯例）
    - 非标户室号（``0233-1``、``1-2楼`` 等含非数字或长度≠3/4）：floor = NULL，
      归「未分层」组置底，不参与门牌自动拼装
    - 楼层位解析为 0（如 ``0001``、``001``）：视为无有效楼层 → NULL

    Args:
        room_no: 户室号原始串

    Returns:
        楼层数（>0 的整数）；非标户室号返回 None

    """
    s = (room_no or "").strip()
    if _STANDARD_ROOM_NO_RE.fullmatch(s):
        floor = int(s[:2])
    elif _TRIPLE_DIGIT_ROOM_NO_RE.fullmatch(s):
        floor = int(s[0])
    else:
        return None
    if floor <= 0:
        return None
    return floor


def is_standard_room_no(room_no: str | None) -> bool:
    """判断是否标准户室号（4 位数字），决定门牌能否自动拼装（BR-12）."""
    s = (room_no or "").strip()
    return bool(_STANDARD_ROOM_NO_RE.fullmatch(s)) and parse_room_floor(s) is not None


def normalize_community_name(name: str | None) -> str:
    """小区名归一化（FR-19）：去首尾与内部空白 + 全角转半角 + 转小写.

    用于 bd_pending_entries.normalized_name，作为 uq_pending_open
    同名并发唯一的判定依据（去空白/全半角归一后的名称）。

    Args:
        name: 原始名称

    Returns:
        归一化后的名称（不做其他业务改写）

    """
    if not name:
        return ""
    s = name.strip()
    # 全角转半角（空格、ASCII 可打印字符）
    out: list[str] = []
    for ch in s:
        code = ord(ch)
        if ch == _FULLWIDTH_SPACE:
            out.append(" ")
        elif _FULLWIDTH_ASCII_START <= code <= _FULLWIDTH_ASCII_END:
            out.append(chr(code - _FULLWIDTH_OFFSET))
        else:
            out.append(ch)
    # 去除全部空白（含内部空格，归一化仅用于唯一性判定）
    return "".join("".join(out).split()).lower()


def format_plate_no(room_no: str | None) -> str:
    """门牌自动拼装的户室号映射（FR-09 / FR-05）：``0401`` → ``401``、``0103`` → ``103``.

    仅标准 4 位户室号参与映射；非标户室号原样返回（调用方应回退手填，BR-12）。

    Args:
        room_no: 户室号原始串

    Returns:
        映射后的门牌户号串；非标户室号返回原串

    """
    s = (room_no or "").strip()
    if not is_standard_room_no(s):
        return s
    return str(int(s))


def has_building_suffix(building_no: str | None) -> bool:
    """楼栋号是否已自带量词（BR-29，展示层拼装判定）.

    前端 ``formatBuildingLabel`` 与本函数同口径：自带量词则原样展示、
    否则补一个「号」。否则 ``2号楼`` 会被拼成 ``2号楼号``。

    Args:
        building_no: 楼栋号原始串

    Returns:
        True 表示已自带量词（号/号楼/栋/幢/单元/弄），无需再补「号」

    """
    s = (building_no or "").strip()
    if not s:
        return False
    return bool(_BUILDING_SUFFIX_RE.search(s))


def normalize_building_no(raw: str | None) -> str:
    """楼栋号量词归一（BR-29）：剥离尾部**单个**「号」，并折叠空白.

    运营高频反馈：录入「金杨路660弄21号」，而全系统展示层会再补一个「号」
    （``buildPlate`` / 审核弹层 / 抽屉回显），结果拼成「金杨路660弄21号号」。
    写入层统一收口：落库去「号」，展示层后缀感知补回，两边恒等。

    **只剥单个「号」**，刻意不处理「号楼/栋/幢/单元/弄」——
    ``2号楼`` 剥成 ``2`` 会丢失原文语义（该楼栋确实以「号楼」为量词），
    且展示层 ``has_building_suffix`` 已能正确呈现，无需改写。

    Args:
        raw: 用户输入或导入原文的楼栋号

    Returns:
        归一后的楼栋号（去尾部空白与单个「号」）；剥完为空时**回退原文**，
        避免 ``号`` 这类脏值被归一成空串导致 uq 撞空值

    """
    s = " ".join((raw or "").split())
    if not s:
        return ""
    stripped = _TRAILING_HAO_RE.sub("", s).strip()
    # 回退保护：纯「号」/ 剥完为空 → 保留原文（不给脏值造空串）
    return stripped or s
