// 迭代二 · 角色工作台布局 Playwright E2E（SPEC §11.4 / §11.5 A7–A9、A12）.
//
// 覆盖：
//  1. 角色矩阵（验收 A7）：admin 10 / operator 8 / user 3 个 widget，
//     且 operator/user 视角**不含** finance_summary、audit_summary
//  2. 权限不扩张（验收 A8）：给 user 写入 finance_summary → 后端不返回、页面不渲染
//  3. 定制持久（验收 A9）：隐藏一个 widget → 刷新仍隐藏 → 重置恢复
//  4. 路由守卫：无 workbench:manage 访问 /admin/settings/workbench 被拦
//  5. user 角色无「定制」入口（D-07），且其布局写入返回 403
//
// 造数：经 backend python 直建 operator/user 临时账号（避开 must_change_password
// 首次改密闸门）；清理时物理删除该账号及其偏好行。
// ⚠️ 布局写入是 admin 自己的 user_preferences，不影响他人。
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER/PASSWORD 由 .env 提供。
// 运行：
//   set -a; source ../.env; set +a
//   export E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD
//   npx playwright test e2e/workbench-role-layout.spec.ts --reporter=line

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage, FRONTEND_BASE } from "./helpers/auth";

test.describe.configure({ mode: "serial" });
// 后端登录限流 5 次/分钟，且本文件要登录 admin/operator/user 三个账号；
// fetchTokens 的 429 退避最长 20+40+60s，故整文件超时放宽（默认 30s 不够）。
test.setTimeout(180_000);

const STAMP = Date.now();
const OPERATOR_USER = `e2e-wb-op-${STAMP}`;
const PLAIN_USER = `e2e-wb-user-${STAMP}`;
/** 临时账号统一密码（仅本次测试存活、测后即删；不落仓库） */
const TEMP_PASSWORD = `E2etmp-${STAMP}-Aa1`;

function backendPython(script: string): string {
  return execFileSync(path.resolve(__dirname, "../../backend/.venv/bin/python"), ["-c", script], {
    cwd: path.resolve(__dirname, "../../backend"),
    stdio: "pipe",
    encoding: "utf-8",
    env: {
      ...process.env,
      UPLOAD_DIR: path.resolve(__dirname, "../../backend/static/uploads"),
    },
  });
}

const SETUP_SCRIPT = `
import sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import Role, User
from utils.auth import get_password_hash

db = SessionLocal()
try:
    from models import UserPreference
    from models.user.preference import NAMESPACE_WORKBENCH_LAYOUT
    # 矩阵用例断言的是「无个人覆盖」时的角色默认布局；清掉历史残留
    # （含 admin——上一轮 A9 中止会留下隐藏 widget 的覆盖，导致数量断言 9≠10）
    usernames = ("admin", "${OPERATOR_USER}", "${PLAIN_USER}")
    ids = [u.id for u in db.query(User).filter(User.username.in_(usernames)).all()]
    if ids:
        db.query(UserPreference).filter(
            UserPreference.user_id.in_(ids),
            UserPreference.namespace == NAMESPACE_WORKBENCH_LAYOUT,
        ).delete(synchronize_session=False)
        db.commit()
    for code, username in (("operator", "${OPERATOR_USER}"), ("user", "${PLAIN_USER}")):
        if db.query(User).filter(User.username == username).first():
            continue
        role = db.query(Role).filter(Role.code == code).first()
        db.add(User(
            username=username,
            password=get_password_hash("${TEMP_PASSWORD}"),
            nickname=f"工作台E2E-{code}",
            role_id=role.id,
            status="active",
            must_change_password=False,
        ))
    db.commit()
    print("setup ok")
finally:
    db.close()
`;

