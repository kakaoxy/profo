import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers.js';
import path from 'path';

test.describe('数据导入模块', () => {
  let helpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.loginTestUser();
  });

  test.describe('页面基本元素 (FR-2.1, FR-2.2, FR-2.3)', () => {
    test('应该正确显示数据导入页面', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      await helpers.checkPageTitle('数据导入');
      await expect(page.locator('p:has-text("支持多种数据源的导入")')).toBeVisible();
    });

    test('应该显示所有导入方式', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 检查CSV文件导入区域
      await expect(page.locator('h3:has-text("CSV文件导入")')).toBeVisible();
      
      // 检查API同步区域
      await expect(page.locator('h3:has-text("API数据同步")')).toBeVisible();
      
      // 检查手动录入区域
      await expect(page.locator('h3:has-text("手动录入")')).toBeVisible();
    });
  });

  test.describe('CSV文件导入功能 (FR-2.1)', () => {
    test('应该显示CSV导入说明', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 检查导入说明
      await expect(page.locator('text=请先下载CSV模板')).toBeVisible();
      await expect(page.locator('text=必填字段：小区ID、房源状态')).toBeVisible();
      await expect(page.locator('text=支持的状态：在售、已成交、个人记录、已下架')).toBeVisible();
    });

    test('应该能够下载CSV模板', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 设置下载监听
      const downloadPromise = page.waitForEvent('download');
      
      // 点击下载模板按钮
      await page.click('button:has-text("下载CSV模板")');
      
      // 等待下载完成
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    });

    test('应该显示文件上传区域', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 检查文件上传区域
      await expect(page.locator('text=点击选择文件或拖拽文件到此处')).toBeVisible();
      await expect(page.locator('input[type="file"]')).toBeVisible();
      await expect(page.locator('text=支持CSV格式，文件大小不超过10MB')).toBeVisible();
    });

    test('应该能够选择CSV文件', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 创建测试CSV文件内容
      const csvContent = `community_id,status,area_sqm,listing_price_wan
1,在售,88.5,280
1,已成交,95.0,320`;
      
      // 模拟文件选择
      const fileInput = page.locator('input[type="file"]');
      
      // 创建临时文件
      const buffer = Buffer.from(csvContent);
      await fileInput.setInputFiles({
        name: 'test-properties.csv',
        mimeType: 'text/csv',
        buffer: buffer
      });
      
      // 检查文件信息显示
      await expect(page.locator('text=test-properties.csv')).toBeVisible();
      await expect(page.locator('button:has-text("开始导入")')).toBeEnabled();
    });

    test('应该验证文件格式', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 尝试上传非CSV文件
      const fileInput = page.locator('input[type="file"]');
      
      const txtContent = 'This is not a CSV file';
      const buffer = Buffer.from(txtContent);
      
      await fileInput.setInputFiles({
        name: 'test.txt',
        mimeType: 'text/plain',
        buffer: buffer
      });
      
      // 应该显示格式错误提示
      await expect(page.locator('text=请选择CSV格式的文件')).toBeVisible();
    });

    test('应该验证文件大小', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 创建大文件内容（模拟超过10MB）
      const largeContent = 'a'.repeat(11 * 1024 * 1024); // 11MB
      const buffer = Buffer.from(largeContent);
      
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'large-file.csv',
        mimeType: 'text/csv',
        buffer: buffer
      });
      
      // 应该显示文件大小错误提示
      await expect(page.locator('text=文件大小不能超过10MB')).toBeVisible();
    });

    test('应该能够清除选中的文件', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 先选择一个文件
      const csvContent = 'community_id,status\n1,在售';
      const buffer = Buffer.from(csvContent);
      
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: buffer
      });
      
      // 检查文件已选中
      await expect(page.locator('text=test.csv')).toBeVisible();
      
      // 点击清除按钮
      const clearButton = page.locator('button[title="清除"], svg[class*="x-mark"]');
      if (await clearButton.isVisible()) {
        await clearButton.click();
        
        // 检查文件已清除
        await expect(page.locator('text=test.csv')).not.toBeVisible();
        await expect(page.locator('button:has-text("开始导入")')).toBeDisabled();
      }
    });

    test('应该能够执行CSV导入', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟成功的导入API响应
      await page.route('**/api/v1/data-import/csv/properties', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success_count: 2,
            error_count: 0,
            total_count: 2,
            errors: []
          })
        });
      });
      
      // 选择文件
      const csvContent = 'community_id,status\n1,在售\n1,已成交';
      const buffer = Buffer.from(csvContent);
      
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: buffer
      });
      
      // 开始导入
      await page.click('button:has-text("开始导入")');
      
      // 检查导入结果
      await expect(page.locator('h3:has-text("导入结果")')).toBeVisible();
      await expect(page.locator('text=成功导入')).toBeVisible();
      await expect(page.locator('.text-2xl.font-bold.text-green-600:has-text("2")')).toBeVisible();
    });

    test('应该显示导入错误信息', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟有错误的导入API响应
      await page.route('**/api/v1/data-import/csv/properties', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success_count: 1,
            error_count: 1,
            total_count: 2,
            errors: [
              { row: 2, message: '小区ID不存在' }
            ]
          })
        });
      });
      
      // 选择文件并导入
      const csvContent = 'community_id,status\n1,在售\n999,已成交';
      const buffer = Buffer.from(csvContent);
      
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: buffer
      });
      
      await page.click('button:has-text("开始导入")');
      
      // 检查错误信息显示
      await expect(page.locator('h4:has-text("错误详情")')).toBeVisible();
      await expect(page.locator('text=第2行：小区ID不存在')).toBeVisible();
    });
  });

  test.describe('API数据同步功能 (FR-2.2)', () => {
    test('应该显示API同步区域', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 检查API同步说明
      await expect(page.locator('text=从外部API同步最新的房源数据')).toBeVisible();
      await expect(page.locator('text=同步过程可能需要几分钟时间')).toBeVisible();
      
      // 检查同步按钮
      await expect(page.locator('button:has-text("同步外部数据")')).toBeVisible();
    });

    test('应该能够执行API同步', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟API同步
      let syncStarted = false;
      await page.route('**/api/v1/data-import/sync/external-data', route => {
        syncStarted = true;
        // 模拟延迟
        setTimeout(() => {
          route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'Sync completed' })
          });
        }, 1000);
      });
      
      // 点击同步按钮
      await page.click('button:has-text("同步外部数据")');
      
      // 检查同步状态
      await expect(page.locator('text=同步中...')).toBeVisible();
      
      // 等待同步完成
      await expect(page.locator('text=数据同步完成')).toBeVisible();
      
      expect(syncStarted).toBe(true);
    });

    test('应该在同步过程中禁用按钮', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟长时间的API同步
      await page.route('**/api/v1/data-import/sync/external-data', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Sync completed' })
        });
      });
      
      const syncButton = page.locator('button:has-text("同步外部数据")');
      
      // 点击同步按钮
      await syncButton.click();
      
      // 检查按钮是否被禁用
      await expect(syncButton).toBeDisabled();
      
      // 等待同步完成后按钮重新启用
      await expect(syncButton).toBeEnabled({ timeout: 10000 });
    });
  });

  test.describe('手动录入功能 (FR-2.3)', () => {
    test('应该显示手动录入区域', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 检查手动录入说明
      await expect(page.locator('text=如果您只需要添加少量房源')).toBeVisible();
      
      // 检查快捷链接
      await expect(page.locator('a:has-text("新增房源")')).toBeVisible();
      await expect(page.locator('a:has-text("新增看房笔记")')).toBeVisible();
    });

    test('应该能够跳转到新增房源页面', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 点击新增房源链接
      await page.click('a:has-text("新增房源")');
      
      // 检查是否跳转到房源新增页面
      await page.waitForURL('/properties/new');
      await helpers.checkPageTitle('新增房源');
    });

    test('应该能够跳转到新增看房笔记页面', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 点击新增看房笔记链接
      await page.click('a:has-text("新增看房笔记")');
      
      // 检查是否跳转到看房笔记新增页面
      await page.waitForURL('/my-viewings/new');
      await helpers.checkPageTitle('新增看房笔记');
    });
  });

  test.describe('响应式设计', () => {
    test('应该在移动端正确显示', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 检查移动端布局
      await helpers.checkPageTitle('数据导入');
      
      // 检查各个导入方式在移动端的显示
      await expect(page.locator('h3:has-text("CSV文件导入")')).toBeVisible();
      await expect(page.locator('h3:has-text("API数据同步")')).toBeVisible();
      await expect(page.locator('h3:has-text("手动录入")')).toBeVisible();
      
      // 检查文件上传区域在移动端的显示
      await expect(page.locator('input[type="file"]')).toBeVisible();
    });
  });

  test.describe('错误处理', () => {
    test('应该处理CSV导入API错误', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟API错误
      await page.route('**/api/v1/data-import/csv/properties', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Server error' })
        });
      });
      
      // 选择文件并尝试导入
      const csvContent = 'community_id,status\n1,在售';
      const buffer = Buffer.from(csvContent);
      
      const fileInput = page.locator('input[type="file"]');
      await fileInput.setInputFiles({
        name: 'test.csv',
        mimeType: 'text/csv',
        buffer: buffer
      });
      
      await page.click('button:has-text("开始导入")');
      
      // 检查错误提示
      await expect(page.locator('text=文件上传失败')).toBeVisible();
    });

    test('应该处理API同步错误', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟API同步错误
      await page.route('**/api/v1/data-import/sync/external-data', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Sync failed' })
        });
      });
      
      // 点击同步按钮
      await page.click('button:has-text("同步外部数据")');
      
      // 检查错误提示
      await expect(page.locator('text=数据同步失败')).toBeVisible();
    });

    test('应该处理模板下载错误', async ({ page }) => {
      await page.goto('/data-import');
      await helpers.waitForPageLoad();
      
      // 模拟模板下载API错误
      await page.route('**/api/v1/data-import/csv/template/properties', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Template not found' })
        });
      });
      
      // 点击下载模板按钮
      await page.click('button:has-text("下载CSV模板")');
      
      // 检查错误提示
      await expect(page.locator('text=下载模板失败')).toBeVisible();
    });
  });
});
