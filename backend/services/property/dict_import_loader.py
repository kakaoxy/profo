"""楼盘字典导入装载服务（SRS FR-08 / R2）.

四步导入管线：上传 → 解析校验（预扫描 + 异常清单）→ 异步装载 → 对账报告。

装载管线（NFR-01/02）：
- GBK txt → 临时 CSV → PostgreSQL COPY（733 万行批量装载）；
- 逐小区事务：小区/楼栋/户室单小区一批，失败仅回滚当前小区；
- 按 name / uq(community_id, building_no) / uq(building_id, room_no) upsert 幂等
  （BR-16：同包重跑计数不变）；
- 失败行写 csv 明细可下载，归档 90 天（bd_archive 目录，应用内启动 + 每日巡检清理）；
- zip 包逐条目流式处理（任一时刻最多驻留单个 txt，OrbStack 排查报告 §4.2-1）；
- **H1 全链路流式（2026-10-17 性能与安全专项审查）**：条目以
  ``io.TextIOWrapper`` 逐行解码、解析器把户室行直接落临时 CSV，不再
  「整份 read → 整份 decode → splitlines → rooms 列表」四份数据同时驻留
  （实测放大 13.1×：38.7MB → 509MB；改后 38.7MB → 4MB）。
- 单包解压总量上限 1GB、单条目（单 txt）解压上限 16MB（H1：原 512MB 按
  「原始字节 ×13.1」反算实际需 6.7GB，与 backend 容器 512m 承载力不符；
  合法数据实测最大单 txt 约 313KB）。
- 装载前内存闸门：进程 RSS 超 384MB 直接失败并提示拆分单文件（H1）。
- 上传互斥：同一时刻仅允许一个 pending/processing 任务（承载力报告 M5/L2-②）。

楼栋号/户室号保留原始串（BR-02/03）；楼层解析前两位（utils.building_dict.parse_room_floor）；
坐标 BD-09 原样落库前做值域过滤（L3：越界 / (0,0) 占位置空）。
"""

import csv
import io
import logging
import tempfile
import traceback
import uuid
import zipfile
from collections.abc import Iterable, Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import TypeAlias

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from models import BdImportTask, ImportTaskStatus
from services.property.dict_parser import ParsedCommunity, open_decoded_text, parse_community_txt_stream
from utils.building_dict import parse_room_floor

logger = logging.getLogger(__name__)

# 单包大小上限。
# 承载力报告 L2-⑥：SRS 的「≤2GB」与 nginx client_max_body_size 100M 机制矛盾，
# 被否决 —— 可执行口径为网关 100M（应用层留 2GB 兼容带内直连/内网场景，
# 超网关限额的包根本到不了这里）。前端预检与文案已同步为 100MB。
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

# M3 zip bomb 防护：zip 解压后总大小上限。
# 承载力报告 v2（§4 阶段二）：防线必须与执行容器实际承载力对齐——
# backend 容器 mem_limit=512m（docker-compose.yml），流式解压后内存峰值
# = 单 txt 体积（最大 313KB）+ 解析行列表，若仅限总大小则单包 4GB 的
# 宣告体积仍可冲垮容器（总大小限制仅防磁盘耗尽，不防内存）。
# 对齐口径：nginx client_max_body_size 100M（profo.nginx.backup:69,124）
# × 本数据集实测压缩率 6.8× ≈ 680MB，留余量取 1GB。
MAX_UNCOMPRESSED_TOTAL = 1 * 1024 * 1024 * 1024
_ZIP_BOMB_MSG = "zip 包解压后总大小超限（1GB，与 backend 容器 512m 承载力对齐），疑似异常包或超大包，请分批导入"

# zip bomb 防护第二道：单条目解压上限。
# 审查补缺（2026-10-17）：MAX_UNCOMPRESSED_TOTAL 只约束包内全部条目的声明
# 总量，恶意单条目（如声明 800MB 的 txt，包内仅此一个条目）可通过总量检查，
# zf.read() 一次读入后仍可冲垮 512m 容器。
#
# H1 修复（2026-10-17 性能与安全专项审查）：上限由 512MB 降到 16MB。
# 原值按「原始字节数」与容器 mem_limit 对齐，但解析链路的**真实内存放大是
# 13.1×**（tracemalloc 实测，见 dict_parser.parse_community_txt_stream 注释：
# 19.4MB→254MB、38.7MB→509MB、105.1MB→1378MB 三档线性一致），即 512MB 条目
# 需要约 6.7GB 常驻内存；即便按 nginx 100MB 网关上限，单条目 38MB 也需要
# 约 509MB —— 已逼近 docker-compose.yml 的 backend mem_limit: 512m。
# 现在解析改流式（峰值 ≈ 4MB，与文件大小无关，实测 38.7MB→4MB），防线仍保留
# 作为「异常包/超大包」的早失败闸门：16MB 在 13.1× 旧口径下约 210MB，
# 留一半余量；按流式口径 16MB 峰值仅约 4MB。合法数据不受影响：本数据集实测
# 最大单 txt 约 313KB（承载力报告 §4）。
MAX_SINGLE_ENTRY_BYTES = 16 * 1024 * 1024
_SINGLE_ENTRY_LIMIT_MSG = "zip 内单个文件解压后超限（16MB），疑似异常包，请检查数据或分批导入"

