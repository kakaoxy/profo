"""E2E 表单链路（lead / marketing / project 三链路 pending→resolve→回填 + 缺陷D 抽验）.

通过真实 API 验证录入端新增字典载荷的完整闭环：
- 同名 open pending 幂等复用（FR-19）
- bd_pending_references 引用账本（BR-13）
- resolve create → 字典落库 → 单据回填（community_id / building_id + dict_status=linked）
- 缺陷D：机器链路 pending 房源按原文展示与关键词搜索
"""

# ruff: noqa: E402, FBT003, S310
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from decimal import Decimal
from pathlib import Path

BASE = "http://127.0.0.1:8000/api/v1"

sys.path.insert(0, ".")
from sqlalchemy import text as text_f

from db import SessionLocal as SessionLocalF
from models import (
    BdEntryKind,
    BdEntryStatus,
    BdPendingEntry,
    BdPendingReference,
    BdReferenceStatus,
    L4MarketingProject,
    Lead,
    Project,
    PropertyCurrent,
    PropertyStatus,
)

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
        db.execute(text_f("DELETE FROM property_current WHERE data_source = '__E2E_FC'"))
        db.execute(
            text_f(
                "DELETE FROM bd_pending_references WHERE pending_id IN "
                "(SELECT id FROM bd_pending_entries WHERE name LIKE '__E2E_FC%')"
            )
        )
        db.execute(text_f("DELETE FROM bd_pending_entries WHERE name LIKE '__E2E_FC%'"))
        db.execute(text_f("DELETE FROM leads WHERE community_name LIKE '__E2E_FC%'"))
        db.execute(text_f("DELETE FROM l4_marketing_projects WHERE community_name LIKE '__E2E_FC%'"))
        db.execute(
            text_f(
                "DELETE FROM project_contracts WHERE project_id IN "
                "(SELECT id FROM projects WHERE community_name LIKE '__E2E_FC%')"
            )
        )
        db.execute(
            text_f(
                "DELETE FROM project_owners WHERE project_id IN "
                "(SELECT id FROM projects WHERE community_name LIKE '__E2E_FC%')"
            )
        )
        db.execute(text_f("DELETE FROM projects WHERE community_name LIKE '__E2E_FC%'"))
        db.execute(
            text_f(
                "DELETE FROM bd_rooms WHERE building_id IN "
                "(SELECT id FROM bd_buildings WHERE community_id IN "
                "(SELECT id FROM communities WHERE name LIKE '__E2E_FC%'))"
            )
        )
        db.execute(
            text_f(
                "DELETE FROM bd_buildings WHERE community_id IN "
                "(SELECT id FROM communities WHERE name LIKE '__E2E_FC%')"
            )
        )
        db.execute(text_f("DELETE FROM communities WHERE name LIKE '__E2E_FC%'"))
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
comm_name = f"__E2E_FC小区_{ts}__"
mkt_name = f"__E2E_FC营销小区_{ts}__"
proj_comm_name = f"__E2E_FC项目小区_{ts}__"
building_no = "__E2E_FCB1__"
prop_comm_name = "__E2E_FC机器小区__"

cleanup()

# ==================== a. 录入端提交新小区 → pending ====================
print(f"\n=== a. 提交小区 pending（{comm_name}） ===")
s, pend = req("POST", "/admin/building-dictionary/pending", {"kind": "community", "name": comm_name}, token=token)
check(s == 201, "a. 提交 pending 状态码", s, 201)
pending_id = pend.get("pending_id") if s == 201 else None
check(pending_id is not None, "a. 返回 pending_id", pending_id, "整数 ID")

# ==================== b. 线索链路：同名复用 pending 引用 ====================
print(f"\n=== b. 线索链路（{comm_name}） ===")
s, lead = req(
    "POST",
    "/leads",
    {"community_name": comm_name, "new_community": {"name": comm_name}, "dict_status": "pending"},
    token=token,
)
check(s == 201, "b. 创建线索状态码（任务 spec=201）", s, 201)
lead_id = lead.get("id") if isinstance(lead, dict) else None
check(lead_id is not None, "b. 返回线索 id", lead_id, "UUID 字符串")

db = SessionLocalF()
ref = None
try:
    ref = (
        db.query(BdPendingReference)
        .filter(
            BdPendingReference.biz_type == "lead",
            BdPendingReference.biz_id == str(lead_id),
            BdPendingReference.field == "community_id",
            BdPendingReference.status == BdReferenceStatus.OPEN,
        )
        .first()
    )
finally:
    db.close()

