import { test, expect } from "@playwright/test";

test.describe("认证流程", () => {
  test("管理员登录成功", async ({ page }) => {
    await page.goto("/login");

    // 确认登录页面加载
    await expect(page.locator("text=系统登录")).toBeVisible();

    // 填写用户名和密码
    await page.locator('input[name="username"]').fill("admin");
    await page.locator('input[name="password"]').fill("Fdd123..");

    // 提交登录
    await page.locator('button[type="submit"]').click();

    // 验证跳转到首页（工作台）
    await page.waitForURL("/", { timeout: 15000 });

    // 确认侧边栏可见，说明已进入主界面
    await expect(page.locator("nav")).toBeVisible({ timeout: 10000 });
  });

  test("错误密码登录失败", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[name="username"]').fill("admin");
    await page.locator('input[name="password"]').fill("wrongpassword");

    await page.locator('button[type="submit"]').click();

    // 验证错误提示出现
    await expect(page.locator(".text-error")).toBeVisible({ timeout: 10000 });

    // 验证仍在登录页面
    await expect(page).toHaveURL(/\/login/);
  });

  test("退出登录", async ({ page }) => {
    // 先登录
    await page.goto("/login");
    await page.locator('input[name="username"]').fill("admin");
    await page.locator('input[name="password"]').fill("Fdd123..");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("/", { timeout: 15000 });

    // 点击用户头像打开下拉菜单
    await page.locator('[data-slot="dropdown-menu-trigger"]').first().click();

    // 点击退出登录
    await page.locator("text=退出登录").click();

    // 验证跳转到登录页
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test("未认证访问重定向到登录页", async ({ page }) => {
    // 清除所有 cookie，确保未认证状态
    await page.context().clearCookies();

    // 尝试访问需要认证的页面
    await page.goto("/projects");

    // 应被重定向到登录页
    await page.waitForURL(/\/login/, { timeout: 10000 });
    await expect(page.locator("text=系统登录")).toBeVisible();
  });
});
