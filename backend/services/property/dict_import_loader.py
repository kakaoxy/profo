"""楼盘字典导入装载服务（SRS FR-08 / R2）.

四步导入管线：上传 → 解析校验（预扫描 + 异常清单）→ 异步装载 → 对账报告。

装载管线（NFR-01/02）：
- GBK txt → 临时 CSV → PostgreSQL COPY（733 万行批量装载）；
- 逐小区事务：小区/楼栋/户室单小区一批，失败仅回滚当前小区；
- 按 name / uq(community_id, building_no) / uq(building_id, room_no) upsert 幂等
  （BR-16：同包重跑计数不变）；
- 失败行写 csv 明细可下载，归档 90 天（bd_archive 目录，应用内启动 + 每日巡检清理）；
- zip 包逐条目流式处理（任一时刻最多驻留单个 txt，OrbStack 排查报告 §4.2-1）。
- 单包解压总量上限 1GB、单条目（单 txt）解压上限 512MB，与 backend 容器
  512m 承载力对齐（承载力报告 v2 §4；单条目防线为 2026-10-17 审查补缺）。
- 上传互斥：同一时刻仅允许一个 pending/processing 任务（承载力报告 M5/L2-②）。

楼栋号/户室号保留原始串（BR-02/03）；楼层解析前两位（utils.building_dict.parse_room_floor）；
坐标 BD-09 原样落库（BR-18）。
"""

import csv
import logging
import tempfile
import traceback
import uuid
import zipfile
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from models import BdImportTask, ImportTaskStatus
from services.property.dict_parser import detect_encoding, parse_community_txt
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
# zf.read() 一次读入 + parse_community_txt 的 splitlines/rooms 列表约 3-4×
# 膨胀后仍可冲垮 512m 容器。上限取总量防线的一半（512MB，数值与容器
# mem_limit 对齐便于记忆）；单 txt 直传按落盘实际大小同口径拦截。合法数据
# 不受影响：本数据集实测最大单 txt 约 313KB（承载力报告 §4）。
MAX_SINGLE_ENTRY_BYTES = 512 * 1024 * 1024
_SINGLE_ENTRY_LIMIT_MSG = "zip 内单个文件解压后超限（512MB），疑似异常包，请检查数据或分批导入"

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


class DictImportStats:
    """导入对账三计数."""

    __slots__ = ("buildings", "communities", "rooms")

    def __init__(self) -> None:
        """初始化计数."""
        self.communities = 0
        self.buildings = 0
        self.rooms = 0

    def as_dict(self) -> dict[str, int]:
        """返回对账字典."""
        return {"communities": self.communities, "buildings": self.buildings, "rooms": self.rooms}


