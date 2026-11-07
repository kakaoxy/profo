import { expect, test } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 评估弹窗「评估不符 · 放弃」可点击回归。
 *
 * 背景：评估弹窗通过 createPortal 挂到 body，但 Radix Sheet 打开时会给 body
 * 设置 pointer-events: none，弹窗根节点未恢复 pointer-events: auto，导致 Playwright
 * 点击被 sheet-overlay 拦截，用户侧表现为按钮无法点击。
 *
 * 本用例用独立创建的线索执行 reject，验证：点击可命中、弹窗关闭、后端状态变为 REJECTED。
 */
test.describe.configure({ mode: "serial" });

let api: Awaited<ReturnType<typeof createApiContext>>;
let leadId = "";
let community = "";

test.beforeAll(async () => {
  api = await createApiContext();
  community = `E2E评估放弃-${Date.now()}`;
  const res = await api.ctx.post("/api/v1/leads", {
    data: {
      community_name: community,
      floor_info: "8/18层",
      layout: "2室1厅",
      area: 76.5,
      total_price: 428,
    },
  });
  expect(res.ok(), `造评估线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
  leadId = ((await res.json()) as { id: string }).id;
});

test.afterAll(async () => {
  if (leadId) await api.ctx.delete(`/api/v1/leads/${leadId}`);
  await api.dispose();
});

test("评估不符 · 放弃 按钮可点击并流转为已放弃", async ({ page }) => {
  await loginPage(page);
  await page.goto(`/admin/leads?search=${encodeURIComponent(community)}`, {
    waitUntil: "domcontentloaded",
  });

  const row = page.locator('[data-testid="lead-row"]').filter({ hasText: community }).first();
  await expect(row).toBeVisible({ timeout: 15000 });
  await row.click();

  await page.getByRole("button", { name: "给出收房评估" }).first().click();
  const dialog = page.getByRole("dialog").filter({ hasText: "评估录入" });
  await expect(dialog).toBeVisible();

  const reject = dialog.getByRole("button", { name: "评估不符 · 放弃" });
  await expect(reject).toBeVisible();
  await expect(reject).toBeEnabled();
  await reject.click({ timeout: 5000 });

  await expect(dialog).toBeHidden({ timeout: 10000 });

  await expect
    .poll(
      async () => {
        const res = await api.ctx.get(`/api/v1/leads/${leadId}`);
        if (!res.ok()) return `HTTP ${res.status()}`;
        return ((await res.json()) as { status: string }).status;
      },
      { timeout: 10000, message: "线索状态未流转为 REJECTED" },
    )
    .toBe("rejected");
});
