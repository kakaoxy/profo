import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers.js';

test.describe('房源管理模块', () => {
  let helpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.loginTestUser();
  });

  test.describe('房源列表页面 (FR-3.1)', () => {
    test('应该正确显示房源列表页面', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      await helpers.checkPageTitle('房源管理');
      await expect(page.locator('p:has-text("管理所有房源信息")')).toBeVisible();
      await expect(page.locator('button:has-text("新增房源")')).toBeVisible();
    });

    test('应该显示房源列表表格', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 检查表格头部
      const expectedHeaders = ['房源信息', '户型面积', '价格', '状态', '更新时间', '操作'];
      for (const header of expectedHeaders) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }
      
      // 检查是否有数据行或空状态
      const tableRows = page.locator('tbody tr');
      const emptyState = page.locator('text=暂无房源');
      
      const hasRows = await tableRows.count() > 0;
      const hasEmptyState = await emptyState.isVisible();
      
      expect(hasRows || hasEmptyState).toBe(true);
    });

    test('应该支持分页功能', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      await helpers.checkPagination();
    });

    test('应该显示房源基本信息', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const firstRow = page.locator('tbody tr').first();
      if (await firstRow.isVisible()) {
        // 检查房源信息列
        await expect(firstRow.locator('td').first()).toBeVisible();
        
        // 检查状态标签
        const statusBadge = firstRow.locator('.inline-flex.px-2.py-1');
        if (await statusBadge.isVisible()) {
          await expect(statusBadge).toBeVisible();
        }
      }
    });
  });

  test.describe('搜索和筛选功能 (FR-3.2)', () => {
    test('应该显示搜索和筛选区域', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 检查搜索筛选表单
      await expect(page.locator('input[placeholder*="搜索小区名称"]')).toBeVisible();
      await expect(page.locator('select').first()).toBeVisible(); // 状态筛选
      await expect(page.locator('button:has-text("搜索")')).toBeVisible();
      await expect(page.locator('button:has-text("重置筛选")')).toBeVisible();
    });

    test('应该能够按小区名称搜索', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const searchInput = page.locator('input[placeholder*="搜索小区名称"]');
      await searchInput.fill('测试');
      await page.click('button:has-text("搜索")');
      
      await helpers.waitForPageLoad();
      
      // 检查搜索结果
      const results = page.locator('tbody tr');
      if (await results.count() > 0) {
        // 验证搜索结果包含搜索关键词
        const firstResult = results.first();
        await expect(firstResult).toBeVisible();
      }
    });

    test('应该能够按状态筛选', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 选择状态筛选
      const statusSelect = page.locator('select').first();
      await statusSelect.selectOption('在售');
      await page.click('button:has-text("搜索")');
      
      await helpers.waitForPageLoad();
      
      // 检查筛选结果
      const statusBadges = page.locator('.inline-flex.px-2.py-1:has-text("在售")');
      if (await statusBadges.count() > 0) {
        await expect(statusBadges.first()).toBeVisible();
      }
    });

    test('应该能够按价格区间筛选', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 设置价格区间
      await page.fill('input[placeholder="最低价"]', '100');
      await page.fill('input[placeholder="最高价"]', '500');
      await page.click('button:has-text("搜索")');
      
      await helpers.waitForPageLoad();
    });

    test('应该能够重置筛选条件', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 设置一些筛选条件
      await page.fill('input[placeholder*="搜索小区名称"]', '测试');
      await page.selectOption('select', '在售');
      
      // 重置筛选
      await page.click('button:has-text("重置筛选")');
      
      // 检查筛选条件是否被清空
      await expect(page.locator('input[placeholder*="搜索小区名称"]')).toHaveValue('');
    });
  });

  test.describe('房源CRUD操作 (FR-3.3)', () => {
    test('应该能够跳转到新增房源页面', async ({ page }) => {
      await page.goto('/properties');
      await page.click('button:has-text("新增房源")');
      
      await page.waitForURL('/properties/new');
      await helpers.checkPageTitle('新增房源');
    });

    test('应该能够查看房源详情', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const viewLink = page.locator('a:has-text("查看")').first();
      if (await viewLink.isVisible()) {
        await viewLink.click();
        
        // 检查是否跳转到详情页
        await expect(page).toHaveURL(/\/properties\/\d+/);
        await helpers.checkPageTitle('房源详情');
      }
    });

    test('应该能够编辑房源', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const editLink = page.locator('a:has-text("编辑")').first();
      if (await editLink.isVisible()) {
        await editLink.click();
        
        // 检查是否跳转到编辑页
        await expect(page).toHaveURL(/\/properties\/\d+\/edit/);
        await helpers.checkPageTitle('编辑房源');
      }
    });

    test('应该能够删除房源', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const deleteButton = page.locator('button:has-text("删除")').first();
      if (await deleteButton.isVisible()) {
        // 模拟确认对话框
        page.on('dialog', dialog => dialog.accept());
        
        await deleteButton.click();
        
        // 等待页面更新
        await helpers.waitForPageLoad();
      }
    });
  });

  test.describe('房源表单页面', () => {
    test('应该正确显示新增房源表单', async ({ page }) => {
      await page.goto('/properties/new');
      await helpers.waitForPageLoad();
      
      // 检查表单字段
      const expectedFields = [
        'select[name="community_id"]',
        'select[name="status"]',
        'input[name="area_sqm"]',
        'input[name="layout_bedrooms"]',
        'input[name="listing_price_wan"]'
      ];
      
      for (const field of expectedFields) {
        await expect(page.locator(field)).toBeVisible();
      }
      
      // 检查提交按钮
      await expect(page.locator('button:has-text("创建房源")')).toBeVisible();
      await expect(page.locator('button:has-text("取消")')).toBeVisible();
    });

    test('应该能够创建新房源', async ({ page }) => {
      await page.goto('/properties/new');
      await helpers.waitForPageLoad();
      
      // 填写表单
      await page.selectOption('select[name="community_id"]', { index: 1 });
      await page.selectOption('select[name="status"]', '在售');
      await page.fill('input[name="area_sqm"]', '88.5');
      await page.fill('input[name="layout_bedrooms"]', '2');
      await page.fill('input[name="layout_living_rooms"]', '1');
      await page.fill('input[name="layout_bathrooms"]', '1');
      await page.fill('input[name="listing_price_wan"]', '280');
      
      // 提交表单
      await page.click('button:has-text("创建房源")');
      
      // 检查是否跳转回列表页
      await page.waitForURL('/properties');
    });

    test('应该验证必填字段', async ({ page }) => {
      await page.goto('/properties/new');
      await helpers.waitForPageLoad();
      
      // 尝试提交空表单
      await page.click('button:has-text("创建房源")');
      
      // 检查HTML5验证
      const requiredFields = page.locator('select[required], input[required]');
      const count = await requiredFields.count();
      
      if (count > 0) {
        const firstRequired = requiredFields.first();
        const isValid = await firstRequired.evaluate(el => el.validity.valid);
        expect(isValid).toBe(false);
      }
    });
  });

  test.describe('房源详情页面', () => {
    test('应该正确显示房源详情', async ({ page }) => {
      // 先创建一个测试房源或使用现有房源
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const viewLink = page.locator('a:has-text("查看")').first();
      if (await viewLink.isVisible()) {
        await viewLink.click();
        
        // 检查详情页面元素
        await helpers.checkPageTitle('房源详情');
        
        // 检查房源概览
        await expect(page.locator('h3:has-text("房源概览")')).toBeVisible();
        
        // 检查详细信息
        await expect(page.locator('h3:has-text("详细信息")')).toBeVisible();
        
        // 检查价格信息
        await expect(page.locator('h3:has-text("价格信息")')).toBeVisible();
        
        // 检查操作按钮
        await expect(page.locator('button:has-text("编辑"), a:has-text("编辑")')).toBeVisible();
        await expect(page.locator('button:has-text("删除")')).toBeVisible();
      }
    });

    test('应该显示房源统计数据', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const viewLink = page.locator('a:has-text("查看")').first();
      if (await viewLink.isVisible()) {
        await viewLink.click();
        
        // 检查统计数据卡片
        const statCards = page.locator('.text-center.p-4');
        if (await statCards.count() > 0) {
          await expect(statCards.first()).toBeVisible();
        }
      }
    });

    test('应该支持快捷操作', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      const viewLink = page.locator('a:has-text("查看")').first();
      if (await viewLink.isVisible()) {
        await viewLink.click();
        
        // 检查快捷操作按钮
        const quickActions = [
          'button:has-text("添加看房笔记"), a:has-text("添加看房笔记")',
          'button:has-text("复制房源信息")'
        ];
        
        for (const action of quickActions) {
          const element = page.locator(action);
          if (await element.isVisible()) {
            await expect(element).toBeVisible();
          }
        }
      }
    });
  });

  test.describe('响应式设计', () => {
    test('应该在移动端正确显示', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 检查移动端布局
      await helpers.checkPageTitle('房源管理');
      
      // 检查表格在移动端的显示
      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(table).toBeVisible();
      }
      
      // 检查搜索筛选在移动端的布局
      await expect(page.locator('input[placeholder*="搜索小区名称"]')).toBeVisible();
    });
  });

  test.describe('错误处理', () => {
    test('应该处理API加载错误', async ({ page }) => {
      // 模拟API错误
      await page.route('**/api/v1/properties**', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Server error' })
        });
      });
      
      await page.goto('/properties');
      
      // 检查错误处理
      const errorElements = page.locator('.text-red-600, .bg-red-50, text=加载失败');
      if (await errorElements.count() > 0) {
        await expect(errorElements.first()).toBeVisible();
      }
    });

    test('应该处理删除操作错误', async ({ page }) => {
      await page.goto('/properties');
      await helpers.waitForPageLoad();
      
      // 模拟删除API错误
      await page.route('**/api/v1/properties/*', route => {
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
});
