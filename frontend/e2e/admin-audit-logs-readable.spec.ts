// 审计日志可读性 E2E：操作人/对象显示人类可读名称，筛选支持下拉选人。
// 前置：后端 :8000 + 前端 :3000 运行；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 由环境变量提供。
// 运行（凭据从 .env 读 TEST_USERNAME/TEST_PASSWORD，严禁硬编码）：
//   set -a; source ../.env; set +a
//   export E2E_ADMIN_USER=$TEST_USERNAME E2E_ADMIN_PASSWORD=$TEST_PASSWORD
//   npx playwright test e2e/admin-audit-logs-readable.spec.ts --reporter=line

import { test, expect } from "@playwright/test";
import { createApiContext, loginPage, FRONTEND_BASE } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

test("API 契约：user_id 非空的行 operator_name 可读，resource_name 非 UUID", async () => {
  const { ctx, dispose } = await createApiContext();
  const res = await ctx.get("/api/v1/operation-logs?page=1&page_size=20");
  expect(res.ok()).toBeTruthy();
  const body = await res.json();
  await dispose();

  expect(body.items.length).toBeGreaterThan(0);
  for (const item of body.items) {
    // 操作人：已存在用户必须解析出名称；名称一旦存在则不能是 UUID 形态
    if (item.user_id) {
      expect(
        item.operator_name === null ||
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.operator_name),
        `user_id=${item.user_id} 的 operator_name 应为可读名称或 null，实际: ${item.operator_name}`,
      ).toBeTruthy();
    }
    // 对象：注册类型（如 project/role）应解析出名称；任何 resource_name 都不能是 UUID
    expect(
      item.resource_name === null ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.resource_name),
      `resource_id=${item.resource_id} 的 resource_name 不应为 UUID，实际: ${item.resource_name}`,
    ).toBeTruthy();
  }
});

test("UI：表头新文案 + 首行操作人显示名称 + 操作人下拉可选人", async ({ page }) => {
  await loginPage(page);

  const { ctx, dispose } = await createApiContext();
  const res = await ctx.get("/api/v1/operation-logs?page=1&page_size=20");
  const body = await res.json();
  await dispose();

  await page.goto(`${FRONTEND_BASE}/admin/audit-logs`);
  await expect(page.getByRole("columnheader", { name: "操作人" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "动作" })).toBeVisible();
  await expect(page.getByRole("columnheader", { name: "对象" })).toBeVisible();
  // 旧文案不得残留
  await expect(page.getByRole("columnheader", { name: "资源ID" })).toHaveCount(0);

  // 首行操作人与 API 一致（有可读名称时）
  const firstOperator = body.items.find((i: { user_id: string | null }) => i.user_id)?.operator_name;
  if (firstOperator) {
    await expect(
      page.locator("tbody tr").filter({ has: page.getByText(firstOperator, { exact: true }) }).first(),
    ).toBeVisible();
  }

  // 操作人筛选是下拉而非 ID 输入框：点开后能看到人员昵称选项
  const operatorTrigger = page.locator("form").getByRole("combobox").first();
  await operatorTrigger.click();
  const anyOperator = body.items.map((i: { operator_name: string | null }) => i.operator_name).find(Boolean);
  if (anyOperator) {
    await expect(page.getByRole("option").filter({ hasText: anyOperator }).first()).toBeVisible();
  }
});

test("UI：空状态引导文案", async ({ page }) => {
  await loginPage(page);
  await page.goto(`${FRONTEND_BASE}/admin/audit-logs?user_id=00000000-0000-0000-0000-000000000000`);
  await expect(page.getByText("没有找到相关记录，试试调整筛选条件或时间范围")).toBeVisible();
});