const TEARDOWN_SCRIPT = `
import sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import User, UserPreference, NotificationRecipient

db = SessionLocal()
try:
    usernames = ("admin", "${OPERATOR_USER}", "${PLAIN_USER}")
    ids = [u.id for u in db.query(User).filter(User.username.in_(usernames)).all()]
    if ids:
        db.query(UserPreference).filter(
            UserPreference.user_id.in_(ids),
            UserPreference.namespace == "workbench.layout",
        ).delete(synchronize_session=False)
    temp_ids = [u.id for u in db.query(User).filter(
        User.username.in_(("${OPERATOR_USER}", "${PLAIN_USER}"))).all()]
    if temp_ids:
        db.query(UserPreference).filter(UserPreference.user_id.in_(temp_ids)).delete(synchronize_session=False)
        db.query(NotificationRecipient).filter(NotificationRecipient.user_id.in_(temp_ids)).delete(synchronize_session=False)
        db.query(User).filter(User.id.in_(temp_ids)).delete(synchronize_session=False)
    db.commit()
    print(f"torn down={len(temp_ids)}")
finally:
    db.close()
`;

/**
 * 读页头「当前生效 N / M」的启用数，并核对 DOM 中可见的 widget 槽位数。
 * 直接验证验收 A7 的「admin 10 / operator 8 / user 3」而非只看个别卡。
 */
async function assertWidgetCount(page: import("@playwright/test").Page, expected: number) {
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  // 页头文案：当前生效 N / M 个 widget
  const header = page.getByText(/当前生效 \d+ \/ \d+ 个 widget/);
  await expect(header).toBeVisible({ timeout: 20_000 });
  await expect(header).toContainText(`当前生效 ${expected} /`);
  // DOM 实际渲染的 widget 槽位数 = expected
  await expect(page.locator("[data-widget]")).toHaveCount(expected, { timeout: 20_000 });
}

/** 登录态 cookie 域：与 helpers/auth 的 FRONT_HOST 同推导，避免两处硬编码漂移 */
const FRONT_HOST = new URL(FRONTEND_BASE).hostname;

/**
 * 令牌缓存：后端登录限流 5 次/分钟，逐用例重复登录会撞 429
 * （helpers/auth 的 getAdminTokens 同样因此做进程内缓存）。
 */
const tokenCache = new Map<string, { accessToken: string; refreshToken: string }>();

async function fetchTokens(username: string, password: string) {
  const cached = tokenCache.get(username);
  if (cached) return cached;
  // 429 退避重试：多 worker 冷启动可能同时登录
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const ctx = await (await import("@playwright/test")).request.newContext();
    try {
      const res = await ctx.post("http://127.0.0.1:8000/api/v1/auth/login", {
        data: { username, password },
        headers: { "Content-Type": "application/json" },
      });
      if (res.status() === 429) {
        await new Promise((r) => setTimeout(r, 20_000 * (attempt + 1)));
        continue;
      }
      if (!res.ok()) throw new Error(`登录失败 ${res.status()}: ${await res.text()}`);
      const body = (await res.json()) as { access_token: string; refresh_token: string };
      const tokens = { accessToken: body.access_token, refreshToken: body.refresh_token };
      tokenCache.set(username, tokens);
      return tokens;
    } finally {
      await ctx.dispose();
    }
  }
  throw new Error(`登录持续被限流（429）：${username}`);
}

