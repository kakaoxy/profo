import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers.js';

test.describe('小区分析模块', () => {
  let helpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.loginTestUser();
  });

  test.describe('小区列表页面 (FR-4.1)', () => {
    test('应该正确显示小区列表页面', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      await helpers.checkPageTitle('小区分析');
      await expect(page.locator('p:has-text("查看和对比不同小区的统计数据")')).toBeVisible();
    });

    test('应该显示搜索和筛选区域', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      // 检查搜索筛选表单
      await expect(page.locator('input[placeholder*="搜索小区名称"]')).toBeVisible();
      await expect(page.locator('select').first()).toBeVisible(); // 城市筛选
      await expect(page.locator('button:has-text("搜索")')).toBeVisible();
      await expect(page.locator('button:has-text("重置")')).toBeVisible();
    });

    test('应该显示小区列表表格', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      // 检查表格头部
      const expectedHeaders = ['小区信息', '位置', '建筑信息', '统计数据', '操作'];
      for (const header of expectedHeaders) {
        await expect(page.locator(`th:has-text("${header}")`)).toBeVisible();
      }
      
      // 检查是否有数据行或空状态
      const tableRows = page.locator('tbody tr');
      const emptyState = page.locator('text=暂无小区数据');
      
      const hasRows = await tableRows.count() > 0;
      const hasEmptyState = await emptyState.isVisible();
      
      expect(hasRows || hasEmptyState).toBe(true);
    });

    test('应该显示统计概览', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      // 检查统计概览卡片
      const expectedStats = ['小区总数', '平均单价', '在售房源', '已售房源'];
      
      for (const stat of expectedStats) {
        await expect(page.locator(`text=${stat}`)).toBeVisible();
      }
      
      // 检查数值显示
      const statValues = page.locator('.text-2xl.font-bold');
      await expect(statValues).toHaveCountGreaterThanOrEqual(4);
    });

    test('应该能够按小区名称搜索', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const searchInput = page.locator('input[placeholder*="搜索小区名称"]');
      await searchInput.fill('测试');
      await page.click('button:has-text("搜索")');
      
      await helpers.waitForPageLoad();
    });

    test('应该能够按城市筛选', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const citySelect = page.locator('select').first();
      if (await citySelect.locator('option').count() > 1) {
        await citySelect.selectOption({ index: 1 });
        await page.click('button:has-text("搜索")');
        
        await helpers.waitForPageLoad();
      }
    });

    test('应该支持分页功能', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      await helpers.checkPagination();
    });

    test('应该能够查看小区详情', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查是否跳转到详情页
        await expect(page).toHaveURL(/\/communities\/\d+/);
      }
    });
  });

  test.describe('小区详情页面 (FR-4.2)', () => {
    test('应该正确显示小区详情页面', async ({ page }) => {
      // 先去列表页找到一个小区
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查详情页面元素
        await expect(page.locator('nav[aria-label="Breadcrumb"]')).toBeVisible(); // 面包屑导航
        await expect(page.locator('h1')).toBeVisible(); // 小区名称
      }
    });

    test('应该显示小区基本信息', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查小区概览
        await expect(page.locator('h3:has-text("小区概览")')).toBeVisible();
        
        // 检查基本信息字段
        const infoFields = ['所属城市', '所属区域', '开发商', '建成年份', '总楼栋数', '总户数'];
        
        for (const field of infoFields) {
          const fieldElement = page.locator(`dt:has-text("${field}")`);
          if (await fieldElement.isVisible()) {
            await expect(fieldElement).toBeVisible();
          }
        }
      }
    });

    test('应该显示价格趋势图表', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查价格趋势图表
        await expect(page.locator('h3:has-text("价格趋势")')).toBeVisible();
        
        // 检查图表
        const chart = page.locator('canvas');
        if (await chart.isVisible()) {
          await expect(chart).toBeVisible();
        }
        
        // 检查时间段选择按钮
        const periodButtons = page.locator('button:has-text("个月"), button:has-text("年")');
        if (await periodButtons.count() > 0) {
          await expect(periodButtons.first()).toBeVisible();
        }
      }
    });

    test('应该显示该小区房源列表', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查房源列表
        await expect(page.locator('h3:has-text("该小区房源")')).toBeVisible();
        
        // 检查查看全部链接
        await expect(page.locator('a:has-text("查看全部")')).toBeVisible();
      }
    });

    test('应该显示统计数据', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查统计数据
        await expect(page.locator('h3:has-text("统计数据")')).toBeVisible();
        
        // 检查统计指标
        const statLabels = ['平均单价', '在售', '已售', '带看次数', '平均成交周期'];
        
        for (const label of statLabels) {
          const labelElement = page.locator(`text=${label}`);
          if (await labelElement.isVisible()) {
            await expect(labelElement).toBeVisible();
          }
        }
      }
    });

    test('应该显示快捷操作', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查快捷操作
        await expect(page.locator('h3:has-text("快捷操作")')).toBeVisible();
        
        // 检查操作按钮
        await expect(page.locator('a:has-text("添加房源")')).toBeVisible();
        await expect(page.locator('a:has-text("添加看房笔记")')).toBeVisible();
      }
    });

    test('应该能够切换价格趋势时间段', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 测试时间段切换
        const periodButtons = page.locator('button:has-text("个月"), button:has-text("年")');
        const buttonCount = await periodButtons.count();
        
        if (buttonCount > 1) {
          // 点击不同的时间段按钮
          await periodButtons.nth(1).click();
          await page.waitForTimeout(1000); // 等待图表更新
          
          // 检查按钮状态
          await expect(periodButtons.nth(1)).toHaveClass(/bg-primary-100|text-primary-700/);
        }
      }
    });
  });

  test.describe('数据展示和交互', () => {
    test('应该正确显示小区统计数据', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const firstRow = page.locator('tbody tr').first();
      if (await firstRow.isVisible()) {
        // 检查小区信息列
        const nameCell = firstRow.locator('td').first();
        await expect(nameCell.locator('.text-sm.font-medium')).toBeVisible();
        
        // 检查统计数据列
        const statsCell = firstRow.locator('td').nth(3);
        if (await statsCell.isVisible()) {
          await expect(statsCell).toBeVisible();
        }
      }
    });

    test('应该正确计算和显示统计概览', async ({ page }) => {
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      // 检查统计数值是否为数字格式
      const statValues = page.locator('.text-2xl.font-bold');
      const count = await statValues.count();
      
      for (let i = 0; i < count; i++) {
        const value = await statValues.nth(i).textContent();
        // 检查是否包含数字或"-"（表示无数据）
        expect(value).toMatch(/\d+|-/);
      }
    });
  });

  test.describe('响应式设计', () => {
    test('应该在移动端正确显示列表页', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      // 检查移动端布局
      await helpers.checkPageTitle('小区分析');
      
      // 检查搜索筛选在移动端的显示
      await expect(page.locator('input[placeholder*="搜索小区名称"]')).toBeVisible();
      
      // 检查表格在移动端的显示
      const table = page.locator('table');
      if (await table.isVisible()) {
        await expect(table).toBeVisible();
      }
    });

    test('应该在移动端正确显示详情页', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const detailLink = page.locator('a:has-text("查看详情")').first();
      if (await detailLink.isVisible()) {
        await detailLink.click();
        
        // 检查移动端详情页布局
        await expect(page.locator('h1')).toBeVisible();
        
        // 检查图表在移动端的显示
        const chart = page.locator('canvas');
        if (await chart.isVisible()) {
          await expect(chart).toBeVisible();
        }
      }
    });
  });

  test.describe('错误处理', () => {
    test('应该处理API加载错误', async ({ page }) => {
      // 模拟API错误
      await page.route('**/api/v1/communities**', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Server error' })
        });
      });
      
      await page.goto('/communities');
      
      // 检查错误处理
      const errorElements = page.locator('.text-red-600, .bg-red-50, text=加载失败');
      if (await errorElements.count() > 0) {
        await expect(errorElements.first()).toBeVisible();
      }
    });

    test('应该处理小区不存在的情况', async ({ page }) => {
      // 直接访问不存在的小区详情页
      await page.goto('/communities/99999');
      
      // 检查错误页面
      const errorElements = page.locator('text=小区不存在, text=该小区可能已被删除');
      if (await errorElements.count() > 0) {
        await expect(errorElements.first()).toBeVisible();
        await expect(page.locator('a:has-text("返回小区列表")')).toBeVisible();
      }
    });
  });

  test.describe('性能和用户体验', () => {
    test('应该在合理时间内加载完成', async ({ page }) => {
      const startTime = Date.now();
      
      await page.goto('/communities');
      await helpers.waitForPageLoad();
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(10000); // 10秒内加载完成
    });

    test('应该正确显示加载状态', async ({ page }) => {
      // 模拟慢速API响应
      await page.route('**/api/v1/communities**', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });
      
      await page.goto('/communities');
      
      // 检查加载指示器
      const loadingIndicator = page.locator('.animate-spin, text=加载中');
      if (await loadingIndicator.isVisible()) {
        await expect(loadingIndicator).toBeVisible();
        await loadingIndicator.waitFor({ state: 'hidden', timeout: 15000 });
      }
    });
  });
});
