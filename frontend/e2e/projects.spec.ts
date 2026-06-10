import { test, expect } from "@playwright/test";

// 认证状态复用：先登录再测试
test.use({ storageState: "e2e/.auth/user.json" });

test.describe("项目管理", () => {
  test("项目列表页加载", async ({ page }) => {
    await page.goto("/projects");

    // 验证页面标题
    await expect(page.locator("text=项目管理")).toBeVisible({ timeout: 15000 });

    // 验证统计卡片区域存在
    await expect(page.locator("text=签约")).toBeVisible();
    await expect(page.locator("text=装修")).toBeVisible();
    await expect(page.locator("text=在售")).toBeVisible();
    await expect(page.locator("text=已售")).toBeVisible();

    // 验证筛选标签存在
    await expect(page.locator('[data-state="active"]', { hasText: "全部" })).toBeVisible();
  });

  test("新建项目弹窗", async ({ page }) => {
    await page.goto("/projects");

    // 等待页面加载完成
    await expect(page.locator("text=项目管理")).toBeVisible({ timeout: 15000 });

    // 点击新建项目按钮
    await page.locator("button", { hasText: "新建项目" }).click();

    // 验证弹窗出现
    await expect(page.locator('[role="dialog"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator("text=新建项目")).toBeVisible();
    await expect(page.locator("text=录入新项目信息")).toBeVisible();
  });
});