/** 以指定账号登录并注入 cookie（不同账号需要各自 token） */
async function loginAs(page: import("@playwright/test").Page, username: string, password: string) {
  const body = await fetchTokens(username, password);
  {
    await page.context().addCookies([
      {
        name: "access_token",
        value: body.accessToken,
        domain: FRONT_HOST,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
      {
        name: "refresh_token",
        value: body.refreshToken,
        domain: FRONT_HOST,
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);
  }
}

test.beforeAll(async () => {
  // execFileSync 建 python 子进程 + 建 2 个临时账号 + 预热登录：
  // 并行压测下超出默认 30s（与本仓其他重 E2E 同一稳定性口径）
  test.setTimeout(120_000);
  const out = backendPython(SETUP_SCRIPT);
  if (!out.includes("setup ok")) throw new Error(`临时账号创建失败: ${out}`);
  // 只预热两个临时账号：admin 由 helpers/auth 的 loginPage 缓存登录，
  // 此处再登一次会白白吃掉 5/min 限流额度中的一格。
  await fetchTokens(OPERATOR_USER, TEMP_PASSWORD);
  await fetchTokens(PLAIN_USER, TEMP_PASSWORD);
});

test.afterAll(() => {
  backendPython(TEARDOWN_SCRIPT);
});

/**
 * 工作台 widget 定位：用渲染层的 `data-widget="<注册表 key>"` 契约。
 *
 * 不用 aria-label：各卡片自带中文措辞不一（如线索漏斗卡的 aria-label 是
 * 「线索漏斗转化」），且部分卡无 region landmark；用 key 才与
 * WORKBENCH_WIDGETS / 后端注册表同源，也避免嵌套 landmark 断言歧义。
 */
function widget(page: import("@playwright/test").Page, key: string) {
  return page.locator(`[data-widget="${key}"]`);
}

/** 取元素相对视口的 x/宽度，用于断言栅格等分与卡头对齐 */
async function boxOf(locator: import("@playwright/test").Locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error("元素不可见，无法测量");
  return box;
}

test("布局对齐设计稿：顶行 4 卡等宽 + 18px 栅格间距（屏 01）", async ({ page }) => {
  // 设计稿 .wb-grid = repeat(12) + gap 18px；四张 span3 卡在同一行且宽度相等。
  // 旧实现是 5/4/3 非等分 + 16/24px 混用间距，此断言锁定修正。
  await loginPage(page);
  await page.goto("/admin");
  await expect(widget(page, "todo_board_summary")).toBeVisible({ timeout: 20_000 });

  const keys = ["project_overview", "leads_funnel", "alert_card", "todo_board_summary"];
  const boxes = await Promise.all(keys.map(async (k) => boxOf(widget(page, k))));

  // 1) 四卡同一行（y 相同）且等宽（±1px 容差）
  const top = boxes[0].y;
  for (const box of boxes) expect(Math.abs(box.y - top)).toBeLessThanOrEqual(1);
  const width = boxes[0].width;
  for (const box of boxes) expect(Math.abs(box.width - width)).toBeLessThanOrEqual(1);

  // 2) 相邻卡水平间距 = 18px（设计稿栅格 gap）
  for (let i = 1; i < boxes.length; i += 1) {
    const gap = boxes[i].x - (boxes[i - 1].x + boxes[i - 1].width);
    expect(Math.abs(gap - 18)).toBeLessThanOrEqual(1);
  }

  // 3) 顶行四卡等高（align-items: stretch）
  const heights = boxes.map((b) => b.height);
  for (const h of heights) expect(Math.abs(h - heights[0])).toBeLessThanOrEqual(1);
});

test("卡头统一：每张卡标题 15px/500 + 右上角 13px 链接（设计稿 WGHead）", async ({ page }) => {
  // 设计稿所有 widget 共用 WGHead（hifi:1027）：标题 15px/500，
  // 右侧链接 13px/450。旧实现标题链接有 14px/Ink 与 13px/Graphite 两套。
  await loginPage(page);
  await page.goto("/admin");
  await expect(widget(page, "project_overview")).toBeVisible({ timeout: 20_000 });

  for (const [key, title, link] of [
    ["project_overview", "项目总览", "详情"],
    ["leads_funnel", "线索漏斗", "线索"],
    ["alert_card", "待评估提醒", "去处理"],
    ["todo_board_summary", "项目待办", "看板"],
    ["growth_overview", "获客总览", "获客中心"],
  ] as const) {
    const card = widget(page, key);
    // 卡头走 data-widget-title / data-widget-link 契约（含副标签的标题节点无法用 exact 文本命中）
    const titleEl = card.locator(`[data-widget-title="${title}"]`).first();
    await expect(titleEl).toBeVisible();
    await expect(titleEl).toHaveCSS("font-size", "15px");
    await expect(titleEl).toHaveCSS("font-weight", "500");

    const linkEl = card.locator(`[data-widget-link="${link}"]`).first();
    await expect(linkEl).toBeVisible();
    await expect(linkEl).toHaveCSS("font-size", "13px");
  }
});

test("admin 视角：10 个 widget 且含资金/审计概览", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: "工作台" })).toBeVisible();
  await assertWidgetCount(page, 10); // 验收 A7
  await expect(widget(page, "finance_summary")).toBeVisible({ timeout: 20_000 });
  await expect(widget(page, "audit_summary")).toBeVisible({ timeout: 20_000 });
  // 业务员专属卡不应出现在 admin 视角
  await expect(widget(page, "my_todos")).toHaveCount(0);
});

