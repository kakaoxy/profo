import { test, expect, Page } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://127.0.0.1:3000";
const API_URL = process.env.API_URL || "http://127.0.0.1:8000";

// 测试账号
const TEST_CREDENTIALS = {
  username: "admin",
  password: "Fdd123..",
};

/**
 * 登录辅助函数
 */
async function login(page: Page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[placeholder="admin"]', TEST_CREDENTIALS.username);
  await page.fill('input[type="password"]', TEST_CREDENTIALS.password);
  await page.click('button:has-text("立即登录")');
  await page.waitForURL(`${BASE_URL}/`, { timeout: 10000 });
}

/**
 * 获取线索列表的第一个线索ID
 */
async function getFirstLeadId(page: Page): Promise<string | null> {
  await page.goto(`${BASE_URL}/leads`);
  await page.waitForSelector("table tbody tr", { timeout: 10000 });

  // 获取第一行的线索ID
  const firstRow = await page.locator("table tbody tr").first();
  const rowText = await firstRow.textContent();
  const match = rowText?.match(/ID:\s*([a-f0-9-]+)/);
  return match ? match[1] : null;
}

test.describe("线索详情页 - 区域供需全景功能", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("正常加载线索详情页", async ({ page }) => {
    // 导航到线索列表页
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // 验证页面标题
    await expect(page.locator("h1")).toContainText("线索管理");

    // 验证表格加载
    const rows = await page.locator("table tbody tr").count();
    expect(rows).toBeGreaterThan(0);

    // 点击第一行打开详情页
    await page.click("table tbody tr:first-child");

    // 验证详情抽屉打开
    await expect(page.locator('[role="dialog"]')).toBeVisible();
  });

  test("点击查看区域供需全景按钮的交互流程", async ({ page }) => {
    // 导航到线索列表页
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // 点击第一行打开详情页
    await page.click("table tbody tr:first-child");

    // 等待详情抽屉加载
    await page.waitForSelector("text=实时市场动态", { timeout: 5000 });

    // 查找并点击"查看区域供需全景"按钮
    const viewMonitorButton = page.locator('button:has-text("查看区域供需全景")');
    await expect(viewMonitorButton).toBeVisible();

    // 点击按钮
    await viewMonitorButton.click();

    // 验证监控看板打开
    await expect(page.locator("text=监控看板").first()).toBeVisible({ timeout: 10000 });

    // 验证返回按钮存在
    await expect(page.locator('button:has([d="M5 12h14"])')).toBeVisible();
  });

  test("cookies处理逻辑验证 - 无相关错误", async ({ page }) => {
    // 收集控制台错误
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    // 收集页面错误
    const pageErrors: Error[] = [];
    page.on("pageerror", (error) => {
      pageErrors.push(error);
    });

    // 导航到线索列表页并打开监控
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.click("table tbody tr:first-child");
    await page.waitForSelector("text=实时市场动态", { timeout: 5000 });

    // 点击"查看区域供需全景"按钮
    const viewMonitorButton = page.locator('button:has-text("查看区域供需全景")');
    await viewMonitorButton.click();

    // 等待监控页面加载
    await page.waitForSelector("text=监控看板", { timeout: 10000 });
    await page.waitForTimeout(3000); // 等待组件完全加载

    // 验证没有 cookies 相关错误
    const cookieErrors = consoleErrors.filter(
      (e) => e.toLowerCase().includes("cookie") || e.toLowerCase().includes("csrf")
    );
    expect(cookieErrors).toHaveLength(0);

    // 验证没有页面错误
    expect(pageErrors).toHaveLength(0);
  });

  test("小区id关联机制验证 - 直接使用communityId", async ({ page }) => {
    // 监听 API 请求
    const apiRequests: string[] = [];
    page.on("request", (request) => {
      const url = request.url();
      if (url.includes("/api/v1/")) {
        apiRequests.push(url);
      }
    });

    // 导航到线索列表页
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // 获取线索数据
    const response = await page.waitForResponse(
      (resp) => resp.url().includes("/api/v1/leads/") && resp.status() === 200
    );
    const leadsData = await response.json();

    // 验证线索数据中包含 community_id 字段
    if (leadsData.items && leadsData.items.length > 0) {
      const firstLead = leadsData.items[0];
      // community_id 可能为 null，但字段应该存在
      expect(firstLead).toHaveProperty("community_id");
    }
  });

  test("监控页面正确加载与数据展示", async ({ page }) => {
    // 导航到线索列表页
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // 点击第一行打开详情页
    await page.click("table tbody tr:first-child");
    await page.waitForSelector("text=实时市场动态", { timeout: 5000 });

    // 点击"查看区域供需全景"按钮
    const viewMonitorButton = page.locator('button:has-text("查看区域供需全景")');
    await viewMonitorButton.click();

    // 验证监控看板标题
    await expect(page.locator("text=监控看板").first()).toBeVisible({ timeout: 10000 });

    // 验证 HeroSection 加载（市场行情）
    await expect(page.locator("text=市场行情").first()).toBeVisible({ timeout: 15000 });

    // 如果有小区ID关联，验证监控组件加载
    try {
      // 等待市场情绪组件加载
      await page.waitForSelector("text=市场情绪", { timeout: 10000 });

      // 验证市场情绪组件中的数据展示
      const sentimentSection = page.locator("text=市场情绪").first();
      await expect(sentimentSection).toBeVisible();
    } catch {
      // 如果没有关联小区，验证空状态显示
      await expect(page.locator("text=未找到小区数据")).toBeVisible({ timeout: 5000 });
    }
  });

  test("监控页面返回功能正常", async ({ page }) => {
    // 导航到线索列表页
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // 打开监控页面
    await page.click("table tbody tr:first-child");
    await page.waitForSelector("text=实时市场动态", { timeout: 5000 });
    await page.click('button:has-text("查看区域供需全景")');
    await page.waitForSelector("text=监控看板", { timeout: 10000 });

    // 点击返回按钮
    await page.click('button:has([d="M5 12h14"])');

    // 验证返回线索列表页
    await expect(page).toHaveURL(`${BASE_URL}/leads`);
  });
});

test.describe("项目管理-监控模块对比验证", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("线索模块与项目模块监控打开方式一致性验证", async ({ page }) => {
    // 收集 URL 变化
    const urlChanges: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) {
        urlChanges.push(frame.url());
      }
    });

    // 测试线索模块 - 使用状态控制
    await page.goto(`${BASE_URL}/leads`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });
    await page.click("table tbody tr:first-child");
    await page.waitForSelector("text=实时市场动态", { timeout: 5000 });
    await page.click('button:has-text("查看区域供需全景")');
    await page.waitForSelector("text=监控看板", { timeout: 10000 });

    // 验证 URL 没有变化（使用状态控制）
    expect(page.url()).toBe(`${BASE_URL}/leads`);

    // 关闭监控看板
    await page.click('button:has([d="M5 12h14"])');

    // 测试项目模块 - 使用 URL 参数
    await page.goto(`${BASE_URL}/projects`);
    await page.waitForSelector("table tbody tr", { timeout: 10000 });

    // 获取第一行项目ID并点击监控按钮
    const firstRow = await page.locator("table tbody tr").first();
    const monitorButton = firstRow.locator('button[title="打开监控面板"]');

    if (await monitorButton.isVisible().catch(() => false)) {
      await monitorButton.click();

      // 验证 URL 包含 monitor_id 参数
      await page.waitForFunction(
        () => window.location.search.includes("monitor_id"),
        { timeout: 10000 }
      );
    }
  });
});