if ref is None:
    print("  ⚠️ 线索 pending 引用缺失，打印 backend/services/leads/core.py 相关代码行：")
    dump_func("services/leads/core.py", "_submit_dict_pendings")
check(ref is not None, "b. 线索 pending 引用存在", ref is not None, True)
check(
    ref is not None and ref.pending_id == pending_id,
    "b. 同名复用 pending_id",
    ref.pending_id if ref else None,
    pending_id,
)

# ==================== c. 审核转正 + 线索回填 ====================
print(f"\n=== c. 审核转正（{comm_name}） ===")
s, queue = req("GET", "/admin/building-dictionary/review?page=1&page_size=50", token=token)
entry = None
if s == 200:
    for e in queue.get("items", []):
        if e.get("name") == comm_name and e.get("kind") == "community":
            entry = e
            break
check(s == 200 and entry is not None, "c. 审核池找到该条目", entry.get("id") if entry else None, "条目 ID")
entry_id = entry.get("id") if entry else None
if entry_id is not None:
    s, resolved = req(
        "POST", f"/admin/building-dictionary/review/{entry_id}/resolve", {"action": "create"}, token=token
    )
    check(s == 200, "c. resolve create 状态码", s, 200)
else:
    resolved = None

db = SessionLocalF()
lead_rec = None
try:
    lead_rec = db.query(Lead).filter(Lead.id == str(lead_id)).first()
    check(lead_rec is not None, "c. 线索单据存在", lead_rec is not None, True)
    check(
        lead_rec is not None and lead_rec.community_id is not None,
        "c. community_id 非空",
        lead_rec.community_id if lead_rec else None,
        "非空 UUID",
    )
    check(
        lead_rec is not None and lead_rec.dict_status == "linked",
        "c. dict_status linked",
        lead_rec.dict_status if lead_rec else None,
        "linked",
    )
finally:
    db.close()

# ==================== d. 营销链路 ====================
print(f"\n=== d. 营销链路（{mkt_name}） ===")
mkt_body = {
    "community_id": "00000000-0000-0000-0000-000000000000",  # new_community 待审期间占位，resolve 后回填真实 ID
    "community_name": mkt_name,
    "layout": "三室两厅",
    "orientation": "南北通透",
    "floor_info": "15/28层",
    "area": "120.00",
    "total_price": "600.00",
    "title": f"E2E营销{ts}",
    "dict_status": "pending",
    "new_community": {"name": mkt_name},
}
s, mkt = req("POST", "/admin/marketing/projects", mkt_body, token=token)
check(s == 201, "d. 创建营销项目状态码", s, 201)
mkt_id = mkt.get("id") if s == 201 else None
check(mkt_id is not None, "d. 返回营销项目 id", mkt_id, "整数 ID")

db = SessionLocalF()
mkt_ref = None
try:
    mkt_ref = (
        db.query(BdPendingReference)
        .filter(
            BdPendingReference.biz_type == "marketing",
            BdPendingReference.biz_id == str(mkt_id),
            BdPendingReference.field == "community_id",
            BdPendingReference.status == BdReferenceStatus.OPEN,
        )
        .first()
    )
finally:
    db.close()
check(mkt_ref is not None, "d. 营销 pending 引用存在", mkt_ref is not None, True)

if mkt_ref is not None:
    s, mkt_resolved = req(
        "POST", f"/admin/building-dictionary/review/{mkt_ref.pending_id}/resolve", {"action": "create"}, token=token
    )
    check(s == 200, "d. resolve create 状态码", s, 200)
    db = SessionLocalF()
    try:
        mkt_rec = db.query(L4MarketingProject).filter(L4MarketingProject.id == int(mkt_id)).first()
        check(
            mkt_rec is not None and mkt_rec.dict_status == "linked",
            "d. 营销单据 dict_status linked",
            mkt_rec.dict_status if mkt_rec else None,
            "linked",
        )
        check(
            mkt_rec is not None and mkt_rec.community_id != "00000000-0000-0000-0000-000000000000",
            "d. community_id 已回填",
            mkt_rec.community_id if mkt_rec else None,
            "真实小区 UUID",
        )
    finally:
        db.close()

# ==================== e. 项目链路（新建小区 + 新建楼栋） ====================
print(f"\n=== e. 项目链路（{proj_comm_name} / {building_no}） ===")
s, comm = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": proj_comm_name, "district": "浦东", "business_circle": "E2E"},
    token=token,
)
check(s == 201, "e. admin 建小区状态码", s, 201)
proj_cid = comm.get("id") if s == 201 else None
check(proj_cid is not None, "e. 返回小区 id", proj_cid, "UUID 字符串")