test("monitor_projects 卡含「添加新项目」入口，且为设计稿 5 列等宽网格", async ({ page }) => {
  // 该入口在 widget 化重构时一度丢失（旧版在 MonitorSection 内联），
  // 此断言防止再次回归；同时锁定设计稿 `.monitor-row.as-grid`（5 列网格，
  // 非旧版 280px 横滚卡流）。
  await loginPage(page);
  await page.goto("/admin");
  const monitor = widget(page, "monitor_projects");
  await expect(monitor).toBeVisible({ timeout: 20_000 });
  await expect(monitor.getByText("添加新项目")).toBeVisible();

  // 网格容器：≥lg 时 5 列；项目卡 + 添加卡同处一个 grid 容器
  const grid = monitor.locator("[data-monitor-grid]");
  await expect(grid).toHaveCSS("display", "grid");
  const columns = await grid.evaluate(
    (el) => getComputedStyle(el).gridTemplateColumns.split(" ").length,
  );
  expect(columns).toBe(5);
});

test("operator 视角：8 个 widget 且无资金/审计（验收 A7/A8）", async ({ page }) => {
  await loginAs(page, OPERATOR_USER, TEMP_PASSWORD);
  await page.goto("/admin");
  await assertWidgetCount(page, 8); // 验收 A7
  await expect(widget(page, "project_overview")).toBeVisible({ timeout: 20_000 });
  await expect(widget(page, "finance_summary")).toHaveCount(0);
  await expect(widget(page, "audit_summary")).toHaveCount(0);
  await expect(widget(page, "my_todos")).toHaveCount(0);
});

test("user 视角：3 个 widget（快捷入口 + 我负责的项目 + 我的待办）", async ({ page }) => {
  await loginAs(page, PLAIN_USER, TEMP_PASSWORD);
  await page.goto("/admin");
  await assertWidgetCount(page, 3); // 验收 A7
  await expect(widget(page, "my_todos")).toBeVisible({ timeout: 20_000 });
  await expect(widget(page, "my_projects")).toBeVisible({ timeout: 20_000 });
  await expect(widget(page, "finance_summary")).toHaveCount(0);
  await expect(widget(page, "project_overview")).toHaveCount(0);

  // 快捷入口不得对业务员变空卡：user 角色无 project:read/lead:write，
  // 若入口清单只按 staff 权限过滤，整卡会渲染成「没有可用入口」。
  // 且每个入口目标必须真实可达（不能被 PermissionGuard 弹回）。
  const quick = widget(page, "quick_entry");
  const links = quick.getByRole("link");
  await expect(links.first()).toBeVisible({ timeout: 15_000 });
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i += 1) {
    const href = await links.nth(i).getAttribute("href");
    // 业务员可访问：线索中心（lead:read）/ 房源管理（property:read）
    expect(["/admin/leads", "/admin/properties"]).toContain(href);
  }
});

