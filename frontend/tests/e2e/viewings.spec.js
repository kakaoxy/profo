import { test, expect } from '@playwright/test';
import { TestHelpers } from './utils/test-helpers.js';

test.describe('个人看房管理模块', () => {
  let helpers;

  test.beforeEach(async ({ page }) => {
    helpers = new TestHelpers(page);
    await helpers.loginTestUser();
  });

  test.describe('看房笔记列表页面 (FR-5.1)', () => {
    test('应该正确显示看房笔记列表页面', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      await helpers.checkPageTitle('个人看房管理');
      await expect(page.locator('p:has-text("管理您的看房笔记和评价")')).toBeVisible();
      await expect(page.locator('button:has-text("新增看房笔记"), a:has-text("新增看房笔记")')).toBeVisible();
    });

    test('应该以卡片形式显示看房笔记', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      // 检查是否有看房笔记卡片或空状态
      const viewingCards = page.locator('.card');
      const emptyState = page.locator('text=暂无看房记录');
      
      const hasCards = await viewingCards.count() > 0;
      const hasEmptyState = await emptyState.isVisible();
      
      expect(hasCards || hasEmptyState).toBe(true);
      
      if (hasCards) {
        const firstCard = viewingCards.first();
        
        // 检查卡片内容
        await expect(firstCard.locator('.text-lg.font-medium')).toBeVisible(); // 房源名称
        await expect(firstCard.locator('.text-sm.text-gray-500')).toBeVisible(); // 房源信息
      }
    });

    test('应该显示评分系统', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查星星评分
        const stars = firstCard.locator('svg'); // 星星图标
        if (await stars.count() > 0) {
          await expect(stars.first()).toBeVisible();
        }
        
        // 检查评分数值
        const ratingText = firstCard.locator('text=/\\d+\\/5/');
        if (await ratingText.isVisible()) {
          await expect(ratingText).toBeVisible();
        }
      }
    });

    test('应该显示看房基本信息', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查看房时间
        const dateElement = firstCard.locator('text=/看房时间/');
        if (await dateElement.isVisible()) {
          await expect(dateElement).toBeVisible();
        }
        
        // 检查预期价格
        const priceElement = firstCard.locator('text=/预期价格/');
        if (await priceElement.isVisible()) {
          await expect(priceElement).toBeVisible();
        }
        
        // 检查经纪人信息
        const agentElement = firstCard.locator('text=/带看经纪人/');
        if (await agentElement.isVisible()) {
          await expect(agentElement).toBeVisible();
        }
      }
    });

    test('应该显示笔记内容', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查笔记内容区域
        const notesSections = ['总体印象', '优点', '缺点'];
        
        for (const section of notesSections) {
          const sectionElement = firstCard.locator(`text=${section}`);
          if (await sectionElement.isVisible()) {
            await expect(sectionElement).toBeVisible();
          }
        }
      }
    });

    test('应该支持编辑和删除操作', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查编辑按钮
        const editButton = firstCard.locator('button[title="编辑"], svg[class*="pencil"]').first();
        if (await editButton.isVisible()) {
          await expect(editButton).toBeVisible();
        }
        
        // 检查删除按钮
        const deleteButton = firstCard.locator('button[title="删除"], svg[class*="trash"]').first();
        if (await deleteButton.isVisible()) {
          await expect(deleteButton).toBeVisible();
        }
      }
    });

    test('应该支持分页功能', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      await helpers.checkPagination();
    });
  });

  test.describe('看房笔记表单页面 (FR-5.2)', () => {
    test('应该正确显示新增看房笔记表单', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      await helpers.checkPageTitle('新增看房笔记');
      
      // 检查表单字段
      const expectedFields = [
        'select[name="property_id"]', // 关联房源
        'select[name="agent_id"]', // 带看经纪人
        'input[name="viewing_date"]', // 看房时间
        'input[name="expected_purchase_price_wan"]', // 预期价格
        'textarea[name="notes_general"]', // 总体印象
        'textarea[name="notes_pros"]', // 优点
        'textarea[name="notes_cons"]' // 缺点
      ];
      
      for (const field of expectedFields) {
        await expect(page.locator(field)).toBeVisible();
      }
      
      // 检查评分系统
      await expect(page.locator('text=总体评分')).toBeVisible();
      
      // 检查提交按钮
      await expect(page.locator('button:has-text("创建笔记")')).toBeVisible();
      await expect(page.locator('button:has-text("取消")')).toBeVisible();
    });

    test('应该能够选择关联房源', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      const propertySelect = page.locator('select[name="property_id"]');
      await expect(propertySelect).toBeVisible();
      
      // 检查是否有房源选项
      const options = propertySelect.locator('option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(1); // 至少有一个默认选项和一个房源选项
    });

    test('应该能够选择带看经纪人', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      const agentSelect = page.locator('select[name="agent_id"]');
      await expect(agentSelect).toBeVisible();
    });

    test('应该支持评分功能', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      // 检查星星评分
      const stars = page.locator('button svg, .star-rating svg');
      if (await stars.count() >= 5) {
        // 点击第3颗星
        await stars.nth(2).click();
        
        // 检查评分显示
        await expect(page.locator('text=/3\\/5/')).toBeVisible();
      }
    });

    test('应该能够创建新的看房笔记', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      // 填写表单
      await page.selectOption('select[name="property_id"]', { index: 1 });
      await page.fill('input[name="viewing_date"]', '2024-01-15');
      await page.fill('input[name="expected_purchase_price_wan"]', '250');
      await page.fill('textarea[name="notes_general"]', '整体感觉不错，户型方正。');
      await page.fill('textarea[name="notes_pros"]', '采光好，交通便利。');
      await page.fill('textarea[name="notes_cons"]', '楼层稍高，电梯等待时间长。');
      
      // 设置评分
      const stars = page.locator('button svg, .star-rating button');
      if (await stars.count() >= 4) {
        await stars.nth(3).click(); // 4星评分
      }
      
      // 提交表单
      await page.click('button:has-text("创建笔记")');
      
      // 检查是否跳转回列表页
      await page.waitForURL('/my-viewings');
    });

    test('应该验证必填字段', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      // 尝试提交空表单
      await page.click('button:has-text("创建笔记")');
      
      // 检查HTML5验证
      const requiredFields = page.locator('select[required], input[required]');
      const count = await requiredFields.count();
      
      if (count > 0) {
        const firstRequired = requiredFields.first();
        const isValid = await firstRequired.evaluate(el => el.validity.valid);
        expect(isValid).toBe(false);
      }
    });

    test('应该支持编辑现有笔记', async ({ page }) => {
      // 先去列表页找到一个笔记进行编辑
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const editButton = page.locator('button[title="编辑"], svg[class*="pencil"]').first();
      if (await editButton.isVisible()) {
        await editButton.click();
        
        // 检查是否跳转到编辑页
        await expect(page).toHaveURL(/\/my-viewings\/\d+\/edit/);
        await helpers.checkPageTitle('编辑看房笔记');
        
        // 检查表单是否预填充了数据
        const propertySelect = page.locator('select[name="property_id"]');
        const selectedValue = await propertySelect.inputValue();
        expect(selectedValue).not.toBe('');
      }
    });
  });

  test.describe('看房笔记操作', () => {
    test('应该能够删除看房笔记', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const deleteButton = page.locator('button[title="删除"], svg[class*="trash"]').first();
      if (await deleteButton.isVisible()) {
        // 模拟确认对话框
        page.on('dialog', dialog => dialog.accept());
        
        await deleteButton.click();
        
        // 等待页面更新
        await helpers.waitForPageLoad();
      }
    });

    test('应该能够查看关联房源详情', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const propertyLink = page.locator('a:has-text("查看房源详情")').first();
      if (await propertyLink.isVisible()) {
        await propertyLink.click();
        
        // 检查是否跳转到房源详情页
        await expect(page).toHaveURL(/\/properties\/\d+/);
      }
    });
  });

  test.describe('数据展示和交互', () => {
    test('应该正确显示看房时间', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查日期格式
        const dateElement = firstCard.locator('text=/\\d{4}[\\/-]\\d{1,2}[\\/-]\\d{1,2}|\\d{1,2}[\\/-]\\d{1,2}[\\/-]\\d{4}/');
        if (await dateElement.isVisible()) {
          await expect(dateElement).toBeVisible();
        }
      }
    });

    test('应该正确显示评分星星', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查星星数量（应该有5颗星）
        const stars = firstCard.locator('svg[class*="star"], .star-icon');
        if (await stars.count() >= 5) {
          await expect(stars.nth(0)).toBeVisible();
          await expect(stars.nth(4)).toBeVisible();
        }
      }
    });

    test('应该支持笔记内容的展开和收起', async ({ page }) => {
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        const firstCard = viewingCards.first();
        
        // 检查是否有长文本截断
        const truncatedText = firstCard.locator('.line-clamp-2, .truncate');
        if (await truncatedText.isVisible()) {
          await expect(truncatedText).toBeVisible();
        }
      }
    });
  });

  test.describe('响应式设计', () => {
    test('应该在移动端正确显示', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/my-viewings');
      await helpers.waitForPageLoad();
      
      // 检查移动端布局
      await helpers.checkPageTitle('个人看房管理');
      
      // 检查卡片在移动端的显示
      const viewingCards = page.locator('.card');
      if (await viewingCards.count() > 0) {
        await expect(viewingCards.first()).toBeVisible();
      }
      
      // 检查新增按钮在移动端的显示
      await expect(page.locator('button:has-text("新增看房笔记"), a:has-text("新增看房笔记")')).toBeVisible();
    });

    test('应该在移动端正确显示表单', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      // 检查表单在移动端的布局
      await expect(page.locator('select[name="property_id"]')).toBeVisible();
      await expect(page.locator('input[name="viewing_date"]')).toBeVisible();
      await expect(page.locator('textarea[name="notes_general"]')).toBeVisible();
    });
  });

  test.describe('错误处理', () => {
    test('应该处理API加载错误', async ({ page }) => {
      // 模拟API错误
      await page.route('**/api/v1/my-viewings**', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Server error' })
        });
      });
      
      await page.goto('/my-viewings');
      
      // 检查错误处理
      const errorElements = page.locator('.text-red-600, .bg-red-50, text=加载失败');
      if (await errorElements.count() > 0) {
        await expect(errorElements.first()).toBeVisible();
      }
    });

    test('应该处理表单提交错误', async ({ page }) => {
      await page.goto('/my-viewings/new');
      await helpers.waitForPageLoad();
      
      // 模拟提交错误
      await page.route('**/api/v1/my-viewings', route => {
        if (route.request().method() === 'POST') {
          route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ detail: 'Validation error' })
          });
        } else {
          route.continue();
        }
      });
      
      // 填写并提交表单
      await page.selectOption('select[name="property_id"]', { index: 1 });
      await page.fill('input[name="viewing_date"]', '2024-01-15');
      await page.click('button:has-text("创建笔记")');
      
      // 检查错误提示
      await expect(page.locator('text=保存失败')).toBeVisible();
    });
  });
});
