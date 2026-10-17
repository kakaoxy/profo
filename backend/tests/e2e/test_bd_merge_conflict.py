"""E2E: 小区合并（H3 字典楼栋迁移）三处高危缺陷的回归验证（可重跑工件）.

对应 2026-10-17 提交巡检（d0e47063 引入 ``_migrate_dict_buildings``）发现的缺陷：

  C1 同批多个被并小区持有同号楼栋 → ``uq_bd_building_no`` 唯一冲突，
     整笔合并在 commit 前抛 IntegrityError → 合并永久 400「数据库操作失败」。
     真实库中 ``01``/``02`` 等楼栋号横跨 8k+ 个小区，两个被并小区同号是常态。
  C2 合并后单据仍指向已归档小区、楼栋已迁主档 → 三模块编辑链路的
     ``validate_dict_ownership`` 判「字典楼栋不属于所选小区」400，
     单据此后永久不可编辑（连只改状态/发布态都被拦）。解除合并需要对称拆回。
  C3 「合并 → 解除合并 → 再合并」时 ``uq_alias_source`` 唯一冲突
     （解除合并只把并入别名标记 ``is_deleted``，再次合并直接 INSERT）→ 永久 400。

命令: cd backend && .venv/bin/python tests/e2e/test_bd_merge_conflict.py
预期: 全部断言 PASS；造数清理干净（``__MC*`` 0 残留）。
"""

# ruff: noqa: E402 —— env 注入必须先于业务 import（backend/ 目录直跑找不到根 .env）

import os
import sys
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
from utils.auth import AUDIENCE_ADMIN, create_access_token
from utils.common import limiter

results: list[tuple[str, bool, str]] = []

PREFIX = "__MC"


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


# ---------- 认证客户端 ----------
# 合并端点限流 20/hour（Redis 后端），本用例含多次合并：先清限流窗口再跑
limiter.reset()

with db.engine.connect() as _c:
    _row = _c.execute(text("SELECT id, token_version FROM users WHERE username='admin' LIMIT 1")).one()
_admin_id, _admin_ver = str(_row[0]), int(_row[1])
assert _admin_id, "dev 库缺少 admin 用户"

_token = create_access_token(data={"sub": _admin_id, "role": "admin", "ver": _admin_ver}, audience=AUDIENCE_ADMIN)
client = TestClient(app, cookies={"access_token": _token})
client.headers["X-Requested-With"] = "XMLHttpRequest"

API = "/api/v1/admin/building-dictionary"
MERGE = "/api/v1/admin/communities/merge"
UNMERGE = "/api/v1/admin/communities/unmerge"


def exec_sql(sql: str, **params: object) -> list[tuple]:
    with db.engine.begin() as c:
        return list(c.execute(text(sql), params).all())


def cleanup() -> None:
    """清理本用例造数（引用→别名→户室→楼栋→小区）。"""
    with db.engine.begin() as c:
        ids = [
            r[0] for r in c.execute(text("SELECT id FROM communities WHERE name LIKE :p"), {"p": f"{PREFIX}%"}).all()
        ]
        c.execute(text("DELETE FROM community_aliases WHERE alias_name LIKE :p"), {"p": f"{PREFIX}%"})
        if ids:
            for table in ("projects", "leads", "l4_marketing_projects"):
                # 表名为本文件内的字面量常量，无外部输入
                c.execute(text(f"DELETE FROM {table} WHERE community_id = ANY(:ids)"), {"ids": ids})  # noqa: S608
            c.execute(text("DELETE FROM community_aliases WHERE community_id = ANY(:ids)"), {"ids": ids})
            c.execute(
                text(
                    "DELETE FROM bd_rooms WHERE building_id IN "
                    "(SELECT id FROM bd_buildings WHERE community_id = ANY(:ids))"
                ),
                {"ids": ids},
            )
            c.execute(text("DELETE FROM bd_buildings WHERE community_id = ANY(:ids)"), {"ids": ids})
            c.execute(text("DELETE FROM communities WHERE id = ANY(:ids)"), {"ids": ids})


def make_community(name: str) -> str:
    r = client.post(f"{API}/communities", json={"name": name, "district": "青浦区", "business_circle": "盈浦"})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def add_building(community_id: str, building_no: str) -> int:
    r = client.post(f"{API}/buildings", json={"community_id": community_id, "building_no": building_no})
    assert r.status_code == 201, r.text
    rows = exec_sql(
        "SELECT id FROM bd_buildings WHERE community_id = :cid AND building_no = :no",
        cid=community_id,
        no=building_no,
    )
    return int(rows[0][0])