proj_body = {
    "community_id": proj_cid,
    "community_name": proj_comm_name,
    "address": "E2E路100号",
    "area": "100.00",
    "business_form": "agent",
    "contract_no": f"E2E-FC-{ts}",
    "owners": [{"owner_name": "E2E业主"}],
    "new_building": {"name": building_no},
    "dict_status": "pending",
}
s, proj = req("POST", "/projects", proj_body, token=token)
check(s == 201, "e. 创建项目状态码", s, 201)
proj_id = proj.get("id") if s == 201 else None
check(proj_id is not None, "e. 返回项目 id", proj_id, "UUID 字符串")
check(
    s == 201 and proj.get("dict_status") == "pending",
    "e. 项目 dict_status=pending",
    proj.get("dict_status") if s == 201 else None,
    "pending",
)

db = SessionLocalF()
building_pend = None
proj_ref = None
try:
    building_pend = (
        db.query(BdPendingEntry)
        .filter(
            BdPendingEntry.kind == BdEntryKind.BUILDING,
            BdPendingEntry.name == building_no,
            BdPendingEntry.status == BdEntryStatus.PENDING,
        )
        .first()
    )
    if proj_id is not None:
        proj_ref = (
            db.query(BdPendingReference)
            .filter(
                BdPendingReference.biz_type == "project",
                BdPendingReference.biz_id == str(proj_id),
                BdPendingReference.field == "building_id",
                BdPendingReference.status == BdReferenceStatus.OPEN,
            )
            .first()
        )
finally:
    db.close()
check(building_pend is not None, "e. building pending 条目存在", building_pend.id if building_pend else None, "整数 ID")
check(proj_ref is not None, "e. 项目 building 引用存在", proj_ref is not None, True)
check(
    proj_ref is not None and building_pend is not None and proj_ref.pending_id == building_pend.id,
    "e. 引用 pending_id == building pending_id",
    proj_ref.pending_id if proj_ref else None,
    building_pend.id if building_pend else None,
)

if building_pend is not None:
    s, b_resolved = req(
        "POST", f"/admin/building-dictionary/review/{building_pend.id}/resolve", {"action": "create"}, token=token
    )
    check(s == 200, "e. resolve create(building) 状态码", s, 200)
    db = SessionLocalF()
    try:
        proj_rec = db.query(Project).filter(Project.id == str(proj_id)).first()
        check(
            proj_rec is not None and proj_rec.building_id is not None,
            "e. 项目 building_id 非空",
            proj_rec.building_id if proj_rec else None,
            "非空整数",
        )
        check(
            proj_rec is not None and proj_rec.dict_status == "linked",
            "e. 项目 dict_status linked",
            proj_rec.dict_status if proj_rec else None,
            "linked",
        )
    finally:
        db.close()

# ==================== f. 缺陷D 抽验：pending 房源按原文展示/搜索 ====================
print(f"\n=== f. 缺陷D 抽验（{prop_comm_name}） ===")
db = SessionLocalF()
try:
    prop = PropertyCurrent(
        data_source="__E2E_FC",
        source_property_id="fc-001",
        status=PropertyStatus.FOR_SALE,
        community_id=None,
        community_name=prop_comm_name,
        dict_status="pending",
        is_active=True,
        rooms=2,
        halls=1,
        baths=1,
        orientation="南",
        floor_original="中楼层",
        build_area=Decimal("88.00"),
    )
    db.add(prop)
    db.commit()
finally:
    db.close()

s, lst = req("GET", "/properties", token=token, qs={"page": 1, "page_size": 50, "keyword": prop_comm_name})
check(s == 200, "f. 房源列表状态码", s, 200)
hit = None
if s == 200:
    for it in lst.get("items", []):
        if it.get("data_source") == "__E2E_FC" and it.get("source_property_id") == "fc-001":
            hit = it
            break
check(hit is not None, "f. 关键词搜索包含该房源", hit is not None, True)
check(
    hit is not None and hit.get("community_name") == prop_comm_name,
    "f. community_name 原文展示",
    hit.get("community_name") if hit else None,
    prop_comm_name,
)

# ==================== 清理 ====================
cleanup()

# ==================== 总结 ====================
print("\n" + "=" * 60)
if FAILURES:
    print(f"表单链路 E2E 存在失败：{len(FAILURES)} 项")
    for f in FAILURES:
        print(f"  ✗ {f}")
    sys.exit(1)
else:
    print("表单链路 E2E 全部通过 ✓")
