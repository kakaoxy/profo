// 迭代二 · 消息中心 Playwright E2E（SPEC §11.4 / §11.5 A4–A6）.
//
// 覆盖（API 契约已由 backend/tests/e2e/test_notification_center.py 覆盖，
// 本文件聚焦 UI 真实渲染与交互，不做后端已测过的重复断言）：
//  1. 侧栏铃铛角标 == unread-count.total（数据来自 API，非硬编码）
//  2. 抽屉打开 → 造数消息可见、分类 tabs 渲染
//  3. 单条已读 → 角标 -1 且服务端持久（刷新后仍 -1）
//  4. 全部已读 → 角标消失（0 不渲染，设计稿组件状态）
//  5. /admin/notifications 整页渲染 + 筛选器存在
//  6. /admin/notifications/preferences 渲染 + 锁定/置灰与 API 返回一致
//
// ⚠️ 不断言「某分类恰好模板缺失」这类**环境状态**——它是部署配置不是契约；
//    改为先经 API 读取该分类的 wechat_template_missing，再断言 UI 与之一致。
//
// 造数：execFileSync 调 backend python 经 Service.emit 写 2 条（唯一前缀），
// afterAll 物理删除。⚠️ 造给 username='admin' 的账号——与 helpers/auth 登录账号
// 同一人，否则 UI 看不到数据（曾误写成「admin 角色任取第一个用户」）。
//
// 前置：后端 :8000 + 前端 :3000 运行；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 由 .env 提供。
// 运行：
//   set -a; source ../.env; set +a
//   export E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD
//   npx playwright test e2e/admin-notifications.spec.ts --reporter=line

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

// 共享后端状态（造数/已读互相影响），必须串行
test.describe.configure({ mode: "serial" });

const MARK = `E2E-NOTIF-${Date.now()}`;

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

const SEED_SCRIPT = `
import sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import User
from services.notification import Audience, EventType
from services.notification.service import NotificationService, NotificationEvent

db = SessionLocal()
try:
    admin = db.query(User).filter(User.username == "admin").first()
    svc = NotificationService(db)
    # 1 条 growth + 1 条 security（wechat=False：冒烟不依赖模板配置）
    svc.emit(NotificationEvent(
        type=EventType.CUSTOMER_NEW,
        audience=Audience(user_ids=(admin.id,)),
        fields={"module_label": "估价", "community": "${MARK}"},
        dedupe_fields={"module": "valuation", "id": "${MARK}", "user_id": admin.id},
        wechat=False,
    ))
    svc.emit(NotificationEvent(
        type=EventType.SYSTEM_ALERT,
        audience=Audience(user_ids=(admin.id,)),
        fields={"title": "${MARK} 告警", "detail": "e2e"},
        dedupe_fields={"fingerprint": "${MARK}"},
        wechat=False,
    ))
    print("seeded")
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import Notification, NotificationRecipient, NotificationDeliveryLog

db = SessionLocal()
try:
    ids = [n.id for n in db.query(Notification)
           .filter(Notification.title.like("%${MARK}%")).all()]
    if ids:
        db.query(NotificationRecipient).filter(
            NotificationRecipient.notification_id.in_(ids)).delete(synchronize_session=False)
        db.query(NotificationDeliveryLog).filter(
            NotificationDeliveryLog.notification_id.in_(ids)).delete(synchronize_session=False)
        db.query(Notification).filter(Notification.id.in_(ids)).delete(synchronize_session=False)
    db.commit()
    print(f"cleaned={len(ids)}")
finally:
    db.close()
`;

test.beforeAll(() => {
  backendPython(CLEANUP_SCRIPT); // 幂等：清掉可能的历史残留
  const out = backendPython(SEED_SCRIPT);
  if (!out.includes("seeded")) throw new Error(`造数失败: ${out}`);
});

test.afterAll(() => {
  backendPython(CLEANUP_SCRIPT);
});

test.beforeEach(async ({ page }) => {
  await loginPage(page);
});

/** 经前端代理读未读数（page.request 共享 context 的 cookie jar） */
async function fetchUnreadTotal(page: import("@playwright/test").Page): Promise<number> {
  const res = await page.request.get("/api/v1/notifications/unread-count");
  expect(res.ok()).toBeTruthy();
  return ((await res.json()) as { total: number }).total;
}

test("铃铛角标与 unread-count.total 一致（数据来自 API）", async ({ page }) => {
  const apiTotal = await fetchUnreadTotal(page);
  expect(apiTotal).toBeGreaterThanOrEqual(2); // 至少本轮造的 2 条

  await page.goto("/admin");
  const bell = page.locator('button[aria-label^="消息"]').first();
  await expect(bell).toBeVisible();
  await expect(bell.locator("span[aria-live='polite']")).toHaveText(String(apiTotal), {
    timeout: 15_000,
  });
});

