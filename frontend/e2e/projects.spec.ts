import { test, expect } from "@playwright/test";

// 认证状态复用：先登录再测试
test.use({ storageState: "e2e/.auth/user.json" });

test.describe("项目管理", () => {
  test("项目列表页加载", async ({ page }) => {
    await page.goto("/projects");

    // 验证页面标题（使用 heading role，避免匹配侧边栏菜单文字）
    await expect(page.getByRole('heading', { name: '项目管理' }).first()).toBeVisible({ timeout: 15000 });

    // 验证统计卡片区域存在（使用 role=tab 避免匹配统计数字/描述文字）
    await expect(page.getByRole('tab', { name: '签约' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '装修' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '在售' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '已售' })).toBeVisible();

    // 验证筛选标签存在
    await expect(page.locator('[data-state="active"]', { hasText: "全部" })).toBeVisible();
  });

  test("新建项目弹窗", async ({ page }) => {
    await page.goto("/projects");

    // 等待页面加载完成（页面标题可见）
    await expect(page.getByRole('heading', { name: '项目管理' }).first()).toBeVisible({ timeout: 15000 });

    // 点击新建项目按钮
    await page.locator("button", { hasText: "新建项目" }).click();

    // 验证弹窗出现（使用 heading role 匹配弹窗标题，避免匹配按钮文字）
    await expect(page.getByRole('dialog').getByText('新建项目')).toBeVisible({ timeout: 5000 });
    await expect(page.getByRole('dialog').getByText('录入新项目信息')).toBeVisible();
  });
});
