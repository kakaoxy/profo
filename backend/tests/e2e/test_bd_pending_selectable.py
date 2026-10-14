"""E2E 录入端 pending 楼栋/户室可选与楼层解析回归.

通过真实 API 验证（对应 dict-address-picker「pending 项不阻塞录入」改动）：
- 楼栋详情 pending 户室 floor 从户室号解析（0601→6，与楼层分组口径一致）；
- 楼层分组并入 pending 户室楼层（has_pending=True）；
- pending_building 父级链：待审楼栋下可继续提交户室（BR-28）；
- 线索携带 new_building/new_room 创建 → 同名 pending 幂等复用 + 引用回填（FR-19/BR-13）。
"""

# ruff: noqa: E402, FBT003, S310
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000/api/v1"

sys.path.insert(0, ".")
from sqlalchemy import text as text_f

from db import SessionLocal as SessionLocalF
from models import BdPendingReference, BdReferenceStatus

FAILURES: list[str] = []


def req(method, path, body=None, token=None, qs=None):
    """最小 HTTP 客户端（同 test_bd_review_api.py 模式）."""
    url = BASE + path
    if qs:
        url += "?" + urllib.parse.urlencode(qs)
    r = urllib.request.Request(url, method=method)
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, data) as resp:
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def check(cond: bool, label: str, actual: object, expected: object) -> bool:
    """逐条记录通过/失败，打印实际值 vs 期望值（不中断后续步骤）."""
    ok = bool(cond)
    print(f"  {label}: 实际={actual!r} 期望={expected!r} {'✓' if ok else '✗'}")
    if not ok:
        FAILURES.append(f"{label}: 实际={actual!r} 期望={expected!r}")
    return ok


def dump_func(path: str, name: str, after: int = 70) -> None:
    """失败时打印源码定位（供缺陷定位用）."""
    with Path(path).open(encoding="utf-8") as f:
        lines = f.readlines()
    start = None
    for i, ln in enumerate(lines):
        if ln.strip().startswith(f"def {name}") or f"def {name}(" in ln:
            start = i
            break
    if start is None:
        print(f"  (未找到 {path}:{name})")
        return
    print(f"  --- {path} {name} 相关代码行 ---")
    for j in range(max(0, start), min(len(lines), start + after)):
        print(f"  {path}:{j + 1}: {lines[j].rstrip()}")


def cleanup() -> None:
    """按前缀清理本次测试数据（幂等，可重复执行）."""
    db = SessionLocalF()
    try:
        db.execute(
            text_f(
                "DELETE FROM bd_pending_references WHERE pending_id IN "
                "(SELECT id FROM bd_pending_entries WHERE community_id IN "
                "(SELECT id FROM communities WHERE name LIKE '__E2E_PS%'))"
            )
        )
        db.execute(
            text_f(
                "DELETE FROM bd_pending_entries WHERE community_id IN "
                "(SELECT id FROM communities WHERE name LIKE '__E2E_PS%')"
            )
        )
        db.execute(text_f("DELETE FROM leads WHERE community_name LIKE '__E2E_PS%'"))
        db.execute(
            text_f(
                "DELETE FROM bd_rooms WHERE building_id IN "
                "(SELECT id FROM bd_buildings WHERE community_id IN "
                "(SELECT id FROM communities WHERE name LIKE '__E2E_PS%'))"
            )
        )
        db.execute(
            text_f(
                "DELETE FROM bd_buildings WHERE community_id IN "
                "(SELECT id FROM communities WHERE name LIKE '__E2E_PS%')"
            )
        )
        db.execute(text_f("DELETE FROM communities WHERE name LIKE '__E2E_PS%'"))
        db.commit()
    finally:
        db.close()


# ==================== 登录 ====================
r = urllib.request.Request(
    BASE + "/auth/token",
    data=urllib.parse.urlencode({"username": "admin", "password": "Fdd123.."}).encode(),
    method="POST",
)
r.add_header("Content-Type", "application/x-www-form-urlencoded")
token = json.loads(urllib.request.urlopen(r).read())["access_token"]
print("1. 登录 OK")

ts = str(int(time.time()))
comm_name = f"__E2E_PS小区_{ts}__"
building_no = "__E2E_PSB1__"
room_no = "0601"

cleanup()

