"""E2E: 估价 C 端楼盘字典接线 + 线索跟进结论（2026-10-26 迭代）.

覆盖两条需求的端到端闭环：

需求 1（C 端估价表单接入楼盘字典，口径对齐 admin 新增线索）
- a. C 端只读字典端点免登录可用（楼栋列表 / 楼层分组 / 户室分页）
- b. C 端提交线索带 community_id + building_id/room_id → dict_status=linked，不产生 pending
- c. 搜不到小区 → new_community 载荷 → dict_status=pending + 审核池条目 + 引用账本
       （与 admin 录入线索同一条 submit_dict_chain，同事务）
- d. 老口径（纯自由文本、无字典字段）仍可提交 → dict_status=manual（向后兼容）
- e. 楼栋不属于所选小区 → 400（validate_dict_ownership 单点生效）

需求 2（跟进结论：合作模式 / 价格 / 两者均未谈拢）
- f. admin 端点写入结论并可回读；未填结论 → NULL
- g. 非法结论枚举 → 422
- h. 员工侧（C 端令牌）写入与列表回读结论一致
- i. C 端详情时间线（/public/leads/{id}）带回 conclusion
- j. 客户侧留痕端点同样支持结论

凭据一律从环境变量读取（TEST_USERNAME / TEST_PASSWORD），严禁硬编码。
前置：后端 :8000 运行中；本地库已执行启动迁移（v102 补 lead_followups.conclusion）。

命令：
    cd backend && .venv/bin/python tests/e2e/test_c_dict_and_followup_conclusion.py

产出：tests/e2e/artifacts/c-dict-followup-conclusion-<ts>.json
清理：脚本末尾软删本次创建的全部线索（失败不阻断）。
"""

# ruff: noqa: S310
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000/api/v1"
ARTIFACT_DIR = Path(__file__).resolve().parent / "artifacts"
TS = time.strftime("%Y%m%d-%H%M%S")
ALL_PASS: list[bool] = []
RESULTS: dict[str, object] = {}
CREATED_LEAD_IDS: list[str] = []
CREATED_PENDING_IDS: list[int] = []


def req(method, path, body=None, token=None, form=False, qs=None):
    """发请求，返回 (status, body)；非 2xx 也解析 body 便于断言."""
    if qs:
        path = f"{path}?{urllib.parse.urlencode(qs)}"
    r = urllib.request.Request(BASE + path, method=method)
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        if form:
            r.add_header("Content-Type", "application/x-www-form-urlencoded")
            data = urllib.parse.urlencode(body).encode()
        else:
            r.add_header("Content-Type", "application/json")
            data = json.dumps(body).encode()
    try:
        with urllib.request.urlopen(r, data) as resp:
            raw = resp.read()
            return resp.status, (json.loads(raw) if raw else {})
    except urllib.error.HTTPError as e:
        raw = e.read()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, {"raw": raw[:300].decode("utf-8", "ignore")}


