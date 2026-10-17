"""E2E: 楼盘字典全量导入承载力报告 L2 修复验证（可重跑工件）.

验证 docs 承载力报告（2026-10-16 v2）L2 修复项：
  L2-① 流式解压（前次已修）：多 txt 包逐条目装载（任一时刻最多驻留单个 txt）
  L2-② 上传互斥（M5）：pending/processing 任务存在时二次上传 → HTTP 409；
        无进行中任务时正常创建 → 201；并发创建仅 1 个成功
  L2-④ 任务恢复（M7）：遗留 processing 任务被启动迁移标记 failed（可重跑文案）
  L2-⑥ 口径对齐（M2）：>1GB 解压总量的包装载阶段拒绝（zip bomb 防线对齐 512m）
  审查补缺（2026-10-17）：包内单个声明 600MB 的 txt 被单条目防线拒绝
  H1（2026-10-17 性能与安全专项审查）：单条目上限 512MB → 16MB（解析放大 13.1× 反算）

命令: cd backend && .venv/bin/python tests/e2e/test_bd_capacity_fixes.py
预期: 全部断言通过，输出 PASS 汇总；数据库/temp/uploads 无测试残留。
"""

# ruff: noqa: E402 —— env 注入必须先于业务 import（backend/ 目录直跑找不到根 .env）

import concurrent.futures
import io
import os
import sys
import time
import zipfile
from pathlib import Path

sys.path.insert(0, ".")

# backend/ 目录直接运行时 pydantic env_file 找不到根 .env，手动注入
for _line in Path("../.env").read_text().splitlines():
    _line = _line.strip()
    if _line and "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())

from fastapi.testclient import TestClient
from sqlalchemy import text

import db
from main import app
from migrations import run_startup_migrations
from models import BdImportTask, ImportTaskStatus
from services.property.dict_import_loader import (
    MAX_SINGLE_ENTRY_BYTES,
    MAX_UNCOMPRESSED_TOTAL,
    DictImportProcessor,
)
from services.property.dict_import_service import UPLOAD_DIR
from utils.auth import AUDIENCE_ADMIN, create_access_token

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


def make_zip_bytes(files: dict[str, str]) -> bytes:
    """构造导入包：GBK txt。"""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content.encode("gbk"))
    return buf.getvalue()