# ==================== a. 建实表小区 + 无户室楼栋 ====================
print(f"\n=== a. 建实表小区/楼栋（{comm_name} {building_no}） ===")
s, comm = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": comm_name, "district": "测试区", "business_circle": "测试商圈"},
    token=token,
)
check(s == 201, "a. 建小区状态码", s, 201)
community_id = comm.get("id") if s == 201 else None
s, _ = req(
    "POST",
    "/admin/building-dictionary/buildings",
    {"community_id": community_id, "building_no": building_no},
    token=token,
)
check(s == 201, "a. 建楼栋状态码", s, 201)
s, blist = req(
    "GET",
    f"/admin/building-dictionary/communities/{community_id}/buildings",
    token=token,
    qs={"keyword": building_no},
)
building_id = None
if s == 200:
    real = [b for b in blist.get("items", []) if not b.get("pending")]
    building_id = real[0]["id"] if real else None
check(building_id is not None, "a. 楼栋 id", building_id, "整数 ID")

# ==================== b. 未建层直接提交 pending 户室 → 楼层从户室号解析 ====================
print(f"\n=== b. pending 户室楼层解析（{room_no}→6 层） ===")
s, proom = req(
    "POST",
    "/admin/building-dictionary/pending",
    {"kind": "room", "name": room_no, "parent_kind": "building", "parent_id": str(building_id)},
    token=token,
)
check(s == 201, "b. 提交 pending 户室状态码", s, 201)

s, detail = req("GET", f"/admin/building-dictionary/buildings/{building_id}", token=token)
prooms = [x for x in detail.get("rooms", []) if x.get("pending")] if s == 200 else []
check(len(prooms) == 1, "b. 楼栋详情含 1 条 pending 户室", len(prooms), 1)
check(
    prooms[0].get("floor") == 6 if prooms else False,
    "b. pending 户室 floor 从户室号解析",
    prooms[0].get("floor") if prooms else None,
    6,
)
check(
    prooms[0].get("plate_no") == "601" if prooms else False,
    "b. 门牌映射 0601→601",
    prooms[0].get("plate_no") if prooms else None,
    "601",
)

s, floors = req("GET", f"/admin/building-dictionary/buildings/{building_id}/floors", token=token)
g6 = [g for g in floors if g.get("floor") == 6] if s == 200 else []
check(
    bool(g6) and g6[0].get("has_pending") and g6[0].get("room_count") == 1,
    "b. 楼层分组出现 6 层（has_pending, 1户）",
    g6[0] if g6 else None,
    {"floor": 6, "room_count": 1, "has_pending": True},
)

# ==================== c. pending_building 父级链（待审楼栋下建户室） ====================
print("\n=== c. pending_building 父级链 ===")
s, pbuild = req(
    "POST",
    "/admin/building-dictionary/pending",
    {"kind": "building", "name": "__E2E_PSB2__", "parent_kind": "community", "parent_id": community_id},
    token=token,
)
check(s == 201, "c. 提交 pending 楼栋状态码", s, 201)
pb_id = pbuild.get("pending_id") if s == 201 else None
s, proom2 = req(
    "POST",
    "/admin/building-dictionary/pending",
    {"kind": "room", "name": "0501", "parent_kind": "pending_building", "parent_id": str(pb_id)},
    token=token,
)
check(s == 201, "c. 挂待审楼栋提交户室状态码", s, 201)
check(proom2.get("reused") is False, "c. 新建而非复用", proom2.get("reused"), False)

# ==================== d. 线索携带 new_building/new_room → 幂等复用 + 引用回填 ====================
print("\n=== d. 线索创建 pending 引用回填（选中待审楼栋/户室的真实链路） ===")
s, lead = req(
    "POST",
    "/leads",
    {
        "community_name": comm_name,
        "community_id": community_id,
        "dict_status": "pending",
        "new_building": {"name": "__E2E_PSB2__"},
        "new_room": {"name": "0501"},
        "floor_info": "5层",
        "area": 89,
        "total_price": 500,
    },
    token=token,
)
check(s == 201, "d. 创建线索状态码", s, 201)
lead_id = lead.get("id") if isinstance(lead, dict) else None
lead_status = lead.get("dict_status") if isinstance(lead, dict) else None
check(lead_status == "pending", "d. dict_status pending", lead_status, "pending")

db = SessionLocalF()
refs = []
try:
    refs = (
        db.query(BdPendingReference)
        .filter(
            BdPendingReference.biz_type == "lead",
            BdPendingReference.biz_id == str(lead_id),
            BdPendingReference.status == BdReferenceStatus.OPEN,
        )
        .all()
    )
finally:
    db.close()

if not refs:
    print("  ⚠️ 线索 pending 引用缺失，打印 backend/services/leads/core.py 相关代码行：")
    dump_func("services/leads/core.py", "_submit_dict_pendings")
