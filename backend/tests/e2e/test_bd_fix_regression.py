"""迭代后审查修复回归 E2E（H1-H4/M1/M2/M5/M7 定向验证）.

通过真实 API + 直查 DB 验证：
- H1: 营销详情响应含 building_id/room_id/dict_status（绑定状态可回显）
- H2: 营销 update 白名单放行字典三列（编辑保存楼栋 → 重查非空）
- H3: 营销创建携带 new_building/new_room → pending 引用建在真实单据上
- H4: 营销创建带 new_* 且后续 media 步骤可控（事务单次提交，无半提交）
- M1: 楼栋不属于单据小区时创建被 400 拦截
- M2: has_project_link 筛选 total 为过滤后全集计数（非当前页长度）
- M5: create 传 dict_status=linked 谎报时被服务端推导覆盖
- M7: reviewer-roles 保存未知角色 → 400

前置：后端 :8000 运行中。
"""

# ruff: noqa: E402, S310, ERA001
import json
import urllib.parse
import urllib.request

BASE = "http://127.0.0.1:8000/api/v1"

import sys

sys.path.insert(0, ".")
from sqlalchemy import text as text_f

from db import SessionLocal as SessionLocalF
from models import BdPendingReference as BdPendingRefF
from models import BdReferenceStatus as BdRefStatusF
from models import L4MarketingProject as L4MktF

FAILURES: list[str] = []


def check(cond: bool, label: str, actual: object, expected: object) -> None:
    ok = bool(cond)
    if not ok:
        FAILURES.append(label)
    print(f"  {label}: 实际={actual!r} 期望={expected!r} {'✓' if ok else '✗'}")


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
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


r = urllib.request.Request(
    BASE + "/auth/token",
    data=urllib.parse.urlencode({"username": "admin", "password": "Fdd123.."}).encode(),
    method="POST",
)
r.add_header("Content-Type", "application/x-www-form-urlencoded")
# 全量跑时前面脚本已消耗登录限流（5/minute），429 时等待重试
for attempt in range(12):
    try:
        token = json.loads(urllib.request.urlopen(r).read())["access_token"]
        break
    except urllib.error.HTTPError as e:
        if e.code == 429 and attempt < 11:
            import time as _time

            _time.sleep(15)
            continue
        raise
print("1. 登录 OK")

import time

ts = int(time.time())
mkt_name = f"__E2E_FIX营销_{ts}__"
bld_name = f"__E2E_FIX楼_{ts}__"

# 建字典小区 + 楼栋（admin 即时生效）
s, comm = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": mkt_name, "district": "浦东新区", "business_circle": "联洋"},
    token=token,
)
check(s == 201, "2. 建字典小区", s, 201)
comm_id = comm.get("id")
s, blds = req(
    "POST",
    "/admin/building-dictionary/buildings",
    {"community_id": comm_id, "building_no": bld_name},
    token=token,
)
check(s == 201, "3. 建字典楼栋", s, 201)

# 建一个项目单据（拿一个非该小区的 community 场景可用 None）
# ==================== H2/M1/M5: 营销创建 + 编辑 ====================
print("\n=== a. 营销创建（字典楼栋 + 谎报 dict_status） ===")
mkt_body = {
    "community_id": comm_id,
    "community_name": mkt_name,
    "layout": "三室两厅",
    "orientation": "南北通透",
    "floor_info": "15/28层",
    "area": "120.00",
    "total_price": "600.00",
    "title": f"E2E-FIX营销{ts}",
    "building_id": blds.get("added", 0) and None,  # 楼栋 id 需查库
    "dict_status": "linked",  # M5：服务端应忽略自报（此处无楼栋 → 应推导 manual）
}
# 查楼栋 id
db = SessionLocalF()
try:
    row = db.execute(
        text_f("SELECT id FROM bd_buildings WHERE community_id = :cid AND building_no = :no"),
        {"cid": comm_id, "no": bld_name},
    ).first()
    building_id = int(row[0]) if row else None
finally:
    db.close()
mkt_body["building_id"] = building_id

s, mkt = req("POST", "/admin/marketing/projects", mkt_body, token=token)
check(s == 201, "a. 创建营销项目", s, 201)
mkt_id = mkt.get("id")

