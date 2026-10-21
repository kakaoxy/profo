import { test, expect, type Page } from "@playwright/test";
import { loginPage } from "./helpers/auth";

/**
 * 回归用例：admin/projects 新建项目弹窗 —— 选择「朝向」/「业务形式」后
 * 顶部 Tab 栏（基础信息/代理协议/业主信息）必须始终留在弹窗可视区内。
 *
 * 缺陷机制：ScrollArea 根节点仅 `relative` 无裁剪，内容中绝对定位的
 * RadioGroupItem（sr-only input/button）以根节点为包含块，把根的
 * scrollHeight 撑大于 clientHeight（overflow: visible）→ 根成为可滚动容器；
 * 点击 chip 后浏览器对聚焦元素做 scroll-into-view，把 Tabs 容器 scrollTop
 * 拉到底，tabbar 被顶出弹窗上边界（1280x720 实测 top 170 → -26）。
 *
 * 断言：
 * 1. 内容区滚到底后点击「朝向」chip，tabbar 仍完整可见且在弹窗内；
 * 2. 再点「业务形式」chip，tabbar 依然稳定；
 * 3. 滚动容器（ScrollArea root / Tabs root）scrollTop 保持 0，无隐藏滚动；
 * 4. 内容区仍可正常滚动（修复不能用 overflow:hidden 把滚动能力弄丢）；
 * 5. 产出截图工件 e2e/.artifacts/project-create-orientation.png 供人工复核。
 */

const VIEWPORTS = [
  { width: 1280, height: 720 }, // 缺陷可复现的最小高度
  { width: 1440, height: 800 },
];

async function openCreateDialog(page: Page) {
  await page.goto("/admin/projects", { waitUntil: "domcontentloaded" });
  const newBtn = page.getByRole("button", { name: /新建项目/ }).first();
  await newBtn.waitFor({ state: "visible", timeout: 15000 });
  await newBtn.click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // 等字体加载完成（布局宽度收敛，否则 boundingBox 抖动导致断言飘）
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  return dialog;
}

/** 读取弹窗内关键元素的几何/滚动状态 */
async function readLayout(page: Page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
    const tablist = dialog.querySelector('[role="tablist"]') as HTMLElement;
    const tabsRoot = tablist.closest(".overflow-hidden") as HTMLElement;
    // ⚠️ 必须从 Tabs 祖先链内取 ScrollArea：dict 选择器内部也有 ScrollArea，
    // 用 dialog.querySelector 会取到错的节点。
    const scrollAreaRoot = tabsRoot.querySelector('[data-slot="scroll-area"]') as HTMLElement;
    const viewport = scrollAreaRoot.querySelector(
      '[data-slot="scroll-area-viewport"]',
    ) as HTMLElement;
    const dRect = dialog.getBoundingClientRect();
    const tRect = tablist.getBoundingClientRect();
    return {
      dialogTop: dRect.top,
      dialogBottom: dRect.bottom,
      tablistTop: tRect.top,
      tablistBottom: tRect.bottom,
      tabsRootScrollTop: tabsRoot.scrollTop,
      tabsRootScrollHeight: tabsRoot.scrollHeight,
      tabsRootClientHeight: tabsRoot.clientHeight,
      scrollAreaScrollTop: scrollAreaRoot.scrollTop,
      scrollAreaScrollHeight: scrollAreaRoot.scrollHeight,
      scrollAreaClientHeight: scrollAreaRoot.clientHeight,
      viewportScrollTop: viewport.scrollTop,
      viewportScrollHeight: viewport.scrollHeight,
      viewportClientHeight: viewport.clientHeight,
    };
  });
}

/** 内容区 viewport（Tabs 祖先链内的唯一 ScrollArea，避开 dict 选择器内部的） */
function contentViewport(page: Page) {
  return page
    .locator('[role="tablist"]')
    .locator("xpath=ancestor::div[contains(@class,'overflow-hidden')][1]")
    .locator('[data-slot="scroll-area-viewport"]')
    .first();
}

/** 内容区滚到底（真实滚轮），使朝向/业务形式 chip 进入可视区 */
async function scrollContentToBottom(page: Page) {
  const viewport = contentViewport(page);
  const box = (await viewport.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  for (let i = 0; i < 6; i++) {
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(80);
  }
  // 等到滚动到底（wheel 平滑滚动收尾）
  await page.waitForTimeout(300);
}

/** 用真实鼠标坐标点击 chip（不触发 Playwright 的 scrollIntoViewIfNeeded） */
async function clickChipByCoordinate(page: Page, selector: string) {
  const label = page.locator(selector);
  await expect(label).toBeVisible();
  const box = (await label.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(400);
}

for (const size of VIEWPORTS) {
  test(`选择朝向/业务形式后 tabbar 不被顶出弹窗（${size.width}x${size.height}）`, async ({
    page,
  }) => {
    await loginPage(page);
    await page.setViewportSize(size);
    const dialog = await openCreateDialog(page);

    const before = await readLayout(page);
    // 前提：tabbar 完整位于弹窗内
    expect(before.tablistTop).toBeGreaterThanOrEqual(before.dialogTop);

    await scrollContentToBottom(page);
    const scrolled = await readLayout(page);
    expect(scrolled.viewportScrollTop).toBeGreaterThan(0); // 内容区确实可滚动

    // 点击「南北」
    await clickChipByCoordinate(page, 'label[for="orientation-南北"]');
    const afterOrientation = await readLayout(page);

    // 1) tabbar 仍在弹窗内且未被上移
    expect(afterOrientation.tablistTop).toBeGreaterThanOrEqual(afterOrientation.dialogTop);
    expect(afterOrientation.tablistBottom).toBeLessThanOrEqual(afterOrientation.dialogBottom);
    expect(Math.abs(afterOrientation.tablistTop - before.tablistTop)).toBeLessThan(2);

    // 2) 隐藏溢出容器不得被内部 scroll-into-view 拖动
    expect(afterOrientation.tabsRootScrollTop).toBe(0);
    expect(afterOrientation.scrollAreaScrollTop).toBe(0);

    // 3) 点击生效（选中态落到「南北」）
    await expect(page.locator('input[value="南北"]')).toBeChecked();

    // 点击「代理美化」
    await clickChipByCoordinate(page, 'label[for="business-form-agent"]');
    const afterBusinessForm = await readLayout(page);
    expect(afterBusinessForm.tablistTop).toBeGreaterThanOrEqual(afterBusinessForm.dialogTop);
    expect(afterBusinessForm.tabsRootScrollTop).toBe(0);
    await expect(page.locator('input[value="agent"]')).toBeChecked();

    // 4) 内容区滚动手感未破坏：仍可上滚回顶部且 tabbar 不动
    const viewport = contentViewport(page);
    const vpBox = (await viewport.boundingBox())!;
    await page.mouse.move(vpBox.x + vpBox.width / 2, vpBox.y + vpBox.height / 2);
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(300);
    const backTop = await readLayout(page);
    expect(backTop.viewportScrollTop).toBe(0);
    expect(backTop.tablistTop).toBeGreaterThanOrEqual(backTop.dialogTop);

    // 5) Tab 切换仍可用（tabbar 可点）
    await dialog.getByRole("tab", { name: "代理协议" }).click();
    await expect(dialog.getByRole("tab", { name: "代理协议" })).toHaveAttribute(
      "data-state",
      "active",
    );

    await page.screenshot({
      path: `e2e/.artifacts/project-create-orientation-${size.width}x${size.height}.png`,
    });
  });
}
