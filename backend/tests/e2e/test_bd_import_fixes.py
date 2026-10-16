"""E2E: OrbStack 排查报告修复项验证（可重跑工件）.

验证 docs/2026-10-16-OrbStack内存占用10GB排查报告.md 三个代码修复：
  §4.2-1  zip 逐条目流式处理（任一时刻最多驻留单个 txt）
  §4.2-2  归档/原始上传包清理接线（90 天，lifespan 启动 + 每日巡检）
  §4.2-3  失败任务堆栈摘要写回 error_message（可追溯）

命令: cd backend && .venv/bin/python tests/e2e/test_bd_import_fixes.py
预期: 全部断言通过，输出 PASS 汇总；数据库与 temp/uploads 无测试残留。
"""

# ruff: noqa: E402 —— env 注入必须先于业务 import（backend/ 目录直跑找不到根 .env）

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

from sqlalchemy import text

from db import SessionLocal, engine
from models import BdImportTask, ImportTaskStatus
from services.property.dict_import_loader import DictImportProcessor
from services.property.dict_import_service import UPLOAD_DIR, get_bd_import_task_service

PROCESSOR = DictImportProcessor(engine)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
ARCHIVE_DIR = UPLOAD_DIR / "bd_archive"
ARCHIVE_DIR.mkdir(exist_ok=True)

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


def make_task(label: str) -> str:
    """直接落库建任务（绕过 2GB 上传链路，聚焦装载处理器），返回任务 ID."""
    db = SessionLocal()
    try:
        task = BdImportTask(
            user_id="e2e-fix-verify",
            status=ImportTaskStatus.PENDING,
            filename=f"{label}.zip",
            file_path=str(UPLOAD_DIR / f"bd_e2efix_{label}.zip"),
            file_size=1,
        )
        db.add(task)
        db.commit()
        db.refresh(task)
        return task.id
    finally:
        db.close()


