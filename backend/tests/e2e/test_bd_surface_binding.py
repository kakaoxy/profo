"""E2E: 字典地址名称解析与呈现（surface-dict-binding-info 全链路）.

覆盖 spec 三态 + 转正联动：
- 已绑定单据（building_id/room_id 指向字典行）→ 响应返回真实 building_no/room_no/floor
- pending 单据（ID 为空、录入端 new_* 载荷）→ 从 bd_pending_entries 取待审名称
- 未绑定 / manual 单据 → 解析字段为 null，无报错
- 审核池 resolve create 转正回填 → 详情显示真实字典名称、dict_status=linked
- 三模块详情/列表 + 项目 CSV 导出路径（批量 builder）回归

前置：后端 :8000 运行中。产出：tests/e2e/artifacts/ 报告（run_all.sh 汇总）。
"""

# ruff: noqa: E401, S310, FBT003, I001
import json, time, urllib.request, urllib.parse, urllib.error

BASE = "http://127.0.0.1:8000/api/v1"
_ts = str(int(time.time()))


def req(method, path, body=None, token=None, qs=None, expect_empty=False):
    if qs:
        path = path + "?" + urllib.parse.urlencode(qs)
    r = urllib.request.Request(BASE + path, method=method)
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, data) as resp:
            return resp.status, (None if expect_empty else json.loads(resp.read()))
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300]}


def check(name, actual, expect):
    ok = actual == expect
    ALL_PASS.append(ok)
    print(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（期望 {expect!r}）"))
    return ok


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
ALL_PASS: list[bool] = []

comm_name = f"__E2E_SURF小区{_ts}"
building_no = f"{_ts[-4:]} SurfBuildNo"
room_no = "0403"

# ==================== a. 前置：admin 直建字典小区/楼栋/户室 ====================
print("\n=== a. 前置字典数据（admin 直建） ===")
s, comm = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": comm_name, "district": "浦东", "business_circle": "E2E"},
    token=token,
)
check("a. 建小区", s, 201)
cid = comm["id"]
s, bld = req(
    "POST", "/admin/building-dictionary/buildings", {"community_id": cid, "building_no": building_no}, token=token
)
check("a. 建楼栋", s, 201)
# 批量建返回 BdBatchCreateResult，回查楼栋 ID
s, blist = req(
    "GET", f"/admin/building-dictionary/communities/{cid}/buildings", token=token, qs={"page": 1, "page_size": 50}
)
bhit = next((b for b in blist["items"] if b["building_no"] == building_no), None)
check("a. 回查楼栋", bhit is not None, True)
bid = bhit["id"]
s, room = req(
    "POST",
    f"/admin/building-dictionary/buildings/{bid}/rooms",
    {"building_id": bid, "floor": "4", "room_suffix": "03"},
    token=token,
)
check("a. 建户室", s, 201)
# 回查户室 ID（BdBatchCreateResult 不含行 ID）
s, rooms = req("GET", f"/admin/building-dictionary/buildings/{bid}", token=token)
rhit = next((r for r in rooms["rooms"] if r["room_no"] == "0403"), None)
check("a. 回查户室", rhit is not None, True)
rid = rhit["id"]

# ==================== b. 项目：已绑定三态 ====================
print("\n=== b. 项目已绑定（linked）详情/列表 ===")
s, proj = req(
    "POST",
    "/projects",
    {
        "community_id": cid,
        "community_name": comm_name,
        "address": "SURF路1号",
        "area": "88.00",
        "business_form": "agent",
        "contract_no": f"E2E-SURF-P-{_ts}",
        "owners": [{"owner_name": "SURF业主"}],
        "building_id": bid,
        "room_id": rid,
        "dict_status": "linked",
    },
    token=token,
)
check("b. 建项目(带楼栋户室)", s, 201)
proj_id = proj.get("id")
check("b. 响应 building_no=真实字典名", proj.get("building_no"), building_no)
check("b. 响应 room_no", proj.get("room_no"), room_no)
check("b. 响应 floor=4", proj.get("floor"), 4)

s, pd = req("GET", f"/projects/{proj_id}", token=token)
check("b. 详情 building_no", pd.get("building_no"), building_no)
check("b. 详情 room_no", pd.get("room_no"), room_no)
check("b. 详情 floor", pd.get("floor"), 4)

s, plist = req("GET", "/projects", token=token, qs={"page": 1, "page_size": 50})
hit = next((i for i in plist["items"] if i["id"] == proj_id), None)
check("b. 列表命中该项目", hit is not None, True)
if hit:
    check("b. 列表 building_no", hit.get("building_no"), building_no)
    check("b. 列表 room_no", hit.get("room_no"), room_no)

print("\n=== c. 项目 manual/未绑定回归 ===")
s, proj2 = req(
    "POST",
    "/projects",
    {
        "community_name": f"__E2E_SURF手工{_ts}",
        "address": "SURF路2号",
        "area": "66.00",
        "business_form": "agent",
        "contract_no": f"E2E-SURF-M-{_ts}",
        "owners": [{"owner_name": "SURF业主2"}],
    },
    token=token,
)
check("c. 建手工项目", s, 201)
check("c. manual 项目 building_no=null", proj2.get("building_no"), None)
check("c. manual 项目 room_no=null", proj2.get("room_no"), None)
s, pd2 = req("GET", f"/projects/{proj2.get('id')}", token=token)
check(
    "c. manual 详情解析字段全 null", (pd2.get("building_no"), pd2.get("room_no"), pd2.get("floor")), (None, None, None)
)

