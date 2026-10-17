"""E2E: 楼盘字典 2026-10-17 审查缺陷修复验证（可重跑工件）.

对应 `docs/Done/2026-10-17-楼盘字典本周迭代-全维度代码审查报告.md`：

  H1 跨小区同名「待审楼栋」不再复用（唯一性加小区维度）
  H2 待审楼栋下新建的户室可正常转正（parent_is_pending 语义 + 子级改指）
  H3 小区合并迁移字典楼栋；删除「已被并入」的小区被 409 拦截；解除合并可逆
  H4 审核 create 户室后 bd_buildings.room_count 与实表一致
  M1 楼栋列表 pending 行不受 keyword 影响、且不在每页重复
  M2 审核 merge 跨小区目标被拒；未转正父级下的 merge 被拓扑拦截
  M4 线索编辑跨小区楼栋被拒（与创建链路对齐）
  M5 脏引用（单据不存在）回填后收敛为 resolved，pending-backfill 可推进
  M3 导入写真 district/business_circle；filter-options 端点返回动态值域
  L2 导入任务 created_at 不晚于 started_at
  L3 导入任务预扫描 total_communities / total_buildings / total_rooms / warnings_count 非全 0
  L4 单个 zip 条目损坏不再整包 failed（部分成功 + 失败明细）

命令: cd backend && .venv/bin/python tests/e2e/test_bd_audit_20261017_fixes.py
预期: 全部断言 PASS；测试造数清理干净（`__AU17_*` 0 残留）。
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

from fastapi.testclient import TestClient
from sqlalchemy import text

import db
from main import app
from models import BdImportTask, ImportTaskStatus
from services.property.dict_import_loader import DictImportProcessor
from services.property.dict_import_service import UPLOAD_DIR
from services.property.dict_parser import split_district_area
from utils.auth import AUDIENCE_ADMIN, create_access_token

results: list[tuple[str, bool, str]] = []

PREFIX = "__AU17"


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


# ---------- 认证客户端 ----------

with db.engine.connect() as _c:
    _row = _c.execute(text("SELECT id, token_version FROM users WHERE username='admin' LIMIT 1")).one()
_admin_id, _admin_ver = str(_row[0]), int(_row[1])
assert _admin_id, "dev 库缺少 admin 用户"

_token = create_access_token(data={"sub": _admin_id, "role": "admin", "ver": _admin_ver}, audience=AUDIENCE_ADMIN)
client = TestClient(app, cookies={"access_token": _token})
client.headers["X-Requested-With"] = "XMLHttpRequest"

API = "/api/v1/admin/building-dictionary"


# ---------- 造数/清理工具 ----------


def exec_sql(sql: str, **params: object) -> list[tuple]:
    with db.engine.begin() as c:
        return list(c.execute(text(sql), params).all())


def cleanup() -> None:
    """清理本用例造数（顺序：引用→pending→户室→楼栋→小区→任务）。"""
    with db.engine.begin() as c:
        ids = [
            r[0] for r in c.execute(text("SELECT id FROM communities WHERE name LIKE :p"), {"p": f"{PREFIX}%"}).all()
        ]
        # 合并会写 community_aliases（uq(alias_name, data_source)），必须先清
        c.execute(text("DELETE FROM community_aliases WHERE alias_name LIKE :p"), {"p": f"{PREFIX}%"})
        c.execute(
            text("DELETE FROM community_aliases WHERE community_id IN (SELECT id FROM communities WHERE name LIKE :p)"),
            {"p": f"{PREFIX}%"},
        )
        if ids:
            c.execute(
                text(
                    """
                    DELETE FROM bd_pending_references WHERE pending_id IN (
                        SELECT id FROM bd_pending_entries
                         WHERE community_id = ANY(:ids) OR name LIKE :p OR source_id LIKE :p
                    )
                    """
                ),
                {"ids": ids, "p": f"{PREFIX}%"},
            )
            c.execute(
                text(
                    "DELETE FROM bd_pending_entries WHERE community_id = ANY(:ids) OR name LIKE :p OR source_id LIKE :p"
                ),
                {"ids": ids, "p": f"{PREFIX}%"},
            )
            c.execute(
                text(
                    "DELETE FROM bd_rooms WHERE building_id IN "
                    "(SELECT id FROM bd_buildings WHERE community_id = ANY(:ids))"
                ),
                {"ids": ids},
            )
            c.execute(text("DELETE FROM bd_buildings WHERE community_id = ANY(:ids)"), {"ids": ids})
            c.execute(text("DELETE FROM communities WHERE id = ANY(:ids)"), {"ids": ids})
        c.execute(text("DELETE FROM leads WHERE community_name LIKE :p"), {"p": f"{PREFIX}%"})
        # 任务与落盘包
        rows = c.execute(
            text("SELECT id, file_path FROM bd_import_tasks WHERE filename LIKE :p"), {"p": f"{PREFIX}%"}
        ).all()
        for _tid, path in rows:
            Path(path).unlink(missing_ok=True)
        c.execute(text("DELETE FROM bd_import_tasks WHERE filename LIKE :p"), {"p": f"{PREFIX}%"})


cleanup()


def make_community(name: str) -> str:
    r = client.post(f"{API}/communities", json={"name": name, "district": "青浦区", "business_circle": "盈浦"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def submit_pending(**body: object) -> dict:
    r = client.post(f"{API}/pending", json=body)
    assert r.status_code == 201, r.text
    return r.json()


def resolve(entry_id: int, action: str, target_id: str | None = None) -> tuple[int, dict]:
    payload: dict[str, object] = {"action": action}
    if target_id is not None:
        payload["target_id"] = target_id
    r = client.post(f"{API}/review/{entry_id}/resolve", json=payload)
    return r.status_code, r.json() if r.content else {}


# ============================================================
# H1：跨小区同名「待审楼栋」不复用
# ============================================================
c1 = make_community(f"{PREFIX}_H1_A")
c2 = make_community(f"{PREFIX}_H1_B")
p1 = submit_pending(
    kind="building",
    name=f"{PREFIX}8号楼",
    parent_kind="community",
    parent_id=c1,
    source_type="project",
    source_id=f"{PREFIX}_doc1",
)
p2 = submit_pending(
    kind="building",
    name=f"{PREFIX}8号楼",
    parent_kind="community",
    parent_id=c2,
    source_type="project",
    source_id=f"{PREFIX}_doc2",
)
check(
    "H1 跨小区同名楼栋 pending 不再复用",
    p1["created"] is True and p2["created"] is True and p1["pending_id"] != p2["pending_id"],
    f"A={p1} B={p2}",
)
# 同小区重复提交仍幂等复用（不破坏 FR-19）
p1b = submit_pending(
    kind="building",
    name=f"{PREFIX}8号楼",
    parent_kind="community",
    parent_id=c1,
    source_type="lead",
    source_id=f"{PREFIX}_doc3",
)
check(
    "H1 同小区同名仍幂等复用（FR-19 不回退）",
    p1b["reused"] is True and p1b["pending_id"] == p1["pending_id"],
    f"repeat={p1b}",
)
scope_rows = exec_sql(
    "SELECT community_scope FROM bd_pending_entries WHERE id = ANY(:ids)",
    ids=[p1["pending_id"], p2["pending_id"]],
)
check(
    "H1 community_scope 落库为各自小区",
    {r[0] for r in scope_rows} == {c1, c2},
    f"{scope_rows}",
)

# ============================================================
# H2：待审楼栋下新建的户室可转正
# ============================================================
room_pending = submit_pending(
    kind="room",
    name="0801",
    parent_kind="pending_building",
    parent_id=str(p1["pending_id"]),
    source_type="project",
    source_id=f"{PREFIX}_doc4",
)
st_b, body_b = resolve(p1["pending_id"], "create")
check("H2 楼栋 create 成功", st_b == 200, f"{st_b} {body_b.get('message')}")
st_r, body_r = resolve(room_pending["pending_id"], "create")
check(
    "H2 待审楼栋下的户室可转正（原永久 400）",
    st_r == 200,
    f"{st_r} {body_r.get('message')}",
)
room_row = exec_sql(
    """
    SELECT r.room_no, b.community_id FROM bd_rooms r
      JOIN bd_buildings b ON b.id = r.building_id
     WHERE r.room_no = '0801' AND b.community_id = :cid
    """,
    cid=c1,
)
check("H2 户室落在正确小区楼栋下", len(room_row) == 1, f"{room_row}")
child_parent = exec_sql(
    "SELECT parent_is_pending, parent_id FROM bd_pending_entries WHERE id = :i",
    i=room_pending["pending_id"],
)
check(
    "H2 子级 parent_is_pending 已切回实表语义",
    child_parent and child_parent[0][0] is False,
    f"{child_parent}",
)

# ============================================================
# H4：room_count 与实表一致（审核 create 户室后）
# ============================================================
drift = exec_sql(
    """
    SELECT b.id, b.room_count, (SELECT count(*) FROM bd_rooms r WHERE r.building_id = b.id) AS actual
      FROM bd_buildings b WHERE b.community_id = :cid
    """,
    cid=c1,
)
check(
    "H4 审核新增户室后 room_count == 实表 count",
    all(int(r[1]) == int(r[2]) for r in drift) and drift,
    f"{drift}",
)

# ============================================================
# M1：pending 叠加不受分页/keyword 影响
# ============================================================
c3 = make_community(f"{PREFIX}_M1")
# 造 2 个正式楼栋，保证有第 2 页
for no in ("001", "002"):
    client.post(f"{API}/buildings", json={"community_id": c3, "building_no": no})
pend_m1 = submit_pending(kind="building", name=f"{PREFIX}ZZZ", parent_kind="community", parent_id=c3)
page1 = client.get(f"{API}/communities/{c3}/buildings", params={"page": 1, "page_size": 1}).json()
page2 = client.get(f"{API}/communities/{c3}/buildings", params={"page": 2, "page_size": 1}).json()
kw = client.get(
    f"{API}/communities/{c3}/buildings", params={"page": 1, "page_size": 10, "keyword": "nothingmatch"}
).json()
p1_names = [i["building_no"] for i in page1["items"]]
p2_names = [i["building_no"] for i in page2["items"]]
check(
    "M1 pending 行不再每页重复（仅第 1 页）",
    f"{PREFIX}ZZZ" in p1_names and f"{PREFIX}ZZZ" not in p2_names,
    f"page1={p1_names} page2={p2_names}",
)
check(
    "M1 keyword 过滤对 pending 生效",
    all(f"{PREFIX}ZZZ" != n for n in [i["building_no"] for i in kw["items"]]),
    f"keyword=nothingmatch → {[i['building_no'] for i in kw['items']]}",
)
check(
    "M1 pending 行不计入 total",
    page1["total"] == 2,
    f"total={page1['total']}（正式楼栋 2 个）",
)

# ============================================================
# M2：merge 归属/拓扑校验
# ============================================================
# 跨小区目标：在 H1_B 小区造一栋（用于验证 merge / 线索编辑不得跨小区改指）
client.post(f"{API}/buildings", json={"community_id": c2, "building_no": f"{PREFIX}B01"})
b_cross = exec_sql(
    "SELECT id FROM bd_buildings WHERE community_id = :cid AND building_no = :no",
    cid=c2,
    no=f"{PREFIX}B01",
)[0][0]
pend_m2 = submit_pending(kind="building", name=f"{PREFIX}M2栋", parent_kind="community", parent_id=c3)
st_cross, body_cross = resolve(pend_m2["pending_id"], "merge", str(b_cross))
check(
    "M2 merge 跨小区目标被拒（400）",
    st_cross == 400,
    f"{st_cross} {body_cross.get('message')}",
)

pend_parent = submit_pending(kind="building", name=f"{PREFIX}M2父", parent_kind="community", parent_id=c3)
pend_child = submit_pending(
    kind="room", name="0901", parent_kind="pending_building", parent_id=str(pend_parent["pending_id"])
)
local_building = exec_sql("SELECT id FROM bd_buildings WHERE community_id = :cid LIMIT 1", cid=c3)
st_topo, body_topo = resolve(pend_child["pending_id"], "merge", str(local_building[0][0]))
check(
    "M2 父级未转正时 merge 被拓扑拦截（400）",
    st_topo == 400,
    f"{st_topo} {body_topo.get('message')}",
)

# ============================================================
# M4：线索编辑跨小区楼栋被拒
# ============================================================
lead_create = client.post(
    "/api/v1/leads",
    json={"community_name": f"{PREFIX}_线索小区", "community_id": c1},
)
check("M4 前置：线索创建成功", lead_create.status_code == 201, lead_create.text[:200])
if lead_create.status_code == 201:
    lead_id = lead_create.json()["id"]
    upd = client.put(
        f"/api/v1/leads/{lead_id}",
        json={"community_id": c1, "building_id": int(b_cross)},
    )
    check(
        "M4 线索编辑跨小区楼栋被拒（400）",
        upd.status_code == 400,
        f"{upd.status_code} {upd.text[:160]}",
    )
    upd_ok = client.put(
        f"/api/v1/leads/{lead_id}",
        json={"community_id": c2, "building_id": int(b_cross)},
    )
    check(
        "M4 线索编辑（小区同步切换）放行",
        upd_ok.status_code == 200,
        f"{upd_ok.status_code} {upd_ok.text[:160]}",
    )

# ============================================================
# L1：录入端提交的 pending 带提交人，审核池「提交人」列不再恒空
# ============================================================
lead_pending = client.post(
    "/api/v1/leads",
    json={
        "community_name": f"{PREFIX}_L1小区",
        "community_id": c1,
        "new_building": {"name": f"{PREFIX}L1栋"},
    },
)
check("L1 前置：携带 new_building 的线索创建成功", lead_pending.status_code == 201, lead_pending.text[:200])
queue = client.get(f"{API}/review", params={"status": "pending", "page": 1, "page_size": 100})
items = queue.json().get("items", []) if queue.status_code == 200 else []
l1_item = next((i for i in items if i.get("name") == f"{PREFIX}L1栋"), None)
check(
    "L1 审核池条目带 submitted_by / submitter_name（原恒为空）",
    bool(l1_item and l1_item.get("submitted_by") and l1_item.get("submitter_name")),
    f"{ {k: (l1_item or {}).get(k) for k in ('submitted_by', 'submitter_name')} }",
)

# ============================================================
# M5：脏引用收敛（单据不存在 → resolved）
# ============================================================
pend_m5 = submit_pending(
    kind="building",
    name=f"{PREFIX}M5栋",
    parent_kind="community",
    parent_id=c3,
    source_type="project",
    source_id=f"{PREFIX}_ghost_doc",
)
resolve(pend_m5["pending_id"], "create")
ref_row = exec_sql("SELECT status::text FROM bd_pending_references WHERE pending_id = :i", i=pend_m5["pending_id"])
check(
    "M5 指向不存在单据的引用被关闭（resolved）",
    ref_row and ref_row[0][0] == "resolved",
    f"{ref_row}",
)
before_open = exec_sql("SELECT count(*) FROM bd_pending_references WHERE status='open'")[0][0]
client.post(f"{API}/review/pending-backfill")
after_open = exec_sql("SELECT count(*) FROM bd_pending_references WHERE status='open'")[0][0]
check(
    "M5 pending-backfill 可收敛（open 引用数不增，脏引用不再滞留）",
    int(after_open) <= int(before_open),
    f"open {before_open} → {after_open}",
)

# ============================================================
# H3：合并迁移字典树 + 删除拦截 + 解除合并可逆
# ============================================================
comm_a = make_community(f"{PREFIX}_H3_A")
comm_b = make_community(f"{PREFIX}_H3_B")
bld_a = client.post(f"{API}/buildings", json={"community_id": comm_a, "building_no": f"{PREFIX}01"})
assert bld_a.status_code == 201, bld_a.text
bld_a_id = exec_sql(
    "SELECT id FROM bd_buildings WHERE community_id = :cid AND building_no = :no",
    cid=comm_a,
    no=f"{PREFIX}01",
)[0][0]

merge = client.post("/api/v1/admin/communities/merge", json={"primary_id": comm_b, "merge_ids": [comm_a]})
check(
    "H3 合并请求成功",
    merge.status_code == 200,
    f"{merge.status_code} {merge.text[:200]}",
)
moved = exec_sql("SELECT community_id, origin_community_id FROM bd_buildings WHERE id = :i", i=bld_a_id)
check(
    "H3 合并后字典楼栋迁至主档并留原归属标记",
    moved and moved[0][0] == comm_b and moved[0][1] == comm_a,
    f"{moved}",
)
delete_merged = client.delete(f"{API}/communities/{comm_a}")
check(
    "H3 删除「已被并入」的小区被 409 拦截（整树不再可删）",
    delete_merged.status_code == 409,
    f"{delete_merged.status_code} {delete_merged.text[:200]}",
)
unmerge = client.post("/api/v1/admin/communities/unmerge", json={"merged_id": comm_a, "primary_id": comm_b})
check("H3 解除合并成功", unmerge.status_code == 200, f"{unmerge.status_code} {unmerge.text[:200]}")
restored = exec_sql("SELECT community_id, origin_community_id FROM bd_buildings WHERE id = :i", i=bld_a_id)
check(
    "H3 解除合并后楼栋归属可逆归位",
    restored and restored[0][0] == comm_a and restored[0][1] is None,
    f"{restored}",
)

# ============================================================
# M3：district/business_circle 解析与动态筛选选项
# ============================================================
check(
    "M3 「青浦盈浦」拆为 青浦区 / 盈浦",
    split_district_area("青浦盈浦") == ("青浦区", "盈浦"),
    f"{split_district_area('青浦盈浦')}",
)
check(
    "M3 「浦东」别名为 浦东新区",
    split_district_area("浦东") == ("浦东新区", None),
    f"{split_district_area('浦东')}",
)

# M3-b（报告：别名仅参与完整串相等 → 「区名+板块」命中不到）
# 别名必须参与前缀匹配，否则「浦东张江」「闸北彭浦」整体落入板块、district 为 None。
_alias_prefix_cases = [
    ("浦东张江", ("浦东新区", "张江")),
    ("闸北彭浦", ("闸北区", "彭浦")),
    # 全称 + 板块：旧实现被简称「金山/浦东新」切坏，余串残留「区」
    ("金山区石化", ("金山区", "石化")),
    ("浦东新区张江", ("浦东新区", "张江")),
    ("黄浦区", ("黄浦区", None)),
    # 回归：原有场景不得破
    ("宝山淞宝", ("宝山区", "淞宝")),
    ("静安", ("静安区", None)),
    ("静安区静安寺", ("静安区", "静安寺")),
]
_bad_alias = [
    (src, split_district_area(src), want) for src, want in _alias_prefix_cases if split_district_area(src) != want
]
check(
    "M3 别名参与前缀匹配：区名+板块（浦东张江/闸北彭浦）与全称不被切坏",
    not _bad_alias,
    f"失败 {_bad_alias}" if _bad_alias else f"{len(_alias_prefix_cases)} 例全通",
)

_legacy_pudong = exec_sql("SELECT count(*) FROM communities WHERE district IN ('浦东区', '浦东')")[0][0]
check(
    "M3 「浦东区」存量旧值域已归并为 浦东新区（同一行政区不再拆两个值域）",
    int(_legacy_pudong) == 0,
    f"残留={_legacy_pudong}",
)
opts = client.get(f"{API}/filter-options")
check("M3 filter-options 端点可用", opts.status_code == 200, f"{opts.status_code}")
if opts.status_code == 200:
    districts = [d["value"] for d in opts.json()["districts"]]
    db_districts = exec_sql(
        "SELECT count(DISTINCT district) FROM communities WHERE is_active AND district IS NOT NULL AND district <> ''"
    )[0][0]
    check(
        "M3 区域选项 = 库内 distinct 值域（不再是前端硬编码 16 项）",
        len(districts) == int(db_districts) and len(districts) > 16,
        f"选项 {len(districts)} 项 / 库内 {db_districts} 项：{districts[:6]}…",
    )
    circles = client.get(f"{API}/filter-options", params={"district": "青浦区"})
    check(
        "M3 板块选项按区县联动",
        circles.status_code == 200,
        f"count={len(circles.json()['business_circles']) if circles.status_code == 200 else 'n/a'}",
    )

# ============================================================
# L2/L3/L4：导入任务时区、预扫描计数、单条目损坏容错
# ============================================================
ROOM_LINES = (
    f"{PREFIX}导入大厦;01;0101;121.4;31.2;\n"
    f"{PREFIX}导入大厦;01;0102;;;;\n"
    f"{PREFIX}导入大厦;02;0201;;;;\n"
    ";青浦盈浦;测试路1号;\n"
    "住宅-公寓\n"
)


def make_zip(files: dict[str, str]) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        for name, content in files.items():
            zf.writestr(name, content.encode("gbk"))
    return buf.getvalue()


def upload_and_wait(content: bytes, filename: str) -> dict:
    path = UPLOAD_DIR / f"bd_{PREFIX}_{os.getpid()}_{filename}"
    path.write_bytes(content)
    with path.open("rb") as fh:
        r = client.post(f"{API}/import", files={"file": (filename, fh, "application/zip")})
    assert r.status_code == 201, r.text
    task_id = r.json()["task_id"]
    for _ in range(200):
        s = db.SessionLocal()
        try:
            task = s.get(BdImportTask, task_id)
            done = task.status in (ImportTaskStatus.COMPLETED, ImportTaskStatus.FAILED)
            if done:
                return {
                    "id": task.id,
                    "status": task.status.value,
                    "created_at": task.created_at,
                    "started_at": task.started_at,
                    "total_communities": task.total_communities,
                    "total_buildings": task.total_buildings,
                    "total_rooms": task.total_rooms,
                    "warnings_count": task.warnings_count,
                    "communities_loaded": task.communities_loaded,
                    "error_message": task.error_message,
                    "failed_file_url": task.failed_file_url,
                }
        finally:
            s.close()
        time.sleep(0.05)
    msg = "导入任务超时未结束"
    raise AssertionError(msg)


good_task = upload_and_wait(make_zip({f"{PREFIX}导入小区.txt": ROOM_LINES}), "l2e2e-good.zip")
check(
    "L2 导入任务 created_at 不晚于 started_at",
    good_task["created_at"] <= good_task["started_at"] if good_task["started_at"] else False,
    f"created={good_task['created_at']} started={good_task['started_at']}",
)
check(
    "L3 预扫描 total_communities 写入真实条目数",
    good_task["total_communities"] == 1,
    f"{good_task['total_communities']}",
)
check(
    "L3 预扫描楼栋/户室计数非 0",
    good_task["total_buildings"] == 2 and good_task["total_rooms"] == 3,
    f"buildings={good_task['total_buildings']} rooms={good_task['total_rooms']}",
)
check(
    "L3 warnings_count 可累计",
    good_task["warnings_count"] >= 0,
    f"warnings={good_task['warnings_count']}",
)
imported = exec_sql("SELECT district, business_circle FROM communities WHERE name = :n", n=f"{PREFIX}导入小区")
check(
    "M3 导入落库 district/business_circle",
    imported and imported[0][0] == "青浦区" and imported[0][1] == "盈浦",
    f"{imported}",
)

# L4：第 2 个条目数据流损坏 → 任务仍 completed（部分成功），失败明细可下载
# 构造方式：用 ZIP_STORED 写两个 txt（数据段明文可定位），只在第 2 条目数据区改字节，
# 不改本地头/中央目录（避免改名/改结构导致非预期的解析错误）。
corrupt_buf = io.BytesIO()
with zipfile.ZipFile(corrupt_buf, "w", zipfile.ZIP_STORED) as zf:
    zf.writestr(f"{PREFIX}完好小区.txt", ROOM_LINES)
    zf.writestr(f"{PREFIX}损坏小区.txt", ROOM_LINES)
raw = bytearray(corrupt_buf.getvalue())
# 定位第 2 个本地文件头，再跳过 30B 固定头 + 文件名与扩展字段，得到数据区起点
first = raw.find(b"PK\x03\x04")
second = raw.find(b"PK\x03\x04", first + 4)
assert second > 0, "未找到第 2 个 zip 条目"
name_len = int.from_bytes(raw[second + 26 : second + 28], "little")
extra_len = int.from_bytes(raw[second + 28 : second + 30], "little")
data_start = second + 30 + name_len + extra_len
for off in range(data_start, min(data_start + 8, len(raw))):
    raw[off] ^= 0xFF
bad_task = upload_and_wait(bytes(raw), "l2e2e-bad.zip")
check(
    "L4 单条目损坏不再整包 failed",
    bad_task["status"] == "completed",
    f"status={bad_task['status']} err={(bad_task['error_message'] or '')[:120]}",
)
check(
    "L4 已装载小区保留（部分成功）",
    bad_task["communities_loaded"] >= 1,
    f"communities_loaded={bad_task['communities_loaded']}",
)

# L4-b：加密条目抛 RuntimeError（原实现只捕 BadZipFile/OSError）
# 回归防线：生成器不得被未捕获异常杀死，否则后续合法小区全部静默丢弃。


def _set_encrypted_flag(raw: bytes, fname: str) -> bytes:
    """把指定条目的「加密」标志位（general purpose flags 的 bit0）置位.

    本地文件头：sig(4) ver(2) flag(off6) ... namelen(off26) name(off30)
    中央目录项：sig(4) vermade(2) verneed(2) flag(off8) ... namelen(off28) name(off46)
    只改标志位不改数据，使 zipfile 在 read() 时抛 RuntimeError（encrypted）。
    """
    import struct

    buf = bytearray(raw)
    target = fname.encode()
    for sig, flag_off, name_len_off, name_off in (
        (b"PK\x03\x04", 6, 26, 30),
        (b"PK\x01\x02", 8, 28, 46),
    ):
        pos = 0
        while True:
            pos = buf.find(sig, pos)
            if pos < 0:
                break
            nlen = struct.unpack_from("<H", buf, pos + name_len_off)[0]
            if bytes(buf[pos + name_off : pos + name_off + nlen]) == target:
                cur = struct.unpack_from("<H", buf, pos + flag_off)[0]
                struct.pack_into("<H", buf, pos + flag_off, cur | 1)
            pos += 4
    return bytes(buf)


enc_buf = io.BytesIO()
with zipfile.ZipFile(enc_buf, "w", zipfile.ZIP_STORED) as zf:
    zf.writestr(f"{PREFIX}加密前小区.txt", ROOM_LINES)
    zf.writestr(f"{PREFIX}加密条目.txt", ROOM_LINES)
    zf.writestr(f"{PREFIX}加密后小区.txt", ROOM_LINES)
enc_task = upload_and_wait(_set_encrypted_flag(enc_buf.getvalue(), f"{PREFIX}加密条目.txt"), "l2e2e-enc.zip")
enc_loaded = exec_sql("SELECT name FROM communities WHERE name LIKE :p ORDER BY name", p=f"{PREFIX}加密%")
loaded_names = {r[0] for r in enc_loaded}
check(
    "L4 加密条目后的合法小区不被静默丢弃（生成器未被 RuntimeError 杀死）",
    loaded_names >= {f"{PREFIX}加密前小区", f"{PREFIX}加密后小区"},
    f"已入库={sorted(loaded_names)}",
)
check(
    "L4 加密条目记入失败明细时保留真实文件名",
    bool(enc_task["failed_file_url"]),
    f"failed_url={enc_task['failed_file_url']}",
)
check(
    "L4 加密包整体仍为 completed（部分成功）",
    enc_task["status"] == "completed",
    f"status={enc_task['status']} err={(enc_task['error_message'] or '')[:100]}",
)

# L4-c：迭代器条目数少于 total_communities 时不得产生无文件名的幽灵失败行
proc = DictImportProcessor(engine=db.engine)
genuine_iter = proc._iter_txt_entries
proc._iter_txt_entries = lambda fp, t: (  # type: ignore[method-assign]
    iter([("c1.txt", b"c1;01;0101;;;;"), ("c2.txt", b"c2;01;0101;;;;")]),
    5,
)
ghost_id = f"{PREFIX}ghost"
ghost_path = UPLOAD_DIR / f"bd_{PREFIX}_ghost.zip"
ghost_path.write_bytes(b"placeholder")
_ghost_db = db.SessionLocal()
_ghost_db.add(
    BdImportTask(
        id=ghost_id,
        user_id=_admin_id,
        filename=f"{PREFIX}ghost.zip",
        file_path=str(ghost_path),
    )
)
_ghost_db.commit()
_ghost_db.close()
proc._write_failed_csv = lambda tid, rows: f"csv://{len(rows)}"  # type: ignore[method-assign]
_s = db.SessionLocal()
# 同一 session 内取出后立即执行，避免跨 session 属性过期（先取 id 再 get）
proc._execute(_s.get(BdImportTask, ghost_id), _s)
_s.close()
proc._iter_txt_entries = genuine_iter  # type: ignore[method-assign]
ghost_rows = exec_sql("SELECT error_message FROM bd_import_tasks WHERE id = :i", i=ghost_id)
no_ghost = not ghost_rows or not (ghost_rows[0][0] or "").startswith("5/5")
check(
    "L4 条目数少于声明数时提前结束，不产生幽灵失败行",
    no_ghost,
    f"error_message={ghost_rows[0][0] if ghost_rows else None}",
)

# L4-d：失配场景下完成态进度不能冒充 100%（收尾无条件写 100 会把
# 「只处理 2/5」伪装成全部成功，是静默数据丢失）
ghost_progress = exec_sql(
    "SELECT progress_percent, processed_communities, total_communities FROM bd_import_tasks WHERE id = :i",
    i=ghost_id,
)
if ghost_progress:
    _prog, _proc_n, _total_n = ghost_progress[0]
    check(
        "L4 条目数少于声明数时进度按真实比例（不冒充 100%）",
        float(_prog) < 100.0,
        f"progress={_prog}% processed={_proc_n}/{_total_n}",
    )
    check(
        "L4 条目数失配时 error_message 显式告警（不静默）",
        "少于声明数" in (ghost_rows[0][0] or "") if ghost_rows else False,
        f"{(ghost_rows[0][0] if ghost_rows else '')[:110]}",
    )

# ============================================================
# 收尾
# ============================================================
cleanup()
left = exec_sql(
    "SELECT (SELECT count(*) FROM communities WHERE name LIKE :p) + "
    "(SELECT count(*) FROM bd_pending_entries WHERE name LIKE :p) + "
    "(SELECT count(*) FROM bd_import_tasks WHERE filename LIKE :p)",
    p=f"{PREFIX}%",
)[0][0]
check("造数清理干净（0 残留）", int(left) == 0, f"残留={left}")

failed = [r for r in results if not r[1]]
print("\n" + "=" * 60)
print(f"用例 {len(results)} 条，通过 {len(results) - len(failed)} 条，失败 {len(failed)} 条")
for name, _ok, detail in failed:
    print(f"  ❌ {name} — {detail}")
print("=" * 60)
sys.exit(1 if failed else 0)