fields = sorted(r.field for r in refs)
check(fields == ["building_id", "room_id"], "d. 引用字段 building_id+room_id", fields, ["building_id", "room_id"])
check(
    sorted(r.pending_id for r in refs) == sorted({pb_id, proom2.get("pending_id")}) if refs else False,
    "d. 引用挂在待审楼栋/户室条目上",
    sorted(r.pending_id for r in refs) if refs else [],
    sorted({pb_id, proom2.get("pending_id")}),
)
# new_building/new_room 提交应命中同名 open pending 复用（而非新建）
from models import BdEntryStatus, BdPendingEntry

db = SessionLocalF()
try:
    dup_b = (
        db.query(BdPendingEntry)
        .filter(
            BdPendingEntry.kind == "building",
            BdPendingEntry.name == "__E2E_PSB2__",
            BdPendingEntry.status == BdEntryStatus.PENDING,
        )
        .count()
    )
    check(dup_b == 1, "d. 待审楼栋 pending 无重复（幂等复用）", dup_b, 1)
    dup_r = (
        db.query(BdPendingEntry)
        .filter(
            BdPendingEntry.kind == "room",
            BdPendingEntry.name == "0501",
            BdPendingEntry.status == BdEntryStatus.PENDING,
        )
        .count()
    )
    check(dup_r == 1, "d. 待审户室 pending 无重复（幂等复用）", dup_r, 1)
finally:
    db.close()

# ==================== e. 三位户室号楼层解析（202→2 层，与实表户室同层） ====================
print("\n=== e. 三位户室号楼层解析 ===")
s, proom3 = req(
    "POST",
    "/admin/building-dictionary/pending",
    {"kind": "room", "name": "202", "parent_kind": "building", "parent_id": str(building_id)},
    token=token,
)
check(s == 201, "e. 提交 3 位 pending 户室状态码", s, 201)

# 复现用户场景：批量补录 2 楼 01-04 室（实表），202 应与 0201-0204 归同层而非「楼层待定」
s, _ = req(
    "POST",
    f"/admin/building-dictionary/buildings/{building_id}/rooms",
    {"building_id": building_id, "floor": "2", "room_suffix": "01-04"},
    token=token,
)
check(s == 201, "e. 批量补录 2 层 01-04 室状态码", s, 201)

s, detail3 = req("GET", f"/admin/building-dictionary/buildings/{building_id}", token=token)
p202 = next((x for x in detail3.get("rooms", []) if x.get("pending") and x.get("room_no") == "202"), None)
check(p202 is not None, "e. 楼栋详情含 pending 202", p202 is not None, True)
check(
    p202 is not None and p202.get("floor") == 2,
    "e. 202 楼层解析为 2（不再楼层待定）",
    p202.get("floor") if p202 else None,
    2,
)
check(
    p202 is not None and p202.get("plate_no") == "202",
    "e. 门牌 3 位号原样展示",
    p202.get("plate_no") if p202 else None,
    "202",
)

s, floors3 = req("GET", f"/admin/building-dictionary/buildings/{building_id}/floors", token=token)
g2 = next((g for g in floors3 if g.get("floor") == 2), None) if s == 200 else None
check(
    g2 is not None and g2.get("room_count") == 5 and g2.get("has_pending"),
    "e. 2 层组 = 0201-0204 实表 4 户 + 202 pending",
    g2,
    {"floor": 2, "room_count": 5, "has_pending": True},
)

# 非标号（含非数字）仍归「楼层待定」
s, pnonstd = req(
    "POST",
    "/admin/building-dictionary/pending",
    {"kind": "room", "name": "1-2楼", "parent_kind": "building", "parent_id": str(building_id)},
    token=token,
)
check(s == 201, "e. 提交非标户室状态码", s, 201)
s, detail4 = req("GET", f"/admin/building-dictionary/buildings/{building_id}", token=token)
pnon = next((x for x in detail4.get("rooms", []) if x.get("pending") and x.get("room_no") == "1-2楼"), None)
check(
    pnon is not None and pnon.get("floor") is None,
    "e. 非标户室仍为未分层",
    pnon.get("floor") if pnon else None,
    None,
)

# ==================== 清理 ====================
cleanup()

# ==================== 总结 ====================
print("\n" + "=" * 60)
if FAILURES:
    print(f"pending 可选/楼层解析 E2E 存在失败：{len(FAILURES)} 项")
    for f in FAILURES:
        print(f"  ✗ {f}")
    sys.exit(1)
else:
    print("pending 可选/楼层解析 E2E 全部通过 ✓")
