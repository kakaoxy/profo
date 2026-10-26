"""E2E：小区合并「信息取最大合集」（SPEC `community-merge-union` §8.2）.

覆盖报障场景（b 信息完整/名字错 并入 a 名字对/信息不全）与同类相邻缺陷：
  S1  画像并集：b 的画像字段补入空的主档（本场景主档预设 developer 供 S2，
      故实补 8 项），主档名称不变，b 名成为别名
  S2  主档优先：主档已有非空值永不被子档覆盖（D1）
  S3  户型图随迁：b 的图片改挂 a，并带 origin 可逆标记
  S4  图片 URL 撞唯一索引：不 IntegrityError，重复那条软删、解除合并可复活
  S5  待审条目改指：合并后归属主档，审核转正后楼栋落主档
  S6  待审撞名：主档已有同名 open 条目 → 引用改挂 + 本条 merged（不 500）
  S7  竞品改指：owner 侧改指主档，自环边删除
  S7-b 竞品重复边：优先保留主档原行，解除合并后主档关系不丢
  S8  链式合并：B→A→C 后 C 的 merged_children 含 B，origin 保留最初归属 B
  S9  解除合并对称：画像原样、图片回迁、待审回迁、主档补入画像保留（D5）
  S10 预览一致性：preview 的 after 与真实合并后详情逐字段相等
  S11 归档写入守卫：归档小区补录楼栋 409、上传 409（且守卫先于落盘，无孤儿文件）、
      导入跳过；线索图库端点仍宽松（200 空列表，不被守卫误伤）
  S12 重复合并/清理
  S13 预览/实际同序：多子档「先到先得」两侧取值一致（防 AC-6 漂移）
  S14 预览真只读：捕获实际 SQL，预览全程无 FOR UPDATE、合并仍加行锁

命令: cd backend && UPLOAD_DIR="$(pwd)/static/uploads" .venv/bin/python tests/e2e/test_bd_merge_union.py

命令: cd backend && .venv/bin/python tests/e2e/test_bd_merge_union.py
产物: tests/e2e/artifacts/e2e-bd-merge-union-<ts>.txt（由 run_all.sh / 手动 tee 生成）

[不拆分理由] 本文件是**单事务链路的场景脚本**：全程共用一个认证 TestClient、
一份 cleanup() 造数台账，以及跨场景传递的合并状态（S3/S4 依赖 S1/S2 留下的 a_id/b_id
未解除的合并态；S9 依赖 S3/S4 的图片；S13 的「先到先得」要求同一主档下两个子档）。
拆成多文件会让每段各自重建客户端与造数，反而丢失「一次合并的真实副作用链」这一
验证目标，也无法产出单份可复验工件（AGENTS：E2E 结束时产出可复验、可重跑工件）。
体量与既有同类工件一致（test_bd_perf_security_fixes.py 669 行）。
"""

# ruff: noqa: E402 —— env 注入必须先于业务 import（backend/ 目录直跑找不到根 .env）

import base64
import os
import sys
from pathlib import Path

sys.path.insert(0, ".")

for _line in Path("../.env").read_text().splitlines():
    _line = _line.strip()
    if _line and "=" in _line and not _line.startswith("#"):
        _k, _v = _line.split("=", 1)
        os.environ.setdefault(_k.strip(), _v.strip())
os.environ["UPLOAD_DIR"] = str(Path("static/uploads").resolve())
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")

from fastapi.testclient import TestClient
from sqlalchemy import text

import db
from main import app
from services.property.dict_import_loader import SkippedArchivedCommunityError, load_community_by_copy
from utils.auth import AUDIENCE_ADMIN, create_access_token
from utils.common import limiter

PREFIX = "__MU"
API = "/api/v1/admin/building-dictionary"
MERGE = "/api/v1/admin/communities/merge"
PREVIEW = "/api/v1/admin/communities/merge/preview"
UNMERGE = "/api/v1/admin/communities/unmerge"

results: list[tuple[str, bool, str]] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    results.append((name, ok, detail))
    print(f"{'✅' if ok else '❌'} {name}" + (f" — {detail}" if detail else ""))


def exec_sql(sql: str, **params: object) -> list[tuple]:
    with db.engine.begin() as conn:
        result = conn.execute(text(sql), params)
        return list(result) if result.returns_rows else []


# ---------- 认证客户端（合并端点限流 20/hour：先清窗口） ----------
limiter.reset()
with db.engine.connect() as _c:
    _row = _c.execute(text("SELECT id, token_version FROM users WHERE username='admin' LIMIT 1")).one()
_admin_id, _admin_ver = str(_row[0]), int(_row[1])
_token = create_access_token(data={"sub": _admin_id, "role": "admin", "ver": _admin_ver}, audience=AUDIENCE_ADMIN)
client = TestClient(app, cookies={"access_token": _token})
client.headers["X-Requested-With"] = "XMLHttpRequest"


