"""楼盘字典导入装载服务（SRS FR-08 / R2）.

四步导入管线：上传 → 解析校验（预扫描 + 异常清单）→ 异步装载 → 对账报告。

装载管线（NFR-01/02）：
- GBK txt → 临时 CSV → PostgreSQL COPY（733 万行批量装载）；
- 逐小区事务：小区/楼栋/户室单小区一批，失败仅回滚当前小区；
- 按 name / uq(community_id, building_no) / uq(building_id, room_no) upsert 幂等
  （BR-16：同包重跑计数不变）；
- 失败行写 csv 明细可下载，归档 90 天（由部署侧清理策略承担）。

楼栋号/户室号保留原始串（BR-02/03）；楼层解析前两位（utils.building_dict.parse_room_floor）；
坐标 BD-09 原样落库（BR-18）。
"""

import csv
import logging
import tempfile
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from models import BdImportTask, ImportTaskStatus
from services.property.dict_parser import detect_encoding, parse_community_txt
from utils.building_dict import parse_room_floor

logger = logging.getLogger(__name__)

# 单包大小上限（FR-08：≤ 2GB）
MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024
# M3 修复：zip 解压后总大小上限（zip bomb 防护），正常上海全域原始包远小于此
MAX_UNCOMPRESSED_TOTAL = 4 * 1024 * 1024 * 1024
_ZIP_BOMB_MSG = "zip 包解压后总大小超限（4GB），疑似异常包"

# 失败明细/原始包归档天数（NFR-02）
ARCHIVE_DAYS = 90


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
            self._mark_failed(db, task_id, "装载失败，详见服务日志")
        finally:
            db.close()

    def _execute(self, task: BdImportTask, db: Session) -> None:
        """执行装载：解包 → 逐小区解析 → COPY 装载 → 对账."""
        file_path = Path(task.file_path)
        if not file_path.exists():
            self._mark_failed(db, task.id, "文件不存在")
            return

        # 解包：zip → 逐 txt；单 txt 直接处理。
        # M3 修复：限制解压后总大小（zip bomb 防护）——原实现无上限，
        # 恶意压缩包可膨胀至磁盘/内存耗尽。
        txt_entries: list[tuple[str, bytes]] = []
        if file_path.suffix.lower() == ".zip":
            with zipfile.ZipFile(file_path) as zf:
                for info in zf.infolist():
                    if info.is_dir() or not info.filename.lower().endswith(".txt"):
                        continue
                    if sum(s for _, s in txt_entries) + info.file_size > MAX_UNCOMPRESSED_TOTAL:
                        raise ValueError(_ZIP_BOMB_MSG) from None
                    txt_entries.append((Path(info.filename).name, zf.read(info)))
        else:
            # 小区名取自「原始上传文件名」的扩展名前部分；
            # 上传落盘时文件已被重命名为 bd_{task_id}.txt，不能直接用存盘名
            original_name = Path(task.filename).name if task.filename else file_path.name
            txt_entries.append((original_name, file_path.read_bytes()))

        total_communities = len(txt_entries)
        if total_communities == 0:
            self._mark_failed(db, task.id, "包内无 txt 文件")
            return

        stats = DictImportStats()
        failed_rows: list[dict[str, str]] = []

        for idx, (filename, data) in enumerate(txt_entries, start=1):
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
