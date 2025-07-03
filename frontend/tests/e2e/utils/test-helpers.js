import { expect } from '@playwright/test';

/**
 * 测试工具类 - 提供通用的测试辅助方法
 */
export class TestHelpers {
  constructor(page) {
    this.page = page;
  }

  /**
   * 登录测试用户
   */
  async loginTestUser() {
    await this.page.goto('/login');
    await this.page.fill('input[name="username"]', 'testuser');
    await this.page.fill('input[name="password"]', 'testpass123');
    await this.page.click('button[type="submit"]');
    
    // 等待登录成功并跳转到首页
    await this.page.waitForURL('/');
    await expect(this.page.locator('text=数据看板')).toBeVisible();
  }

  /**
   * 登出用户
   */
  async logout() {
    await this.page.click('[data-testid="user-menu-button"]');
    await this.page.click('text=退出登录');
    await this.page.waitForURL('/login');
  }

  /**
   * 等待页面加载完成
   */
  async waitForPageLoad() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 等待API请求完成
   */
  async waitForApiResponse(urlPattern) {
    return await this.page.waitForResponse(response => 
      response.url().includes(urlPattern) && response.status() === 200
    );
  }

  /**
   * 检查页面标题
   */
  async checkPageTitle(expectedTitle) {
    await expect(this.page.locator('h1')).toContainText(expectedTitle);
  }

  /**
   * 检查加载状态
   */
  async checkLoadingState() {
    // 检查是否有加载指示器
    const loadingIndicator = this.page.locator('.animate-spin, text=加载中');
    if (await loadingIndicator.isVisible()) {
      await loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 });
    }
  }

  /**
   * 检查错误消息
   */
  async checkErrorMessage(expectedMessage) {
    const errorElement = this.page.locator('.text-red-600, .bg-red-50, [role="alert"]');
    await expect(errorElement).toContainText(expectedMessage);
  }

  /**
   * 检查成功消息
   */
  async checkSuccessMessage(expectedMessage) {
    const successElement = this.page.locator('.text-green-600, .bg-green-50');
    await expect(successElement).toContainText(expectedMessage);
  }

  /**
   * 填写表单字段
   */
  async fillForm(formData) {
    for (const [field, value] of Object.entries(formData)) {
      if (value !== null && value !== undefined) {
        const input = this.page.locator(`[name="${field}"], #${field}`);
        await input.fill(String(value));
      }
    }
  }

  /**
   * 选择下拉选项
   */
  async selectOption(selector, value) {
    await this.page.selectOption(selector, value);
  }

  /**
   * 上传文件
   */
  async uploadFile(inputSelector, filePath) {
    await this.page.setInputFiles(inputSelector, filePath);
  }

  /**
   * 检查表格数据
   */
  async checkTableData(expectedData) {
    const rows = this.page.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    if (expectedData && expectedData.length > 0) {
      for (let i = 0; i < Math.min(expectedData.length, rowCount); i++) {
        const row = rows.nth(i);
        for (const [key, value] of Object.entries(expectedData[i])) {
          await expect(row).toContainText(String(value));
        }
      }
    }
  }

  /**
   * 检查卡片数据
   */
  async checkCardData(cardSelector, expectedData) {
    const card = this.page.locator(cardSelector);
    await expect(card).toBeVisible();
    
    for (const [key, value] of Object.entries(expectedData)) {
      await expect(card).toContainText(String(value));
    }
  }

  /**
   * 检查图表是否存在
   */
  async checkChartExists(chartSelector = 'canvas') {
    const chart = this.page.locator(chartSelector);
    await expect(chart).toBeVisible();
  }

  /**
   * 检查分页功能
   */
  async checkPagination() {
    const pagination = this.page.locator('[data-testid="pagination"], .pagination');
    if (await pagination.isVisible()) {
      // 检查分页按钮
      const nextButton = this.page.locator('text=下一页, button:has-text("下一页")');
      const prevButton = this.page.locator('text=上一页, button:has-text("上一页")');
      
      await expect(nextButton.or(prevButton)).toBeVisible();
    }
  }

  /**
   * 检查搜索功能
   */
  async testSearch(searchTerm, expectedResults) {
    const searchInput = this.page.locator('input[placeholder*="搜索"], input[type="search"]');
    await searchInput.fill(searchTerm);
    await this.page.keyboard.press('Enter');
    
    await this.waitForPageLoad();
    
    if (expectedResults > 0) {
      const results = this.page.locator('tbody tr, .card');
      await expect(results).toHaveCountGreaterThan(0);
    }
  }

  /**
   * 检查筛选功能
   */
  async testFilter(filterSelector, filterValue) {
    await this.page.selectOption(filterSelector, filterValue);
    await this.waitForPageLoad();
  }

  /**
   * 检查响应式设计
   */
  async checkResponsiveDesign() {
    // 测试移动端视图
    await this.page.setViewportSize({ width: 375, height: 667 });
    await this.waitForPageLoad();
    
    // 检查移动端导航
    const mobileMenu = this.page.locator('[data-testid="mobile-menu"], .lg\\:hidden button');
    if (await mobileMenu.isVisible()) {
      await mobileMenu.click();
      await expect(this.page.locator('nav')).toBeVisible();
    }
    
    // 恢复桌面端视图
    await this.page.setViewportSize({ width: 1280, height: 720 });
    await this.waitForPageLoad();
  }

  /**
   * 截图用于调试
   */
  async takeScreenshot(name) {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}-${Date.now()}.png`,
      fullPage: true 
    });
  }

  /**
   * 等待元素可见
   */
  async waitForElement(selector, timeout = 10000) {
    await this.page.locator(selector).waitFor({ state: 'visible', timeout });
  }

  /**
   * 检查URL
   */
  async checkURL(expectedPath) {
    await expect(this.page).toHaveURL(new RegExp(expectedPath));
  }

  /**
   * 模拟API错误
   */
  async mockApiError(urlPattern, statusCode = 500) {
    await this.page.route(`**/${urlPattern}`, route => {
      route.fulfill({
        status: statusCode,
        contentType: 'application/json',
        body: JSON.stringify({ detail: 'Test error' })
      });
    });
  }

  /**
   * 清除所有路由模拟
   */
  async clearMocks() {
    await this.page.unrouteAll();
  }
}