def cleanup() -> None:
    """清理本用例造数（引用 → 待审 → 竞品 → 图片 → 户室 → 楼栋 → 别名 → 小区）."""
    ids = [r[0] for r in exec_sql("SELECT id FROM communities WHERE name LIKE :p", p=f"{PREFIX}%")]
    exec_sql(
        "DELETE FROM bd_pending_references WHERE pending_id IN (SELECT id FROM bd_pending_entries WHERE name LIKE :p)",
        p=f"{PREFIX}%",
    )
    exec_sql("DELETE FROM bd_pending_entries WHERE name LIKE :p", p=f"{PREFIX}%")
    exec_sql("DELETE FROM community_aliases WHERE alias_name LIKE :p", p=f"{PREFIX}%")
    if ids:
        exec_sql("DELETE FROM community_images WHERE community_id = ANY(:ids)", ids=ids)
        exec_sql(
            "DELETE FROM community_competitors WHERE community_id = ANY(:ids) OR competitor_community_id = ANY(:ids)",
            ids=ids,
        )
        exec_sql(
            "DELETE FROM bd_rooms WHERE building_id IN (SELECT id FROM bd_buildings WHERE community_id = ANY(:ids))",
            ids=ids,
        )
        exec_sql("DELETE FROM bd_buildings WHERE community_id = ANY(:ids)", ids=ids)
        exec_sql("DELETE FROM communities WHERE id = ANY(:ids)", ids=ids)


def make_community(name: str, district: str = "浦东新区", bc: str = "金杨") -> str:
    r = client.post(f"{API}/communities", json={"name": name, "district": district, "business_circle": bc})
    assert r.status_code == 201, r.text
    return r.json()["id"]


PROFILE = ("ring", "property_types", "era_from", "era_to", "developer", "property_mgmt", "address", "lng", "lat")

B_FULL = {
    "ring": "内环至中环",
    "property_types": ["住宅-公寓", "住宅-新里"],
    "era_from": 1993,
    "era_to": 1998,
    "developer": "上海锦和投资集团有限公司",
    "property_mgmt": "上海陆家嘴物业管理有限公司",
    "address": "金杨路660弄,金台路161弄",
    "lng": 121.591596,
    "lat": 31.25587,
}


def detail(cid: str) -> dict:
    r = client.get(f"{API}/communities/{cid}")
    assert r.status_code == 200, r.text
    return r.json()


def merge(primary: str, children: list[str]) -> tuple[int, dict]:
    r = client.post(MERGE, json={"primary_id": primary, "merge_ids": children})
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {})


def unmerge(primary: str, merged: str) -> tuple[int, dict]:
    r = client.post(UNMERGE, json={"primary_id": primary, "merged_id": merged})
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {})


def preview(primary: str, children: list[str]) -> tuple[int, dict]:
    r = client.post(PREVIEW, json={"primary_id": primary, "merge_ids": children})
    return r.status_code, (r.json() if r.headers.get("content-type", "").startswith("application/json") else {})


def add_image(community_id: str, url: str, sort_order: int = 0) -> None:
    exec_sql(
        "INSERT INTO community_images "
        "(community_id, url, thumbnail_url, source, description, sort_order, is_deleted, created_at, updated_at) "
        "VALUES (:cid, :u, :u, 'uploaded', 'E2E', :s, false, now(), now())",
        cid=community_id,
        u=url,
        s=sort_order,
    )


cleanup()

# ============================================================
# S1 / S2 / S10：画像并集 + 主档优先 + 预览一致性
# ============================================================
print("\n=== S1 报障场景：b（完整/错名）→ a（名字对/不全） ===")
a_id = make_community(f"{PREFIX}A名字正确")
b_id = make_community(f"{PREFIX}B信息完整名字错")
assert client.patch(f"{API}/communities/{b_id}", json=B_FULL).status_code == 200
# 主档已有 developer（S2：不得被子档覆盖）
assert client.patch(f"{API}/communities/{a_id}", json={"developer": "主档原有开发商"}).status_code == 200
a_before = detail(a_id)
b_before = detail(b_id)

s, prev = preview(a_id, [b_id])
check("S10 预览返回 200", s == 200, str(s))
preview_map = {row["field"]: row for row in prev.get("profile", [])}
check(
    "S10 预览预告 ring/era/developer 的取值来源正确",
    preview_map.get("ring", {}).get("after") == B_FULL["ring"]
    and preview_map.get("ring", {}).get("source", "").startswith("child:")
    and preview_map.get("developer", {}).get("source") == "kept",
    f"ring={preview_map.get('ring')} developer={preview_map.get('developer')}",
)
check(
    "S10 预览计数含楼栋/图片/待审（本次全 0 属正常）",
    prev.get("counts", {}).get("buildings") == 0 and prev.get("counts", {}).get("images") == 0,
    str(prev.get("counts")),
)