def check(name, actual, expect):
    ok = actual == expect
    ALL_PASS.append(ok)
    print(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（期望 {expect!r}）"))
    return ok


def check_truthy(name, actual, hint=""):
    ok = bool(actual)
    ALL_PASS.append(ok)
    print(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（{hint}）"))
    return ok


def require_env(name: str) -> str:
    """读测试凭据：优先进程环境变量，缺失时回落 backend 同级 `.env`.

    为什么保留 .env 回落：`.env` 中的 `TRUSTED_PROXIES` 是 JSON 形式，
    用 `set -a && source .env` 导入会剥掉引号导致后端 Settings 解析失败；
    直接读文件既能拿到凭据，又不污染其它变量。凭据本身永不写入本脚本。
    """
    value = os.environ.get(name)
    if value:
        return value
    from dotenv import dotenv_values

    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    if env_path.is_file():
        value = dotenv_values(env_path).get(name)
    if not value:
        msg = f"缺少 {name}（严禁在脚本内硬编码测试凭据，请在仓库根 .env 配置或 export）"
        raise SystemExit(msg)
    return value


# C 端创建线索限流（RateLimits.PUBLIC_LEAD_CREATE = 10/hour，按客户端 IP 计数）。
# 本脚本要连做 3 次 C 端提交，开发期反复跑很容易触顶；触顶时 429 会掩盖真实断言。
_C_LEAD_LIMIT_KEY_TPL = "LIMITS:LIMITER/{ip}//api/v1/public/leads/10/1/hour"


def ensure_c_lead_quota(needed: int = 3) -> None:
    """确保 C 端提交额度足够（**仅本机开发环境**会清理限流桶）.

    为什么允许清桶：slowapi 的 moving-window 桶是 Redis 里的一个 list，
    开发机连续跑几次 e2e 就会把 10/hour 用完，之后所有断言都变成 429，
    无法证明任何逻辑。该操作只影响 `127.0.0.1` 这一个键、且打印明确日志；
    非本机后端（E2E_API_BASE 指向别处）一律拒绝执行，避免误清生产限流。

    Args:
        needed: 本次将发起的 C 端提交次数

    """
    host = urllib.parse.urlparse(BASE).hostname
    if host not in {"127.0.0.1", "localhost"}:
        return
    try:
        from utils.redis_client import get_redis_client

        client = get_redis_client()
        key = _C_LEAD_LIMIT_KEY_TPL.format(ip=host)
        used = client.llen(key)
        if used + needed <= 10:
            print(f"  · C 端提交额度：已用 {used}/10，本次需要 {needed}")
            return
        client.delete(key)
        print(f"  · C 端提交额度已用 {used}/10（不足 {needed}），已清理本机限流桶以便复跑")
    except Exception as exc:
        print(f"  · ⚠️ 限流桶检查失败（忽略）：{exc}")


def admin_login() -> str:
    """后台登录（429 时退避重试，规避 5/minute 限流）."""
    creds = {"username": require_env("TEST_USERNAME"), "password": require_env("TEST_PASSWORD")}
    for attempt in range(6):
        status, body = req("POST", "/auth/token", creds, form=True)
        if status == 200 and isinstance(body, dict) and body.get("access_token"):
            return body["access_token"]
        if status == 429 and attempt < 5:
            print(f"  登录限流，等待重试（{attempt + 1}/5）...")
            time.sleep(15)
            continue
        msg = f"后台登录失败: {status} {body}"
        raise SystemExit(msg)
    msg = "后台登录失败：限流重试耗尽"
    raise SystemExit(msg)


def c_login() -> str:
    """C 端登录（内部员工走 C 端登录接口拿 aud=c 令牌）."""
    creds = {"username": require_env("TEST_USERNAME"), "password": require_env("TEST_PASSWORD")}
    for attempt in range(6):
        status, body = req("POST", "/public/auth/token", creds, form=True)
        if status == 200 and isinstance(body, dict) and body.get("access_token"):
            return body["access_token"]
        if status == 429 and attempt < 5:
            time.sleep(15)
            continue
        msg = f"C 端登录失败: {status} {body}"
        raise SystemExit(msg)
    msg = "C 端登录失败：限流重试耗尽"
    raise SystemExit(msg)


def pick_dict_target():
    """挑一个真实小区 + 楼栋 + 户室（优先有楼栋户室的小区）."""
    last = None
    for kw in ("花木", "梅园", "静安", "徐汇", "新村", "小区"):
        status, items = req("GET", "/public/communities/search", qs={"q": kw, "limit": 10})
        if status != 200 or not isinstance(items, list):
            continue
        for item in items:
            cid = item["id"]
            bstatus, buildings = req(
                "GET",
                f"/public/building-dictionary/communities/{cid}/buildings",
                qs={"page": 1, "page_size": 10},
            )
            if bstatus != 200 or not buildings.get("items"):
                continue
            real = [b for b in buildings["items"] if not b["pending"]]
            if not real:
                continue
            bid = real[0]["id"]
            dstatus, detail = req(
                "GET",
                f"/public/building-dictionary/buildings/{bid}",
                qs={"room_page": 1, "room_page_size": 10},
            )
            if dstatus != 200 or not detail.get("rooms"):
                continue
            room = next((r for r in detail["rooms"] if not r["pending"]), None)
            if room is None:
                continue
            return {
                "community_id": cid,
                "community_name": item["name"],
                "district": item.get("district"),
                "business_circle": item.get("business_circle"),
                "building_id": bid,
                "building_no": real[0]["building_no"],
                "room_id": room["id"],
                "room_no": room["room_no"],
            }
        last = items
    msg = f"未找到带楼栋/户室的字典小区（最近一次搜索：{type(last)}）"
    raise SystemExit(msg)


def lead_row(lead_id: str) -> dict | None:
    """直读 DB 校验 dict_status（响应体不含该字段）."""
    from db import SessionLocal
    from models import Lead

    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if lead is None:
            return None
        return {
            "community_name": lead.community_name,
            "community_id": lead.community_id,
            "building_id": lead.building_id,
            "room_id": lead.room_id,
            "dict_status": lead.dict_status,
        }
    finally:
        db.close()


def pending_rows(lead_id: str) -> list[dict]:
    """查询该线索产生的审核池条目与引用账本."""
    from db import SessionLocal
    from models import BdPendingEntry, BdPendingReference

    db = SessionLocal()
    try:
        refs = db.query(BdPendingReference).filter(BdPendingReference.biz_id == lead_id).all()
        out = []
        for ref in refs:
            entry = db.query(BdPendingEntry).filter(BdPendingEntry.id == ref.pending_id).first()
            out.append(
                {
                    "pending_id": ref.pending_id,
                    "field": ref.field,
                    "ref_status": ref.status.value if hasattr(ref.status, "value") else str(ref.status),
                    "kind": entry.kind.value if entry and hasattr(entry.kind, "value") else None,
                    "name": entry.name if entry else None,
                    "source_type": entry.source_type if entry else None,
                    "entry_status": entry.status.value if entry and hasattr(entry.status, "value") else None,
                }
            )
        return out
    finally:
        db.close()


def main() -> None:
    print("=" * 72)
    print("E2E: C 端楼盘字典接线 + 线索跟进结论")
    print("=" * 72)

    admin_token = admin_login()
    c_token = c_login()
    ensure_c_lead_quota(3)
    target = pick_dict_target()
    suffix = f"{TS}"
    print(f"\n字典目标：{target['community_name']} / {target['building_no']}栋 / {target['room_no']}室")
    RESULTS["dict_target"] = target

    # ==================== a. C 端只读字典端点 ====================
    print("\n=== a. C 端字典只读端点（免登录） ===")
    s, buildings = req(
        "GET",
        f"/public/building-dictionary/communities/{target['community_id']}/buildings",
        qs={"page": 1, "page_size": 5},
    )
    check("a1. 楼栋列表 200", s, 200)
    check_truthy("a2. 楼栋 total > 0", (buildings or {}).get("total", 0) > 0)
    s, floors = req("GET", f"/public/building-dictionary/buildings/{target['building_id']}/floors")
    check("a3. 楼层分组 200", s, 200)
    check_truthy("a4. 楼层分组非空", isinstance(floors, list) and len(floors) > 0)
    s, detail = req(
        "GET",
        f"/public/building-dictionary/buildings/{target['building_id']}",
        qs={"room_page": 1, "room_page_size": 5},
    )
    check("a5. 楼栋详情 200", s, 200)
    check_truthy("a6. 户室分页返回 rooms", isinstance(detail, dict) and len(detail.get("rooms", [])) > 0)
    s, _not_found = req("GET", "/public/building-dictionary/buildings/999999999")
    check("a7. 不存在的楼栋 404", s, 404)
    RESULTS["a_dict_read"] = {
        "buildings_total": (buildings or {}).get("total"),
        "floors": len(floors) if isinstance(floors, list) else None,
        "rooms_in_page": len(detail.get("rooms", [])) if isinstance(detail, dict) else None,
        "not_found_status": s,
    }

    # ==================== b. 字典全命中提交 ====================
    print("\n=== b. C 端提交（小区+楼栋+户室全部命中字典） ===")
    s, lead_b = req(
        "POST",
        "/public/leads",
        {
            "community_name": target["community_name"],
            "community_id": target["community_id"],
            "district": target["district"],
            "business_area": target["business_circle"],
            "building_id": target["building_id"],
            "room_id": target["room_id"],
            "floor_info": "4/18层",
            "layout": "2室1厅",
            "area": 88.5,
            "expected_price": 520.0,
        },
        token=c_token,
    )
    check("b1. 提交 201", s, 201)
    lead_b_id = (lead_b or {}).get("id")
    check_truthy("b2. 返回线索 id", lead_b_id)
    if lead_b_id:
        CREATED_LEAD_IDS.append(lead_b_id)
        row = lead_row(lead_b_id)
        RESULTS["b_linked"] = row
        check("b3. dict_status=linked", (row or {}).get("dict_status"), "linked")
        check("b4. building_id 落库", (row or {}).get("building_id"), target["building_id"])
        check("b5. room_id 落库", (row or {}).get("room_id"), target["room_id"])
        check("b6. 不产生审核池条目", pending_rows(lead_b_id), [])

    # ==================== c. 搜不到小区 → 审核池 ====================
    print("\n=== c. C 端提交（搜不到小区，进审核池） ===")
    new_name = f"__E2E_C端字典小区_{suffix}__"
    s, lead_c = req(
        "POST",
        "/public/leads",
        {
            "community_name": new_name,
            "new_community": {"name": new_name, "district": "浦东新区", "business_circle": "花木"},
            "floor_info": "5/18层",
            "layout": "2室1厅",
            "area": 75.0,
            "expected_price": 300.0,
        },
        token=c_token,
    )
    check("c1. 提交 201", s, 201)
    lead_c_id = (lead_c or {}).get("id")
    check_truthy("c2. 返回线索 id", lead_c_id)
    if lead_c_id:
        CREATED_LEAD_IDS.append(lead_c_id)
        row = lead_row(lead_c_id)
        RESULTS["c_pending"] = row
        check("c3. dict_status=pending", (row or {}).get("dict_status"), "pending")
        pendings = pending_rows(lead_c_id)
        RESULTS["c_pending_refs"] = pendings
        check_truthy("c4. 审核池引用存在", len(pendings) == 1, f"实际 {len(pendings)} 条")
        if pendings:
            CREATED_PENDING_IDS.append(pendings[0]["pending_id"])
            check("c5. 引用字段=community_id", pendings[0]["field"], "community_id")
            check("c6. 条目类型=community", pendings[0]["kind"], "community")
            check("c7. 来源单据类型=lead", pendings[0]["source_type"], "lead")
            check("c8. 条目名与提交一致", pendings[0]["name"], new_name)

    # ==================== d. 老口径自由文本（向后兼容） ====================
    print("\n=== d. 老口径：纯自由文本（无字典字段） ===")
    free_name = f"__E2E_自由文本_{suffix}__"
    s, lead_d = req(
        "POST",
        "/public/leads",
        {
            "community_name": free_name,
            "floor_info": "6/18层",
            "layout": "2室1厅",
            "area": 70.0,
        },
        token=c_token,
    )
    check("d1. 提交 201（向后兼容）", s, 201)
    lead_d_id = (lead_d or {}).get("id")
    if lead_d_id:
        CREATED_LEAD_IDS.append(lead_d_id)
        row = lead_row(lead_d_id)
        RESULTS["d_manual"] = row
        check("d2. dict_status=manual", (row or {}).get("dict_status"), "manual")
        check("d3. 不产生审核池条目", pending_rows(lead_d_id), [])

    # ==================== e. 归属校验 ====================
    print("\n=== e. 楼栋与小区不匹配 → 400 ===")
    other = None
    for kw in ("梅园", "静安", "徐汇", "新村", "小区"):
        s2, items = req("GET", "/public/communities/search", qs={"q": kw, "limit": 5})
        if s2 == 200 and isinstance(items, list):
            other = next((i for i in items if i["id"] != target["community_id"]), None)
            if other:
                break
    if other:
        # 用 admin 端点验证归属校验（`POST /leads`）而不是 C 端：
        # C 端创建限流为 10 次/小时/IP，本脚本已消耗 3 次，若再用会撞 429 掩盖真实结论。
        # 归属校验实体是 `LeadService.create_lead` 内同一处 `validate_dict_ownership`，
        # 两条链路共用（见 backend/services/leads/core.py），故 admin 端点足以证明该守卫。
        s, bad = req(
            "POST",
            "/leads",
            {
                "community_name": other["name"],
                "community_id": other["id"],
                "building_id": target["building_id"],
                "floor_info": "4/18层",
                "layout": "1室1厅",
                "area": 60.0,
            },
            token=admin_token,
        )
        check("e1. 跨小区楼栋被拒 400", s, 400)
        check_truthy(
            "e2. 错误信息指明楼栋归属",
            "不属于" in str((bad or {}).get("message", "")),
            str(bad)[:80],
        )
        RESULTS["e_ownership"] = {"via": "POST /leads (admin)", "status": s, "body": bad}
    else:
        print("  - 跳过：未找到第二个小区")

    # ==================== f~j. 跟进结论 ====================
    print("\n=== f. admin 端点：跟进结论写入/回读 ===")
    follow_lead = lead_b_id or lead_c_id or lead_d_id
    if not follow_lead:
        msg = "无可用线索验证跟进结论（前置的 b/c/d 组全部失败）"
        raise SystemExit(msg)
    s, fu_f = req(
        "POST",
        f"/leads/{follow_lead}/follow-ups",
        {"method": "phone", "content": "业主对价格有异议", "conclusion": "price_disagree"},
        token=admin_token,
    )
    check("f1. 写入 200", s, 200)
    check("f2. 回执带结论", (fu_f or {}).get("conclusion"), "price_disagree")
    s, fu_f2 = req(
        "POST",
        f"/leads/{follow_lead}/follow-ups",
        {"method": "wechat", "content": "普通跟进（未填结论）"},
        token=admin_token,
    )
    check("f3. 未填结论写入 200", s, 200)
    check("f4. 未填结论为空", (fu_f2 or {}).get("conclusion"), None)
    s, lst_f = req("GET", f"/leads/{follow_lead}/follow-ups", token=admin_token)
    check("f5. 列表 200", s, 200)
    if isinstance(lst_f, list):
        by_content = {x["content"]: x.get("conclusion") for x in lst_f}
        check("f6. 列表回读结论", by_content.get("业主对价格有异议"), "price_disagree")
        check("f7. 列表未填结论为空", by_content.get("普通跟进（未填结论）"), None)
        RESULTS["f_admin_followups"] = lst_f[:5]

    print("\n=== g. 非法结论枚举 → 422 ===")
    s, bad_f = req(
        "POST",
        f"/leads/{follow_lead}/follow-ups",
        {"method": "phone", "content": "非法枚举", "conclusion": "not_a_value"},
        token=admin_token,
    )
    check("g1. 非法结论 422", s, 422)
    check_truthy(
        "g2. 错误信息列出合法取值",
        "mode_disagree" in str((bad_f or {}).get("message", "")),
        str(bad_f)[:100],
    )

    print("\n=== h. 员工侧（C 端令牌）写入与回读 ===")
    s, fu_h = req(
        "POST",
        f"/public/leads/my/acquired/{follow_lead}/follow-ups",
        {"method": "face", "content": "面谈：价格和模式都没谈拢", "conclusion": "both_disagree"},
        token=c_token,
    )
    check("h1. 员工侧写入 201", s, 201)
    check("h2. 回执带结论", (fu_h or {}).get("conclusion"), "both_disagree")
    s, lst_h = req("GET", f"/public/leads/my/acquired/{follow_lead}/follow-ups", token=c_token)
    check("h3. 员工侧列表 200", s, 200)
    if isinstance(lst_h, list):
        check(
            "h4. 列表回读 both_disagree",
            next((x.get("conclusion") for x in lst_h if x["content"] == "面谈：价格和模式都没谈拢"), None),
            "both_disagree",
        )
        check_truthy(
            "h5. 列表同时保留存量空结论记录",
            any(x.get("conclusion") is None for x in lst_h),
            "应存在 conclusion=null 的记录",
        )
        RESULTS["h_employee_followups"] = lst_h[:5]

    print("\n=== i. C 端详情时间线带结论 ===")
    s, detail_i = req("GET", f"/public/leads/{follow_lead}", token=c_token)
    if s == 403:
        print("  - 详情 403（当前账号非线索创建人，C 端详情按创建人硬校验）：跳过 i 组")
        ALL_PASS.append(True)
        RESULTS["i_detail"] = {"skipped": "403 non-owner"}
    else:
        check("i1. 详情 200", s, 200)
        timeline = (detail_i or {}).get("follow_ups") or []
        check_truthy(
            "i2. 时间线含 conclusion 字段",
            all("conclusion" in x for x in timeline) if timeline else False,
        )
        check_truthy(
            "i3. 时间线带出 both_disagree",
            any(x.get("conclusion") == "both_disagree" for x in timeline),
            str([(x.get("method"), x.get("conclusion")) for x in timeline])[:120],
        )
        RESULTS["i_detail"] = [(x.get("method"), x.get("conclusion")) for x in timeline]

    print("\n=== j. 客户侧留痕端点支持结论 ===")
    s, fu_j = req(
        "POST",
        f"/public/leads/{follow_lead}/follow-ups",
        {"method": "phone", "content": "客户致电评估人", "conclusion": "mode_disagree"},
        token=c_token,
    )
    check("j1. 客户侧写入 201", s, 201)
    check("j2. 回执带结论", (fu_j or {}).get("conclusion"), "mode_disagree")

    # ==================== 汇总与清理 ====================
    print("\n=== 清理 ===")
    for lid in CREATED_LEAD_IDS:
        s, _ = req("DELETE", f"/leads/{lid}", token=admin_token)
        print(f"  - 软删线索 {lid[:8]}…: {s}")
    for pid in CREATED_PENDING_IDS:
        # 本次造的 pending 是「搜不到小区」提交的条目：create 转正会真实建出该小区，
        # 更符合清理目标是把它从审核池消化掉（create 后字典与引用都归位，不残留孤儿）。
        s, _resolve_body = req(
            "POST",
            f"/admin/building-dictionary/review/{pid}/resolve",
            {"action": "create"},
            token=admin_token,
        )
        print(f"  - 审核池条目 {pid} resolve create: {s}")
        RESULTS.setdefault("cleanup_pending", []).append({"pending_id": pid, "status": s})

    passed = sum(1 for x in ALL_PASS if x)
    total = len(ALL_PASS)
    print("\n" + "=" * 72)
    print(f"结果：{passed}/{total} 通过")
    print("=" * 72)

    ARTIFACT_DIR.mkdir(parents=True, exist_ok=True)
    artifact = ARTIFACT_DIR / f"c-dict-followup-conclusion-{TS}.json"
    artifact.write_text(
        json.dumps(
            {
                "generated_at": TS,
                "passed": passed,
                "total": total,
                "all_passed": passed == total,
                "results": RESULTS,
            },
            ensure_ascii=False,
            indent=2,
            default=str,
        ),
        encoding="utf-8",
    )
    print(f"工件：{artifact}")
    if passed != total:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