def load_community_by_copy(
    engine: Engine,
    *,
    community_name: str,
    property_types: list[str],
    era_from: int | None,
    era_to: int | None,
    property_mgmt: str | None,
    developer: str | None,
    district_area: str | None,  # noqa: ARG001 区域板块仅展示用，落库不单独存列
    address: str | None,
    ring: str | None,
    lng: float | None,
    lat: float | None,
    rooms: list[tuple[str, str, float | None, float | None]],
) -> DictImportStats:
    """单小区事务装载（幂等 upsert）.

    事务内：
    1. communities 按 name upsert（跨批次重名小区按最新批次更新画像列，
       已有画像值不覆盖为空 —— 幂等且保留人工修正）；
    2. bd_buildings 按 uq(community_id, building_no) upsert；
    3. bd_rooms 临时 CSV → COPY 进 staging 表 → INSERT ... ON CONFLICT DO NOTHING
       （uq(building_id, room_id) 冲突跳过，BR-16）。

    Returns:
        本次实际新增的对账计数（幂等重跑时全部为增量 0）

    """
    stats = DictImportStats()
    with engine.begin() as conn:
        # 1. communities upsert（source=import 废止 → 不写 source；画像列 COALESCE 保留已有值）
        #    id 为应用层 UUID（ORM default），COPY 链路需显式生成
        row = conn.execute(
            text(
                """
                INSERT INTO communities
                    (id, name, property_types, era_from, era_to, property_mgmt, developer,
                     address, ring, lng, lat, is_active, total_properties, created_at, updated_at)
                VALUES
                    (:id, :name, :property_types, :era_from, :era_to, :property_mgmt, :developer,
                     :address, :ring, :lng, :lat, true, 0, now(), now())
                ON CONFLICT (name) DO UPDATE SET
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
        first_coords: dict[str, tuple[float | None, float | None]] = {}
        for building_no, _room_no, r_lng, r_lat in rooms:
            if building_no not in first_coords and (r_lng is not None or r_lat is not None):
                first_coords[building_no] = (r_lng, r_lat)

        building_rows = sorted({b for b, _r, _lng, _lat in rooms})
        for building_no in building_rows:
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
        if rooms:
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
                for building_no, room_no, _r_lng, _r_lat in rooms:
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

    def _iter_txt_entries(self, file_path: Path, task: BdImportTask) -> tuple[Iterator[tuple[str, bytes]], int]:
        """构造 txt 条目迭代器（报告 §4.2-1 流式修复）.

        zip：先按中央目录扫描（只读元数据，不读数据）过滤 txt 条目并做
        zip bomb 防护（声明解压总大小累加），返回逐条目惰性解压迭代器——
        任一时刻最多驻留单个 txt，消除原实现全包 read() 驻留内存隐患。
        单 txt：返回单元素迭代器，小区名取「原始上传文件名」（存盘名已被
        重命名为 bd_{task_id}.txt，不能直接用）。

        Returns:
            (条目迭代器 (文件名, 全部字节)，总条目数)。总条目数来自中央
            目录/单文件分支，不消耗迭代器。

        Raises:
            ValueError: 声明解压总大小超 MAX_UNCOMPRESSED_TOTAL（zip bomb 防护）。

        """
        if file_path.suffix.lower() != ".zip":
            # 单 txt 直传：按落盘实际大小做单文件拦截（与 zip 条目同口径），
            # 在 read_bytes() 读入内存前拒绝
            if file_path.stat().st_size > MAX_SINGLE_ENTRY_BYTES:
                raise ValueError(_SINGLE_ENTRY_LIMIT_MSG) from None
            # 小区名取自「原始上传文件名」的扩展名前部分
            original_name = Path(task.filename).name if task.filename else file_path.name
            return iter([(original_name, file_path.read_bytes())]), 1

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
    def _iter_zip_txt(file_path: Path, infos: list[zipfile.ZipInfo]) -> Iterator[tuple[str, bytes]]:
        """逐条目惰性解压 zip 内 txt（每打开一次 ZipFile，读一个条目即释放）."""
        with zipfile.ZipFile(file_path) as zf:
            for info in infos:
                yield Path(_decode_zip_name(info)).name, zf.read(info)

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

        stats = DictImportStats()
        failed_rows: list[dict[str, str]] = []

        for idx, (filename, data) in enumerate(entries, start=1):
            community_name = filename[:-4] if filename.lower().endswith(".txt") else filename
            try:
                content = detect_encoding(data)
                parsed = parse_community_txt(content, community_name)
                loaded = load_community_by_copy(
                    self.engine,
                    community_name=parsed.name,
                    property_types=parsed.property_types,
                    era_from=parsed.era_from,
                    era_to=parsed.era_to,
                    property_mgmt=parsed.property_mgmt,
                    developer=parsed.developer,
                    district_area=parsed.district_area,
                    address=parsed.address,
                    ring=parsed.ring,
                    lng=next((r[2] for r in parsed.rooms if r[2] is not None), None),
                    lat=next((r[3] for r in parsed.rooms if r[3] is not None), None),
                    rooms=parsed.rooms,
                )
                stats.communities += loaded.communities
                stats.buildings += loaded.buildings
                stats.rooms += loaded.rooms
            except Exception as e:
                logger.exception("小区装载失败: %s", community_name)
                failed_rows.append({"community": community_name, "error": str(e)[:500]})

            # 进度实时更新（NFR-01 可关闭页面，异步任务承担）
            task.processed_communities = idx
            task.communities_loaded = stats.communities
            task.buildings_loaded = stats.buildings
            task.rooms_loaded = stats.rooms
            task.progress_percent = round(idx / total_communities * 100, 2)
            db.commit()

        # 收尾
        task.status = ImportTaskStatus.COMPLETED
        task.progress_percent = 100.0
        task.completed_at = datetime.now(timezone.utc)
        if task.started_at:
            task.processing_duration = (task.completed_at - task.started_at).total_seconds()
        if failed_rows:
            task.failed_file_url = self._write_failed_csv(task.id, failed_rows)
            task.error_message = f"{len(failed_rows)} 个小区装载失败，详见失败明细"
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