s, merged = merge(a_id, [b_id])
check("S1 合并返回 200", s == 200 and merged.get("success"), str(merged)[:160])
a_after = detail(a_id)

lost = [
    f
    for f in PROFILE
    if f != "developer" and (b_before.get(f) not in (None, "", [])) and (a_after.get(f) in (None, "", []))
]
check("S1 b 的 8 个画像字段全部补入主档（developer 走 S2 保留）", not lost, f"仍缺 {lost}")
check(
    "S1 补入值逐字段等于 b 原值",
    all(a_after.get(f) == b_before.get(f) for f in PROFILE if f != "developer"),
    str(
        {
            f: (a_after.get(f), b_before.get(f))
            for f in PROFILE
            if f != "developer" and a_after.get(f) != b_before.get(f)
        }
    ),
)
check(
    "S2 主档已有 developer 未被覆盖（D1）", a_after.get("developer") == "主档原有开发商", str(a_after.get("developer"))
)
check("S1 主档名称保留 a（D2）", a_after["name"] == a_before["name"], a_after["name"])
check(
    "S1 合并回执列出补入字段",
    isinstance(merged.get("profile_filled"), list) and "ring" in merged["profile_filled"],
    str(merged.get("profile_filled")),
)
check(
    "S10 预览 after 与真实合并后详情逐字段一致（AC-6）",
    all(a_after.get(row["field"]) == row["after"] for row in prev.get("profile", [])),
    str(
        [
            (row["field"], row["after"], a_after.get(row["field"]))
            for row in prev.get("profile", [])
            if a_after.get(row["field"]) != row["after"]
        ]
    ),
)
# 别名：b 名可搜索命中主档
r = client.get(f"{API}/communities", params={"keyword": f"{PREFIX}B信息完整名字错", "page": 1, "page_size": 10})
hit_ids = [item["id"] for item in (r.json().get("items") or [])]
check("S1 子档名成为主档别名（搜索命中主档）", a_id in hit_ids, str(hit_ids))
# 审计留痕
audit = exec_sql(
    "SELECT after FROM operation_logs WHERE action='community_merge' AND resource_id=:rid "
    "ORDER BY created_at DESC LIMIT 1",
    rid=a_id,
)
audit_after = audit[0][0] if audit else {}
check(
    "S1 合并审计含画像补入明细",
    bool(audit) and isinstance(audit_after, dict) and "profile_filled" in audit_after,
    str(audit_after)[:120] if audit else "无审计",
)
# 审计必须能区分「改之前」与「改之后」：主档对象是被就地改写的，若在改写后才取
# before，两者会完全相同（实施期实测踩过），留痕等于没留 —— SPEC §5.4 / AC-7 失效。
before_map = audit_after.get("profile_before") or {}
after_map = audit_after.get("profile_after") or {}
check(
    "S1 审计 profile_before 取的是改写前的值（before != after）",
    bool(before_map) and bool(after_map) and before_map != after_map and before_map.get("ring") is None,
    f"before={ {k: before_map.get(k) for k in ('ring', 'era_from')} } "
    f"after={ {k: after_map.get(k) for k in ('ring', 'era_from')} }",
)
check(
    "S1 审计快照只覆盖被补入的字段（键集合与 profile_filled 一致）",
    set(before_map) == set(after_map) == set(audit_after.get("profile_filled") or []),
    f"before键={sorted(before_map)} filled={sorted(audit_after.get('profile_filled') or [])}",
)

# ============================================================
# S3 / S4：户型图随迁 + URL 撞唯一索引
# ============================================================
print("\n=== S3/S4 户型图随迁 ===")
s, _ = unmerge(a_id, b_id)
assert s == 200, s
add_image(b_id, f"/static/uploads/{PREFIX}b-1.png", 0)
add_image(b_id, f"/static/uploads/{PREFIX}b-2.png", 1)
# 主档与子档各有一张同 URL（S4：撞 uq_community_image_url）
add_image(a_id, f"/static/uploads/{PREFIX}shared.png", 0)
add_image(b_id, f"/static/uploads/{PREFIX}shared.png", 2)

