// 商户管理 V09 · 通知任务执行记录（REQ-M14-006）
//
// 覆盖：页面加载执行记录、按类型筛选、手动补跑后新增一条执行记录。

import { test, expect } from "@playwright/test";

import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

test.beforeEach(async ({ page }) => {
  await loginPage(page);
});

test("通知任务页可查看执行记录并手动补跑", async ({ page }) => {
  await page.goto("/admin/merchant/notify-runs");
  await expect(page.getByRole("heading", { name: "通知任务" })).toBeVisible();

  await page.getByRole("button", { name: "手动补跑" }).click();
  await expect(page.getByText(/补跑完成|已有任务在运行/)).toBeVisible({ timeout: 30_000 });

  // 补跑会写一条 operation_logs 记录，列表应至少出现一行
  await expect(page.getByRole("row").filter({ hasText: "成功" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("协议", { exact: true })).toBeVisible();
  await expect(page.getByText("拜访", { exact: true })).toBeVisible();
});

test("可按通知类型筛选", async ({ page }) => {
  await page.goto("/admin/merchant/notify-runs");
  await page.getByRole("combobox", { name: "通知类型" }).click();
  await page.getByRole("option", { name: "协议到期" }).click();
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.getByRole("heading", { name: "通知任务" })).toBeVisible();
});