def make_lead(community_id: str, building_id: int, tag: str) -> str:
    r = client.post(
        "/api/v1/leads",
        json={
            "community_name": f"{PREFIX}{tag}小区",
            "community_id": community_id,
            "address": "E2E 测试地址",
            "building_id": building_id,
            "dict_status": "linked",
            "customer_name": f"{PREFIX}{tag}客户",
            "customer_phone": "13800000000",
            "source": "walk_in",
            "status": "pending_visit",
        },
    )
    assert r.status_code == 201, r.text
    return r.json()["id"]


cleanup()

# ============================================================
# C1：同批多个被并小区持有同号楼栋，合并不得整笔失败
# ============================================================
c1_primary = make_community(f"{PREFIX}C1主档")
c1_child_a = make_community(f"{PREFIX}C1子一")
c1_child_b = make_community(f"{PREFIX}C1子二")
for cid in (c1_child_a, c1_child_b):
    add_building(cid, "01")

c1_merge = client.post(MERGE, json={"primary_id": c1_primary, "merge_ids": [c1_child_a, c1_child_b]})
check(
    "C1 同批被并小区同号楼栋合并成功（原 IntegrityError → 400）",
    c1_merge.status_code == 200,
    f"{c1_merge.status_code} {c1_merge.text[:200]}",
)
primary_buildings = exec_sql(
    "SELECT building_no, origin_community_id FROM bd_buildings WHERE community_id = :cid",
    cid=c1_primary,
)
check(
    "C1 主档只保留一个同号楼栋（迁一行，另一行留在原小区）",
    [r[0] for r in primary_buildings] == ["01"],
    f"{primary_buildings}",
)
left_behind = exec_sql(
    "SELECT community_id FROM bd_buildings WHERE community_id = ANY(:ids) AND building_no = '01'",
    ids=[c1_child_a, c1_child_b],
)
check("C1 同号冲突的另一行未被迁走（仍属原小区，解除合并可还原）", len(left_behind) == 1, f"{left_behind}")
c1_unmerge = client.post(UNMERGE, json={"primary_id": c1_primary, "merged_id": c1_child_a})
check("C1 合并后仍可正常解除合并", c1_unmerge.status_code == 200, c1_unmerge.text[:200])
cleanup()

# ============================================================
# C2：合并后单据改指主档，编辑不再被归属校验 400 拦住
# ============================================================
c2_primary = make_community(f"{PREFIX}C2主档")
c2_child = make_community(f"{PREFIX}C2被并")
c2_building = add_building(c2_child, "08")
c2_lead = make_lead(c2_child, c2_building, "C2")

c2_merge = client.post(MERGE, json={"primary_id": c2_primary, "merge_ids": [c2_child]})
check("C2 前置：合并成功", c2_merge.status_code == 200, c2_merge.text[:200])
lead_after_merge = exec_sql("SELECT community_id, building_id FROM leads WHERE id = :i", i=c2_lead)
check(
    "C2 合并后单据小区改指主档（楼栋 id 不变）",
    lead_after_merge and lead_after_merge[0][0] == c2_primary and int(lead_after_merge[0][1]) == c2_building,
    f"{lead_after_merge}",
)
c2_update = client.put(f"/api/v1/leads/{c2_lead}", json={"status": "visited"})
check(
    "C2 合并后单据仅改状态可保存（原 400『字典楼栋不属于所选小区』）",
    c2_update.status_code == 200,
    f"{c2_update.status_code} {c2_update.text[:160]}",
)

c2_unmerge = client.post(UNMERGE, json={"primary_id": c2_primary, "merged_id": c2_child})
check("C2 解除合并成功", c2_unmerge.status_code == 200, c2_unmerge.text[:200])
lead_after_unmerge = exec_sql("SELECT community_id FROM leads WHERE id = :i", i=c2_lead)
check(
    "C2 解除合并后单据随楼栋拆回被并小区（归属与楼栋一致）",
    lead_after_unmerge and lead_after_unmerge[0][0] == c2_child,
    f"{lead_after_unmerge}",
)
c2_update2 = client.put(f"/api/v1/leads/{c2_lead}", json={"status": "visited"})
check("C2 解除合并后单据仍可编辑", c2_update2.status_code == 200, c2_update2.text[:160])
cleanup()

