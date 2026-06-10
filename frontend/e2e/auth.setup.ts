import { test as setup, expect } from "@playwright/test";

const authFile = "e2e/.auth/user.json";

setup("authenticate", async ({ page }) => {
  await page.goto("/login");

  await page.locator('input[name="username"]').fill("admin");
  await page.locator('input[name="password"]').fill("Fdd123..");

  await page.locator('button[type="submit"]').click();

  // 登录成功后应跳转到首页（工作台）
  await page.waitForURL("/", { timeout: 15000 });

  // 确认已进入主界面（侧边栏存在）
  await expect(page.locator("nav")).toBeVisible({ timeout: 10000 });

  // 保存认证状态
  await page.context().storageState({ path: authFile });
});