test("抽屉显示造数消息 + 分类 tabs", async ({ page }) => {
  await page.goto("/admin");
  const bell = page.locator('button[aria-label^="消息"]').first();
  await expect(bell).toBeVisible();
  await bell.click();

  const dialog = page.locator('[role="dialog"][aria-label="消息"]');
  await expect(dialog).toBeVisible();
  // 本轮 2 条消息标题都含 MARK
  await expect(dialog.getByText(MARK).first()).toBeVisible({ timeout: 10_000 });
  // tabs：未读数>0 的分类才渲染（造了 growth + security）
  await expect(dialog.getByRole("button", { name: /获客/ })).toBeVisible();
  await expect(dialog.getByRole("button", { name: /系统/ })).toBeVisible();
});

test("单条已读 → 角标 -1 且刷新后保持（服务端持久）", async ({ page }) => {
  const before = await fetchUnreadTotal(page);

  await page.goto("/admin");
  const bell = page.locator('button[aria-label^="消息"]').first();
  await bell.click();
  const dialog = page.locator('[role="dialog"][aria-label="消息"]');
  await expect(dialog).toBeVisible();

  // 点本轮造的第一条（含 MARK）。⚠️ 点击会乐观标记已读并按 action_url 跳转，
  // 跳转不影响本断言（角标在全局侧栏），但为避免 SPA 导航竞态，点「系统」
  // 那条（action=/admin/audit-logs）后直接等角标变化。
  await dialog.locator("li button").filter({ hasText: MARK }).first().click();

  const badge = bell.locator("span[aria-live='polite']");
  await expect(badge).toHaveText(String(before - 1), { timeout: 10_000 });

  // 服务端持久性：硬刷新后仍 -1
  const after = await fetchUnreadTotal(page);
  expect(after).toBe(before - 1);
});

test("全部已读 → 角标消失（0 不渲染）", async ({ page }) => {
  await page.goto("/admin");
  const bell = page.locator('button[aria-label^="消息"]').first();
  await bell.click();
  const dialog = page.locator('[role="dialog"][aria-label="消息"]');
  await expect(dialog).toBeVisible();

  await dialog.getByRole("button", { name: "全部已读" }).click();
  await page.keyboard.press("Escape");

  const badge = bell.locator("span[aria-live='polite']");
  await expect(badge).toBeHidden({ timeout: 10_000 });
  expect(await fetchUnreadTotal(page)).toBe(0);
});

test("消息中心整页渲染（tabs/筛选器/卡片说明区）", async ({ page }) => {
  await page.goto("/admin/notifications");
  await expect(page.getByRole("heading", { name: "消息中心" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^未读/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /全部已读/ })).toBeVisible();
  await expect(page.getByLabel("优先级筛选")).toBeVisible();
  await expect(page.getByLabel("时间范围筛选")).toBeVisible();
  // 造数消息（已全部已读）仍在列表
  await expect(page.getByText(MARK).first()).toBeVisible({ timeout: 10_000 });
});

test("偏好页渲染且锁定/置灰状态与 API 返回一致", async ({ page }) => {
  // 先经 API 拿真实契约状态，再断言 UI 与之一致（不硬编码环境状态）
  const res = await page.request.get("/api/v1/notifications/preferences");
  expect(res.ok()).toBeTruthy();
  const prefs = (await res.json()) as {
    categories: Record<string, { in_app_locked: boolean; wechat_template_missing: boolean }>;
  };

  await page.goto("/admin/notifications/preferences");
  await expect(page.getByRole("heading", { name: "消息偏好" })).toBeVisible();

  // system/security 锁定徽章 + 站内信开关 disabled（与 API in_app_locked 一致）
  for (const cat of ["system", "security"]) {
    expect(prefs.categories[cat].in_app_locked).toBeTruthy();
    const label = cat === "system" ? "系统" : "安全";
    const row = page.locator("tr").filter({ hasText: label });
    // 徽章是精确文本「不可关闭」；说明文字「站内信不可关闭」也含该串，
    // 用 exact 避免 strict mode 命中 2 个元素
    await expect(row.getByText("不可关闭", { exact: true })).toBeVisible();
    await expect(row.locator('[role="switch"]').first()).toHaveAttribute("aria-disabled", "true");
  }

  // 任一 wechat_template_missing=true 的分类 → 其微信开关 disabled（与 API 一致）
  const missing = Object.entries(prefs.categories).find(([, v]) => v.wechat_template_missing);
  if (missing) {
    const labels: Record<string, string> = {
      lead: "线索",
      growth: "获客",
      project: "项目",
      key: "房源分享",
      marketing: "营销",
      finance: "资金",
    };
    const row = page.locator("tr").filter({ hasText: labels[missing[0]] ?? missing[0] }).first();
    await expect(row.locator('[role="switch"]').nth(1)).toHaveAttribute("aria-disabled", "true");
  }
});