s, merged = merge(a_id, [b_id])
check(
    "S4 存在同 URL 图片时合并仍成功（原 IntegrityError → 400）", s == 200 and merged.get("success"), str(merged)[:160]
)
imgs_a = client.get(f"/api/v1/admin/communities/{a_id}/images", params={"page": 1, "page_size": 50}).json()
imgs_b = client.get(f"/api/v1/admin/communities/{b_id}/images", params={"page": 1, "page_size": 50})
check("S3 主档图库拿到子档 2 张（共享那条去重）", imgs_a["total"] == 3, f"主档={imgs_a['total']}")
check("S3 子档图库已清空", imgs_b.status_code == 404, f"{imgs_b.status_code}")
# SPEC §5.3 要求两个读端点同口径：C 端公开图库也不得看到归档子档
pub_b = client.get(f"/api/v1/public/communities/{b_id}/images")
check("S3 公开图库端点对归档子档同样 404（C 端不看到归档档）", pub_b.status_code == 404, str(pub_b.status_code))
pub_a = client.get(f"/api/v1/public/communities/{a_id}/images")
check(
    "S3 公开图库端点主档正常返回 3 张",
    pub_a.status_code == 200 and pub_a.json().get("total") == 3,
    f"{pub_a.status_code} {str(pub_a.json())[:60]}",
)
origins = exec_sql(
    "SELECT count(*) FROM community_images WHERE community_id=:a AND origin_community_id=:b",
    a=a_id,
    b=b_id,
)
check("S3 随迁图片带 origin 可逆标记", int(origins[0][0]) == 3, f"{origins}")
deduped = exec_sql(
    "SELECT count(*) FROM community_images WHERE community_id=:a AND origin_community_id=:b AND is_deleted",
    a=a_id,
    b=b_id,
)
check("S4 撞 URL 的那条被去重软删（1 张）", int(deduped[0][0]) == 1, f"{deduped}")

# ============================================================
# S9：解除合并对称（图片回迁 + 复活 + 画像原样 + 主档补入保留）
# ============================================================
print("\n=== S9 解除合并对称 ===")
s, _ = unmerge(a_id, b_id)
check("S9 解除合并 200", s == 200, str(s))
b_restored = detail(b_id)
check(
    "S9 子档画像原样还在（合并未污染子档行）",
    all(b_restored.get(f) == b_before.get(f) for f in PROFILE),
    str({f: (b_restored.get(f), b_before.get(f)) for f in PROFILE if b_restored.get(f) != b_before.get(f)}),
)
imgs_b2 = client.get(f"/api/v1/admin/communities/{b_id}/images", params={"page": 1, "page_size": 50}).json()
check("S9 图片回迁子档（3 张，含被去重软删的那张复活）", imgs_b2["total"] == 3, f"子档={imgs_b2['total']}")
a_kept = detail(a_id)
check(
    "S9 主档补入的画像保留（D5：解除不回退）",
    a_kept.get("ring") == B_FULL["ring"] and a_kept.get("era_from") == B_FULL["era_from"],
    f"ring={a_kept.get('ring')}",
)

# ============================================================
# S5 / S6：待审条目改指 + 撞名合并
# ============================================================
print("\n=== S5/S6 待审条目 ===")
c_id = make_community(f"{PREFIX}C待审场景")
d_id = make_community(f"{PREFIX}D待审场景")
r = client.post(
    f"{API}/pending",
    json={"kind": "building", "name": f"{PREFIX}待审楼栋", "parent_kind": "community", "parent_id": d_id},
)
check("S5 前置：提交待审楼栋 201", r.status_code == 201, r.text[:120])
pid = int(exec_sql("SELECT id FROM bd_pending_entries WHERE name=:n", n=f"{PREFIX}待审楼栋")[0][0])

# S6：主档已有同名 open 条目
r = client.post(
    f"{API}/pending",
    json={"kind": "building", "name": f"{PREFIX}待审楼栋", "parent_kind": "community", "parent_id": c_id},
)
check("S6 前置：主档同名待审条目 201", r.status_code == 201, r.text[:120])
main_pid = int(
    exec_sql("SELECT id FROM bd_pending_entries WHERE name=:n AND community_id=:c", n=f"{PREFIX}待审楼栋", c=c_id)[0][0]
)

s, merged = merge(c_id, [d_id])
check(
    "S6 主档已有同名 open 条目时合并仍成功（撞 uq_pending_open）", s == 200 and merged.get("success"), str(merged)[:160]
)
scope = exec_sql(
    "SELECT community_id, community_scope, origin_community_id FROM bd_pending_entries WHERE id=:i", i=pid
)[0]
check(
    "S6 子档待审条目并入主档同名条目（本条 origin 记录原归属）",
    scope[2] == d_id,
    str(scope),
)
open_after = exec_sql(
    "SELECT count(*) FROM bd_pending_entries WHERE kind='building' AND status='pending' AND community_scope=:c",
    c=c_id,
)
check("S6 主档只剩 1 条 open 待审楼栋（不产生重复）", int(open_after[0][0]) == 1, f"{open_after}")
s, _ = unmerge(c_id, d_id)
assert s == 200, s

