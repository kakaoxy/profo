// 商户管理 V05 · 协议审核入口按角色收敛（BR-M04-031）
//
// 前端 `/admin/merchant/agreements` 只在 admin/operator 角色下渲染「通过/驳回」；
// 后端负例见 backend/tests/test_merchant_admin.py::test_merge_and_agreement_review_require_internal_role。
// 本用例用拦截 /auth/me 的方式覆盖「user 角色持 merchant:agreement 也不应看到审核按钮」分支。

import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test("非 admin/operator 角色不展示协议审核按钮", async ({ page }) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "u1",
        username: "e2e-user",
        role_id: "r1",
        role: { id: "r1", code: "user", name: "员工" },
        status: "active",
        leads_count: 0,
        created_at: "2026-01-01T00:00:00+08:00",
        permissions: ["merchant:read", "merchant:agreement"],
      }),
    }),
  );
  await loginPage(page);
  await page.goto("/admin/merchant/agreements");
  await expect(page.getByRole("button", { name: "作废" }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: "通过" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "驳回" })).toHaveCount(0);
});