# ============================================================
# C2-a：仅选小区（无楼栋/户室）与仅选户室两种单据同样改指
# ============================================================
c2a_primary = make_community(f"{PREFIX}C2a主档")
c2a_child = make_community(f"{PREFIX}C2a被并")
c2a_building = add_building(c2a_child, "06")
c2a_room_resp = client.post(
    f"{API}/buildings/{c2a_building}/rooms", json={"building_id": c2a_building, "floor": "6", "room_suffix": "01"}
)
assert c2a_room_resp.status_code == 201, c2a_room_resp.text
c2a_room = int(exec_sql("SELECT id FROM bd_rooms WHERE building_id = :b LIMIT 1", b=c2a_building)[0][0])

c2a_room_lead = client.post(
    "/api/v1/leads",
    json={
        "community_name": f"{PREFIX}C2a户室小区",
        "community_id": c2a_child,
        "room_id": c2a_room,
        "dict_status": "linked",
        "customer_name": f"{PREFIX}C2a户室客户",
        "customer_phone": "13800000001",
        "source": "walk_in",
        "status": "pending_visit",
    },
)
check("C2-a 前置：仅选户室线索创建成功", c2a_room_lead.status_code == 201, c2a_room_lead.text[:160])
c2a_room_lead_id = c2a_room_lead.json()["id"]
c2a_plain_lead = client.post(
    "/api/v1/leads",
    json={
        "community_name": f"{PREFIX}C2a小区级",
        "community_id": c2a_child,
        "dict_status": "manual",
        "customer_name": f"{PREFIX}C2a小区客户",
        "customer_phone": "13800000002",
        "source": "walk_in",
        "status": "pending_visit",
    },
)
check("C2-a 前置：仅选小区线索创建成功", c2a_plain_lead.status_code == 201, c2a_plain_lead.text[:160])
c2a_plain_lead_id = c2a_plain_lead.json()["id"]

c2a_merge = client.post(MERGE, json={"primary_id": c2a_primary, "merge_ids": [c2a_child]})
check("C2-a 合并成功（户室引用不触发子查询多行错误）", c2a_merge.status_code == 200, c2a_merge.text[:200])
c2a_rows = exec_sql(
    "SELECT id, community_id FROM leads WHERE id = ANY(:ids)", ids=[c2a_room_lead_id, c2a_plain_lead_id]
)
moved_map = {str(r[0]): r[1] for r in c2a_rows}
check(
    "C2-a 仅选户室 / 仅选小区两类单据均改指主档",
    moved_map.get(c2a_room_lead_id) == c2a_primary and moved_map.get(c2a_plain_lead_id) == c2a_primary,
    f"{moved_map}",
)
check(
    "C2-a 改指后两类单据均可编辑",
    client.put(f"/api/v1/leads/{c2a_room_lead_id}", json={"status": "visited"}).status_code == 200
    and client.put(f"/api/v1/leads/{c2a_plain_lead_id}", json={"status": "visited"}).status_code == 200,
)
cleanup()

# ============================================================
# C2-b：撞号楼栋留在原小区时，其引用单据不得被改指（避免新造脏关联）
# ============================================================
c2b_primary = make_community(f"{PREFIX}C2b主档")
c2b_child = make_community(f"{PREFIX}C2b被并")
add_building(c2b_primary, "01")
c2b_building = add_building(c2b_child, "01")
c2b_lead = make_lead(c2b_child, c2b_building, "C2b")
c2b_merge = client.post(MERGE, json={"primary_id": c2b_primary, "merge_ids": [c2b_child]})
check("C2-b 撞号合并成功", c2b_merge.status_code == 200, c2b_merge.text[:200])
c2b_after = exec_sql("SELECT community_id FROM leads WHERE id = :i", i=c2b_lead)
check(
    "C2-b 楼栋撞号留在原小区时，其引用单据保持原小区（不产生新脏关联）",
    c2b_after and c2b_after[0][0] == c2b_child,
    f"{c2b_after}",
)
c2b_update = client.put(f"/api/v1/leads/{c2b_lead}", json={"status": "visited"})
check("C2-b 该单据仍可编辑", c2b_update.status_code == 200, c2b_update.text[:160])
cleanup()

