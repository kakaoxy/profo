"""E2E: merge 写 merged_into_id + unmerge 恢复独立（AC-P6-3）"""

# ruff: noqa: E401, E402, S310, PT018, I001
import json, urllib.request, urllib.parse, urllib.error

BASE = "http://127.0.0.1:8000/api/v1"


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
            raw = resp.read()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:200]}


r = urllib.request.Request(
    BASE + "/auth/token",
    data=urllib.parse.urlencode({"username": "admin", "password": "Fdd123.."}).encode(),
    method="POST",
)
r.add_header("Content-Type", "application/x-www-form-urlencoded")
# 全量跑时前面脚本已消耗登录限流（5/minute），429 时等待重试
for _attempt in range(12):
    try:
        token = json.loads(urllib.request.urlopen(r).read())["access_token"]
        break
    except urllib.error.HTTPError as e:
        if e.code == 429 and _attempt < 11:
            import time as _time

            _time.sleep(15)
            continue
        raise

import time

suffix = time.strftime("%H%M%S")
# 建两个小区
s, primary = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": f"__E2E_MERGE主_{suffix}__", "district": "静安", "business_circle": "E2E"},
    token=token,
)
s2, secondary = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": f"__E2E_MERGE被并_{suffix}__", "district": "静安", "business_circle": "E2E"},
    token=token,
)
print("前置:", primary["id"], secondary["id"])

# merge（现有端点）
s, merged = req(
    "POST", "/admin/communities/merge", {"primary_id": primary["id"], "merge_ids": [secondary["id"]]}, token=token
)
print("1. merge:", s, merged)
assert s == 200 and merged["success"]

# S2（性能与安全专项审查）：归档（已合并）小区的详情 GET 返回 404，
# 避免运营通过历史链接打开一个「总览里永远搜不到」的小区；合并信息改从主档视角看
s, detail = req("GET", f"/admin/building-dictionary/communities/{secondary['id']}", token=token)
print("2. 被并小区详情（S2：应 404）:", s, detail)
assert s == 404, f"已合并小区详情应 404，实际 {s}: {detail}"

# 主档视角能看到被并子档（merged_children）
s, primary_detail = req("GET", f"/admin/building-dictionary/communities/{primary['id']}", token=token)
child_ids = [c["id"] for c in (primary_detail.get("merged_children") or [])]
print("2b. 主档 merged_children:", child_ids)
assert secondary["id"] in child_ids, "主档应能看到已并入的子档"

# unmerge 恢复（新增端点）
s, un = req(
    "POST", "/admin/communities/unmerge", {"merged_id": secondary["id"], "primary_id": primary["id"]}, token=token
)
print("3. unmerge:", s, un)
assert s == 200 and un["success"]

s, detail2 = req("GET", f"/admin/building-dictionary/communities/{secondary['id']}", token=token)
print("4. 解除后 merged_into_id:", detail2.get("merged_into_id"))
assert detail2["merged_into_id"] is None

# 总览里被并小区重新可见（is_active 恢复）
from urllib.parse import quote

s, lst = req(
    "GET", f"/admin/building-dictionary/communities?keyword={quote(f'__E2E_MERGE被并_{suffix}__')}", token=token
)
print("5. 恢复后总览可见:", lst["total"])
assert lst["total"] == 1

print("\nunmerge E2E 全部通过（AC-P6-3）✓")