# S5：不撞名场景 → 直接改指
e_id = make_community(f"{PREFIX}E待审场景")
f_id = make_community(f"{PREFIX}F待审场景")
r = client.post(
    f"{API}/pending",
    json={"kind": "building", "name": f"{PREFIX}独有待审楼栋", "parent_kind": "community", "parent_id": f_id},
)
assert r.status_code == 201, r.text
solo_pid = int(exec_sql("SELECT id FROM bd_pending_entries WHERE name=:n", n=f"{PREFIX}独有待审楼栋")[0][0])
s, merged = merge(e_id, [f_id])
check("S5 合并成功", s == 200, str(merged)[:120])
solo = exec_sql(
    "SELECT community_id, community_scope, origin_community_id FROM bd_pending_entries WHERE id=:i", i=solo_pid
)[0]
check(
    "S5 待审条目归属改指主档（community_id + scope）",
    solo[0] == e_id and solo[1] == e_id and solo[2] == f_id,
    str(solo),
)
r = client.post(f"{API}/review/{solo_pid}/resolve", json={"action": "create"})
landed = exec_sql(
    "SELECT b.community_id, c.is_active FROM bd_buildings b JOIN communities c ON c.id=b.community_id "
    "WHERE b.building_no=:n",
    n=f"{PREFIX}独有待审楼栋",
)
check(
    "S5 审核转正后楼栋落在主档（原落进已归档子档）",
    r.status_code == 200 and landed and landed[0][0] == e_id and landed[0][1] is True,
    f"{r.status_code} {landed}",
)

# ============================================================
# S7：竞品关系改指 + 自环清理
# ============================================================
print("\n=== S7 竞品关系 ===")
g_id = make_community(f"{PREFIX}G竞品主")
h_id = make_community(f"{PREFIX}H竞品子")
i_id = make_community(f"{PREFIX}I竞品目标")
r = client.post(f"/api/v1/monitor/communities/{h_id}/competitors", json={"competitor_community_id": i_id})
check("S7 前置：子档添加竞品 201", r.status_code == 201, str(r.status_code))
r = client.post(f"/api/v1/monitor/communities/{h_id}/competitors", json={"competitor_community_id": g_id})
check("S7 前置：子档把主档设为竞品（合并后应成自环）", r.status_code == 201, str(r.status_code))
s, merged = merge(g_id, [h_id])
edges = exec_sql(
    "SELECT community_id, competitor_community_id, origin_community_id FROM community_competitors "
    "WHERE (community_id=:g OR competitor_community_id=:g) AND is_deleted=false",
    g=g_id,
)
targets = {row[1] for row in edges}
check("S7 竞品边改指主档", all(row[0] == g_id for row in edges), str(edges))
check("S7 指向子档的竞品边也改指主档", h_id not in targets, str(targets))
check("S7 自环边不可见（主档不把自己当竞品）", g_id not in targets, str(targets))
check("S7 原竞品目标保留", i_id in targets, str(targets))
# v101：自环/重复边不再物理删除，改为软删保留，否则解除合并无法复活子档那条边。
# 被软删的行保留**原坐标**（子档 H→主档 G）并记 origin=H —— 解除合并据此原样复原，
# 不会变成无意义的 G→G。
self_loop_row = exec_sql(
    "SELECT is_deleted, origin_community_id FROM community_competitors "
    "WHERE community_id=:h AND competitor_community_id=:g AND is_deleted=true",
    h=h_id,
    g=g_id,
)
check(
    "S7 自环边以软删保留（记 origin=子档，可随解除合并复原），不物理删除",
    len(self_loop_row) == 1 and self_loop_row[0][0] is True and self_loop_row[0][1] == h_id,
    f"{self_loop_row}",
)

# S7-b：主档已有同一条竞品关系时，重复边必须**保留主档那条**（origin IS NULL），
# 否则解除合并会把唯一一条边搬回子档 → 主档平白丢掉它本来就有的竞品关系。
g2 = make_community(f"{PREFIX}G2竞品主")
h2 = make_community(f"{PREFIX}H2竞品子")
i2 = make_community(f"{PREFIX}I2竞品目标")
for owner in (g2, h2):
    client.post(f"/api/v1/monitor/communities/{owner}/competitors", json={"competitor_community_id": i2})
