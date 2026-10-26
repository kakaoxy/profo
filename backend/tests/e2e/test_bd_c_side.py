"""E2E: C 端线索字典口径回归（FR-17 修订版 / 2026-10-26）.

**口径变更**（原 FR-17/v1.5「C 端零改动、维持自由文本、不入池」已废止）：
小程序估价提交页改为与 `admin/leads` 新增线索**完全一致**的楼盘字典口径——
小区走字典选择器（必选）、楼栋/户室选填、搜不到时随线索提交进审核池。

因此本脚本的断言从「C 端不产生 pending」翻转为「C 端与 admin 同一条链路」：

1. **向后兼容**：不带任何字典字段的纯自由文本提交仍返回 201，
   且 `dict_status=manual`、不产生 pending（老版本小程序/外部调用方零破坏）；
2. **字典命中**：带 community_id + building_id/room_id → `dict_status=linked`，不产生 pending；
3. **进审核池**：带 `new_community` → `dict_status=pending` + `bd_pending_entries` 条目
   + `bd_pending_references` 引用账本（来源类型 `lead`）。

命令: cd backend && .venv/bin/python tests/e2e/test_bd_c_side.py
前置: 后端 :8000 运行中；C 端测试账号（仓库根 .env 的 TEST_USERNAME/TEST_...）。
清理: 脚本末尾软删本次创建的线索，并把 pending 条目 resolve 掉。
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
_SUFFIX = time.strftime("%H%M%S")
CREATED: list[str] = []
PASSED: list[bool] = []

# C 端创建限流 10/hour（按 IP）：重复跑本脚本会触顶，触顶时清理本机限流桶
_C_LEAD_LIMIT_KEY = "LIMITS:LIMITER/127.0.0.1//api/v1/public/leads/10/1/hour"


def _env(name: str) -> str:
    """凭据读取：环境变量优先，回落仓库根 .env（严禁在本文件硬编码）."""
    value = os.environ.get(name)
    if value:
        return value
    from dotenv import dotenv_values

    env_path = Path(__file__).resolve().parent.parent.parent.parent / ".env"
    if env_path.is_file():
        value = dotenv_values(env_path).get(name)
    if not value:
        msg = f"缺少 {name}：请在仓库根 .env 配置或 export"
        raise SystemExit(msg)
    return value


def req(method, path, body=None, token=None, form=False):
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
            return e.code, {"raw": raw[:200].decode("utf-8", "ignore")}


def check(name, actual, expect):
    ok = actual == expect
    PASSED.append(ok)
    print(f"  {'✓' if ok else '✗'} {name}: {actual!r}" + ("" if ok else f"（期望 {expect!r}）"))
    return ok


def reset_c_lead_quota(needed: int = 3) -> None:
    """仅本机开发环境：C 端创建限流不足时清理限流桶，保证脚本可复跑."""
    try:
        from utils.redis_client import get_redis_client

        client = get_redis_client()
        used = client.llen(_C_LEAD_LIMIT_KEY)
        if used + needed > 10:
            client.delete(_C_LEAD_LIMIT_KEY)
            print(f"  · 清理本机 C 端创建限流桶（已用 {used}/10）")
    except Exception as exc:
        print(f"  · 限流桶检查失败（忽略）：{exc}")


def login_c() -> str | None:
    for _attempt in range(6):
        status, body = req(
            "POST",
            "/public/auth/token",
            {"username": _env("TEST_USERNAME"), "password": _env("TEST_PASSWORD")},
            form=True,
        )
        if status == 200 and isinstance(body, dict) and body.get("access_token"):
            return body["access_token"]
        if status == 429:
            time.sleep(15)
            continue
        print(f"  · C 端登录失败 {status}：{body}")
        return None
    return None


def lead_row(lead_id: str) -> dict | None:
    from db import SessionLocal
    from models import Lead

    db = SessionLocal()
    try:
        lead = db.query(Lead).filter(Lead.id == lead_id).first()
        if lead is None:
            return None
        return {"dict_status": lead.dict_status, "building_id": lead.building_id, "room_id": lead.room_id}
    finally:
        db.close()


def pending_count(lead_id: str) -> int:
    from db import SessionLocal
    from models import BdPendingReference

    db = SessionLocal()
    try:
        return db.query(BdPendingReference).filter(BdPendingReference.biz_id == lead_id).count()
    finally:
        db.close()


def pick_dict_target() -> dict | None:
    """找一个带楼栋户室的真实小区（用于「字典命中」用例）."""
    for kw in ("花木", "梅园", "静安", "徐汇", "新村"):
        status, items = req("GET", f"/public/communities/search?{urllib.parse.urlencode({'q': kw, 'limit': 10})}")
        if status != 200 or not isinstance(items, list):
            continue
        for item in items:
            s2, buildings = req(
                "GET",
                f"/public/building-dictionary/communities/{item['id']}/buildings?page=1&page_size=5",
            )
            if s2 != 200 or not buildings.get("items"):
                continue
            real = [b for b in buildings["items"] if not b["pending"]]
            if not real:
                continue
            s3, detail = req(
                "GET",
                f"/public/building-dictionary/buildings/{real[0]['id']}?room_page=1&room_page_size=5",
            )
            if s3 != 200 or not detail.get("rooms"):
                continue
            room = next((r for r in detail["rooms"] if not r["pending"]), None)
            if room is None:
                continue
            return {
                "community_id": item["id"],
                "community_name": item["name"],
                "district": item.get("district"),
                "business_circle": item.get("business_circle"),
                "building_id": real[0]["id"],
                "room_id": room["id"],
            }
    return None


def main() -> None:
    print("=" * 68)
    print("E2E: C 端线索字典口径（向后兼容 / 字典命中 / 进审核池）")
    print("=" * 68)

    token = login_c()
    if not token:
        print("SKIP: 无可用 C 端测试账号（请在仓库根 .env 配置 TEST_USERNAME/TEST_...）")
        return
    reset_c_lead_quota(3)

    # ---- 1. 向后兼容：纯自由文本 ----
    print("\n=== 1. 老口径自由文本（向后兼容） ===")
    free_name = f"__E2E_自由文本_{_SUFFIX}__"
    s, lead = req(
        "POST",
        "/public/leads",
        {"community_name": free_name, "floor_info": "5/18层", "layout": "2室1厅", "area": 75.0},
        token=token,
    )
    check("1.1 提交 201", s, 201)
    if s == 201:
        lid = lead["id"]
        CREATED.append(lid)
        row = lead_row(lid)
        check("1.2 dict_status=manual", (row or {}).get("dict_status"), "manual")
        check("1.3 不产生 pending", pending_count(lid), 0)

    # ---- 2. 字典命中 ----
    print("\n=== 2. 字典命中（小区+楼栋+户室） ===")
    target = pick_dict_target()
    if target:
        s, lead = req(
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
                "area": 88.0,
                "expected_price": 520.0,
            },
            token=token,
        )
        check("2.1 提交 201", s, 201)
        if s == 201:
            lid = lead["id"]
            CREATED.append(lid)
            row = lead_row(lid)
            check("2.2 dict_status=linked", (row or {}).get("dict_status"), "linked")
            check("2.3 building_id 落库", (row or {}).get("building_id"), target["building_id"])
            check("2.4 room_id 落库", (row or {}).get("room_id"), target["room_id"])
            check("2.5 不产生 pending", pending_count(lid), 0)
    else:
        print("  - 跳过：库内无可用的楼栋/户室数据")

    # ---- 3. 进审核池 ----
    print("\n=== 3. 搜不到小区 → 进审核池（与 admin 同链路） ===")
    new_name = f"__E2E_C端入池_{_SUFFIX}__"
    s, lead = req(
        "POST",
        "/public/leads",
        {
            "community_name": new_name,
            "new_community": {"name": new_name},
            "floor_info": "6/18层",
            "layout": "1室1厅",
            "area": 60.0,
        },
        token=token,
    )
    check("3.1 提交 201", s, 201)
    if s == 201:
        lid = lead["id"]
        CREATED.append(lid)
        row = lead_row(lid)
        check("3.2 dict_status=pending", (row or {}).get("dict_status"), "pending")
        check("3.3 产生 1 条 pending 引用", pending_count(lid), 1)

    # ---- 清理 ----
    print("\n=== 清理 ===")
    s, admin = req(
        "POST",
        "/auth/token",
        {"username": _env("TEST_USERNAME"), "password": _env("TEST_PASSWORD")},
        form=True,
    )
    admin_token = admin.get("access_token") if s == 200 else None
    for lid in CREATED:
        if admin_token:
            s, _ = req("DELETE", f"/leads/{lid}", token=admin_token)
            print(f"  - 软删线索 {lid[:8]}…: {s}")
    # 清理本条 pending（create 转正，避免残留孤儿待审条目）
    if admin_token:
        from db import SessionLocal
        from models import BdPendingReference

        db = SessionLocal()
        pids = (
            [r.pending_id for r in db.query(BdPendingReference).filter(BdPendingReference.biz_id.in_(CREATED)).all()]
            if CREATED
            else []
        )
        db.close()
        for pid in pids:
            s, _ = req(
                "POST",
                f"/admin/building-dictionary/review/{pid}/resolve",
                {"action": "create"},
                token=admin_token,
            )
            print(f"  - 审核池条目 {pid} resolve create: {s}")

    passed = sum(1 for x in PASSED if x)
    print("\n" + "=" * 68)
    print(f"结果：{passed}/{len(PASSED)} 通过")
    print("=" * 68)
    if passed != len(PASSED):
        raise SystemExit(1)


if __name__ == "__main__":
    main()