# ============================================================
# C3：合并 → 解除合并 → 再合并（原 uq_alias_source 冲突永久 400）
# ============================================================
c3_primary = make_community(f"{PREFIX}C3主档")
c3_child = make_community(f"{PREFIX}C3被并")
add_building(c3_child, "09")
c3_first = client.post(MERGE, json={"primary_id": c3_primary, "merge_ids": [c3_child]})
check("C3 首次合并成功", c3_first.status_code == 200, c3_first.text[:200])
c3_alias_after_first = exec_sql(
    "SELECT is_deleted FROM community_aliases WHERE alias_name = :a AND data_source = 'merge_operation'",
    a=f"{PREFIX}C3被并",
)
check(
    "C3 首次合并写入并入别名（未删除）",
    c3_alias_after_first and c3_alias_after_first[0][0] is False,
    f"{c3_alias_after_first}",
)
c3_unmerge = client.post(UNMERGE, json={"primary_id": c3_primary, "merged_id": c3_child})
check("C3 解除合并成功", c3_unmerge.status_code == 200, c3_unmerge.text[:200])
c3_alias_after_unmerge = exec_sql(
    "SELECT is_deleted FROM community_aliases WHERE alias_name = :a AND data_source = 'merge_operation'",
    a=f"{PREFIX}C3被并",
)
check(
    "C3 解除合并把并入别名标记删除（行保留，唯一约束仍占用）",
    c3_alias_after_unmerge and c3_alias_after_unmerge[0][0] is True,
    f"{c3_alias_after_unmerge}",
)
c3_second = client.post(MERGE, json={"primary_id": c3_primary, "merge_ids": [c3_child]})
check(
    "C3 再次合并同一小区成功（原 uq_alias_source 冲突 → 400）",
    c3_second.status_code == 200,
    f"{c3_second.status_code} {c3_second.text[:200]}",
)
c3_alias_after_second = exec_sql(
    "SELECT is_deleted FROM community_aliases WHERE alias_name = :a AND data_source = 'merge_operation'",
    a=f"{PREFIX}C3被并",
)
check(
    "C3 再合并复用软删别名行（不新增重复行）",
    len(c3_alias_after_second) == 1 and c3_alias_after_second[0][0] is False,
    f"{c3_alias_after_second}",
)
c3_buildings = exec_sql("SELECT building_no FROM bd_buildings WHERE community_id = :cid", cid=c3_primary)
check("C3 再合并后字典楼栋已在主档", [r[0] for r in c3_buildings] == ["09"], f"{c3_buildings}")
cleanup()

# ============================================================
# C3-b：解除合并后并入「另一个」主档（别名行挂着旧主档 id）
# ============================================================
c3b_old = make_community(f"{PREFIX}C3b旧主档")
c3b_new = make_community(f"{PREFIX}C3b新主档")
c3b_child = make_community(f"{PREFIX}C3b被并")
add_building(c3b_child, "02")
check(
    "C3-b 首次合并到旧主档成功",
    client.post(MERGE, json={"primary_id": c3b_old, "merge_ids": [c3b_child]}).status_code == 200,
)
check(
    "C3-b 解除合并成功",
    client.post(UNMERGE, json={"primary_id": c3b_old, "merged_id": c3b_child}).status_code == 200,
)
c3b_second = client.post(MERGE, json={"primary_id": c3b_new, "merge_ids": [c3b_child]})
check(
    "C3-b 解除合并后并入另一主档成功（别名行改挂新主档，原 400）",
    c3b_second.status_code == 200,
    f"{c3b_second.status_code} {c3b_second.text[:200]}",
)
c3b_alias = exec_sql(
    "SELECT community_id, is_deleted FROM community_aliases WHERE alias_name = :a AND data_source = 'merge_operation'",
    a=f"{PREFIX}C3b被并",
)
check(
    "C3-b 被并小区名别名改挂新主档且未删除",
    c3b_alias and c3b_alias[0][0] == c3b_new and c3b_alias[0][1] is False,
    f"{c3b_alias} new_primary={c3b_new}",
)
cleanup()

# ============================================================
# 收尾
# ============================================================
left = exec_sql(
    "SELECT (SELECT count(*) FROM communities WHERE name LIKE :p) + "
    "(SELECT count(*) FROM bd_buildings b JOIN communities c ON c.id = b.community_id WHERE c.name LIKE :p) + "
    "(SELECT count(*) FROM community_aliases WHERE alias_name LIKE :p)",
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
