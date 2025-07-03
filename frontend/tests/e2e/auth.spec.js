import { test, expect } from '@playwright/test';
import { LoginPage } from './pages/LoginPage.js';
import { TestHelpers } from './utils/test-helpers.js';

test.describe('用户认证模块', () => {
  let loginPage;
  let helpers;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    helpers = new TestHelpers(page);
  });

  test.describe('登录功能', () => {
    test('应该正确显示登录页面元素', async () => {
      await loginPage.goto();
      await loginPage.checkPageElements();
    });

    test('应该能够成功登录', async () => {
      await loginPage.goto();
      await loginPage.login('testuser', 'testpass123');
      await loginPage.checkLoginSuccess();
    });

    test('应该能够使用记住我功能', async () => {
      await loginPage.goto();
      await loginPage.testRememberMe();
      await loginPage.login('testuser', 'testpass123', true);
      await loginPage.checkLoginSuccess();
    });

    test('应该正确处理错误的用户名', async () => {
      await loginPage.goto();
      await loginPage.login('wronguser', 'testpass123');
      await loginPage.checkLoginFailure('用户名或密码错误');
    });

    test('应该正确处理错误的密码', async () => {
      await loginPage.goto();
      await loginPage.login('testuser', 'wrongpassword');
      await loginPage.checkLoginFailure('用户名或密码错误');
    });

    test('应该验证必填字段', async () => {
      await loginPage.goto();
      await loginPage.checkFormValidation();
    });

    test('应该显示加载状态', async () => {
      await loginPage.goto();
      
      // 模拟慢速网络
      await loginPage.page.route('**/api/v1/auth/login', async route => {
        await new Promise(resolve => setTimeout(resolve, 2000));
        await route.continue();
      });
      
      await loginPage.login('testuser', 'testpass123');
      await loginPage.checkLoadingState();
    });

    test('应该能够跳转到注册页面', async () => {
      await loginPage.goto();
      await loginPage.clickRegisterLink();
      await expect(loginPage.page.locator('h2:has-text("创建新账户")')).toBeVisible();
    });

    test('应该显示微信登录选项', async () => {
      await loginPage.goto();
      await expect(loginPage.page.locator('button:has-text("微信登录")')).toBeVisible();
    });
  });

  test.describe('注册功能', () => {
    test('应该正确显示注册页面元素', async ({ page }) => {
      await page.goto('/register');
      
      await expect(page.locator('h2:has-text("创建新账户")')).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="nickname"]')).toBeVisible();
      await expect(page.locator('input[name="phone"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('input[name="confirmPassword"]')).toBeVisible();
      await expect(page.locator('input[name="agree-terms"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('应该能够成功注册新用户', async ({ page }) => {
      await page.goto('/register');
      
      const timestamp = Date.now();
      const username = `newuser${timestamp}`;
      
      await page.fill('input[name="username"]', username);
      await page.fill('input[name="nickname"]', '新用户');
      await page.fill('input[name="phone"]', '13900139000');
      await page.fill('input[name="password"]', 'newpass123');
      await page.fill('input[name="confirmPassword"]', 'newpass123');
      await page.check('input[name="agree-terms"]');
      
      await page.click('button[type="submit"]');
      
      // 注册成功后应该跳转到首页
      await page.waitForURL('/');
      await expect(page.locator('text=数据看板')).toBeVisible();
    });

    test('应该验证密码确认', async ({ page }) => {
      await page.goto('/register');
      
      await page.fill('input[name="username"]', 'testuser2');
      await page.fill('input[name="password"]', 'password123');
      await page.fill('input[name="confirmPassword"]', 'differentpassword');
      await page.check('input[name="agree-terms"]');
      
      await page.click('button[type="submit"]');
      
      await expect(page.locator('text=两次输入的密码不一致')).toBeVisible();
    });

    test('应该要求同意服务条款', async ({ page }) => {
      await page.goto('/register');
      
      await page.fill('input[name="username"]', 'testuser3');
      await page.fill('input[name="password"]', 'password123');
      await page.fill('input[name="confirmPassword"]', 'password123');
      // 不勾选同意条款
      
      const submitButton = page.locator('button[type="submit"]');
      await expect(submitButton).toBeDisabled();
    });

    test('应该能够跳转到登录页面', async ({ page }) => {
      await page.goto('/register');
      await page.click('a:has-text("登录已有账户")');
      await page.waitForURL('/login');
      await expect(page.locator('h2:has-text("登录您的账户")')).toBeVisible();
    });
  });

  test.describe('认证状态管理', () => {
    test('应该在登录后保持认证状态', async ({ page }) => {
      await helpers.loginTestUser();
      
      // 刷新页面
      await page.reload();
      await page.waitForLoadState('networkidle');
      
      // 应该仍然在首页，而不是被重定向到登录页
      await expect(page).toHaveURL('/');
      await expect(page.locator('text=数据看板')).toBeVisible();
    });

    test('应该能够正确登出', async ({ page }) => {
      await helpers.loginTestUser();
      
      // 点击用户菜单
      await page.click('button:has-text("Test User"), button:has-text("testuser")');
      await page.click('text=退出登录');
      
      // 应该跳转到登录页
      await page.waitForURL('/login');
      await expect(page.locator('h2:has-text("登录您的账户")')).toBeVisible();
    });

    test('应该在未登录时重定向到登录页', async ({ page }) => {
      // 直接访问需要认证的页面
      await page.goto('/properties');
      
      // 应该被重定向到登录页
      await page.waitForURL('/login');
      await expect(page.locator('h2:has-text("登录您的账户")')).toBeVisible();
    });

    test('应该在token过期时重定向到登录页', async ({ page }) => {
      await helpers.loginTestUser();
      
      // 模拟token过期的API响应
      await page.route('**/api/v1/**', route => {
        route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Token expired' })
        });
      });
      
      // 尝试访问需要认证的API
      await page.goto('/properties');
      
      // 应该被重定向到登录页
      await page.waitForURL('/login');
    });
  });

  test.describe('错误处理', () => {
    test('应该处理网络错误', async ({ page }) => {
      await page.goto('/login');
      
      // 模拟网络错误
      await page.route('**/api/v1/auth/login', route => {
        route.abort('failed');
      });
      
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'testpass123');
      await page.click('button[type="submit"]');
      
      // 应该显示错误信息
      await expect(page.locator('.text-red-600, .bg-red-50')).toBeVisible();
    });

    test('应该处理服务器错误', async ({ page }) => {
      await page.goto('/login');
      
      // 模拟服务器错误
      await page.route('**/api/v1/auth/login', route => {
        route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Internal server error' })
        });
      });
      
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'testpass123');
      await page.click('button[type="submit"]');
      
      // 应该显示错误信息
      await expect(page.locator('.text-red-600, .bg-red-50')).toBeVisible();
    });
  });

  test.describe('响应式设计', () => {
    test('应该在移动端正确显示', async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 667 });
      await page.goto('/login');
      
      // 检查页面元素在移动端的显示
      await expect(page.locator('h2:has-text("登录您的账户")')).toBeVisible();
      await expect(page.locator('input[name="username"]')).toBeVisible();
      await expect(page.locator('input[name="password"]')).toBeVisible();
      await expect(page.locator('button[type="submit"]')).toBeVisible();
      
      // 测试登录功能
      await page.fill('input[name="username"]', 'testuser');
      await page.fill('input[name="password"]', 'testpass123');
      await page.click('button[type="submit"]');
      
      await page.waitForURL('/');
      await expect(page.locator('text=数据看板')).toBeVisible();
    });
  });
});