s, merged = merge(g2, [h2])
rows = exec_sql(
    "SELECT origin_community_id FROM community_competitors WHERE community_id=:g AND competitor_community_id=:i",
    g=g2,
    i=i2,
)
check(
    "S7-b 重复竞品边只留 1 条可见行，且留的是主档原行（origin IS NULL）",
    s == 200 and len(rows) == 1 and rows[0][0] is None,
    f"{s} {str(merged)[:150]} rows={[(str(r[0])[:8] if r[0] else None) for r in rows]}",
)
# S7-c（v101）：子档那条重复边不再物理删除，而是软删 + 记 origin 保留，
# 解除合并时复活回子档。此前它被 DELETE 掉，子档的竞品关系永久丢失。
soft = exec_sql(
    "SELECT community_id, competitor_community_id, origin_community_id, is_deleted "
    "FROM community_competitors WHERE origin_community_id=:h",
    h=h2,
)
check(
    "S7-c 子档重复边被软删保留（记 origin + is_deleted=true，不物理删除）",
    len(soft) == 1 and soft[0][3] is True and soft[0][2] == h2,
    f"{soft}",
)
s, _ = unmerge(g2, h2)
still = exec_sql(
    "SELECT count(*) FROM community_competitors "
    "WHERE community_id=:g AND competitor_community_id=:i AND is_deleted=false",
    g=g2,
    i=i2,
)
check(
    "S7-b 解除合并后主档的竞品关系仍在（不因合并期间的取舍而丢）",
    s == 200 and int(still[0][0]) == 1,
    f"{s} 剩余={still[0][0]}",
)
back = exec_sql(
    "SELECT competitor_community_id, is_deleted FROM community_competitors WHERE community_id=:h",
    h=h2,
)
check(
    "S7-c 解除合并后子档的竞品边被复活（原本会永久丢失）",
    s == 200 and len(back) == 1 and back[0][0] == i2 and back[0][1] is False,
    f"{back}",
)
exec_sql(
    "DELETE FROM community_competitors WHERE community_id=ANY(:ids) OR competitor_community_id=ANY(:ids)",
    ids=[g2, h2, i2],
)
exec_sql("DELETE FROM communities WHERE id = ANY(:ids)", ids=[g2, h2, i2])

# ============================================================
# S8：链式合并（B→A→C）
# ============================================================
print("\n=== S8 链式合并 ===")
cleanup()
j_id = make_community(f"{PREFIX}J链式主档")
k_id = make_community(f"{PREFIX}K链式子档")
l_id = make_community(f"{PREFIX}L链式最终")
client.post(f"{API}/buildings", json={"community_id": k_id, "building_no": "01"})
s, _ = merge(j_id, [k_id])
check("S8 前置：K→J 合并 200", s == 200, str(s))
origin_1 = exec_sql("SELECT origin_community_id FROM bd_buildings WHERE community_id=:j", j=j_id)[0][0]
s, merged = merge(l_id, [j_id])
check("S8 J→L 合并 200", s == 200, str(merged)[:120])
origin_2 = exec_sql("SELECT origin_community_id FROM bd_buildings WHERE community_id=:l", l=l_id)[0][0]
check(
    "S8 origin 保留最初归属 K（原被覆盖成中间主档 J）",
    origin_1 == k_id and origin_2 == k_id,
    f"第一次={str(origin_1)[:8]} 第二次={str(origin_2)[:8]} K={k_id[:8]}",
)
children_l = [x["id"] for x in detail(l_id).get("merged_children") or []]
check("S8 主档 L 的 merged_children 含 J 与 K（层级压平）", j_id in children_l and k_id in children_l, str(children_l))
k_ptr = exec_sql("SELECT merged_into_id FROM communities WHERE id=:k", k=k_id)[0][0]
check("S8 K 的 merged_into_id 改指最终主档 L", k_ptr == l_id, str(k_ptr))
check(
    "S8 回执含层级压平计数",
    merged.get("archived_children_reparented", 0) >= 1,
    str(merged.get("archived_children_reparented")),
)
# R3（SPEC §9 L2）：压平后 K 的原归属只剩「它曾在 J 下」这一事实，而 J 上已无痕迹。
# 审计里必须留下被改指的孙档名单，否则层级关系永久不可重建。
audit_after = exec_sql(
    "SELECT after FROM operation_logs WHERE action='community_merge' AND resource_id=:r "
    "ORDER BY created_at DESC LIMIT 1",
    r=l_id,
)[0][0]
reparented_detail = audit_after.get("archived_children_reparented_detail") or []
check(
    "S8 审计记录被压平的孙档名单（含 id 与名字，可人工重建层级）",
    any(item.get("id") == k_id and item.get("name") == f"{PREFIX}K链式子档" for item in reparented_detail),
    str(reparented_detail),
)
check(
    "S8 孙档名单不进 API 回执（回执契约不变）",
    "archived_children_reparented_detail" not in merged,
    f"keys={sorted(merged)}",
)
s, un = unmerge(l_id, k_id)
buildings_k = exec_sql("SELECT count(*) FROM bd_buildings WHERE community_id=:k", k=k_id)[0][0]
check(
    "S8 可从最终主档直接解除 K 且楼栋回迁（原 400 / 楼栋成孤儿）",
    s == 200 and int(buildings_k) == 1,
    f"{s} 楼栋={buildings_k}",
)

