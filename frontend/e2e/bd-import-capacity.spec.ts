import { expect, test } from "@playwright/test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loginPage } from "./helpers/auth";

/**
 * 楼盘字典导入页 L2 修复验证（承载力报告 M6 前端预检 + 口径对齐）：
 * 1. 页面文案不再出现「2GB」承诺，上限统一为 100MB（nginx 网关口径）
 * 2. 前端预检：>100MB 文件不上传直接 toast 拒绝（不产生导入任务）
 * 3. 正常大小文件走完整上传创建任务（后端互斥/装载由后端 E2E 覆盖）
 * 4. 产出截图工件（e2e/.artifacts/）供人工复核
 *
 * 注：input[type=file] 为 hidden（触发按钮 click 打开选择框），
 * 走 filechooser 事件路径（真实用户行为）；>50MB buffer 受 Playwright
 * 限制，写临时文件传路径。
 *
 * ⚠️ 已知残留：用例 3 会在 dev 库 bd_import_tasks 留 1 条 pw-e2e 前缀任务行
 * （终态，不拦截重跑；无删除任务的 API，与历史任务行同性质，可接受）。
 */

/**
 * 注入文件到隐藏 input[type=file].
 * input 为 hidden（className=hidden），setInputFiles 仅要求元素 attached
 * （不要求 visible），比 filechooser 对水合时序更鲁棒；同样触发真实
 * React onChange → 预检/上传代码路径一致。
 */
async function uploadViaInput(
  page: import("@playwright/test").Page,
  file: { name: string; mimeType: string; buffer: Buffer } | string,
) {
  await page.setInputFiles('input[type="file"]', file);
}

/**
 * 进入导入页并回到步骤 1（上传区）.
 * 页面按「最近任务」状态定位 stepper：历史已完成任务会让页面停在步骤 4，
 * 上传区不渲染 —— 真实用户路径是点「去小区库」重置 activeTask 回步骤 1。
 * 竞态：挂载时的 loadTasks 若在点击后才 resolve，会把页面拉回步骤 4，
 * 故需轮询确认「上传按钮稳定可见」（连续两次间隔检查均在步骤 1）。
 */
async function gotoUploadStep(page: import("@playwright/test").Page) {
  await loginPage(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/building-dictionary/import", { waitUntil: "domcontentloaded" });
  await expect(page.getByText("上传文件").first()).toBeVisible();

  const backBtn = page.getByRole("button", { name: "去小区库" });
  const uploadBtn = page.getByRole("button", { name: /选择文件上传/ });
  for (let i = 0; i < 6; i++) {
    if (await backBtn.isVisible().catch(() => false)) {
      await backBtn.click();
    }
    if (await uploadBtn.isVisible().catch(() => false)) {
      // 等一拍确认 loadTasks 不会把页面拉回步骤 4
      await page.waitForTimeout(800);
      if (await uploadBtn.isVisible().catch(() => false)) return;
    }
    await page.waitForTimeout(500);
  }
  throw new Error("上传区未能稳定回到步骤 1（loadTasks 与去小区库点击竞态）");
}

test.describe("楼盘字典导入 L2 修复", () => {
  test("文案口径对齐：无 2GB 承诺，统一 100MB", async ({ page }) => {
    await gotoUploadStep(page);

    // 全页无 2GB 承诺（口径已被网关 100M 否决）
    await expect(page.getByText(/2\s*GB/i)).toHaveCount(0);
    // 上限统一 100MB（stepper / 提示 / 按钮）
    await expect(page.getByText(/≤\s*100\s*MB/).first()).toBeVisible();

    await page.screenshot({ path: "e2e/.artifacts/bd-import-copy-100mb.png", fullPage: true });
  });

  test("前端预检：>100MB 文件直接拒绝且不创建任务", async ({ page }) => {
    await gotoUploadStep(page);

    const rowsBefore = await page.locator("table tbody tr").count();

    // 101MB 临时文件（Playwright buffer 上限 50MB，大文件走磁盘路径）
    const dir = mkdtempSync(join(tmpdir(), "pw-bd-"));
    const bigPath = join(dir, "oversize.zip");
    writeFileSync(bigPath, Buffer.alloc(101 * 1024 * 1024 + 1));
    try {
      await uploadViaInput(page, bigPath);

      // 预检同步拒绝：toast 提示 100MB 上限（sonner toast 容器）
      await expect(page.locator("[data-sonner-toast]").first()).toContainText("100MB", { timeout: 5000 });

      // 任务历史未新增（没有走上传链路）
      await page.waitForTimeout(500);
      const rowsAfter = await page.locator("table tbody tr").count();
      expect(rowsAfter).toBe(rowsBefore);

      await page.screenshot({ path: "e2e/.artifacts/bd-import-oversize-reject.png", fullPage: true });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("正常文件走完整上传创建任务", async ({ page }) => {
    await gotoUploadStep(page);

    // 纯 ASCII 内容（GBK 兼容）单 txt：后端支持单 txt 导入
    // （GBK 中文编码 Node 侧无内置支持，纯 ASCII 字节即合法 GBK）
    const txt = "PWE2E-A;01;0101;121.4;31.2;\nPWE2E-A;01;0102;;;;\n";
    await uploadViaInput(page, {
      name: "pw-e2e-upload.txt",
      mimeType: "text/plain",
      buffer: Buffer.from(txt, "latin1"),
    });

    // 上传成功 toast → 任务创建
    await expect(page.locator("[data-sonner-toast]").first()).toContainText("导入任务已创建并启动", { timeout: 10000 });

    // 任务历史出现新任务行（状态待处理/执行中/已完成均可）
    await expect(page.locator("table tbody tr").filter({ hasText: "pw-e2e-upload.txt" }).first()).toBeVisible({
      timeout: 10000,
    });

    await page.screenshot({ path: "e2e/.artifacts/bd-import-upload-ok.png", fullPage: true });
  });
});
