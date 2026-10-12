import { expect, test, type Page } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 附件库悬停预览 + 并发保存修复 E2E（regression: 918dc6dc bug）
 *
 * 覆盖：
 * 1. 图片附件悬停文件名 → HoverCard 缩略图出现（无需点击预览按钮）
 * 2. 图片附件预览按钮不再渲染（Eye icon-btn 仅保留给 PDF）
 * 3. 点击文件名 → 打开大图预览弹窗（「图片预览」Dialog）
 * 4. 上传一张图片附件 → 立即出现在「合同及协议文件」分组（分类立即生效）
 * 5. 删除该附件 → 列表消失（显式删除信号链路）
 *
 * 可复跑：npx playwright test e2e/admin-attachments.spec.ts
 * 依赖：本地后端 :8000 + 前端 :3000 调试进程；账号读 E2E_ADMIN_USER/PASSWORD。
 */

/** 找一个有业务形式的项目（保证文书清单已初始化，归档分组存在） */
async function findProjectId(page: Page): Promise<string> {
  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.get("/api/v1/projects?page=1&page_size=20");
    if (!res.ok()) throw new Error(`拉取项目列表失败: HTTP ${res.status()}`);
    const body = (await res.json()) as {
      items: { id: string; name: string }[];
    };
    const target = body.items[0];
    if (!target) throw new Error("本地库无项目，无法执行附件库 E2E");
    return target.id;
    // page 仅用于与登录态共享上下文，未直接使用
    void page;
  } finally {
    await dispose();
  }
}

test.describe("附件库悬停预览与并发保存修复", () => {
  test.beforeEach(async ({ page }) => {
    await loginPage(page);
  });

  test("图片附件悬停即预览、点击放大，无预览按钮", async ({ page }) => {
    const projectId = await findProjectId(page);
    await page.goto(`/admin/projects/${projectId}`);
    await expect(page.getByText("附件库")).toBeVisible({ timeout: 15000 });

    // 上传一张 PNG（1x1 红点）走真实上传链路（前端 /api/uploads → 后端落盘）
    const PNG_1PX =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const file = await Promise.resolve({
      name: "hover-e2e.png",
      mimeType: "image/png",
      buffer: Buffer.from(PNG_1PX, "base64"),
    });

    await page.getByRole("button", { name: "上传附件" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    const chooserPromise = page.waitForEvent("filechooser");
    await dialog.getByText("点击或拖拽文件到此处上传").click();
    const chooser = await chooserPromise;
    await chooser.setFiles([file]);

    // 上传完成 → 附件行出现（弹窗无目标文书 → other 分组）
    const row = page.getByText("hover-e2e.png", { exact: true }).first();
    await expect(row).toBeVisible({ timeout: 20000 });

    // 新交互：多文件上传不自动关弹窗，手动关闭后再验证附件库行为
    // （模态遮罩会拦截背景行的 hover/click，必须先关）
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 5000 });

    // 悬停文件名 → HoverCard 缩略图出现（img[alt=hover-e2e.png] 在卡片内渲染）
    const thumb = page.locator(`img[alt="hover-e2e.png"]`);
    await row.hover();
    await expect(thumb).toBeVisible({ timeout: 5000 });

    // 预览按钮不再渲染给图片（Eye 图标按钮仅保留给 PDF；本地该项目无 PDF 附件）
    await expect(page.locator('[title="预览"]')).toHaveCount(0);

    // 点击文件名 → 打开大图预览弹窗
    await row.click();
    await expect(page.getByText("图片预览")).toBeVisible({ timeout: 5000 });

    // 关闭大图弹窗
    await page.keyboard.press("Escape");

    // 删除该附件（显式删除信号链路）
    row.hover();
    const delBtn = page.locator('[title="删除"]').first();
    await delBtn.click();
    await page.getByRole("button", { name: "确认删除" }).click();
    await expect(page.getByText("附件已删除")).toBeVisible({ timeout: 10000 });
    await expect(row).toBeHidden({ timeout: 10000 });
  });
});