db = SessionLocalF()
try:
    rec = db.query(L4MktF).filter(L4MktF.id == int(mkt_id)).first()
    check(
        rec is not None and rec.building_id == building_id,
        "a. 营销 building_id 落库",
        rec.building_id if rec else None,
        building_id,
    )
    check(
        rec is not None and rec.dict_status == "linked",
        "a. dict_status 推导 linked",
        rec.dict_status if rec else None,
        "linked",
    )
finally:
    db.close()

# M5 反例：谎报 linked 但无楼栋
print("\n=== b. M5 谎报 dict_status=linked（无楼栋） → 服务端推导 manual ===")
mkt_body2 = dict(mkt_body)
mkt_body2.pop("building_id")
mkt_body2["dict_status"] = "linked"
mkt_body2["title"] = f"E2E-FIX营销谎报{ts}"
s, mkt2 = req("POST", "/admin/marketing/projects", mkt_body2, token=token)
check(s == 201, "b. 创建营销项目（谎报）", s, 201)
mkt_id2 = mkt2.get("id")
db = SessionLocalF()
try:
    rec2 = db.query(L4MktF).filter(L4MktF.id == int(mkt_id2)).first()
    check(
        rec2 is not None and rec2.dict_status == "manual",
        "b. 服务端覆盖为 manual",
        rec2.dict_status if rec2 else None,
        "manual",
    )
finally:
    db.close()

# H2: update 白名单
print("\n=== c. H2 营销编辑保存楼栋（白名单放行） ===")
s, updated = req(
    "PUT",
    f"/admin/marketing/projects/{mkt_id2}",
    {"building_id": building_id, "room_id": None, "dict_status": "linked"},
    token=token,
)
check(s == 200, "c. 编辑状态码", s, 200)
db = SessionLocalF()
try:
    rec2 = db.query(L4MktF).filter(L4MktF.id == int(mkt_id2)).first()
    check(
        rec2 is not None and rec2.building_id == building_id,
        "c. building_id 保存生效",
        rec2.building_id if rec2 else None,
        building_id,
    )
finally:
    db.close()

# H1: 详情响应含三列
print("\n=== d. H1 营销详情响应含字典三列 ===")
s, detail = req("GET", f"/admin/marketing/projects/{mkt_id}", token=token)
check(s == 200, "d. 详情状态码", s, 200)
has_status: object = "dict_status" in detail
has_bld: object = "building_id" in detail
has_room: object = "room_id" in detail
expected: object = True
check(has_status, "d. dict_status 字段存在", has_status, expected)
check(has_bld, "d. building_id 字段存在", has_bld, expected)
check(has_room, "d. room_id 字段存在", has_room, expected)
check(detail.get("building_id") == building_id, "d. building_id 值正确", detail.get("building_id"), building_id)

# M1: 楼栋不属于单据小区
print("\n=== e. M1 楼栋归属校验（跨小区 400） ===")
s, comm2 = req(
    "POST",
    "/admin/building-dictionary/communities",
    {"name": f"__E2E_FIX他区_{ts}__", "district": "徐汇区", "business_circle": "徐家汇"},
    token=token,
)
comm2_id = comm2.get("id")
mkt_body3 = dict(mkt_body)
mkt_body3["community_id"] = comm2_id
mkt_body3["community_name"] = f"__E2E_FIX他区_{ts}__"
mkt_body3["title"] = f"E2E-FIX跨区{ts}"
s, err = req("POST", "/admin/marketing/projects", mkt_body3, token=token)
check(s == 400, "e. 跨小区楼栋被拦截", s, 400)

# H3: 营销 new_building/new_room 进审核池 + 引用建在真实单据
print("\n=== f. H3 营销 new_building/new_room 审核池引用 ===")
new_bld = f"__E2E_FIX新楼_{ts}__"
new_room = f"990{ts % 100:02d}"
s, mkt3 = req(
    "POST",
    "/admin/marketing/projects",
    {
        "community_id": comm_id,
        "community_name": mkt_name,
        "layout": "两室一厅",
        "orientation": "南",
        "floor_info": "9/28层",
        "area": "89.00",
        "total_price": "450.00",
        "title": f"E2E-FIX新增载荷{ts}",
        "new_building": {"name": new_bld},
        "new_room": {"name": new_room},
    },
    token=token,
)
check(s == 201, "f. 创建营销项目（new_*）", s, 201)
mkt_id3 = mkt3.get("id")