test("user 角色无「定制」入口，且写布局被后端 403（D-07）", async ({ page }) => {
  await loginAs(page, PLAIN_USER, TEMP_PASSWORD);
  await page.goto("/admin");
  await expect(page.getByRole("button", { name: "定制" })).toHaveCount(0);

  // ⚠️ 必须带 X-Requested-With：后端对 Cookie 写请求有 CSRF 守卫，
  // 不带会先返回「403 缺少 CSRF 防护头」，让本用例因错误原因通过（假绿）。
  const res = await page.request.put("/api/v1/admin/workbench/config", {
    data: { widgets: [{ key: "finance_summary", order: 10, enabled: true }] },
    headers: { "X-Requested-With": "XMLHttpRequest" },
  });
  expect(res.status()).toBe(403);
  const body = (await res.json()) as { message?: string };
  expect(body.message ?? "").toContain("业务员角色不支持");
});

test("越权 widget 写入被后端过滤：user 手写 finance_summary 不渲染（验收 A8）", async ({
  page,
}) => {
  // 绕过被 403 拦住的接口，直接写 user_preferences 模拟「手工塞入」，
  // 验证后端读取时仍按权限/角色过滤——这才是 A8 的真实语义。
  const writeScript = `
import sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import User, UserPreference
from models.user.preference import NAMESPACE_WORKBENCH_LAYOUT

db = SessionLocal()
try:
    u = db.query(User).filter(User.username == "${PLAIN_USER}").first()
    row = db.query(UserPreference).filter_by(user_id=u.id, namespace=NAMESPACE_WORKBENCH_LAYOUT).first()
    payload = {"version": 1, "widgets": [
        {"key": "finance_summary", "order": 10, "enabled": True},
        {"key": "my_todos", "order": 20, "enabled": True},
    ]}
    if row is None:
        db.add(UserPreference(user_id=u.id, namespace=NAMESPACE_WORKBENCH_LAYOUT, value=payload))
    else:
        row.value = payload
    db.commit()
    print("injected")
finally:
    db.close()
`;
  const out = backendPython(writeScript);
  expect(out).toContain("injected");

  await loginAs(page, PLAIN_USER, TEMP_PASSWORD);
  await page.goto("/admin");
  await expect(widget(page, "my_todos")).toBeVisible({ timeout: 20_000 });
  // 越权卡不渲染
  await expect(widget(page, "finance_summary")).toHaveCount(0);
});

test("定制持久：隐藏 widget → 刷新仍隐藏 → 重置恢复（验收 A9）", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  const customizerBtn = page.getByRole("button", { name: "定制" });
  await expect(customizerBtn).toBeVisible();
  await customizerBtn.click();

  const dialog = page.getByRole("dialog", { name: "定制工作台" });
  await expect(dialog).toBeVisible();

  // 隐藏「线索漏斗」
  const funnelSwitch = dialog.getByRole("switch", { name: "显示 线索漏斗" });
  await expect(funnelSwitch).toHaveAttribute("aria-checked", "true");
  await funnelSwitch.click();
  await dialog.getByRole("button", { name: "保存布局" }).click();

  // 保存触发 router.refresh → 卡片消失
  await expect(widget(page, "leads_funnel")).toHaveCount(0, { timeout: 20_000 });

  // 硬刷新仍隐藏（持久化在 user_preferences）
  await page.reload();
  await expect(widget(page, "leads_funnel")).toHaveCount(0, { timeout: 20_000 });

  // 重置恢复
  await customizerBtn.click();
  await dialog.getByRole("button", { name: "重置" }).click();
  await expect(widget(page, "leads_funnel")).toBeVisible({ timeout: 20_000 });
});

test("无 workbench:manage 访问布局管理页被拦（验收 A8 路由守卫）", async ({ page }) => {
  // 前端守卫：无权限 → 重定向离开该页
  await loginAs(page, OPERATOR_USER, TEMP_PASSWORD);
  await page.goto("/admin/settings/workbench");
  await expect(page).not.toHaveURL(/\/admin\/settings\/workbench$/, { timeout: 15_000 });

  // 后端守卫：直接调 API 也必须 403
  const res = await page.request.get("/api/v1/admin/workbench/role-layouts");
  expect(res.status()).toBe(403);
});