# H1 装载线程内存闸门：解析前预检进程 RSS，超阈值直接失败并提示拆分单文件。
# 阈值取容器 mem_limit（docker-compose.yml: backend 512m）的 75% —— 留出
# FastAPI/SQLAlchemy/其他请求的余量。非 Linux（开发机）无 cgroup 时按同一
# 常量兜底判断（开发机内存远大于此，正常不会触发）。
MEMORY_GATE_BYTES = 384 * 1024 * 1024
_MEMORY_GATE_MSG = "服务内存不足（RSS 已超 384MB），请稍后重试或拆分单文件后分批导入"

# 失败明细/原始包归档天数（NFR-02）
ARCHIVE_DAYS = 90


def _decode_zip_name(info: zipfile.ZipInfo) -> str:
    """解码 zip 条目文件名.

    Python zipfile 对未打 UTF-8 标志（flag bit 0x800）的条目按 cp437 解码，
    macOS/Windows 中文环境压缩的非 ASCII 文件名会变成乱码，需还原原始字节
    后按 UTF-8/GBK 重解码。
    """
    if info.flag_bits & 0x800:
        return info.filename
    raw = info.filename.encode("cp437")
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError:
        return raw.decode("gbk", errors="replace")


def _read_proc_vmrss(status_path: Path = Path("/proc/self/status")) -> int | None:
    """从 procfs 读取**现时** RSS（字节）；文件不存在/无 VmRSS 时返回 None.

    Args:
        status_path: procfs 状态文件路径（默认当前进程；可注入伪文件以验证解析）

    Returns:
        RSS 字节数或 None

    """
    try:
        with status_path.open(encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("VmRSS:"):
                    return int(line.split()[1]) * 1024
    except (OSError, ValueError, IndexError):
        return None
    return None


def _current_rss_bytes() -> int | None:
    """读取当前进程 **现时** RSS（字节）；无法读取时返回 None.

    优先读 Linux 的 ``/proc/self/status``（``VmRSS`` 是当前值）；读不到时回退
    ``resource.getrusage`` —— 后者 ``ru_maxrss`` 是**峰值**（历史最高水位，永不下降），
    只能作为非 Linux 开发机（macOS）的近似值，绝不可用于容器内存闸门判断
    （一旦进程历史上曾冲高一次，后续导入会永久误判「内存不足」，而旧实现即如此）。

    Returns:
        当前进程常驻内存字节数；平台不支持时返回 None

    """
    rss = _read_proc_vmrss()
    if rss is not None:
        return rss
    try:
        import resource
        import sys

        usage = resource.getrusage(resource.RUSAGE_SELF)
        # macOS 的 ru_maxrss 单位是字节，Linux 是 KB（非 Linux 兜底分支）
        factor = 1 if sys.platform == "darwin" else 1024
        return int(usage.ru_maxrss) * factor
    except (ImportError, OSError, ValueError):  # pragma: no cover - 平台差异兜底
        return None


def _check_memory_gate() -> None:
    """装载前内存闸门（H1）：RSS 超阈值直接失败并提示拆分单文件.

    Raises:
        ValueError: 进程 RSS 超过 ``MEMORY_GATE_BYTES``

    """
    rss = _current_rss_bytes()
    if rss is not None and rss > MEMORY_GATE_BYTES:
        logger.error("导入内存闸门触发：RSS=%.0fMB > 阈值 %.0fMB", rss / 2**20, MEMORY_GATE_BYTES / 2**20)
        raise ValueError(_MEMORY_GATE_MSG) from None


def _iter_lines(data: Iterable[str] | bytes) -> Iterable[str]:
    """把条目内容规整为「行迭代器」（H1；兼容注入 bytes 的调用方/测试）.

    Args:
        data: 逐行文本流（正常路径）或 bytes（测试/兼容路径）

    Returns:
        行迭代器

    """
    if isinstance(data, bytes | bytearray):
        from services.property.dict_parser import detect_encoding

        return io.StringIO(detect_encoding(bytes(data)))
    return data


class _BadEntry:
    """损坏 zip 条目占位（L4：生成器内不 raise，交给调用方记失败明细）.

    作为 ``_ZipEntry`` 联合类型的一个分支参与 yield：生成器一旦 raise 就再也
    无法产出后续条目，故损坏条目降级为携带原异常的值对象，由 ``_execute``
    识别后记失败明细并继续下一个。
    """

    __slots__ = ("error",)

    def __init__(self, error: Exception) -> None:
        """保存原始异常供调用方上抛."""
        self.error = error


# 单包入口产出项：正常条目为 (文件名, 逐行解码的文本流)，解压/解码失败的条目为
# (文件名, _BadEntry)。用联合类型如实表达（而非 Iterator[tuple[str, object]] +
# type: ignore 遮盖），调用方必须显式 isinstance 收窄后才能当文本流使用。
# H1：由 ``bytes``（整份解压进内存）改为 ``Iterable[str]`` 文本流（逐行解码）。
_ZipEntry: TypeAlias = tuple[str, Iterable[str] | _BadEntry]


class DictImportStats:
    """导入对账三计数."""

    __slots__ = ("buildings", "communities", "rooms", "scanned_buildings")

    def __init__(self) -> None:
        """初始化计数."""
        self.communities = 0
        self.buildings = 0
        self.rooms = 0
        # H1：预扫描口径（L3）的楼栋数 —— 流式解析后内存中不再持有 rooms 列表，
        # 由装载侧在遍历户室行时统计，供 task.total_buildings 使用
        self.scanned_buildings = 0

    def as_dict(self) -> dict[str, int]:
        """返回对账字典."""
        return {"communities": self.communities, "buildings": self.buildings, "rooms": self.rooms}


# 户室行 CSV 列数：楼栋号, 室号, 经度, 纬度（空串表示 None）
_ROOM_ROW_FIELDS = 4


def _iter_room_rows(
    rooms: list[tuple[str, str, float | None, float | None]],
    rooms_csv_path: str | None,
) -> Iterator[tuple[str, str, float | None, float | None]]:
    """遍历户室行（内存列表或落盘 CSV 两种来源，H1）.

    Args:
        rooms: 内存中的户室行（小文件/单测路径；为空时改读 CSV）
        rooms_csv_path: ``parse_community_txt_stream`` 落盘的户室行 CSV

    Yields:
        (楼栋号, 室号, lng, lat)

    """
    if rooms_csv_path:
        with Path(rooms_csv_path).open(encoding="utf-8", newline="") as f:
            for row in csv.reader(f):
                if len(row) < _ROOM_ROW_FIELDS:  # 损坏行容错（理论上不会出现）
                    continue
                building_no, room_no, lng_raw, lat_raw = row[0], row[1], row[2], row[3]
                yield (
                    building_no,
                    room_no,
                    float(lng_raw) if lng_raw else None,
                    float(lat_raw) if lat_raw else None,
                )
        return
    yield from rooms


def load_community_by_copy(
    engine: Engine,
    *,
    community_name: str,
    property_types: list[str],
    era_from: int | None,
    era_to: int | None,
    property_mgmt: str | None,
    developer: str | None,
    district_area: str | None,
    address: str | None,
    ring: str | None,
    lng: float | None,
    lat: float | None,
    rooms: list[tuple[str, str, float | None, float | None]] | None = None,
    rooms_csv_path: str | None = None,
    district: str | None = None,
    business_circle: str | None = None,
) -> DictImportStats:
    """单小区事务装载（幂等 upsert）.

    事务内：
    1. communities 按 name upsert（跨批次重名小区按最新批次画像列更新，
       已有画像值不覆盖为空 —— 幂等且保留人工修正）；
    2. bd_buildings 按 uq(community_id, building_no) upsert；
    3. bd_rooms 临时 CSV → COPY 进 staging 表 → INSERT ... ON CONFLICT DO NOTHING
       （uq(building_id, room_id) 冲突跳过，BR-16）。

    Args:
        engine: 数据库引擎（本小区独立事务）
        community_name: 小区名（跨批次同名 upsert 键）
        property_types: 物业类型列表
        era_from: 建成年代起
        era_to: 建成年代止
        property_mgmt: 物业公司
        developer: 开发商
        district_area: 源数据「区域板块」原文（仅作 Fallback 拆分依据，不单独存列）
        address: 小区地址
        ring: 环线
        lng: 首户经度（BD-09；为 None 且走 CSV 路径时从 CSV 首个非空坐标取值）
        lat: 首户纬度（BD-09；同上）
        rooms: 户室行 [(楼栋号, 室号, lng, lat)]（内存路径）
        rooms_csv_path: 户室行落盘 CSV（H1 流式路径；与 rooms 二选一，
            CSV 列序为 楼栋号, 室号, 经度, 纬度，空串表示 None）
        district: 归一化行政区（带「区」后缀）；缺省时从 district_area 拆
        business_circle: 板块；缺省时从 district_area 拆

    Returns:
        本次实际新增的对账计数（幂等重跑时全部为增量 0）

    """
    # M3：区域/板块归一（前端筛选依赖这两列；原实现只解析不落库）
    if district is None and business_circle is None:
        from services.property.dict_parser import split_district_area

        district, business_circle = split_district_area(district_area)
    room_rows = rooms or []
    stats = DictImportStats()
    with engine.begin() as conn:
        # 1. communities upsert（source=import 废止 → 不写 source；画像列 COALESCE 保留已有值）
        #    id 为应用层 UUID（ORM default），COPY 链路需显式生成
        row = conn.execute(
            text(
                """
                INSERT INTO communities
                    (id, name, district, business_circle, property_types, era_from, era_to, property_mgmt, developer,
                     address, ring, lng, lat, is_active, total_properties, created_at, updated_at)
                VALUES
                    (:id, :name, :district, :business_circle, :property_types, :era_from, :era_to, :property_mgmt,
                     :developer, :address, :ring, :lng, :lat, true, 0, now(), now())
                ON CONFLICT (name) DO UPDATE SET
                    district = COALESCE(communities.district, EXCLUDED.district),
                    business_circle = COALESCE(communities.business_circle, EXCLUDED.business_circle),
                    property_types = COALESCE(communities.property_types, EXCLUDED.property_types),
                    era_from = COALESCE(communities.era_from, EXCLUDED.era_from),
                    era_to = COALESCE(communities.era_to, EXCLUDED.era_to),
                    property_mgmt = COALESCE(communities.property_mgmt, EXCLUDED.property_mgmt),
                    developer = COALESCE(communities.developer, EXCLUDED.developer),
                    address = COALESCE(communities.address, EXCLUDED.address),
                    ring = COALESCE(communities.ring, EXCLUDED.ring),
                    lng = COALESCE(communities.lng, EXCLUDED.lng),
                    lat = COALESCE(communities.lat, EXCLUDED.lat),
                    updated_at = now()
                RETURNING id, (xmax = 0) AS inserted
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "name": community_name,
                "district": district,
                "business_circle": business_circle,
                "property_types": property_types or None,
                "era_from": era_from,
                "era_to": era_to,
                "property_mgmt": property_mgmt,
                "developer": developer,
                "address": address,
                "ring": ring,
                "lng": lng,
                "lat": lat,
            },
        ).one()
        community_id = str(row[0])
        community_inserted = bool(row[1])
        if community_inserted:
            stats.communities = 1

        # 导入撞同名 open pending：仅置 created + resolved_target_id（BR-26）；
        # open 引用不同步回填，留交既有 pending-backfill 异步任务按 resolved_target_id 兜底
        from utils.building_dict import normalize_community_name

        norm = normalize_community_name(community_name)
        prow = conn.execute(
            text(
                """
                SELECT id FROM bd_pending_entries
                WHERE kind = 'community' AND status = 'pending' AND normalized_name = :norm
                LIMIT 1 FOR UPDATE
                """
            ),
            {"norm": norm},
        ).first()
        if prow:
            conn.execute(
                text(
                    """
                    UPDATE bd_pending_entries
                    SET status = 'created', resolved_target_id = :cid, resolved_at = now()
                    WHERE id = :pid
                    """
                ),
                {"cid": community_id, "pid": int(prow[0])},
            )

        # 2. 楼栋 upsert（首户坐标）
        # H1：户室行可能是内存列表（单测/小文件）或落盘 CSV（导入链路），
        # 这里单遍遍历收集楼栋集合与每栋首户坐标，不再依赖内存列表
        first_coords: dict[str, tuple[float | None, float | None]] = {}
        building_nos: list[str] = []
        seen_buildings: set[str] = set()
        for building_no, _room_no, r_lng, r_lat in _iter_room_rows(room_rows, rooms_csv_path):
            if building_no not in seen_buildings:
                seen_buildings.add(building_no)
                building_nos.append(building_no)
            if building_no not in first_coords and (r_lng is not None or r_lat is not None):
                first_coords[building_no] = (r_lng, r_lat)
        stats.scanned_buildings = len(building_nos)

        for building_no in sorted(building_nos):
            b_lng, b_lat = first_coords.get(building_no, (None, None))
            brow = conn.execute(
                text(
                    """
                    INSERT INTO bd_buildings (community_id, building_no, lng, lat, room_count, created_at, updated_at)
                    VALUES (:community_id, :building_no, :lng, :lat, 0, now(), now())
                    ON CONFLICT (community_id, building_no) DO UPDATE SET
                        lng = COALESCE(bd_buildings.lng, EXCLUDED.lng),
                        lat = COALESCE(bd_buildings.lat, EXCLUDED.lat),
                        updated_at = now()
                    RETURNING id, (xmax = 0) AS inserted
                    """
                ),
                {"community_id": community_id, "building_no": building_no, "lng": b_lng, "lat": b_lat},
            ).one()
            if bool(brow[1]):
                stats.buildings += 1

        building_id_map: dict[str, int] = {}
        for bid, bno in conn.execute(
            text("SELECT id, building_no FROM bd_buildings WHERE community_id = :cid"),
            {"cid": community_id},
        ).all():
            building_id_map[str(bno)] = int(bid)

        # 3. 户室：临时 CSV → COPY staging → ON CONFLICT DO NOTHING
        if building_id_map and (rooms_csv_path or room_rows):
            conn.execute(
                text(
                    """
                    CREATE TEMP TABLE IF NOT EXISTS bd_rooms_staging (
                        building_id BIGINT, room_no TEXT, floor INT
                    ) ON COMMIT DROP
                    """
                ),
            )
            conn.execute(text("TRUNCATE bd_rooms_staging"))

            tmp = tempfile.NamedTemporaryFile(  # noqa: SIM115
                mode="w",
                suffix=".csv",
                encoding="utf-8",
                newline="",
                delete=False,
            )
            try:
                writer = csv.writer(tmp, quoting=csv.QUOTE_MINIMAL)
                for building_no, room_no, _r_lng, _r_lat in _iter_room_rows(room_rows, rooms_csv_path):
                    bid = building_id_map.get(building_no)
                    if bid is None:
                        continue
                    writer.writerow([bid, room_no, parse_room_floor(room_no)])
                tmp.close()
                # psycopg3 COPY 语法（cursor.copy 上下文管理器）
                with (
                    Path(tmp.name).open(encoding="utf-8", newline="") as f,
                    conn.connection.cursor().copy(
                        "COPY bd_rooms_staging (building_id, room_no, floor) FROM STDIN WITH (FORMAT csv)"
                    ) as copy,
                ):
                    while chunk := f.read(1 << 20):
                        copy.write(chunk)
            finally:
                Path(tmp.name).unlink(missing_ok=True)

            result = conn.execute(
                text(
                    """
                    INSERT INTO bd_rooms (building_id, room_no, floor, created_at)
                    SELECT building_id, room_no, floor, now() FROM bd_rooms_staging
                    ON CONFLICT (building_id, room_no) DO NOTHING
                    """
                ),
            )
            stats.rooms = result.rowcount or 0

            # 更新楼栋冗余计数（BR-16 幂等：以实际行数为准）
            conn.execute(
                text(
                    """
                    UPDATE bd_buildings b SET room_count = sub.cnt, updated_at = now()
                    FROM (
                        SELECT building_id, count(*) AS cnt FROM bd_rooms
                        WHERE building_id IN (
                            SELECT id FROM bd_buildings WHERE community_id = :cid
                        ) GROUP BY building_id
                    ) sub WHERE b.id = sub.building_id
                    """
                ),
                {"cid": community_id},
            )

    return stats


class DictImportProcessor:
    """楼盘字典导入任务处理器（后台线程执行）."""

    def __init__(self, engine: Engine) -> None:
        """初始化处理器."""
        self.engine = engine

    @staticmethod
    def _is_txt_entry(info: zipfile.ZipInfo) -> bool:
        """判定 zip 条目是否为待处理 txt（跳过目录与 macOS 压缩产物）."""
        if info.is_dir() or not info.filename.lower().endswith(".txt"):
            return False
        # 跳过 macOS 压缩产物：__MACOSX 目录与 ._ AppleDouble 文件
        return not (info.filename.startswith("__MACOSX/") or Path(info.filename).name.startswith("._"))

    def _iter_txt_entries(self, file_path: Path, task: BdImportTask) -> tuple[Iterator[_ZipEntry], int]:
        """构造 txt 条目迭代器（报告 §4.2-1 流式修复 + H1 流式解析）.

        zip：先按中央目录扫描（只读元数据，不读数据）过滤 txt 条目并做
        zip bomb 防护（声明解压总大小累加），返回逐条目惰性解压迭代器——
        任一时刻最多驻留单个 txt，消除原实现全包 read() 驻留内存隐患。
        单 txt：返回单元素迭代器，小区名取「原始上传文件名」（存盘名已被
        重命名为 bd_{task_id}.txt，不能直接用）。

        H1 修复：条目产出**文本流**（``io.TextIOWrapper`` 逐行解码）而非
        ``bytes`` 全量——原实现 ``zf.read(info)`` + ``detect_encoding`` 整份 decode
        后交 ``parse_community_txt``，实测 38.7MB 数据峰值 509MB（13.1×），
        40MB 的合法 txt 即可打爆 512m 容器。现在解码与解析都是逐行流式，
        峰值 ≈ 4MB 且与文件大小无关。

        Returns:
            (条目迭代器 (文件名, 文本流 | _BadEntry)，总条目数)。总条目数来自中央
            目录/单文件分支，不消耗迭代器。

        Raises:
            ValueError: 声明解压总大小超 MAX_UNCOMPRESSED_TOTAL（zip bomb 防护）。

        """
        if file_path.suffix.lower() != ".zip":
            # 单 txt 直传：按落盘实际大小做单文件拦截（与 zip 条目同口径），
            # 在打开文件流前拒绝
            if file_path.stat().st_size > MAX_SINGLE_ENTRY_BYTES:
                raise ValueError(_SINGLE_ENTRY_LIMIT_MSG) from None
            # 小区名取自「原始上传文件名」的扩展名前部分
            original_name = Path(task.filename).name if task.filename else file_path.name
            return self._iter_single_txt(file_path, original_name), 1

        with zipfile.ZipFile(file_path) as zf:
            infos = [info for info in zf.infolist() if self._is_txt_entry(info)]
            uncompressed_total = sum(info.file_size for info in infos)
            if uncompressed_total > MAX_UNCOMPRESSED_TOTAL:
                raise ValueError(_ZIP_BOMB_MSG) from None
            # 单条目防线：总量检查拦不住「包内仅一个超大条目」的包
            for info in infos:
                if info.file_size > MAX_SINGLE_ENTRY_BYTES:
                    raise ValueError(_SINGLE_ENTRY_LIMIT_MSG) from None
        total = len(infos)
        return self._iter_zip_txt(file_path, infos), total

    @staticmethod
    def _iter_single_txt(file_path: Path, original_name: str) -> Iterator[_ZipEntry]:
        """单 txt 直传：打开文件流并按行解码（H1，不整份读入）."""
        try:
            with file_path.open("rb") as fh:
                buffered = io.BufferedReader(fh) if not isinstance(fh, io.BufferedReader) else fh
                text = open_decoded_text(buffered)
                try:
                    yield original_name, text
                finally:
                    text.close()
        except Exception as exc:  # 单条目失败不得杀死生成器
            logger.warning("txt 文件读取失败，记失败明细: %s (%s)", original_name, exc)
            yield original_name, _BadEntry(exc)

    @staticmethod
    def _iter_zip_txt(file_path: Path, infos: list[zipfile.ZipInfo]) -> Iterator[_ZipEntry]:
        """逐条目惰性解压 zip 内 txt（每打开一次 ZipFile，读一个条目即释放）.

        L4：单条目解压失败不得终止整个生成器 —— 生成器一旦被未捕获异常杀死就
        永久死亡，后续 ``next()`` 全部变为 ``StopIteration``，合法小区被静默丢弃
        （实测：包内 good1 / locked(加密) / good2 / good3，只有 good1 入库，
        good2、good3 连同真实文件名一起消失，任务却显示 completed）。

        因此损坏条目降级为 ``_BadEntry`` 值对象随元组 yield，由调用方
        ``_execute`` 识别 isinstance 后记失败明细并继续下一个；两个分支产出的
        元组结构完全一致（均为 ``(filename, data)``）。

        异常范围取 ``Exception`` 而非枚举：原实现只捕 ``BadZipFile/OSError``，
        漏掉了 ``RuntimeError`` —— 实测加密条目、不支持的压缩方法均由
        ``zipfile.open`` 抛 ``RuntimeError``（"...is encrypted, password required"），
        导致生成器死亡、后续条目全部丢失。捕获基类后无论哪类读取失败都只影响
        当次条目，失败明细仍带回真实文件名与原因（运营可定位丢的是哪个小区）。

        H1：条目内容以文本流形式产出（``open_decoded_text`` 逐行解码），
        不再 ``zf.read()`` 整份进内存。

        Returns:
            (文件名, 文本流 | _BadEntry) 的惰性迭代器

        """
        with zipfile.ZipFile(file_path) as zf:
            for info in infos:
                name = Path(_decode_zip_name(info)).name
                try:
                    raw = zf.open(info)
                except Exception as exc:  # 单条目失败不得杀死生成器
                    logger.warning("zip 条目解压失败，记失败明细后继续: %s (%s)", name, exc)
                    yield name, _BadEntry(exc)
                    continue
                buffered = io.BufferedReader(raw)
                try:
                    text = open_decoded_text(buffered)
                except Exception as exc:  # 编码探测失败同样只影响当条
                    logger.warning("zip 条目解码失败，记失败明细后继续: %s (%s)", name, exc)
                    buffered.close()
                    yield name, _BadEntry(exc)
                    continue
                try:
                    yield name, text
                finally:
                    # 关闭文本流会级联关闭底层 ZipExtFile
                    text.close()

    def process_task(self, task_id: str) -> None:
        """处理导入任务主入口（独立线程）."""
        from db import SessionLocal

        db = SessionLocal()
        try:
            task = db.get(BdImportTask, task_id)
            if not task:
                logger.error("字典导入任务不存在: %s", task_id)
                return
            if task.status == ImportTaskStatus.CANCELLED:
                return

            task.status = ImportTaskStatus.PROCESSING
            task.started_at = datetime.now(timezone.utc)
            db.commit()

            self._execute(task, db)
        except Exception:
            logger.exception("字典导入任务失败: %s", task_id)
            db.rollback()
            # 报告 §4.2-3：失败堆栈摘要写回 error_message，任务历史可直接定位根因
            # （原实现仅写死一句话，backend/logs 缺失时形成排查死胡同）
            stack_tail = traceback.format_exc()[-1500:]
            self._mark_failed(db, task_id, f"装载失败（详见服务日志），堆栈摘要：\n{stack_tail}")
        finally:
            db.close()

    def _execute(self, task: BdImportTask, db: Session) -> None:
        """执行装载：解包 → 逐小区解析 → COPY 装载 → 对账.

        报告 §4.2-1：zip 逐条目流式处理——先按中央目录扫描过滤 txt 条目
        （仅累加声明大小做 zip bomb 防护，不读数据），再逐条目解压，
        任一时刻最多驻留单个 txt，消除全包解压驻留内存隐患。
        """
        file_path = Path(task.file_path)
        if not file_path.exists():
            self._mark_failed(db, task.id, "文件不存在")
            return

        try:
            entries, total_communities = self._iter_txt_entries(file_path, task)
        except ValueError as e:
            # zip bomb 防护（M3）：声明解压总大小超限
            self._mark_failed(db, task.id, str(e))
            return
        except zipfile.BadZipFile:
            # 损坏/伪造后缀的包：确定性用户可修复错误，给明确提示而非裸堆栈
            self._mark_failed(db, task.id, "zip 包损坏或不是有效的 zip 文件")
            return

        if total_communities == 0:
            self._mark_failed(db, task.id, "包内无 txt 文件")
            return

        # L3 修复（预扫描口径）：task.total_communities 写入真实条目数；
        # 楼栋/户室/异常条数需解析后才能得知，为避免 2000×N 行全量预扫描
        # 造成导入耗时翻倍，按「装载时累计 + 末值回填」写入（首轮结束时即与
        # 对账口径一致，前端「检查数据」不再恒为 0）。
        warnings_count = 0
        # 预扫描口径（L3）：装载时逐条累加包内楼栋/户室总数，与对账「已入库」分列
        scanned_buildings = 0
        scanned_rooms = 0
        task.total_communities = total_communities
        db.commit()

        stats = DictImportStats()
        failed_rows: list[dict[str, str]] = []

        for idx in range(1, total_communities + 1):
            community_name = ""
            parsed: ParsedCommunity | None = None
            # L4 修复（单条目损坏不再整包 failed）：生成器的 next() 也必须在 try 内。
            # 注意 ``for .. in enumerate(entries)`` 的 next() 发生在循环体之前，
            # 解压异常会直接冒到 process_task → 整包 failed 且已装载小区无续跑入口；
            # 因此这里显式 next() 并包进同一个 try，坏条目记失败明细后继续下一个。
            try:
                filename, data = next(entries)
                community_name = filename[:-4] if filename.lower().endswith(".txt") else filename
                if isinstance(data, _BadEntry):
                    # L4：损坏条目不进入解析/装载，直接记失败明细（后续条目继续）
                    raise data.error
                # H1：内存闸门（解析前预检进程 RSS，超阈值直接失败并提示拆分单文件）
                _check_memory_gate()
                # H1：isinstance 收窄后 data 为逐行文本流 —— 解析全程流式，
                # 户室行落临时 CSV（parsed.rooms_csv_path），不进内存列表
                parsed = parse_community_txt_stream(_iter_lines(data), community_name)
                loaded = load_community_by_copy(
                    self.engine,
                    community_name=parsed.name,
                    property_types=parsed.property_types,
                    era_from=parsed.era_from,
                    era_to=parsed.era_to,
                    property_mgmt=parsed.property_mgmt,
                    developer=parsed.developer,
                    district_area=parsed.district_area,
                    district=parsed.district,
                    business_circle=parsed.business_circle,
                    address=parsed.address,
                    ring=parsed.ring,
                    lng=parsed.lng,
                    lat=parsed.lat,
                    rooms=[],
                    rooms_csv_path=parsed.rooms_csv_path,
                )
                stats.communities += loaded.communities
                stats.buildings += loaded.buildings
                stats.rooms += loaded.rooms
                warnings_count += len(parsed.warnings)
                scanned_buildings += loaded.scanned_buildings
                scanned_rooms += parsed.room_count
            except StopIteration:
                # 迭代器提前耗尽（条目数与 total_communities 失配）：停止消费并
                # 让收支逻辑据 processed_communities 如实记账，不再对剩余索引
                # 反复抛 StopIteration 产生无文件名的「幽灵」失败行。
                logger.warning(
                    "导入条目不早于声明数：已消费 %d 个，声明 %d 个，提前结束",
                    idx - 1,
                    total_communities,
                )
                break
            except Exception as e:
                community_name = community_name or f"第 {idx} 个条目"
                logger.exception("小区装载失败: %s", community_name)
                failed_rows.append({"community": community_name, "error": str(e)[:500]})
            finally:
                # H1：户室行临时 CSV 用完即删（parse 成功/失败都清理）
                if parsed is not None and parsed.rooms_csv_path:
                    Path(parsed.rooms_csv_path).unlink(missing_ok=True)

            # 进度实时更新（NFR-01 可关闭页面，异步任务承担）
            task.processed_communities = idx
            task.communities_loaded = stats.communities
            task.buildings_loaded = stats.buildings
            task.rooms_loaded = stats.rooms
            task.warnings_count = warnings_count
            task.total_buildings = scanned_buildings
            task.total_rooms = scanned_rooms
            task.progress_percent = round(idx / total_communities * 100, 2)
            db.commit()

        # 收尾（L4：部分小区失败仍算 completed + 失败明细，不再整包 failed）
        # processed_communities 可能在循环内因 StopIteration 提前 break 而小于
        # total_communities（条目数与声明数失配）；此时不得无条件写 100%，
        # 否则「只处理 2/5 却显示 100%」把数据丢失伪装成成功。
        # 口径：任务已完成（没东西可做了），但进度按真实消费比例记，
        # 并在 error_message 里显式告警失配。
        processed = task.processed_communities
        truncated = processed < total_communities
        task.status = ImportTaskStatus.COMPLETED
        task.progress_percent = round(processed / total_communities * 100, 2) if total_communities else 100.0
        task.warnings_count = warnings_count
        task.completed_at = datetime.now(timezone.utc)
        if task.started_at:
            task.processing_duration = (task.completed_at - task.started_at).total_seconds()
        if failed_rows:
            task.failed_file_url = self._write_failed_csv(task.id, failed_rows)
            task.error_message = (
                f"{len(failed_rows)}/{total_communities} 个小区装载失败，详见失败明细；"
                f"已成功的 {stats.communities} 个小区已入库（单包重跑幂等，不会重复入库）"
            )
        if truncated:
            mismatch_msg = (
                f"包内实际可处理条目数（{processed}）少于声明数（{total_communities}），"
                f"任务已提前结束，请检查 zip 包完整性后重试"
            )
            task.error_message = f"{task.error_message}；{mismatch_msg}" if task.error_message else mismatch_msg
            logger.warning("字典导入提前结束: %s (task=%s)", mismatch_msg, task.id)
        db.commit()

        logger.info(
            "字典导入完成: %s 对账=%s 失败小区=%d",
            task.id,
            stats.as_dict(),
            len(failed_rows),
        )

    def _mark_failed(self, db: Session, task_id: str, message: str) -> None:
        """标记任务失败."""
        task = db.get(BdImportTask, task_id)
        if task:
            task.status = ImportTaskStatus.FAILED
            task.error_message = message
            task.completed_at = datetime.now(timezone.utc)
            db.commit()

    def _write_failed_csv(self, task_id: str, failed_rows: list[dict[str, str]]) -> str | None:
        """失败明细 csv 留档（90 天，NFR-02）。"""
        try:
            from services.market.import_task_service import UPLOAD_DIR

            archive_dir = Path(UPLOAD_DIR) / "bd_archive"
            archive_dir.mkdir(parents=True, exist_ok=True)
            timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
            path = archive_dir / f"bd_failed_{task_id}_{timestamp}.csv"
            with path.open("w", encoding="utf-8-sig", newline="") as f:
                writer = csv.DictWriter(f, fieldnames=["community", "error"])
                writer.writeheader()
                writer.writerows(failed_rows)
        except Exception:
            logger.exception("写入失败明细 csv 失败")
            return None
        else:
            return f"/api/v1/admin/building-dictionary/import/{path.name}/failed-csv"