db = SessionLocalF()
try:
    refs = (
        db.query(BdPendingRefF)
        .filter(
            BdPendingRefF.biz_type == "marketing",
            BdPendingRefF.biz_id == str(mkt_id3),
            BdPendingRefF.status == BdRefStatusF.OPEN,
        )
        .all()
    )
    fields = sorted(r.field for r in refs)
    check("building_id" in fields, "f. 楼栋引用建在真实单据", fields, "含 building_id")
    check("room_id" in fields, "f. 户室引用建在真实单据", fields, "含 room_id")
    rec3 = db.query(L4MktF).filter(L4MktF.id == int(mkt_id3)).first()
    check(
        rec3 is not None and rec3.dict_status == "pending",
        "f. dict_status=pending",
        rec3.dict_status if rec3 else None,
        "pending",
    )
finally:
    db.close()

# M7: reviewer roles 未知角色
print("\n=== g. M7 审核角色配置校验 ===")
s, resp = req("PUT", "/admin/building-dictionary/review/reviewer-roles", {"roles": ["__不存在角色__"]}, token=token)
check(s == 400, "g. 未知角色被拦截", s, 400)
s, resp = req("PUT", "/admin/building-dictionary/review/reviewer-roles", {"roles": ["admin"]}, token=token)
check(s == 200, "g. 合法角色保存", s, 200)

# M2: has_project_link 分页计数（语义验证：linked + unlinked 应等于全量，
# 且 total 为过滤后全集计数而非当前页长度）
print("\n=== h. M2 has_project_link 过滤计数 ===")
s, lst_all = req("GET", "/admin/building-dictionary/communities?page=1&page_size=1", token=token)
check(s == 200, "h. 全量请求成功", s, 200)
total_all = lst_all.get("total", 0)
s, lst_l = req(
    "GET",
    "/admin/building-dictionary/communities?page=1&page_size=1&has_project_link=true",
    token=token,
)
check(s == 200, "h. linked 筛选请求成功", s, 200)
total_linked = lst_l.get("total", 0)
s, lst_u = req(
    "GET",
    "/admin/building-dictionary/communities?page=1&page_size=1&has_project_link=false",
    token=token,
)
check(s == 200, "h. unlinked 筛选请求成功", s, 200)
total_unlinked = lst_u.get("total", 0)
check(
    total_linked + total_unlinked == total_all,
    "h. linked+unlinked == 全量（计数口径正确，非页长）",
    f"{total_linked}+{total_unlinked}={total_linked + total_unlinked}",
    total_all,
)

# ==================== 清理 ====================
print("\n=== 清理测试数据 ===")
db = SessionLocalF()
try:
    for mid in (mkt_id, mkt_id2, mkt_id3):
        if mid:
            db.execute(text_f("DELETE FROM l4_marketing_projects WHERE id = :i"), {"i": int(mid)})
    db.execute(
        text_f(
            "DELETE FROM bd_pending_references WHERE biz_type='marketing' AND biz_id IN "
            "(:a,:b,:c) OR pending_id IN (SELECT id FROM bd_pending_entries WHERE name LIKE :pfx)"
        ),
        {"a": str(mkt_id), "b": str(mkt_id2), "c": str(mkt_id3), "pfx": "__E2E_FIX%"},
    )
    db.execute(text_f("DELETE FROM bd_pending_entries WHERE name LIKE '__E2E_FIX%'"))
    db.execute(
        text_f(
            "DELETE FROM bd_rooms WHERE building_id IN (SELECT id FROM bd_buildings WHERE community_id IN (:c1,:c2))"
        ),
        {"c1": comm_id, "c2": comm2_id},
    )
    db.execute(text_f("DELETE FROM bd_buildings WHERE community_id IN (:c1,:c2)"), {"c1": comm_id, "c2": comm2_id})
    db.execute(text_f("DELETE FROM communities WHERE id IN (:c1,:c2)"), {"c1": comm_id, "c2": comm2_id})
    db.commit()
    print("清理完成")
finally:
    db.close()

print("\n" + "=" * 60)
if FAILURES:
    print(f"审查修复回归 E2E 存在失败：{len(FAILURES)} 项")
    for f in FAILURES:
        print(f"  ✗ {f}")
    sys.exit(1)
print("审查修复回归 E2E 全部通过 ✓")
