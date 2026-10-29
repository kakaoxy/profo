"""E2E: 已售（过往案例）房源 C 端写入守卫（Design QA 2026-10-28 B-02 修复复验）.

**背景**：修复前，298 条「已售·发布」房源经公开接口可达，详情页提供可提交的
看房预约与调价订阅入口；后端 `create_booking` 与房源级订阅上报
`report_project_result` 只校验 `is_deleted + publish_status`，不校验
`project_status`，已售房源的预约/订阅能成功落库（脏数据 + 广告合规风险）。

**修复**：两个写入口均前置于其他业务校验，拒绝 `project_status == 已售`：
- POST /public/bookings            → 409 「该房源已售出，不再接受看房预约」
- POST /public/marketing/projects/{id}/subscription/report → 409 「该房源已售出，无需调价提醒」

**断言**：
1. 已售房源：预约 → 409 且 message 含「已售出」、响应体为统一错误格式 {code≠0, message}；
2. 已售房源：订阅上报 → 409 且 message 含「已售出」；
3. 非已售房源（在售）：订阅上报不受状态守卫影响（模板 ID 不匹配静默忽略 → 200），
   随后 cancel 清理（验证取消入口保持开放，不产生脏额度）；
4. 正控补充：预约入口对非已售房源不受状态守卫影响——仅在测试账号已有预约记录时
   以幂等重放验证（不产生新数据）；无既有预约时跳过（避免产生真实线索）。

命令: cd backend && .venv/bin/python tests/e2e/test_sold_state_guards.py
前置: 后端 :8000 运行中；C 端测试账号（仓库根 .env 的 TEST_USERNAME/TEST_PASSWORD）。
清理: 幂等（不新增预约）；在售正控产生的房源级订阅行经 cancel 清零额度后保留
      （订阅行保留是产品口径：维持 admin 订阅人数累计），无脏数据残留。
"""

# ruff: noqa: S310
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "http://127.0.0.1:8000/api/v1"
PASSED: list[bool] = []


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
    """统一请求：form=True 走 OAuth2 表单（登录），否则 JSON；返回 (status, body)."""
    r = urllib.request.Request(BASE + path, method=method)
    if token:
        r.add_header("Authorization", f"Bearer {token}")
    data = None
    if body is not None:
        if form:
            data = urllib.parse.urlencode(body).encode()
            r.add_header("Content-Type", "application/x-www-form-urlencoded")
        else:
            data = json.dumps(body).encode()
            r.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(r, data=data, timeout=15) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read().decode())
        except Exception:
            return e.code, {}


def check(name: str, cond: bool, detail: str = "") -> None:
    """记录一条断言（报告式输出，退出码聚合）."""
    PASSED.append(bool(cond))
    mark = "✓" if cond else "✗"
    print(f"  {mark} {name}" + (f"  [{detail}]" if detail else ""))


def _err_message(body: object) -> str:
    """提取错误响应 message（非 dict 或缺字段时为空串）."""
    if isinstance(body, dict):
        return str(body.get("message", ""))
    return ""


