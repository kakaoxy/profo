import { test, expect } from "@playwright/test";
import { loginPage, createApiContext } from "./helpers/auth";

/**
 * 验证 admin/projects 编辑态（就地编辑器 InfoInlineEditor）：
 * 楼盘字典选择器独占一行，详细地址紧随其下（同一栅格流，相邻可对照）。
 * 截图工件：e2e/.artifacts/dict-picker-project-edit.png
 */
test("projects 编辑态：详细地址在小区选择器下方", async ({ page }) => {
  test.setTimeout(60000);
  await loginPage(page);
  await page.setViewportSize({ width: 1440, height: 1200 });

  // 经 API 取任一项目 id 直达详情（列表行首链接指向台账页，非详情路由）
  const { ctx, dispose } = await createApiContext();
  let projectId: string;
  try {
    const res = await ctx.get("/api/v1/projects?page=1&page_size=20");
    if (!res.ok()) throw new Error(`拉取项目列表失败: HTTP ${res.status()}`);
    const body = (await res.json()) as { items: { id: string }[] };
    if (!body.items?.length) throw new Error("本地库无项目，无法执行编辑态布局 E2E");
    projectId = body.items[0].id;
  } finally {
    dispose();
  }
  await page.goto(`/admin/projects/${projectId}`, { waitUntil: "domcontentloaded" });

  // 项目信息卡卡头「编辑」（hover:underline 样式特征，区分顶栏 TopToolbar 同名按钮）
  // 进入就地编辑态；点击会触发全量刷新 + 骨架，选择器卡片重现后即编辑态
  const editBtn = page.locator("button.hover\\:underline", { hasText: "编辑" }).first();
  await editBtn.waitFor({ state: "visible", timeout: 15000 });
  await editBtn.click();

  // 选择器卡片根容器（@container 类为页面唯一，避开刷新骨架/侧栏卡干扰）
  const pickerCard = page.locator(".\\@container.flex.flex-col.gap-4.rounded-cards").first();
  await pickerCard.waitFor({ state: "visible", timeout: 30000 });

  const pickerBox = await pickerCard.boundingBox();
  expect(pickerBox).not.toBeNull();

  // 详细地址输入框（SimpleInputField 无 placeholder）：取其 label 同层级 FormItem 内的 input。
  // 用 label 文本反查：label 与 input 同处一个 FormItem div；选择器卡片不应包含该 input
  const addressField = page
    .locator("label")
    .filter({ hasText: "详细地址" })
    .locator("xpath=following-sibling::div//input | ../following-sibling::div//input")
    .first();
  await expect(addressField).toBeVisible({ timeout: 10000 });
  const addressBox = await addressField.boundingBox();
  expect(addressBox).not.toBeNull();
  const gap = addressBox!.y - (pickerBox!.y + pickerBox!.height);
  expect(gap).toBeGreaterThanOrEqual(0);
  expect(gap).toBeLessThan(160);
  // 详情页主栏 lg:col-span-8（max-w-1200 容器 ≈ 760px）：选择器应占满主栏（>600px），
  // 即「独占一行」而非半列（半列仅 ≈360px）
  expect(pickerBox!.width).toBeGreaterThan(600);

  await page.screenshot({ path: "e2e/.artifacts/dict-picker-project-edit.png", fullPage: false });
});
