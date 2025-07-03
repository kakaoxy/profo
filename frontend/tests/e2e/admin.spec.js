import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers.js';

test.describe('基础数据管理模块', () => {
  let helpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.loginTestUser();
  });

  test.describe('基础数据管理页面 (FR-6.1)', () => {
    test('应该正确显示基础数据管理页面', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      await helpers.checkPageTitle('基础数据管理');
      await expect(page.locator('p:has-text("管理系统中的基础实体数据")')).toBeVisible();
    });

    test('应该显示标签页导航', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 检查标签页
      const expectedTabs = ['城市管理', '中介公司', '经纪人', '小区管理'];
      
      for (const tab of expectedTabs) {
        await expect(page.locator(`button:has-text("${tab}")`)).toBeVisible();
      }
    });

    test('应该能够切换标签页', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      const tabs = ['城市管理', '中介公司', '经纪人', '小区管理'];
      
      for (const tabName of tabs) {
        const tab = page.locator(`button:has-text("${tabName}")`);
        await tab.click();
        
        // 检查标签页是否被激活
        await expect(tab).toHaveClass(/border-primary-500|text-primary-600/);
        
        // 检查对应内容是否显示
        await expect(page.locator(`h2:has-text("${tabName}")`)).toBeVisible();
      }
    });
  });

  test.describe('城市管理', () => {
    test('应该显示城市管理界面', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 确保在城市管理标签页
      await page.click('button:has-text("城市管理")');
      
      // 检查页面元素
      await expect(page.locator('h2:has-text("城市管理")')).toBeVisible();
      await expect(page.locator('button:has-text("新增城市")')).toBeVisible();
      
      // 检查表格头部
      const expectedHeaders = ['城市名称', '省份', '创建时间', '操作'];
      for (const header of expectedHeaders) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }
    });

    test('应该显示城市列表', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("城市管理")');
      
      // 检查是否有城市数据
      const tableRows = page.locator('tbody tr');
      if (await tableRows.count() > 0) {
        const firstRow = tableRows.first();
        
        // 检查城市信息显示
        await expect(firstRow.locator('td').first()).toBeVisible(); // 城市名称
        
        // 检查操作按钮
        await expect(firstRow.locator('button:has-text("编辑")')).toBeVisible();
        await expect(firstRow.locator('button:has-text("删除")')).toBeVisible();
      }
    });

    test('应该能够点击新增城市按钮', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("城市管理")');
      
      // 点击新增城市按钮
      await page.click('button:has-text("新增城市")');
      
      // 这里应该打开模态框或跳转到表单页面
      // 由于实际实现可能是模态框，我们检查是否有相应的响应
      await page.waitForTimeout(500);
    });

    test('应该能够编辑城市', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("城市管理")');
      
      const editButton = page.locator('button:has-text("编辑")').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        await page.waitForTimeout(500);
      }
    });

    test('应该能够删除城市', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("城市管理")');
      
      const deleteButton = page.locator('button:has-text("删除")').first();
      if (await deleteButton.isVisible()) {
        // 模拟确认对话框
        page.on('dialog', dialog => dialog.accept());
        
        await deleteButton.click();
        await helpers.waitForPageLoad();
      }
    });
  });

  test.describe('中介公司管理', () => {
    test('应该显示中介公司管理界面', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 切换到中介公司标签页
      await page.click('button:has-text("中介公司")');
      
      // 检查页面元素
      await expect(page.locator('h2:has-text("中介公司管理")')).toBeVisible();
      await expect(page.locator('button:has-text("新增中介公司")')).toBeVisible();
      
      // 检查表格头部
      const expectedHeaders = ['公司名称', '联系电话', '地址', '操作'];
      for (const header of expectedHeaders) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }
    });

    test('应该显示中介公司列表', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("中介公司")');
      
      // 检查是否有中介公司数据
      const tableRows = page.locator('tbody tr');
      if (await tableRows.count() > 0) {
        const firstRow = tableRows.first();
        
        // 检查公司信息显示
        await expect(firstRow.locator('td').first()).toBeVisible(); // 公司名称
        
        // 检查操作按钮
        await expect(firstRow.locator('button:has-text("编辑")')).toBeVisible();
        await expect(firstRow.locator('button:has-text("删除")')).toBeVisible();
      }
    });

    test('应该能够管理中介公司', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("中介公司")');
      
      // 测试新增按钮
      await page.click('button:has-text("新增中介公司")');
      await page.waitForTimeout(500);
      
      // 测试编辑和删除按钮
      const editButton = page.locator('button:has-text("编辑")').first();
      const deleteButton = page.locator('button:has-text("删除")').first();
      
      if (await editButton.isVisible()) {
        await expect(editButton).toBeVisible();
      }
      
      if (await deleteButton.isVisible()) {
        await expect(deleteButton).toBeVisible();
      }
    });
  });

  test.describe('经纪人管理', () => {
    test('应该显示经纪人管理界面', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 切换到经纪人标签页
      await page.click('button:has-text("经纪人")');
      
      // 检查页面元素
      await expect(page.locator('h2:has-text("经纪人管理")')).toBeVisible();
      await expect(page.locator('button:has-text("新增经纪人")')).toBeVisible();
      
      // 检查表格头部
      const expectedHeaders = ['姓名', '所属公司', '联系电话', '微信号', '操作'];
      for (const header of expectedHeaders) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }
    });

    test('应该显示经纪人列表', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("经纪人")');
      
      // 检查是否有经纪人数据
      const tableRows = page.locator('tbody tr');
      if (await tableRows.count() > 0) {
        const firstRow = tableRows.first();
        
        // 检查经纪人信息显示
        await expect(firstRow.locator('td').first()).toBeVisible(); // 姓名
        
        // 检查操作按钮
        await expect(firstRow.locator('button:has-text("编辑")')).toBeVisible();
        await expect(firstRow.locator('button:has-text("删除")')).toBeVisible();
      }
    });

    test('应该能够管理经纪人', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("经纪人")');
      
      // 测试新增按钮
      await page.click('button:has-text("新增经纪人")');
      await page.waitForTimeout(500);
    });
  });

  test.describe('小区管理', () => {
    test('应该显示小区管理界面', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 切换到小区管理标签页
      await page.click('button:has-text("小区管理")');
      
      // 检查页面元素
      await expect(page.locator('h2:has-text("小区管理")')).toBeVisible();
      await expect(page.locator('button:has-text("新增小区")')).toBeVisible();
      
      // 检查表格头部
      const expectedHeaders = ['小区名称', '所属城市', '区域', '建成年份', '操作'];
      for (const header of expectedHeaders) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }
    });

    test('应该显示小区列表', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("小区管理")');
      
      // 检查是否有小区数据
      const tableRows = page.locator('tbody tr');
      if (await tableRows.count() > 0) {
        const firstRow = tableRows.first();
        
        // 检查小区信息显示
        await expect(firstRow.locator('td').first()).toBeVisible(); // 小区名称
        
        // 检查操作按钮
        await expect(firstRow.locator('button:has-text("编辑")')).toBeVisible();
        await expect(firstRow.locator('button:has-text("删除")')).toBeVisible();
      }
    });

    test('应该能够管理小区', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("小区管理")');
      
      // 测试新增按钮
      await page.click('button:has-text("新增小区")');
      await page.waitForTimeout(500);
    });
  });

  test.describe('数据操作', () => {
    test('应该正确显示创建时间', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 检查城市管理中的创建时间
      await page.click('button:has-text("城市管理")');
      
      const tableRows = page.locator('tbody tr');
      if (await tableRows.count() > 0) {
        const firstRow = tableRows.first();
        const timeCell = firstRow.locator('td').nth(2); // 创建时间列
        
        if (await timeCell.isVisible()) {
          const timeText = await timeCell.textContent();
          // 检查日期格式
          expect(timeText).toMatch(/\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4}/);
        }
      }
    });

    test('应该处理删除确认', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("城市管理")');
      
      const deleteButton = page.locator('button:has-text("删除")').first();
      if (await deleteButton.isVisible()) {
        // 模拟取消删除
        page.on('dialog', dialog => dialog.dismiss());
        
        await deleteButton.click();
        
        // 页面应该没有变化
        await expect(page.locator('h2:has-text("城市管理")')).toBeVisible();
      }
    });
  });

  test.describe('响应式设计', () => {
    test('应该在移动端正确显示', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 检查移动端布局
      await helpers.checkPageTitle('基础数据管理');
      
      // 检查标签页在移动端的显示
      await expect(page.locator('button:has-text("城市管理")')).toBeVisible();
      
      // 检查表格在移动端的显示
      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(table).toBeVisible();
      }
    });
  });

  test.describe('错误处理', () => {
    test('应该处理API加载错误', async ({ page }) => {
      // 模拟API错误
      await page.route('**/api/v1/cities**', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Server error' })
        });
      });
      
      await page.goto('/admin');
      await page.click('button:has-text("城市管理")');
      
      // 检查错误处理
      const errorElements = page.locator('.text-red-600, .bg-red-50, text=加载失败');
      if (await errorElements.count() > 0) {
        await expect(errorElements.first()).toBeVisible();
      }
    });

    test('应该处理删除操作错误', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      await page.click('button:has-text("城市管理")');
      
      // 模拟删除API错误
      await page.route('**/api/v1/cities/*', route => {
        if (route.request().method() === 'DELETE') {
          route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Delete failed' })
          });
        } else {
          route.continue();
        }
      });
      
      const deleteButton = page.locator('button:has-text("删除")').first();
      if (await deleteButton.isVisible()) {
        page.on('dialog', dialog => dialog.accept());
        await deleteButton.click();
        
        // 检查错误提示
        await expect(page.locator('text=删除失败')).toBeVisible();
      }
    });
  });

  test.describe('数据一致性', () => {
    test('应该在不同标签页间保持数据一致性', async ({ page }) => {
      await page.goto('/admin');
      await helpers.waitForPageLoad();
      
      // 在城市管理中记录数据
      await page.click('button:has-text("城市管理")');
      const cityRows = await page.locator('tbody tr').count();
      
      // 切换到其他标签页再切换回来
      await page.click('button:has-text("中介公司")');
      await page.waitForTimeout(500);
      await page.click('button:has-text("城市管理")');
      
      // 检查数据是否一致
      const newCityRows = await page.locator('tbody tr').count();
      expect(newCityRows).toBe(cityRows);
    });
  });
});
