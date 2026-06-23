import { test, expect } from "@playwright/test";

// 认证状态复用：先登录再测试
test.use({ storageState: "e2e/.auth/user.json" });

test.describe("线索中心", () => {
  test("线索列表页加载", async ({ page }) => {
    await page.goto("/leads");

    // 验证筛选标签存在（使用 role=tab 避免匹配 badge/表格文字）
    await expect(page.getByRole('tab', { name: '全部' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: '待评估' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '待看房' })).toBeVisible();

    // 验证新增线索按钮存在
    await expect(page.locator("button", { hasText: "新增线索" })).toBeVisible();
  });

  test("新增线索弹窗", async ({ page }) => {
    await page.goto("/leads");

    // 等待页面加载完成
    await expect(page.locator("button", { hasText: "新增线索" })).toBeVisible({ timeout: 15000 });

    // 点击新增线索按钮
    await page.locator("button", { hasText: "新增线索" }).click();

    // 验证弹窗出现（使用 heading 匹配弹窗标题，不使用 role=dialog）
    await expect(page.getByRole('heading', { name: '录入新线索' })).toBeVisible({ timeout: 5000 });

    // 验证表单关键字段存在（使用 data-testid 匹配）
    await expect(page.getByTestId('field-community-name')).toBeVisible();
    await expect(page.getByTestId('field-area')).toBeVisible();
  });
});