# ============================================================
# S11：归档小区写入守卫
# ============================================================
print("\n=== S11 归档小区写入守卫 ===")
cleanup()
m_id = make_community(f"{PREFIX}M守卫主档")
n_id = make_community(f"{PREFIX}N守卫子档")
s, _ = merge(m_id, [n_id])
assert s == 200, s
r = client.post(f"{API}/buildings", json={"community_id": n_id, "building_no": "99"})
check("S11 归档小区补录楼栋 → 409（原 201 落进归档行）", r.status_code == 409, f"{r.status_code} {r.text[:120]}")
try:
    load_community_by_copy(
        db.engine,
        community_name=f"{PREFIX}N守卫子档",
        property_types=["住宅-公寓"],
        era_from=1993,
        era_to=1998,
        property_mgmt="某物业",
        developer="某开发商",
        district_area="浦东金杨",
        address="金杨路1弄",
        ring="内环至中环",
        lng=121.5,
        lat=31.2,
        rooms=[("01", "0101", None, None)],
    )
    skipped = False
    detail_msg = "未抛异常"
except SkippedArchivedCommunityError as e:
    skipped = True
    detail_msg = str(e)[:80]
check("S11 导入命中归档小区 → SkippedArchivedCommunityError（不落楼栋）", skipped, detail_msg)
orphan = exec_sql("SELECT count(*) FROM bd_buildings WHERE community_id=:n", n=n_id)[0][0]
check("S11 归档小区楼栋数未增加", int(orphan) == 0, f"{orphan}")

# --- 户型图写入守卫（SPEC D7：写归档行=「改了看不见」，须 409 且**先于落盘**）---
from settings import settings as _settings

upload_dir = Path(_settings.upload_dir)
before_files = {f.name for f in upload_dir.glob("*") if f.is_file()}
png = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)
r = client.post(
    f"/api/v1/admin/communities/{n_id}/images",
    files={"file": (f"{PREFIX}probe.png", png, "image/png")},
)
after_files = {f.name for f in upload_dir.glob("*") if f.is_file()}
check(
    "S11 归档小区上传户型图 → 409（读端点是 404，写须给主档名指路）",
    r.status_code == 409,
    f"{r.status_code} {r.text[:120]}",
)
check(
    "S11 409 文案指向主档",
    "守卫主档"
    in (r.json().get("message", "") if r.headers.get("content-type", "").startswith("application/json") else ""),
    str(r.json())[:120],
)
check(
    "S11 守卫在落盘之前：磁盘无孤儿文件",
    not (after_files - before_files),
    f"新增文件={sorted(after_files - before_files)}",
)
imgs_archived = exec_sql("SELECT count(*) FROM community_images WHERE community_id=:n", n=n_id)[0][0]
check("S11 归档小区图库未被写入", int(imgs_archived) == 0, f"{imgs_archived}")

# 正向对照：主档可正常上传（守卫不误伤）。dev 的 STORAGE_BACKEND=oss 无凭据，
# 任何真实上传都会在存储层 400，故本用例临时切到本地后端，让断言真正走通全链路。
from utils import storage as _storage

_storage._storage_backend = _storage.LocalStorage()
r = client.post(
    f"/api/v1/admin/communities/{m_id}/images",
    files={"file": (f"{PREFIX}ok.png", png, "image/png")},
)
_storage._storage_backend = None  # 复位，避免污染后续用例
new_files = {f.name for f in upload_dir.glob("*") if f.is_file()} - after_files
check("S11 主档上传户型图 201（守卫不误伤 active 小区）", r.status_code == 201, f"{r.status_code} {r.text[:120]}")
for f in new_files:
    (upload_dir / f).unlink(missing_ok=True)
exec_sql("DELETE FROM community_images WHERE community_id=:m", m=m_id)

# --- 守卫落在端点层而非服务层：线索链路必须保持宽松（返回空列表，不 404）---
lead = client.post(
    "/api/v1/leads",
    json={
        "community_name": f"{PREFIX}N守卫子档",
        "community_id": n_id,
        "customer_name": f"{PREFIX}守卫客户",
        "customer_phone": "13800000000",
        "source": "walk_in",
        "status": "pending_visit",
    },
)
check("S11 前置：引用归档小区的线索可创建", lead.status_code == 201, f"{lead.status_code} {lead.text[:100]}")
lead_id = lead.json()["id"]
r = client.get(f"/api/v1/leads/{lead_id}/community-images")
check(
    "S11 线索图库端点仍宽松（归档小区 → 200 空列表，不是 404）",
    r.status_code == 200 and r.json().get("total") == 0,
    f"{r.status_code} {str(r.json())[:80]}",
)
exec_sql("DELETE FROM leads WHERE id=:i", i=lead_id)

# ============================================================
# S14：预览是真正的只读（不加行锁），合并仍加行锁
# ============================================================
print("\n=== S14 预览不加行锁 / 合并仍加行锁 ===")
# 「预览只读、零副作用」是 SPEC §5.1 的契约。接线类改动必须验证消费方真实生效，
# 所以这里不只看编译通过，而是**捕获实际发出的 SQL**：预览全程不得出现 FOR UPDATE
# （否则每次勾选都会持住主档 + 全部子档的行锁，把并发的真实合并挡住）。
from sqlalchemy import event as _event

