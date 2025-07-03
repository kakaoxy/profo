import { expect } from '@playwright/test';

/**
 * 数据看板页面对象模型
 */
export class DashboardPage {
  constructor(page) {
    this.page = page;
    
    // 页面元素选择器
    this.pageTitle = 'h1:has-text("数据看板")';
    this.metricsCards = '.card';
    this.trendChart = 'canvas';
    this.periodButtons = 'button:has-text("天"), button:has-text("30天"), button:has-text("90天")';
    this.recentProperties = '[data-testid="recent-properties"]';
    this.recentViewings = '[data-testid="recent-viewings"]';
    this.viewAllPropertiesLink = 'a:has-text("查看全部房源")';
    this.viewAllViewingsLink = 'a:has-text("查看全部看房记录")';
  }

  /**
   * 导航到数据看板
   */
  async goto() {
    await this.page.goto('/');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 检查页面基本元素
   */
  async checkPageElements() {
    await expect(this.page.locator(this.pageTitle)).toBeVisible();
    await expect(this.page.locator('p:has-text("房源信息概览和趋势分析")')).toBeVisible();
  }

  /**
   * 检查核心指标卡片
   */
  async checkMetricsCards() {
    const cards = this.page.locator(this.metricsCards);
    await expect(cards).toHaveCountGreaterThanOrEqual(4);

    // 检查每个指标卡片的内容
    const expectedMetrics = [
      '昨日新房成交',
      '昨日二手房成交', 
      '房源总数',
      '我的看房记录'
    ];

    for (const metric of expectedMetrics) {
      await expect(this.page.locator(`text=${metric}`)).toBeVisible();
    }

    // 检查数值显示
    const numberElements = this.page.locator('.text-2xl.font-bold');
    await expect(numberElements).toHaveCountGreaterThanOrEqual(4);
  }

  /**
   * 检查交易趋势图表
   */
  async checkTrendChart() {
    await expect(this.page.locator('h3:has-text("交易趋势")')).toBeVisible();
    
    // 检查图表是否存在
    const chart = this.page.locator(this.trendChart);
    await expect(chart).toBeVisible();

    // 检查时间段选择按钮
    const periodButtons = this.page.locator(this.periodButtons);
    await expect(periodButtons).toHaveCountGreaterThanOrEqual(3);
  }

  /**
   * 测试时间段切换
   */
  async testPeriodSwitch() {
    const buttons = ['7天', '30天', '90天'];
    
    for (const buttonText of buttons) {
      const button = this.page.locator(`button:has-text("${buttonText}")`);
      await button.click();
      
      // 等待图表更新
      await this.page.waitForTimeout(1000);
      
      // 检查按钮是否被激活
      await expect(button).toHaveClass(/bg-primary-100|text-primary-700/);
    }
  }

  /**
   * 检查近期动态
   */
  async checkRecentActivities() {
    // 检查最近房源
    await expect(this.page.locator('h3:has-text("最近房源")')).toBeVisible();
    
    // 检查最近看房笔记
    await expect(this.page.locator('h3:has-text("最近看房笔记")')).toBeVisible();
    
    // 检查查看全部链接
    await expect(this.page.locator(this.viewAllPropertiesLink)).toBeVisible();
    await expect(this.page.locator(this.viewAllViewingsLink)).toBeVisible();
  }

  /**
   * 测试快捷链接
   */
  async testQuickLinks() {
    // 测试查看全部房源链接
    await this.page.click(this.viewAllPropertiesLink);
    await this.page.waitForURL('/properties');
    await this.page.goBack();
    
    // 测试查看全部看房记录链接
    await this.page.click(this.viewAllViewingsLink);
    await this.page.waitForURL('/my-viewings');
    await this.page.goBack();
  }

  /**
   * 检查数据加载状态
   */
  async checkDataLoading() {
    // 检查是否有加载指示器
    const loadingIndicator = this.page.locator('.animate-spin, text=加载中');
    if (await loadingIndicator.isVisible()) {
      await loadingIndicator.waitFor({ state: 'hidden', timeout: 10000 });
    }
    
    // 确保数据已加载
    await expect(this.page.locator(this.metricsCards)).toHaveCountGreaterThan(0);
  }

  /**
   * 检查空状态
   */
  async checkEmptyState() {
    const emptyStateElements = this.page.locator('text=暂无数据, text=暂无房源记录, text=暂无看房记录');
    
    // 如果有空状态，检查相应的提示信息
    if (await emptyStateElements.first().isVisible()) {
      await expect(emptyStateElements.first()).toBeVisible();
    }
  }

  /**
   * 检查响应式设计
   */
  async checkResponsiveDesign() {
    // 测试移动端视图
    await this.page.setViewportSize({ width: 375, height: 667 });
    await this.page.waitForTimeout(500);
    
    // 检查指标卡片在移动端的布局
    const cards = this.page.locator(this.metricsCards);
    await expect(cards).toBeVisible();
    
    // 检查图表在移动端的显示
    await expect(this.page.locator(this.trendChart)).toBeVisible();
    
    // 恢复桌面端视图
    await this.page.setViewportSize({ width: 1280, height: 720 });
    await this.page.waitForTimeout(500);
  }

  /**
   * 检查图表交互
   */
  async checkChartInteraction() {
    const chart = this.page.locator(this.trendChart);
    
    if (await chart.isVisible()) {
      // 获取图表的边界框
      const chartBox = await chart.boundingBox();
      
      if (chartBox) {
        // 在图表上移动鼠标（模拟悬停）
        await this.page.mouse.move(
          chartBox.x + chartBox.width / 2,
          chartBox.y + chartBox.height / 2
        );
        
        // 等待可能的工具提示出现
        await this.page.waitForTimeout(500);
      }
    }
  }

  /**
   * 验证数据一致性
   */
  async validateDataConsistency() {
    // 获取看板上的房源总数
    const totalPropertiesText = await this.page.locator('text=房源总数').locator('..').locator('.text-2xl').textContent();
    const totalProperties = parseInt(totalPropertiesText);
    
    // 导航到房源列表页面验证数据
    await this.page.click(this.viewAllPropertiesLink);
    await this.page.waitForLoadState('networkidle');
    
    // 检查房源列表是否有数据（如果看板显示有房源的话）
    if (totalProperties > 0) {
      const propertyRows = this.page.locator('tbody tr');
      await expect(propertyRows).toHaveCountGreaterThan(0);
    }
    
    // 返回看板
    await this.page.goto('/');
  }
}