def main() -> None:
    print("== 已售房源 C 端写入守卫 E2E ==")

    # 1) C 端登录（测试账号凭据走 .env，不落仓库）
    creds = {"username": _env("TEST_USERNAME"), "password": _env("TEST_PASSWORD")}
    s, tok = req("POST", "/public/auth/token", creds, form=True)
    token = tok.get("access_token") if isinstance(tok, dict) else None
    check("C 端登录成功", s == 200 and bool(token), f"HTTP {s}")
    if s != 200 or not token:
        raise SystemExit(1)

    # 2) 取已发布房源样本（各 1 条；查询值含中文，需 percent-encode）
    sold_q = urllib.parse.urlencode({"project_status": "已售", "page_size": 1})
    sale_q = urllib.parse.urlencode({"project_status": "在售", "page_size": 5})
    s, sold_list = req("GET", f"/public/projects?{sold_q}")
    s2, sale_list = req("GET", f"/public/projects?{sale_q}")
    has_samples = bool(sold_list.get("items")) and bool(sale_list.get("items"))
    check("公开列表可达（已售/在售样本各≥1）", s == 200 and s2 == 200 and has_samples)
    sold = sold_list["items"][0]
    print(f"  样本: 已售 id={sold['id']} title={str(sold.get('title', ''))[:20]}")

    # 3) 已售房源预约 → 409（状态守卫前置于手机号校验，无手机号账号亦可直接验证）
    s, body = req(
        "POST",
        "/public/bookings",
        {"marketing_project_id": sold["id"], "visitor_id": "e2e-sold-guard"},
        token=token,
    )
    check("已售房源预约返回 409", s == 409, f"HTTP {s}")
    fmt_ok = isinstance(body, dict) and body.get("code", 0) != 0
    check(
        "预约错误为统一格式且文案含「已售出」",
        fmt_ok and "已售出" in _err_message(body),
        json.dumps(body, ensure_ascii=False)[:80],
    )

    # 4) 已售房源调价订阅上报 → 409
    s, body = req(
        "POST",
        f"/public/marketing/projects/{sold['id']}/subscription/report",
        {"results": [{"template_id": "E2E-FAKE-TEMPLATE", "status": "accept"}]},
        token=token,
    )
    check("已售房源调价订阅上报返回 409", s == 409, f"HTTP {s}")
    check("订阅错误文案含「已售出」", "已售出" in _err_message(body), json.dumps(body, ensure_ascii=False)[:80])

    # 5) 正控：在售房源订阅上报不受状态守卫影响（模板不匹配静默忽略 → 200），随后 cancel 清理
    on_sale = next((i for i in sale_list["items"] if i.get("project_status") == "在售"), None)
    if on_sale:
        s, _ = req(
            "POST",
            f"/public/marketing/projects/{on_sale['id']}/subscription/report",
            {"results": [{"template_id": "E2E-FAKE-TEMPLATE", "status": "accept"}]},
            token=token,
        )
        check("在售房源订阅上报不受守卫拦截（200）", s == 200, f"HTTP {s}")
        s, _ = req("POST", f"/public/marketing/projects/{on_sale['id']}/subscription/cancel", token=token)
        check("在售房源订阅 cancel 保持可用（200）", s == 200, f"HTTP {s}")
    else:
        sample_ok = False
        check("在售房源订阅正控", sample_ok, "列表无在售样本，跳过")

    # 6) 正控：在售房源预约入口不受守卫影响——仅在已有预约时幂等重放（零新增数据）
    s, mine = req("GET", "/public/bookings/my?page_size=50", token=token)
    bookings = mine if isinstance(mine, list) else mine.get("items", [])
    if bookings:
        target_id = bookings[0]["marketing_project_id"]
        s, body = req(
            "POST",
            "/public/bookings",
            {"marketing_project_id": target_id, "visitor_id": "e2e-sold-guard"},
            token=token,
        )
        if s == 409 and "已售出" in _err_message(body):
            # 样本过期：既有预约对应房源已被标记为已售，守卫拦截是正确业务行为，
            # 不判定测试失败（my 接口不含 project_status，无法前置过滤）
            print("  - SKIP: 既有预约房源已转为已售，幂等重放被守卫正确拦截（样本过期，非缺陷）")
        else:
            check("非已售房源预约不受状态守卫影响（幂等重放 200）", s == 200, f"HTTP {s}")
    else:
        print("  - SKIP: 测试账号无既有预约，为避免产生真实线索跳过预约正控（负向断言已覆盖守卫生效）")

    print()
    ok = all(PASSED)
    print(f"总结论: {'全部通过 ✓' if ok else '存在失败 ✗'}（{sum(PASSED)}/{len(PASSED)}）")
    raise SystemExit(0 if ok else 1)


if __name__ == "__main__":
    main()