_captured: list[str] = []


def _record(conn, cursor, statement, parameters, context, executemany):
    _captured.append(statement)


_event.listen(db.engine, "before_cursor_execute", _record)

p14 = make_community(f"{PREFIX}P14主档")
c14 = make_community(f"{PREFIX}P14子档")
client.patch(f"{API}/communities/{c14}", json={"ring": "内环至中环"})


def _locking(statements: list[str]) -> list[str]:
    """挑出带行锁的语句（只报 offender，避免把整段 SQL 灌进产物）."""
    return [stmt for stmt in statements if "FOR UPDATE" in stmt.upper()]


_captured.clear()
_s, prev = preview(p14, [c14])
locked = _locking(_captured)
check("S14 前置：预览 200", prev.get("primary", {}).get("id") == p14, str(prev)[:80])
check(
    "S14 预览全程 SQL 不含 FOR UPDATE（只读契约真实成立）",
    not locked,
    "无锁语句" if not locked else locked[0][:140],
)

_captured.clear()
merge(p14, [c14])
locked_on_merge = [stmt for stmt in _locking(_captured) if "COMMUNITIES" in stmt.upper()]
check(
    "S14 合并仍对 communities 加行锁（并发保护未被削弱）",
    bool(locked_on_merge),
    locked_on_merge[0][:140] if locked_on_merge else "未观察到 communities 行锁",
)
_event.remove(db.engine, "before_cursor_execute", _record)

# ============================================================
# S13：预览与实际同序（多子档「先到先得」）
# ============================================================
print("\n=== S13 预览/实际同序（多子档先到先得） ===")
# 画像并集是「先到先得」：主档该字段为空 + 两个子档都有值且不同 → 必须取
# merge_ids 顺序里的第一个。若合并按 IN 的数据库任意序取、预览按请求序取，
# 两侧会给出不同答案（正是 AC-6 要杜绝的「预览说补 A、实际补 B」）。
# 注意：此处**不能** cleanup() —— S11 的 m_id/n_id 还要留给 S12 断言
# 「子档已归档 → 400」，提前清理会让 S12 因「主档不存在」拿到 400 而假绿。
for case, first_ring, expect_ring, expect_dev in (
    ("甲在前", "内环内", "内环内", "甲开发商"),
    ("乙在前", "外环外", "外环外", "乙开发商"),
):
    host = make_community(f"{PREFIX}P13主档{case}")
    # 固定语义：甲=内环内/甲开发商，乙=外环外/乙开发商；ordered 决定谁先来
    jia = make_community(f"{PREFIX}P13甲{case}")
    yi = make_community(f"{PREFIX}P13乙{case}")
    client.patch(f"{API}/communities/{jia}", json={"ring": "内环内", "developer": "甲开发商"})
    client.patch(f"{API}/communities/{yi}", json={"ring": "外环外", "developer": "乙开发商"})
    ordered = [jia, yi] if first_ring == "内环内" else [yi, jia]

    _s, prev = preview(host, ordered)
    claimed = {row["field"]: row["after"] for row in prev.get("profile", [])}
    _s, merged = merge(host, ordered)
    after = detail(host)
    check(
        f"S13 {case}：预览值 == 实际值 == 请求序第一个子档的值",
        claimed.get("ring") == after.get("ring") == expect_ring
        and claimed.get("developer") == after.get("developer") == expect_dev,
        f"预览 ring={claimed.get('ring')}/dev={claimed.get('developer')} "
        f"实际 ring={after.get('ring')}/dev={after.get('developer')} 预期 {expect_ring}",
    )
    check(
        f"S13 {case}：ring/developer 均记入补入清单",
        {"ring", "developer"} <= set(merged.get("profile_filled") or []),
        str(merged.get("profile_filled")),
    )

# ============================================================
# S12：重复合并 + 清理
# ============================================================
print("\n=== S12 重复合并 / 清理 ===")
s, body = merge(m_id, [n_id])
check("S12 对已归档子档再次合并 → 400（幂等拒绝）", s == 400, f"{s} {str(body)[:120]}")

cleanup()
left = exec_sql(
    "SELECT (SELECT count(*) FROM communities WHERE name LIKE :p) "
    "+ (SELECT count(*) FROM bd_pending_entries WHERE name LIKE :p)",
    p=f"{PREFIX}%",
)[0][0]
check("造数清理干净（0 残留）", int(left) == 0, f"残留={left}")

failed = [r for r in results if not r[1]]
print("\n" + "=" * 78)
print(f"断言 {len(results)} 条，通过 {len(results) - len(failed)} 条，失败 {len(failed)} 条")
for name, _ok, detail_msg in failed:
    print(f"  ❌ {name} — {detail_msg}")
print("=" * 78)
sys.exit(1 if failed else 0)
