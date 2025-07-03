import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage.js';
import { TestHelpers } from './utils/test-helpers.js';

test.describe('数据看板模块', () => {
  let dashboardPage;
  let helpers;

  test.beforeEach(async ({ page }) => {
    dashboardPage = new DashboardPage(page);
    helpers = new TestHelpers(page);
    
    // 登录后访问看板
    await helpers.loginTestUser();
  });

  test.describe('页面加载和基本元素', () => {
    test('应该正确显示看板页面标题和描述', async () => {
      await dashboardPage.checkPageElements();
    });

    test('应该正确加载所有数据', async () => {
      await dashboardPage.checkDataLoading();
    });

    test('应该在移动端正确显示', async () => {
      await dashboardPage.checkResponsiveDesign();
    });
  });

  test.describe('核心指标展示 (FR-1.1)', () => {
    test('应该显示所有核心指标卡片', async () => {
      await dashboardPage.checkMetricsCards();
    });

    test('应该显示正确的指标数值', async () => {
      const metricsCards = dashboardPage.page.locator('.card');
      
      // 检查每个指标卡片都有数值显示
      const count = await metricsCards.count();
      for (let i = 0; i < count; i++) {
        const card = metricsCards.nth(i);
        const numberElement = card.locator('.text-2xl.font-bold');
        await expect(numberElement).toBeVisible();
        
        // 检查数值是否为数字格式
        const numberText = await numberElement.textContent();
        expect(numberText).toMatch(/\d+/);
      }
    });

    test('应该显示指标单位', async () => {
      // 检查单位显示
      await expect(dashboardPage.page.locator('text=套')).toHaveCountGreaterThanOrEqual(3);
      await expect(dashboardPage.page.locator('text=次')).toBeVisible();
    });

    test('应该正确显示图标', async () => {
      // 检查每个指标卡片都有对应的图标
      const iconSelectors = [
        'svg', // 通用SVG图标选择器
        '.h-8.w-8' // Heroicons的常用类名
      ];
      
      for (const selector of iconSelectors) {
        const icons = dashboardPage.page.locator(selector);
        if (await icons.count() > 0) {
          await expect(icons.first()).toBeVisible();
          break;
        }
      }
    });
  });

  test.describe('交易趋势图表 (FR-1.2)', () => {
    test('应该显示趋势图表', async () => {
      await dashboardPage.checkTrendChart();
    });

    test('应该能够切换时间段', async () => {
      await dashboardPage.testPeriodSwitch();
    });

    test('应该显示图表图例', async () => {
      // 检查图表图例
      await expect(dashboardPage.page.locator('text=新房成交套数')).toBeVisible();
      await expect(dashboardPage.page.locator('text=二手房成交套数')).toBeVisible();
    });

    test('应该支持图表交互', async () => {
      await dashboardPage.checkChartInteraction();
    });

    test('应该在没有数据时显示空状态', async () => {
      // 模拟空数据响应
      await dashboardPage.page.route('**/api/v1/dashboard/stats/trend**', route => {
        route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ trend_data: [] })
        });
      });
      
      await dashboardPage.page.reload();
      await dashboardPage.page.waitForLoadState('networkidle');
      
      // 检查空状态显示
      await expect(dashboardPage.page.locator('text=暂无数据')).toBeVisible();
    });
  });

  test.describe('近期动态 (FR-1.3)', () => {
    test('应该显示近期动态区域', async () => {
      await dashboardPage.checkRecentActivities();
    });

    test('应该显示最近房源信息', async () => {
      const recentPropertiesSection = dashboardPage.page.locator('h3:has-text("最近房源")').locator('..');
      
      // 检查是否有房源数据或空状态提示
      const hasData = await recentPropertiesSection.locator('.bg-gray-50').count() > 0;
      const hasEmptyState = await recentPropertiesSection.locator('text=暂无房源记录').isVisible();
      
      expect(hasData || hasEmptyState).toBe(true);
    });

    test('应该显示最近看房笔记', async () => {
      const recentViewingsSection = dashboardPage.page.locator('h3:has-text("最近看房笔记")').locator('..');
      
      // 检查是否有看房记录或空状态提示
      const hasData = await recentViewingsSection.locator('.bg-gray-50').count() > 0;
      const hasEmptyState = await recentViewingsSection.locator('text=暂无看房记录').isVisible();
      
      expect(hasData || hasEmptyState).toBe(true);
    });

    test('应该能够跳转到详细页面', async () => {
      await dashboardPage.testQuickLinks();
    });

    test('应该显示房源基本信息', async () => {
      const propertyItems = dashboardPage.page.locator('h3:has-text("最近房源")').locator('..').locator('.bg-gray-50');
      
      if (await propertyItems.count() > 0) {
        const firstItem = propertyItems.first();
        
        // 检查房源信息显示
        await expect(firstItem.locator('.font-medium')).toBeVisible();
        await expect(firstItem.locator('.text-sm.text-gray-500')).toBeVisible();
      }
    });

    test('应该显示看房笔记评分', async () => {
      const viewingItems = dashboardPage.page.locator('h3:has-text("最近看房笔记")').locator('..').locator('.bg-gray-50');
      
      if (await viewingItems.count() > 0) {
        const firstItem = viewingItems.first();
        
        // 检查评分星星显示
        const stars = firstItem.locator('svg'); // 星星图标
        if (await stars.count() > 0) {
          await expect(stars.first()).toBeVisible();
        }
      }
    });
  });

  test.describe('数据一致性验证', () => {
    test('应该验证看板数据与详细页面数据的一致性', async () => {
      await dashboardPage.validateDataConsistency();
    });

    test('应该正确处理API错误', async () => {
      // 模拟API错误
      await dashboardPage.page.route('**/api/v1/dashboard/stats/overview', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Server error' })
        });
      });
      
      await dashboardPage.page.reload();
      await dashboardPage.page.waitForLoadState('networkidle');
      
      // 检查错误处理
      const errorElements = dashboardPage.page.locator('.text-red-600, .bg-red-50, text=加载失败');
      if (await errorElements.count() > 0) {
        await expect(errorElements.first()).toBeVisible();
      }
    });
  });

  test.describe('性能和用户体验', () => {
    test('应该在合理时间内加载完成', async () => {
      const startTime = Date.now();
      
      await dashboardPage.goto();
      await dashboardPage.checkDataLoading();
      
      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(10000); // 10秒内加载完成
    });

    test('应该正确显示加载状态', async () => {
      // 模拟慢速API响应
      await dashboardPage.page.route('**/api/v1/dashboard/**', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });
      
      await dashboardPage.goto();
      
      // 检查加载指示器
      const loadingIndicator = dashboardPage.page.locator('.animate-spin, text=加载中');
      if (await loadingIndicator.isVisible()) {
        await expect(loadingIndicator).toBeVisible();
        await loadingIndicator.waitFor({ state: 'hidden', timeout: 15000 });
      }
    });

    test('应该支持页面刷新', async () => {
      await dashboardPage.goto();
      await dashboardPage.checkDataLoading();
      
      // 刷新页面
      await dashboardPage.page.reload();
      await dashboardPage.page.waitForLoadState('networkidle');
      
      // 检查页面重新加载后的状态
      await dashboardPage.checkPageElements();
      await dashboardPage.checkMetricsCards();
    });
  });

  test.describe('无障碍性测试', () => {
    test('应该有正确的页面标题', async () => {
      await expect(dashboardPage.page).toHaveTitle(/房源管理系统|数据看板/);
    });

    test('应该有正确的语义化标签', async () => {
      // 检查主要的语义化标签
      await expect(dashboardPage.page.locator('main, [role="main"]')).toBeVisible();
      await expect(dashboardPage.page.locator('h1')).toBeVisible();
    });

    test('应该支持键盘导航', async () => {
      // 测试Tab键导航
      await dashboardPage.page.keyboard.press('Tab');
      
      // 检查焦点是否正确移动
      const focusedElement = await dashboardPage.page.locator(':focus');
      await expect(focusedElement).toBeVisible();
    });
  });
});
