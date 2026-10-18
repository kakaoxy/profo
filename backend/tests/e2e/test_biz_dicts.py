"""E2E: 业务字典（techdebt-config-unify T1.1–T1.3 可复验工件）.

覆盖：
- A 鉴权：无 token → 401；非 admin 账号 → 403（dict:manage 仅 admin）
- B 种子：4 组字典的行数/编码/预置标记与 spec 种子表一致
- C CRUD：新增 → 201；重复 code → 409；改 label/停用 → 公开端点 ≤60s 生效口径；
  批量排序生效；未知字典组 → 404
- D 宽松校验（D5）：公开埋点上报字典外渠道值 → 200 落库原值；unmanaged 端点可查；
  转正后自动退出 unmanaged（字典补录自动转正）
- E 文书模板：字典优先（新项目清单随字典变化）→ 历史项目不变（V7/D6）；
  全部停用 → 回退 constants 常量（12/18 项）
- F 迁移幂等：连跑两次迁移无副作用；运营改过的 label 不被种子覆盖

前置：后端 :8000 运行中；前端不需要。产出：tests/e2e/artifacts/e2e-biz-dicts-*.txt

⚠️ 测试自建数据（``e2e_*`` 编码的字典条目 / 临时用户 / 临时项目）在结束时清理：
字典条目走直接 SQL 删除（API 只增不删是产品口径，测试清理不适用）。
"""

# ruff: noqa: S310, FBT003, I001
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(BACKEND_ROOT))

BASE = "http://127.0.0.1:8000/api/v1"
ADMIN_USER = os.environ.get("E2E_ADMIN_USER", "")
ADMIN_PASSWORD = os.environ.get("E2E_ADMIN_PASSWORD", "")
if not ADMIN_USER or not ADMIN_PASSWORD:
    print("缺少 E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 环境变量（严禁硬编码账号密码）。")
    print("示例：set -a; source frontend/.env.local; set +a; backend/.venv/bin/python tests/e2e/test_biz_dicts.py")
    sys.exit(2)
_ts = str(int(time.time()))
ALL_PASS: list[bool] = []
LINES: list[str] = []


def log(msg: str) -> None:
    print(msg)
    LINES.append(msg)


def check(name: str, actual, expect) -> bool:
    ok = actual == expect
    ALL_PASS.append(ok)
    log(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（期望 {expect!r}）"))
    return ok


def check_true(name: str, cond: bool, detail: str = "") -> bool:
    ALL_PASS.append(bool(cond))
    log(f"  {'✓' if cond else '✗'} {name}" + (f": {detail}" if detail else ""))
    return bool(cond)


def req(method, path, body=None, token=None, form=None):
    r = urllib.request.Request(BASE + path, method=method)
    data = None
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    if form is not None:
        r.add_header("Content-Type", "application/x-www-form-urlencoded")
        data = urllib.parse.urlencode(form).encode()
    elif body is not None:
        r.add_header("Content-Type", "application/json")
        data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, data, timeout=30) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as exc:
        raw = exc.read()
        try:
            return exc.code, json.loads(raw)
        except Exception:
            return exc.code, {"raw": raw[:300].decode(errors="replace")}


def login(username: str, password: str) -> str | None:
    for attempt in range(12):
        status, data = req(
            "POST",
            "/auth/token",
            form={"grant_type": "password", "username": username, "password": password},
        )
        if status == 200:
            return data["access_token"]
        if status == 429 and attempt < 11:
            time.sleep(12)
            continue
        log(f"  登录失败: {status} {data}")
        return None
    return None


log(f"业务字典 E2E 报告  时间={time.strftime('%Y-%m-%d %H:%M:%S')}")
log(f"BASE={BASE}")

token = login(ADMIN_USER, ADMIN_PASSWORD)
if token is None:
    log("管理员登录失败，终止")
    sys.exit(1)
log("管理员登录成功")

# ─────────────────────────────────────────────────────────────
# A. 鉴权
# ─────────────────────────────────────────────────────────────
log("\nA. 鉴权 / 权限")
check("无 token 访问管理端", req("GET", "/admin/dicts")[0], 401)