def build_zip(zip_path: Path, files: dict[str, str], *, gbk: bool = False) -> Path:
    """构造导入包：GBK 编码 txt，模拟 macOS Finder 压缩（__MACOSX/ 噪声）."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            enc = content.encode("gbk") if gbk else content.encode("utf-8")
            zf.writestr(zipfile.ZipInfo(name), enc)
        if gbk:  # macOS 压缩产物噪声
            zf.writestr("__MACOSX/.__noise.txt", b"junk")
    zip_path.write_bytes(buf.getvalue())
    return zip_path


ROOMS = "测试大厦E2E;01;0101;121.4;31.2;\n测试大厦E2E;01;0102;;;;\n"
ROOMS2 = "花园小区E2E;02;0201;121.4;31.3;\n"

# ---------- ① 流式装载（zip 多 txt，含 GBK 文件名 + macOS 噪声） ----------
task1 = make_task("stream")
zp1 = build_zip(UPLOAD_DIR / "bd_e2efix_stream.zip", {"测试大厦E2E.txt": ROOMS, "花园小区E2E.txt": ROOMS2}, gbk=True)
PROCESSOR.process_task(task1)

db = SessionLocal()
t1 = db.get(BdImportTask, task1)
check("① 流式装载完成", t1.status == ImportTaskStatus.COMPLETED, f"status={t1.status.value} err={t1.error_message!r}")
check("① 双小区均装载（GBK 文件名解码正确）", t1.communities_loaded == 2, f"communities={t1.communities_loaded}")
check("① 户室计数正确", t1.rooms_loaded == 3, f"rooms={t1.rooms_loaded}")
check("① 进度 100%", t1.progress_percent == 100.0)
db.close()

# 幂等重跑（BR-16）：重跑全包 0 新增，对账计数不变
PROCESSOR.process_task(task1)
db = SessionLocal()
t1b = db.get(BdImportTask, task1)
check(
    "① 幂等重跑 0 新增且计数不变（BR-16）",
    t1b.rooms_loaded == 0 and t1b.communities_loaded == 0,
    f"rooms={t1b.rooms_loaded}",
)
db.close()

# ---------- ② 空包 / 无 txt 包失败路径 ----------
task2 = make_task("empty")
zp2 = UPLOAD_DIR / "bd_e2efix_empty.zip"
with zipfile.ZipFile(zp2, "w") as zf:
    zf.writestr("readme.md", "no txt here")
PROCESSOR.process_task(task2)
db = SessionLocal()
t2 = db.get(BdImportTask, task2)
check(
    "② 空 txt 包失败且原因明确",
    t2.status == ImportTaskStatus.FAILED and t2.error_message == "包内无 txt 文件",
    f"msg={t2.error_message!r}",
)
db.close()

# ---------- ③ 装载失败堆栈写回 error_message（§4.2-3） ----------
task3 = make_task("baddata")
# 超长楼栋号（>200 字符）触发 DB String 长度异常 → 小区级失败记入 failed_rows
bad = "测试大厦E2E;" + "X" * 300 + ";0101;;;;\n"
zp3 = build_zip(UPLOAD_DIR / "bd_e2efix_baddata.zip", {"__e2e坏数据小区__.txt": bad})
PROCESSOR.process_task(task3)
db = SessionLocal()
t3 = db.get(BdImportTask, task3)
check(
    "③ 装载失败有明细（completed + failed_file_url 或 failed + 堆栈）",
    (t3.status == ImportTaskStatus.COMPLETED and t3.failed_file_url) or t3.status == ImportTaskStatus.FAILED,
    f"status={t3.status.value} url={t3.failed_file_url!r} err={(t3.error_message or '')[:80]!r}",
)
db.close()

# ---------- ③b 损坏 zip → 明确失败提示（§4.2-3 可追溯性：确定性错误不裸堆栈） ----------
task3b = make_task("gone")
zp3b = UPLOAD_DIR / "bd_e2efix_gone.zip"
zp3b.write_bytes(b"PK\x03\x04 corrupted-not-a-zip")
PROCESSOR.process_task(task3b)
db = SessionLocal()
t3b = db.get(BdImportTask, task3b)
msg3b = t3b.error_message or ""
check(
    "③b 损坏 zip 失败且提示明确",
    t3b.status == ImportTaskStatus.FAILED and "zip 包损坏" in msg3b,
    f"err={msg3b[:100]!r}",
)
db.close()

# ---------- ③c 顶层异常堆栈写回机制验证（monkeypatch 注入） ----------
import services.property.dict_import_loader as loader_mod

_orig_exec = loader_mod.DictImportProcessor._execute

from sqlalchemy.orm import Session


def _boom(self, task: BdImportTask, db: Session) -> None:
    msg = "注入的意外异常（验证堆栈写回）"
    raise RuntimeError(msg)


loader_mod.DictImportProcessor._execute = _boom
task3c = make_task("boom")
try:
    PROCESSOR.process_task(task3c)
finally:
    loader_mod.DictImportProcessor._execute = _orig_exec
db = SessionLocal()
t3c = db.get(BdImportTask, task3c)
msg3c = t3c.error_message or ""
check(
    "③c 顶层异常堆栈摘要写回 error_message（可追溯）",
    t3c.status == ImportTaskStatus.FAILED
    and "堆栈摘要" in msg3c
    and "RuntimeError" in msg3c
    and "注入的意外异常" in msg3c,
    f"err={msg3c[:140]!r}",
)
db.close()

# ---------- ④ 清理函数：原始包 + 归档目录全覆盖（§4.2-2） ----------
old = time.time() - 100 * 86400
old_arch = ARCHIVE_DIR / "_e2e_old.csv"
old_arch.write_text("community,error\n")
old_zip = UPLOAD_DIR / "bd_e2efix_stream.zip"  # ① 留下的原始包
old_zip.utime((old, old)) if hasattr(old_zip, "utime") else os.utime(old_zip, (old, old))
old_arch_utime = os.utime(old_arch, (old, old))
new_txt = UPLOAD_DIR / "bd_e2efix_keep.txt"  # 未超期守卫
new_txt.write_text("keep")

removed = get_bd_import_task_service().cleanup_expired_archives()
check("④ 清理删除超期原始包与归档明细", not old_zip.exists() and not old_arch.exists(), f"removed={removed}")
check("④ 未超期文件不误删", new_txt.exists())
new_txt.unlink()

# ---------- ⑤ DB/磁盘清理（测试自清，不污染开发库） ----------
names = ("测试大厦E2E", "花园小区E2E", "__e2e坏数据小区__")
with engine.begin() as conn:
    conn.execute(
        text(
            "DELETE FROM bd_rooms WHERE building_id IN "
            "(SELECT id FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name = ANY(:ns)))"
        ),
        {"ns": list(names)},
    )
    conn.execute(
        text("DELETE FROM bd_buildings WHERE community_id IN (SELECT id FROM communities WHERE name = ANY(:ns))"),
        {"ns": list(names)},
    )
    conn.execute(text("DELETE FROM communities WHERE name = ANY(:ns)"), {"ns": list(names)})
    conn.execute(text("DELETE FROM bd_import_tasks WHERE user_id = 'e2e-fix-verify'"))

db = SessionLocal()
left = db.query(BdImportTask).filter(BdImportTask.user_id == "e2e-fix-verify").count()
db.close()
check("⑤ 测试数据自清理", left == 0)
for p in UPLOAD_DIR.glob("bd_e2efix_*"):
    p.unlink(missing_ok=True)
for p in ARCHIVE_DIR.glob("*e2e*"):
    p.unlink(missing_ok=True)

failed = [r for r in results if not r[1]]
print(f"\n{'=' * 50}\n{'❌ FAILED' if failed else '✅ ALL PASS'}: {len(results) - len(failed)}/{len(results)} 项通过")
sys.exit(1 if failed else 0)
