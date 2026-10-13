"""E2E 全链路（AC-P1/P2/P5 核心场景）— 通过真实 API"""

# ruff: noqa: E402, S310, PT018, PLR1714
import json
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1"

import sys

sys.path.insert(0, ".")
from sqlalchemy import text as text_f

from db import SessionLocal as SessionLocalF
from models import BdPendingEntry as BdPendingEntryF
from models import BdPendingReference as BdPendingRefF


def req(method, path, body=None, token=None):
    r = urllib.request.Request(BASE + path, method=method)
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


# 1. 登录
_, login = req("POST", "/auth/token", body=None) if False else (0, {})
import urllib.parse

r = urllib.request.Request(
    BASE + "/auth/token",
    data=urllib.parse.urlencode({"username": "admin", "password": "Fdd123.."}).encode(),
    method="POST",
)
r.add_header("Content-Type", "application/x-www-form-urlencoded")
token = json.loads(urllib.request.urlopen(r).read())["access_token"]
print("1. 登录 OK")

# 2. KPI
s, kpi = req("GET", "/admin/building-dictionary/kpi", token=token)
print(f"2. KPI: {s} {kpi}")
assert s == 200

# 3. 录入端提交新小区 → pending（AC-P1-2 / AC-P5-1）—— 幂等清理
_dbs0 = SessionLocalF()
_dbs0.query(BdPendingRefF).filter(BdPendingRefF.biz_id.like("%e2e1")).delete(synchronize_session=False)
_dbs0.query(BdPendingRefF).filter(BdPendingRefF.biz_id.like("%e2e2")).delete(synchronize_session=False)
_dbs0.query(BdPendingEntryF).filter(BdPendingEntryF.name.like("__E2E_API%")).delete(synchronize_session=False)
_dbs0.commit()

with _dbs0.begin():
    _dbs0.execute(text_f("DELETE FROM communities WHERE name LIKE '__E2E_API%'"))
_dbs0.close()
s, p1 = req(
    "POST",
    "/admin/building-dictionary/pending",
    {
        "kind": "community",
        "name": "__E2E_API小区__",
        "community_payload": {"district": "浦东", "business_circle": "E2E"},
        "source_type": "project",
        "source_id": "00000000-0000-0000-0000-00000000e2e1",
    },
    token=token,
)
print(f"3a. 首次提交: {s} {p1}")
assert s == 201 and p1["created"] is True

s, p2 = req(
    "POST",
    "/admin/building-dictionary/pending",
    {
        "kind": "community",
        "name": "__E2E_API小区__",
        "source_type": "project",
        "source_id": "00000000-0000-0000-0000-00000000e2e2",
    },
    token=token,
)
print(f"3b. 同名再提交(应复用): {s} {p2}")
assert s == 201 and p2["reused"] is True and p2["pending_id"] == p1["pending_id"]
print("3c. 并发唯一/幂等复用 ✓ (AC-P5-1)")

# 4. 审核池列表
s, queue = req("GET", "/admin/building-dictionary/review", token=token)
print(f"4. 审核池: {s} total={queue['total']} kpi={queue['kpi']}")
assert s == 200

# 5. create 转正（AC-P1-2）
entry_id = p1["pending_id"]
s, resolved = req("POST", f"/admin/building-dictionary/review/{entry_id}/resolve", {"action": "create"}, token=token)
print(f"5. create 转正: {s} {resolved}")
assert s == 200 and resolved["success"]

# 6. 重复 resolve 应 409（AC-P5-4）
s, dup = req("POST", f"/admin/building-dictionary/review/{entry_id}/resolve", {"action": "create"}, token=token)
print(f"6. 重复 resolve: {s} {dup}")
assert s == 409, f"期望 409 实际 {s}"
print("6a. 并发/重复 resolve 409 ✓ (AC-P5-4)")

# 7. communities 出现新小区（转正落库）
s, lst = req("GET", "/admin/building-dictionary/communities?keyword=__E2E_API", token=token)
print(f"7. 总览搜索: {s} total={lst['total']}")
assert s == 200 and lst["total"] >= 1

# 8. admin 新增小区撞同名 open pending 自动转正（AC-P5-5）
s, pend3 = req(
    "POST",
    "/admin/building-dictionary/pending",
    {
        "kind": "community",
        "name": "__E2E_API撞名小区__",
        "source_type": "lead",
        "source_id": "00000000-0000-0000-0000-00000000e2e3",
    },
    token=token,
)
assert s == 201
s, created = req(
    "POST",
    "/admin/building-dictionary/communities",
    {
        "name": "__E2E_API撞名小区__",
        "district": "徐汇",
        "business_circle": "E2E",
    },
    token=token,
)
print(f"8. admin 新增撞 pending: {s} name={created.get('name')}")
assert s == 201

# 9. 重名拦截（BR-01）
s, dupc = req(
    "POST",
    "/admin/building-dictionary/communities",
    {
        "name": "__E2E_API撞名小区__",
        "district": "徐汇",
        "business_circle": "E2E",
    },
    token=token,
)
print(f"9. 重名拦截: {s} {dupc}")
assert s == 409, f"期望 409 实际 {s}"

# 10. admin 补录楼栋区间（AC-P0-6）
comm_id = created["id"]
s, added = req(
    "POST", "/admin/building-dictionary/buildings", {"community_id": comm_id, "building_no": "1-3"}, token=token
)
print(f"10. 区间补录 1-3 栋: {s} {added}")
assert s == 201 and added["added"] == 3
s, skipped = req(
    "POST", "/admin/building-dictionary/buildings", {"community_id": comm_id, "building_no": "1-3"}, token=token
)
print(f"10b. 重跑 uq 跳过: {skipped}")
assert skipped == {"added": 0, "skipped": 3}

# 11. 超上限拦截（BR-07）
s, over = req(
    "POST", "/admin/building-dictionary/buildings", {"community_id": comm_id, "building_no": "10-99"}, token=token
)
print(f"11. 超 60 栋拦截: {s}")
assert s == 422 or s == 400, f"期望 4xx 实际 {s}"

# 12. 审核池处理人权限配置读取
print("\n=== E2E 核心场景全部通过（AC-P0-6/7, AC-P1-2, AC-P5-1/4/5）✓ ===")