temp_username = f"e2e_dict_{_ts}"
temp_password = "E2eDict!2026"
roles_status, roles_payload = req("GET", "/roles", token=token)
roles = roles_payload.get("items", []) if roles_status == 200 else []
user_role_id = next((r["id"] for r in roles if r["code"] == "user"), None)
temp_user_id = None
if user_role_id:
    create_status, created_user = req(
        "POST",
        "/users",
        {"username": temp_username, "password": temp_password, "role_id": user_role_id},
        token=token,
    )
    if create_status == 201:
        temp_user_id = created_user["id"]
        limited_token = login(temp_username, temp_password)
        check(
            "普通 user 角色访问管理端",
            req("GET", "/admin/dicts", token=limited_token)[0],
            403,
        )
    else:
        check_true("临时用户创建（403 用例前置）", False, f"{create_status} {created_user}")
else:
    check_true("临时用户创建（403 用例前置）", False, "未取到 user 角色")

# ─────────────────────────────────────────────────────────────
# B. 种子
# ─────────────────────────────────────────────────────────────
log("\nB. 字典组与种子")
status, groups = req("GET", "/admin/dicts", token=token)
check("字典组数量", (status, len(groups)), (200, 4))
by_code = {g["dict_code"]: g for g in groups}
check("recruit_source 种子行数", by_code.get("recruit_source", {}).get("item_count"), 2)
check("document_template 种子行数", by_code.get("document_template", {}).get("item_count"), 30)
check("renovation_stage_alias 种子行数", by_code.get("renovation_stage_alias", {}).get("item_count"), 7)

status, recruit_items = req("GET", "/admin/dicts/recruit_source/items", token=token)
check("recruit_source 编码", [i["code"] for i in recruit_items], ["card", "poster"])
check("种子项 is_builtin", all(i["is_builtin"] for i in recruit_items), True)

status, stage_items = req("GET", "/admin/dicts/renovation_stage_alias/items", token=token)
check(
    "改造阶段编码=入库中文值",
    [i["code"] for i in stage_items],
    ["拆除", "设计", "水电", "木瓦", "油漆", "交付", "已完成"],
)

check("未知字典组", req("GET", "/admin/dicts/nope_dict/items", token=token)[0], 404)
check("未知字典组公开端点", req("GET", "/public/dicts/nope_dict")[0], 404)

# ─────────────────────────────────────────────────────────────
# C. CRUD + 公开端点
# ─────────────────────────────────────────────────────────────
log("\nC. CRUD / 公开端点")
new_code = f"e2e_channel_{_ts}"
status, created = req("POST", "/admin/dicts/lead_attr_channel/items", {"code": new_code, "label": "E2E渠道"}, token)
check("新增条目", status, 201)
check("新增项 is_builtin=false", created.get("is_builtin"), False)
check("重复 code", req("POST", "/admin/dicts/lead_attr_channel/items", {"code": new_code, "label": "x"}, token)[0], 409)

item_id = created["id"]
status, updated = req("PUT", f"/admin/dicts/lead_attr_channel/items/{item_id}", {"label": "E2E渠道改名"}, token)
check("改展示名", (status, updated.get("label")), (200, "E2E渠道改名"))

# item_id 路径参数健壮性：合法字符串命中，非法格式/不存在/跨组一律 404（不得 500）
malformed = req("PUT", "/admin/dicts/lead_attr_channel/items/not-a-uuid", {"label": "x"}, token)
check("item_id 非法格式 → 404（非 500，PG uuid 转换错误不外泄）", malformed[0], 404)
missing = req(
    "PUT",
    "/admin/dicts/lead_attr_channel/items/00000000-0000-0000-0000-000000000000",
    {"label": "x"},
    token,
)
check("item_id 合法但不存在 → 404", missing[0], 404)
cross_group = req(
    "PUT",
    f"/admin/dicts/recruit_source/items/{item_id}",
    {"label": "x"},
    token,
)
check("跨字典组 item_id → 404", cross_group[0], 404)

status, public_before = req("GET", "/public/dicts/lead_attr_channel")
check("公开端点含新增项", any(i["code"] == new_code for i in public_before["items"]), True)

status, _ = req("PUT", f"/admin/dicts/lead_attr_channel/items/{item_id}", {"enabled": False}, token)
status, public_after = req("GET", "/public/dicts/lead_attr_channel")
check("停用项不出现在公开端点", any(i["code"] == new_code for i in public_after["items"]), False)
check("公开端点仅启用项数", len(public_after["items"]), len(public_before["items"]) - 1)

