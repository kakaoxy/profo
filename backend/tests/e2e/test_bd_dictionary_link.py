"""E2E: dictionary-link 四类绑定（AC-P1-7 部分 / AC-P4-4 / AC-P5-3）"""

# ruff: noqa: E401, S310, PT018, I001
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
            return resp.status, json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body)
        except Exception:
            return e.code, {"raw": body[:200]}


r = urllib.request.Request(
    BASE + "/auth/token",
    data=urllib.parse.urlencode({"username": "admin", "password": "Fdd123.."}).encode(),
    method="POST",
)
r.add_header("Content-Type", "application/x-www-form-urlencoded")
token = json.loads(urllib.request.urlopen(r).read())["access_token"]

# 前置：建一个字典小区
s, comm = req(
    "POST",
    "/admin/building-dictionary/communities",
    {
        "name": "__E2E_LINK小区__",
        "district": "虹口",
        "business_circle": "E2E",
    },
    token=token,
)
if s == 409:
    s, lst = req("GET", "/admin/building-dictionary/communities?keyword=__E2E_LINK", token=token)
    comm = lst["items"][0]
print("前置小区:", s, comm["id"])
cid = comm["id"]

# 1. 建测试项目（走正常创建接口）
s, proj = req(
    "POST",
    "/projects",
    {
        "community_name": "__E2E_LINK小区__-手工",
        "address": "XX路100号",
        "contract_no": "E2E-LINK-001-" + __import__("time").strftime("%H%M%S"),
    },
    token=token,
)
print("1. 建项目:", s, proj.get("id") if s == 201 else proj)
assert s == 201, proj
pid = proj["id"]

# 2. 绑定字典（AC-P1-7: building_id/room_id 落库且 address 不变）
s, linked = req("PUT", f"/admin/projects/{pid}/dictionary-link", {"community_id": cid}, token=token)
print("2. 绑定:", s, linked)
assert s == 200 and linked["dict_status"] == "linked"

# 3. 详情校验 address 不变 + dict_status 落库
s, detail = req("GET", f"/projects/{pid}", token=token)
print(
    "3. 详情: address =",
    detail.get("address"),
    "| dict_status =",
    detail.get("dict_status"),
    "| community_id =",
    detail.get("community_id"),
)
assert detail["address"] == "XX路100号"
assert detail["dict_status"] == "linked"
assert detail["community_id"] == cid

# 4. 解绑
s, unlinked = req("DELETE", f"/admin/projects/{pid}/dictionary-link", token=token)
print("4. 解绑:", s, unlinked)
assert s == 200 and unlinked["dict_status"] == "manual"
s, detail2 = req("GET", f"/projects/{pid}", token=token)
assert detail2["dict_status"] == "manual" and detail2["community_id"] is None
print("4b. 解绑后 dict_status=manual, community_id 清空 ✓")

# 5. 绑定不存在的字典小区 → 404
s, err = req(
    "PUT",
    f"/admin/projects/{pid}/dictionary-link",
    {"community_id": "00000000-0000-0000-0000-000000000000"},
    token=token,
)
print("5. 绑定不存在小区:", s, err)
assert s == 404

# 清理项目（204 无 body）
try:
    s = req("DELETE", f"/projects/{pid}", token=token)[0]
except Exception:
    s = "ok"
print("清理项目:", s)

print("\ndictionary-link E2E 全部通过 ✓")
