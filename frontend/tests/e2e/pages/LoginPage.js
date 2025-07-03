import { expect } from '@playwright/test';

/**
 * 登录页面对象模型
 */
export class LoginPage {
  constructor(page) {
    this.page = page;
    
    // 页面元素选择器
    this.usernameInput = 'input[name="username"]';
    this.passwordInput = 'input[name="password"]';
    this.rememberMeCheckbox = 'input[name="remember-me"]';
    this.loginButton = 'button[type="submit"]';
    this.registerLink = 'a[href="/register"]';
    this.wechatLoginButton = 'button:has-text("微信登录")';
    this.errorMessage = '.text-red-600, .bg-red-50';
    this.loadingIndicator = '.animate-spin';
  }

  /**
   * 导航到登录页面
   */
  async goto() {
    await this.page.goto('/login');
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * 检查页面元素是否存在
   */
  async checkPageElements() {
    await expect(this.page.locator('h2')).toContainText('登录您的账户');
    await expect(this.page.locator(this.usernameInput)).toBeVisible();
    await expect(this.page.locator(this.passwordInput)).toBeVisible();
    await expect(this.page.locator(this.loginButton)).toBeVisible();
    await expect(this.page.locator(this.registerLink)).toBeVisible();
    await expect(this.page.locator(this.wechatLoginButton)).toBeVisible();
  }

  /**
   * 执行登录操作
   */
  async login(username, password, rememberMe = false) {
    await this.page.fill(this.usernameInput, username);
    await this.page.fill(this.passwordInput, password);
    
    if (rememberMe) {
      await this.page.check(this.rememberMeCheckbox);
    }
    
    await this.page.click(this.loginButton);
  }

  /**
   * 检查登录成功
   */
  async checkLoginSuccess() {
    await this.page.waitForURL('/');
    await expect(this.page.locator('text=数据看板')).toBeVisible();
  }

  /**
   * 检查登录失败
   */
  async checkLoginFailure(expectedError) {
    await expect(this.page.locator(this.errorMessage)).toContainText(expectedError);
  }

  /**
   * 检查加载状态
   */
  async checkLoadingState() {
    const loading = this.page.locator(this.loadingIndicator);
    if (await loading.isVisible()) {
      await loading.waitFor({ state: 'hidden', timeout: 10000 });
    }
  }

  /**
   * 点击注册链接
   */
  async clickRegisterLink() {
    await this.page.click(this.registerLink);
    await this.page.waitForURL('/register');
  }

  /**
   * 点击微信登录
   */
  async clickWechatLogin() {
    await this.page.click(this.wechatLoginButton);
  }

  /**
   * 检查表单验证
   */
  async checkFormValidation() {
    // 尝试提交空表单
    await this.page.click(this.loginButton);
    
    // 检查HTML5验证
    const usernameValidity = await this.page.locator(this.usernameInput).evaluate(el => el.validity.valid);
    const passwordValidity = await this.page.locator(this.passwordInput).evaluate(el => el.validity.valid);
    
    expect(usernameValidity).toBe(false);
    expect(passwordValidity).toBe(false);
  }

  /**
   * 测试记住我功能
   */
  async testRememberMe() {
    await this.page.check(this.rememberMeCheckbox);
    const isChecked = await this.page.locator(this.rememberMeCheckbox).isChecked();
    expect(isChecked).toBe(true);
  }
}
