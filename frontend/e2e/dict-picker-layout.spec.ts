import { test, expect, type Page } from "@playwright/test";
import { loginPage } from "./helpers/auth";

/**
 * 布局迭代验证：楼盘字典选择器（DictAddressPicker）在 admin/marketing/new 与
 * admin/projects 新建表单中的布局与风格回归。
 *
 * 断言：
 * 1. marketing/new：选择器卡片（rounded-cards 白底容器）独占一行、宽于半栏；
 *    触发按钮为 h-11 Steep 输入风格；无「手动填写地址」入口；
 *    小区搜索 popover 可打开。
 * 2. projects 新建对话框：选择器独占第一行，行政区/商圈/详细地址三列在第二行。
 * 3. 产出截图工件（e2e/.artifacts/）供人工复核。
 */

/** 打开小区搜索 popover（含 hydration 重试：首页 SSR 后 RSC 水合前点击可能被吞） */
async function openCommunityPopover(page: Page) {
  const card = page.locator(".rounded-cards.border.border-dove\\/40.bg-white").first();
  await card.waitFor({ state: "visible", timeout: 15000 });
  const trigger = card.getByRole("combobox").first();
  for (let i = 0; i < 3; i++) {
    await trigger.click();
    const opened = await page
      .getByPlaceholder("输入小区名/地址/别名搜索")
      .isVisible()
      .catch(() => false);
    if (opened) return { card, trigger };
    await page.waitForTimeout(500);
  }
  throw new Error("小区搜索 popover 未能打开（重试 3 次）");
}

test.describe("DictAddressPicker 布局迭代", () => {
  test("marketing/new 选择器卡片独占一行且风格统一", async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/marketing/new", { waitUntil: "domcontentloaded" });

    const { card, trigger } = await openCommunityPopover(page);

    // 触发按钮：h-11 Steep 输入风格
    const box = await trigger.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThanOrEqual(40); // h-11 = 44px，允许渲染误差

    // 营销表单无手动入口
    await expect(card.getByText("手动填写地址")).toHaveCount(0);

    // 空态引导文案
    await expect(card.getByText("从楼盘字典选择地址")).toBeVisible();

    // 卡片宽度：创建页左栏 lg:col-span-8，断言 > 视口 40%
    const cardBox = await card.boundingBox();
    expect(cardBox!.width).toBeGreaterThan(1440 * 0.4);

    await page.keyboard.press("Escape");
    await page.screenshot({ path: "e2e/.artifacts/dict-picker-marketing-new.png", fullPage: true });
  });

  test("选中小区后三栏级联渲染", async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/marketing/new", { waitUntil: "domcontentloaded" });

    const { card } = await openCommunityPopover(page);
    const searchInput = page.getByPlaceholder("输入小区名/地址/别名搜索");
    // 泳真实小区名首字（库内现有小区，如泗塘/呼玛/共康）；避免触发「新增小区」入口
    await searchInput.fill("泗塘");
    await page.waitForTimeout(800); // 防抖 300ms + 请求

    const options = page.locator("[data-radix-popper-content-wrapper] button");
    const optionCount = await options.count();
    // 弹层里唯一按钮若是「新增小区」则视为无真实数据，跳过（不产生脏数据）
    const hasCreateEntry = optionCount === 1;
    test.skip(hasCreateEntry, "本地库无匹配小区，跳过三栏断言");

    await options.first().click();
    await page.waitForTimeout(800);

    // 三栏级联：楼栋/楼层/户室 栏头可见
    await expect(card.getByText("楼栋", { exact: false }).first()).toBeVisible();
    await expect(card.getByText("户室", { exact: false }).first()).toBeVisible();

    await page.screenshot({ path: "e2e/.artifacts/dict-picker-casc.png", fullPage: true });
  });

  test("projects 新建对话框选择器独占第一行", async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto("/admin/projects", { waitUntil: "domcontentloaded" });

    const newBtn = page.getByRole("button", { name: /新建项目/ }).first();
    await newBtn.waitFor({ state: "visible", timeout: 15000 });
    await newBtn.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const card = dialog.locator(".rounded-cards.border.border-dove\\/40.bg-white").first();
    await card.waitFor({ state: "visible", timeout: 10000 });
    const cardBox = await card.boundingBox();
    expect(cardBox).not.toBeNull();
    // 独占一行：宽度接近对话框内容区（sm:max-w-187.5 ≈ 750px）
    expect(cardBox!.width).toBeGreaterThan(560);

    // 行政区/商圈/详细地址与选择器不同行（y 差距 > 100px）
    const districtLabel = dialog.getByText("行政区", { exact: false }).first();
    await expect(districtLabel).toBeVisible();
    const dBox = await districtLabel.boundingBox();
    expect(dBox!.y - cardBox!.y).toBeGreaterThan(100);

    await page.screenshot({
      path: "e2e/.artifacts/dict-picker-project-dialog.png",
      fullPage: false,
    });
  });
});