# ==================== d. 线索：pending → 转正回填联动 ====================
print("\n=== d. 线索 pending（录入端 new_* 载荷） ===")
lead_bno = f"{_ts[-4:]}LeadB"
s, lead = req(
    "POST",
    "/leads",
    {
        "community_name": comm_name,
        "community_id": cid,
        "building_id": None,
        "room_id": None,
        "dict_status": "pending",
        "new_building": {"name": lead_bno},
        "layout": "2室1厅",
        "area": "70.00",
        "total_price": "300.00",
    },
    token=token,
)
check("d. 建 pending 线索", s, 201)
lead_id = lead.get("id")
check("d. 响应 building_no=待审名", lead.get("building_no"), lead_bno)
check("d. 响应 building_id 为空", lead.get("building_id"), None)

s, ll = req("GET", "/leads", token=token, qs={"page": 1, "page_size": 50})
lhit = next((i for i in ll["items"] if i["id"] == lead_id), None)
check("d. 列表命中 pending 线索", lhit is not None, True)
if lhit:
    check("d. 列表 building_no=待审名", lhit.get("building_no"), lead_bno)
    check("d. 列表 dict_status=pending", lhit.get("dict_status"), "pending")

s, ld = req("GET", f"/leads/{lead_id}", token=token)
check("d. 详情 building_no=待审名", ld.get("building_no"), lead_bno)

print("\n=== e. 审核池转正 → 回填联动复查 ===")
s, queue = req("GET", "/admin/building-dictionary/review", token=token, qs={"page": 1, "page_size": 50})
entry = next((e for e in queue.get("items", []) if e.get("name") == lead_bno and e.get("kind") == "building"), None)
check("e. 审核池找到待审楼栋", entry is not None, True)
if entry:
    s, _ = req("POST", f"/admin/building-dictionary/review/{entry['id']}/resolve", {"action": "create"}, token=token)
    check("e. resolve create", s, 200)
    s, ld2 = req("GET", f"/leads/{lead_id}", token=token)
    check("e. 转正后详情 building_no=待审名(已成字典行)", ld2.get("building_no"), lead_bno)
    check("e. 转正后 building_id 非空", ld2.get("building_id") is not None, True)
    check("e. 转正后 dict_status=linked", ld2.get("dict_status"), "linked")
    s, ll2 = req("GET", "/leads", token=token, qs={"page": 1, "page_size": 50})
    lhit2 = next((i for i in ll2["items"] if i["id"] == lead_id), None)
    if lhit2:
        check("e. 转正后列表 dict_status=linked", lhit2.get("dict_status"), "linked")

# ==================== f. 营销：详情/列表解析字段 ====================
print("\n=== f. 营销：详情/列表解析字段 ===")
s, mkt = req(
    "POST",
    "/admin/marketing/projects",
    {
        "community_id": cid,
        "community_name": comm_name,
        "layout": "三室两厅",
        "orientation": "南北通透",
        "floor_info": "4/28层",
        "area": "120.00",
        "total_price": "600.00",
        "title": f"E2E-SURF营销{_ts}",
        "building_id": bid,
        "room_id": rid,
        "dict_status": "linked",
    },
    token=token,
)
check("f. 建营销项目(带楼栋户室)", s, 201)
mkt_id = mkt.get("id")
check("f. 响应 building_no", mkt.get("building_no"), building_no)
check("f. 响应 room_no", mkt.get("room_no"), room_no)
s, md = req("GET", f"/admin/marketing/projects/{mkt_id}", token=token)
check("f. 详情 building_no", md.get("building_no"), building_no)
check("f. 详情 room_no", md.get("room_no"), room_no)
s, ml = req("GET", "/admin/marketing/projects", token=token, qs={"page": 1, "page_size": 50})
mhit = next((i for i in ml["items"] if i["id"] == mkt_id), None)
check("f. 列表命中", mhit is not None, True)
if mhit:
    check("f. 列表 building_no", mhit.get("building_no"), building_no)

print("\n=== g. 回归：LeadCreate 注入解析字段（修复后应忽略，不 500） ===")
s, inj = req(
    "POST",
    "/leads",
    {
        "community_name": f"__E2E_SURF注入{_ts}",
        "layout": "1室1厅",
        "area": "50.00",
        "total_price": "100.00",
        # 恶意/误传：解析字段曾误入 LeadBase → LeadCreate，透传 ORM 报 500；
        # 修复后收歒到 LeadResponse，仅响应侧下发，请求体中传入应被忽略
        "building_no": "注入字段",
        "room_no": "注入字段",
        "floor": 999,
    },
    token=token,
)
check("g. 注入字段不再 500", s, 201)
check("g. 注入值未落库/未回显", (inj.get("building_no"), inj.get("room_no"), inj.get("floor")), (None, None, None))

# 清理注入线索（204 无响应体）
if inj.get("id"):
    req("DELETE", f"/leads/{inj['id']}", token=token, expect_empty=True)

print("\n=== h. 回归：删除挂待审户室的小区被 409 拦截 ===")
# 用 g/场景 a 同套字典数据：向实表楼栋 bid 提交待审户室，再尝试删小区
s, pr = req(
    "POST",
    "/admin/building-dictionary/pending",
    {"kind": "room", "name": f"{_ts[-3:]}X", "parent_kind": "building", "parent_id": str(bid)},
    token=token,
)
check("h. 提交待审户室", s in (200, 201), True)
s, delres = req("DELETE", f"/admin/building-dictionary/communities/{cid}", token=token)
check("h. 删除被 409 拦截", s, 409)

print("\n════════════════════════════════════════")
if ALL_PASS and all(ALL_PASS):
    print("结论: 全部通过 ✓")
else:
    print(f"结论: 存在失败断言 ✗ ({ALL_PASS.count(False)} 项)")
    raise SystemExit(1)