def make_bomb_zip_bytes(target_total: int) -> bytes:
    """造声明解压总量超 target_total 字节的 zip（高压缩数据段，磁盘占用 KB 级）.

    单 txt 声明体积 = 500000B，数量按目标总量倒推；数据段用重复字节
    （ZIP_DEFLATED 压缩后极小），实际落盘仅数百 KB。
    """
    unit_declared = 500_000
    count = target_total // unit_declared + 1
    payload = ("测试大厦L2;01;0101;121.4;31.2;\n" * 8).encode("gbk")
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for i in range(count):
            zf.writestr(zipfile.ZipInfo(f"填充小区{i}.txt"), payload * (unit_declared // len(payload) + 1))
    return buf.getvalue()


ROOMS = "测试大厦L2;01;0101;121.4;31.2;\n测试大厦L2;01;0102;;;;\n"

# ---------- HTTP 层：真实 multipart 上传（admin cookie 认证 + 互斥 409） ----------

conn = db.engine.connect()
row = conn.execute(text("SELECT id, token_version FROM users WHERE username = 'admin' LIMIT 1")).one()
conn.close()
admin_id, admin_ver = str(row[0]), int(row[1])
assert admin_id, "dev 库缺少 admin 用户，无法走 HTTP 层测试"
_token = create_access_token(data={"sub": admin_id, "role": "admin", "ver": admin_ver}, audience=AUDIENCE_ADMIN)

client = TestClient(app, cookies={"access_token": _token})
client.headers["X-Requested-With"] = "XMLHttpRequest"

IMPORT_URL = "/api/v1/admin/building-dictionary/import"


def _cleanup_tasks_and_files() -> None:
    """删除本测试创建的任务行与落盘包（终态任务互斥才不拦截后续用例）。"""
    s = db.SessionLocal()
    try:
        rows = s.query(BdImportTask).filter(BdImportTask.filename.like("%l2e2e%")).all()
        for t in rows:
            Path(t.file_path).unlink(missing_ok=True)
            s.delete(t)
        s.commit()
    finally:
        s.close()


def _wait_terminal(task_id: str) -> ImportTaskStatus:
    """等待任务离开 pending/processing（后台线程处理小包为几十毫秒级）。"""
    for _ in range(100):
        s = db.SessionLocal()
        st = s.get(BdImportTask, task_id).status if task_id else None
        s.close()
        if st in (ImportTaskStatus.COMPLETED, ImportTaskStatus.FAILED):
            return st
        time.sleep(0.05)
    return st  # type: ignore[possibly-undefined]


_cleanup_tasks_and_files()

# ① 无进行中任务 → 201 创建成功
zp1 = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_a.zip"
zp1.write_bytes(make_zip_bytes({"测试大厦L2.txt": ROOMS}))
with zp1.open("rb") as fh:
    r1 = client.post(IMPORT_URL, files={"file": ("l2e2e-a.zip", fh, "application/zip")})
check("① 无进行中任务上传 → 201", r1.status_code == 201, f"status={r1.status_code} body={r1.text[:120]}")
if r1.status_code == 201:
    _wait_terminal(r1.json()["task_id"])

# ② 存在终态任务 → 不拦截，201（互斥只针对 pending/processing）
zp2 = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_b.zip"
zp2.write_bytes(make_zip_bytes({"测试大厦L2.txt": ROOMS}))
with zp2.open("rb") as fh:
    r2 = client.post(IMPORT_URL, files={"file": ("l2e2e-b.zip", fh, "application/zip")})
check("② 仅终态任务不拦截 → 201", r2.status_code == 201, f"status={r2.status_code} body={r2.text[:120]}")
if r2.status_code == 201:
    _wait_terminal(r2.json()["task_id"])

# ③ 并发创建（无任何拦截任务时）：事务级锁覆盖竞态窗口，同一时刻仅 1 个成功
zp3 = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_d.zip"
zp3.write_bytes(make_zip_bytes({"测试大厦L2.txt": ROOMS}))


def _upload_concurrent() -> int:
    with zp3.open("rb") as fh:
        return client.post(IMPORT_URL, files={"file": ("l2e2e-d.zip", fh, "application/zip")}).status_code


with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
    codes = list(ex.map(lambda _: _upload_concurrent(), range(3)))
check("③ 并发 3 请求仅 1 个 201，其余 409", codes.count(201) == 1 and codes.count(409) == 2, f"codes={codes}")

# ④ 手工造一个 processing 任务 → 二次上传 409（互斥），且文件未落盘
s = db.SessionLocal()
processing = BdImportTask(
    user_id=admin_id,
    status=ImportTaskStatus.PROCESSING,
    filename="l2e2e-blocking.zip",
    file_path=str(UPLOAD_DIR / "bd_l2e2e_blocking.zip"),
    file_size=1,
)
s.add(processing)
s.commit()
processing_id = processing.id
s.close()

zp4 = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_c.zip"
zp4.write_bytes(make_zip_bytes({"测试大厦L2.txt": ROOMS}))
with zp4.open("rb") as fh:
    r4 = client.post(IMPORT_URL, files={"file": ("l2e2e-c.zip", fh, "application/zip")})
body4 = r4.json() if r4.headers.get("content-type", "").startswith("application/json") else {}
check("④ 有 processing 任务时上传 → 409", r4.status_code == 409, f"status={r4.status_code} body={r4.text[:120]}")
msg4 = body4.get("message")
check("④ 409 响应带统一 message", msg4 == "已有导入任务进行中，请等待完成后再上传", f"message={msg4!r}")
orphan = list(UPLOAD_DIR.glob("bd_*l2e2e-c.zip"))
check("④ 被拒上传未落盘残留", not orphan, f"leftover={[p.name for p in orphan]}")

# 清理 processing 拦截任务
s = db.SessionLocal()
t = s.get(BdImportTask, processing_id)
if t:
    s.delete(t)
    s.commit()
s.close()

# ---------- 装载层 ----------
processor = DictImportProcessor(db.engine)

# ⑤ L2-④ 任务恢复迁移：置遗留 processing 任务 → run_startup_migrations → failed
s = db.SessionLocal()
stale = BdImportTask(
    user_id="l2-e2e-recover",
    status=ImportTaskStatus.PROCESSING,
    filename="l2e2e-stale.zip",
    file_path=str(UPLOAD_DIR / "bd_l2e2e_stale.zip"),
    file_size=1,
    error_message=None,
)
s.add(stale)
s.commit()
stale_id = stale.id
s.close()
run_startup_migrations(db.engine)
s = db.SessionLocal()
t = s.get(BdImportTask, stale_id)
status5 = t.status.value if t else None
ok5 = t is not None and t.status == ImportTaskStatus.FAILED
check("⑤ 遗留 processing 任务被恢复迁移标记 failed", ok5, f"status={status5}")
msg5 = (t.error_message or "") if t else ""
check("⑤ 失败原因含可重跑指引", "服务重启中断" in msg5 and "重传同一文件" in msg5, f"msg={msg5[:60]!r}")
s.close()

# ⑥ L2-① 流式解压回归：多 txt 包逐条目装载完成（小区名解码 + 全部处理）
zp6 = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_stream.zip"
zp6.write_bytes(make_zip_bytes({"测试大厦L2.txt": ROOMS, "花园小区L2.txt": "花园小区L2;02;0201;121.4;31.3;\n"}))
s = db.SessionLocal()
task6 = BdImportTask(
    user_id="l2-e2e-stream",
    status=ImportTaskStatus.PENDING,
    filename="l2e2e-stream.zip",
    file_path=str(zp6),
    file_size=zp6.stat().st_size,
)
s.add(task6)
s.commit()
task6_id = task6.id
s.close()
processor.process_task(task6_id)
s = db.SessionLocal()
t6 = s.get(BdImportTask, task6_id)
names6 = [r[0] for r in s.execute(text("SELECT name FROM communities WHERE name IN ('测试大厦L2','花园小区L2')")).all()]
s.close()
# 幂等重跑安全：断言处理数与落库存在性，不断言新增计数（重跑时小区已存在）
ok6 = t6.status == ImportTaskStatus.COMPLETED and t6.processed_communities == 2 and not t6.failed_file_url
detail6 = f"status={t6.status.value} processed={t6.processed_communities} err={t6.error_message!r}"
check("⑥ 流式解压多 txt 装载完成（无失败小区）", ok6, detail6)
check("⑥ 两个小区均落库（GBK 文件名解码正确）", len(names6) == 2, f"names={names6}")

# ⑦ L2-⑥ 解压总量超 1GB → 装载阶段拒绝（zip bomb 防线对齐 512m 承载力）
# 声明总量 ~1.05GB（500KB × 2101 个 txt），数据段高压缩磁盘仅数百 KB；
# 若防线失效会真实装载（哨兵名「填充小区」由 ⑨ 清理断言兜底检出）
zp7 = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_bomb.zip"
zp7.write_bytes(make_bomb_zip_bytes(MAX_UNCOMPRESSED_TOTAL + 50 * 1024 * 1024))
s = db.SessionLocal()
task7 = BdImportTask(
    user_id="l2-e2e-bomb",
    status=ImportTaskStatus.PENDING,
    filename="l2e2e-bomb.zip",
    file_path=str(zp7),
    file_size=zp7.stat().st_size,
)
s.add(task7)
s.commit()
task7_id = task7.id
s.close()
processor.process_task(task7_id)
s = db.SessionLocal()
t7 = s.get(BdImportTask, task7_id)
msg7 = t7.error_message or ""
ok7 = t7.status == ImportTaskStatus.FAILED and "超限" in msg7 and "1GB" in msg7
check("⑦ 声明解压总量 >1GB 的包被拒绝", ok7, f"status={t7.status.value} msg={msg7[:80]!r}")
s.close()

# ⑦b 审查补缺防线：包内仅一个声明 600MB 的 txt（总量 <1GB 不触发总量防线，
# 单条目防线拦截）。声明体积仅元数据，真实数据段高压缩磁盘 KB 级，
# 若防线失效会真实读入 600MB（哨兵名由 ⑨ 兑底检出）
buf7b = io.BytesIO()
with zipfile.ZipFile(buf7b, "w", zipfile.ZIP_DEFLATED) as zf:
    payload = ("测试大厦L2;01;0101;121.4;31.2;\n" * 8).encode("gbk")
    zf.writestr(zipfile.ZipInfo("巨型单条目.txt"), payload * (600 * 1024 * 1024 // len(payload) + 1))
zp7b = UPLOAD_DIR / f"bd_l2e2e_{os.getpid()}_single_entry_bomb.zip"
zp7b.write_bytes(buf7b.getvalue())
s = db.SessionLocal()
task7b = BdImportTask(
    user_id="l2-e2e-bomb-single",
    status=ImportTaskStatus.PENDING,
    filename="l2e2e-single-bomb.zip",
    file_path=str(zp7b),
    file_size=zp7b.stat().st_size,
)
s.add(task7b)
s.commit()
task7b_id = task7b.id
s.close()
processor.process_task(task7b_id)
s = db.SessionLocal()
t7b = s.get(BdImportTask, task7b_id)
msg7b = t7b.error_message or ""
ok7b = t7b.status == ImportTaskStatus.FAILED and "单个文件" in msg7b and "超限" in msg7b
check(
    "⑦b 包内单个声明 600MB 的 txt 被单条目防线拒绝",
    ok7b,
    f"status={t7b.status.value} msg={msg7b[:80]!r} (声明 {600}MB > 上限 {MAX_SINGLE_ENTRY_BYTES // 1024 // 1024}MB)",
)
s.close()
zp7b.unlink(missing_ok=True)

# ⑧ 上海包正常口径自查：常数关系（网关 100M × 实测压缩率 6.8 ≈ 680MB < 1GB 上限）
ok8 = MAX_UNCOMPRESSED_TOTAL > 100 * 1024 * 1024 * 6.8
mb8 = MAX_UNCOMPRESSED_TOTAL // 1024 // 1024
check("⑧ 1GB 防线容纳网关口径（100M×6.8≈680MB）", ok8, f"MAX_UNCOMPRESSED_TOTAL={mb8}MB")

# ---------- 清理（DB + 磁盘，保证可重跑） ----------
_cleanup_tasks_and_files()
for p in UPLOAD_DIR.glob("bd_l2e2e_*"):
    p.unlink(missing_ok=True)
s = db.SessionLocal()
left_tasks = s.query(BdImportTask).filter(BdImportTask.user_id.like("l2-e2e%")).count()
s.close()
with db.engine.begin() as c:
    c.execute(
        text(
            "DELETE FROM bd_rooms WHERE building_id IN "
            "(SELECT id FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name LIKE '%L2'))"
        )
    )
    c.execute(text("DELETE FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name LIKE '%L2')"))
    c.execute(text("DELETE FROM communities WHERE name LIKE '%L2'"))
with db.engine.connect() as c:
    # 哨兵：防线失效时「填充小区」会被真实装载，此处计数暴露防线回归
    leftover_filler = c.execute(text("SELECT count(*) FROM communities WHERE name LIKE '填充小区%'")).scalar()
ok9 = left_tasks == 0 and leftover_filler == 0
check("⑨ 测试数据自清理（含防线失效哨兵）", ok9, f"leftover_tasks={left_tasks} leftover_filler={leftover_filler}")

failed = [r for r in results if not r[1]]
print(f"\n{'=' * 50}\n{'❌ FAILED' if failed else '✅ ALL PASS'}: {len(results) - len(failed)}/{len(results)} 项通过")
sys.exit(1 if failed else 0)