# 排序：把目标条目排到首位，校验返回值与 sort_order 步长
status, current_items = req("GET", "/admin/dicts/lead_attr_channel/items", token=token)
ordered_ids = [item_id] + [i["id"] for i in current_items if i["id"] != item_id]
status, reordered = req(
    "POST",
    "/admin/dicts/lead_attr_channel/reorder",
    {"item_ids": ordered_ids},
    token,
)
check("批量排序状态", status, 200)
check("批量排序返回条数", len(reordered), len(current_items))
check("排序后首位=目标条目", reordered[0]["id"], item_id)
check("排序 sort_order 步长 10", [r["sort_order"] for r in reordered][:3], [0, 10, 20])

# ─────────────────────────────────────────────────────────────
# D. 宽松校验（D5）
# ─────────────────────────────────────────────────────────────
log("\nD. 归因渠道宽松校验")
unmanaged_value = f"e2e_um_{_ts[-6:]}"
status, visit = req(
    "POST",
    "/public/valuations/visit-events",
    {"visitor_id": f"e2e-visitor-{_ts}", "source": unmanaged_value},
)
check("字典外渠道上报（放行）", status, 200)

status, unmanaged = req("GET", "/admin/dicts/lead_attr_channel/unmanaged", token=token)
codes = [i["value"] for i in unmanaged["items"]]
check("字典外值可查（unmanaged）", unmanaged_value in codes, True)

status, promoted = req(
    "POST",
    "/admin/dicts/lead_attr_channel/items",
    {"code": unmanaged_value, "label": "E2E转正渠道"},
    token,
)
check("转正（补录字典项）", status, 201)
status, unmanaged_after = req("GET", "/admin/dicts/lead_attr_channel/unmanaged", token=token)
check("转正后自动退出 unmanaged", unmanaged_value in [i["value"] for i in unmanaged_after["items"]], False)

status, public_channel = req("GET", "/public/dicts/lead_attr_channel")
check(
    "转正后前台展示名生效",
    next((i["label"] for i in public_channel["items"] if i["code"] == unmanaged_value), None),
    "E2E转正渠道",
)

# ─────────────────────────────────────────────────────────────
# E. 文书模板：字典优先 / 历史不变 / 常量回退
# ─────────────────────────────────────────────────────────────
log("\nE. 文书模板")
created_projects: list[str] = []


def create_project(suffix: str) -> str | None:
    status, data = req(
        "POST",
        "/projects",
        {
            "community_name": f"E2E字典小区{suffix}",
            "address": f"E2E字典路{suffix}号",
            "contract_no": f"E2E-DICT-{_ts}-{suffix}",
            "business_form": "agent",
        },
        token=token,
    )
    if status in (200, 201):
        created_projects.append(data["id"])
        return data["id"]
    log(f"  项目创建失败: {status} {data}")
    return None


def document_names(project_id: str) -> list[str]:
    status, data = req("GET", f"/projects/{project_id}/documents", token=token)
    if status != 200:
        return []
    return [d["document_name"] for d in data]


project_a = create_project("A")
check_true("创建项目A（字典生效前）", project_a is not None)
names_a = document_names(project_a) if project_a else []
check("项目A文书数量（agent 12 项）", len(names_a), 12)
check("项目A含常量文书名「签约合同」", "签约合同" in names_a, True)

status, doc_items = req("GET", "/admin/dicts/document_template/items", token=token)
target_code = "agent:签约合同"
target = next((i for i in doc_items if i["code"] == target_code), None)
check_true("文书字典含 agent:签约合同", target is not None)
if target:
    status, _ = req("PUT", f"/admin/dicts/document_template/items/{target['id']}", {"label": "签约合同(E2E)"}, token)
    check("改文书展示名", status, 200)

project_b = create_project("B")
names_b = document_names(project_b) if project_b else []
check("新项目B含改后文书名", "签约合同(E2E)" in names_b, True)
check("新项目B不含旧文书名", "签约合同" in names_b, False)
check("历史项目A文书名不变", document_names(project_a) if project_a else [], names_a)

# 常量回退：全部停用 agent 组文书字典
agent_items = [i for i in doc_items if i["business_form"] == "agent"]
for item in agent_items:
    req("PUT", f"/admin/dicts/document_template/items/{item['id']}", {"enabled": False}, token)
project_c = create_project("C")
names_c = document_names(project_c) if project_c else []
check("字典全停用 → 回退常量（12 项）", len(names_c), 12)
check("回退常量含「签约合同」", "签约合同" in names_c, True)

# 恢复
for item in agent_items:
    req("PUT", f"/admin/dicts/document_template/items/{item['id']}", {"enabled": True}, token)
if target:
    req("PUT", f"/admin/dicts/document_template/items/{target['id']}", {"label": "签约合同"}, token)

# ─────────────────────────────────────────────────────────────
# F. 迁移幂等 + 种子不覆盖人工配置
# ─────────────────────────────────────────────────────────────
log("\nF. 迁移幂等 / 种子不覆盖")
from db import SessionLocal  # noqa: E402
from sqlalchemy import text  # noqa: E402
from migrations._biz_dicts import create_biz_dict_items_table  # noqa: E402
from db import engine  # noqa: E402

db = SessionLocal()
before_count = db.execute(text("SELECT COUNT(*) FROM biz_dict_items")).scalar()
before_label = db.execute(
    text("SELECT label FROM biz_dict_items WHERE dict_code='recruit_source' AND code='card'"),
).scalar()
db.execute(text("UPDATE biz_dict_items SET label='E2E人工改名' WHERE dict_code='recruit_source' AND code='card'"))
db.commit()

create_biz_dict_items_table(engine)
create_biz_dict_items_table(engine)

after_count = db.execute(text("SELECT COUNT(*) FROM biz_dict_items")).scalar()
after_label = db.execute(
    text("SELECT label FROM biz_dict_items WHERE dict_code='recruit_source' AND code='card'"),
).scalar()
perm_count = db.execute(text("SELECT COUNT(*) FROM permissions WHERE code='dict:manage'")).scalar()
admin_grant = db.execute(
    text(
        "SELECT COUNT(*) FROM role_permissions rp JOIN roles r ON r.id = rp.role_id "
        "JOIN permissions p ON p.id = rp.permission_id "
        "WHERE r.code='admin' AND p.code='dict:manage'"
    ),
).scalar()
check("连跑两次迁移行数不变", after_count, before_count)
check("种子不覆盖人工改的 label", after_label, "E2E人工改名")
check("dict:manage 权限点唯一", perm_count, 1)
check("dict:manage 已授予 admin", admin_grant, 1)

# 还原种子 label
db.execute(
    text("UPDATE biz_dict_items SET label=:label WHERE dict_code='recruit_source' AND code='card'"),
    {"label": before_label},
)
db.commit()

# ─────────────────────────────────────────────────────────────
# 清理测试数据
# ─────────────────────────────────────────────────────────────
log("\n清理测试数据")
for project_id in created_projects:
    status, _ = req("DELETE", f"/projects/{project_id}", token=token)
    log(f"  删除项目 {project_id}: {status}")
if temp_user_id:
    log(f"  删除临时用户: {req('DELETE', f'/users/{temp_user_id}', token=token)[0]}")

deleted = db.execute(
    text("DELETE FROM biz_dict_items WHERE code LIKE 'e2e\\_%' ESCAPE '\\' OR code = :unmanaged"),
    {"unmanaged": unmanaged_value},
).rowcount
db.commit()
log(f"  清理测试字典条目: {deleted}")
dropped = db.execute(text("DELETE FROM valuation_visits WHERE source = :src"), {"src": unmanaged_value}).rowcount
db.commit()
log(f"  清理测试埋点: {dropped}")
db.close()

# ─────────────────────────────────────────────────────────────
# 结论 + 工件
# ─────────────────────────────────────────────────────────────
passed = sum(1 for ok in ALL_PASS if ok)
log(f"\n总结论: {passed}/{len(ALL_PASS)} 通过" + ("" if passed == len(ALL_PASS) else "（存在失败用例）"))

artifacts_dir = Path(__file__).resolve().parent / "artifacts"
artifacts_dir.mkdir(parents=True, exist_ok=True)
out_path = artifacts_dir / f"e2e-biz-dicts-{time.strftime('%Y%m%d-%H%M%S')}.txt"
out_path.write_text("\n".join(LINES) + "\n", encoding="utf-8")
log(f"报告已保存: {out_path}")

sys.exit(0 if passed == len(ALL_PASS) else 1)
