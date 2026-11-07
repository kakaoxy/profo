import { expect, test } from "@playwright/test";
import { loginPage } from "./helpers/auth";

/**
 * 线索中心 2026-11-07 设计稿落地回归。
 *
 * 覆盖三块可复验行为：
 * - 桌面端漏斗 + 6 组列的线索表；
 * - 抽屉打开、评估弹窗的三项必填闸门；
 * - 390px 移动端使用卡片列表而非压缩桌面表格。
 */
test.describe("线索中心设计稿 1:1", () => {
  test("桌面端：漏斗、分组表头与 20 行列表", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`));

    await loginPage(page);
    await page.setViewportSize({ width: 1440, height: 1100 });
    await page.goto("http://127.0.0.1:3000/admin/leads", { waitUntil: "networkidle" });

    await expect(page.getByRole("heading", { name: "线索中心" })).toBeVisible();
    await expect(page.getByText("收房漏斗")).toBeVisible();
    await expect(page.getByRole("button", { name: /^待评估 \d+$/ })).toBeVisible();
    await expect(page.getByTestId("lead-table-header")).toContainText("房源");
    await expect(page.getByTestId("lead-table-header")).toContainText("最近跟进");
    await expect(page.getByTestId("lead-row")).toHaveCount(20);
    expect(errors).toEqual([]);
  });

  test("抽屉：打开评估弹窗后三项未填不可提交", async ({ page }) => {
    const errors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(`PAGEERROR: ${error.message}`));

    await loginPage(page);
    await page.goto("http://127.0.0.1:3000/admin/leads", { waitUntil: "networkidle" });

    await page
      .getByTestId("lead-row")
      .filter({ hasText: "通河二村" })
      .first()
      .click();
    await expect(page.locator("[data-slot=sheet-content]")).toBeVisible();
    await expect(page.getByRole("button", { name: "编辑线索" })).toBeVisible();

    await page.getByRole("button", { name: "给出收房评估" }).first().click();
    const assessmentDialog = page.getByRole("dialog").filter({ hasText: "评估录入" });
    await expect(assessmentDialog).toBeVisible();
    await expect(assessmentDialog.getByText("房源条件分", { exact: false }).first()).toBeVisible();
    await expect(assessmentDialog.getByText("装修后可售周期", { exact: false }).first()).toBeVisible();
    await expect(assessmentDialog.getByRole("button", { name: "批准约看排期" })).toBeDisabled();
    expect(errors).toEqual([]);
  });

  test("移动端：390px 使用卡片列表", async ({ page }) => {
    await loginPage(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("http://127.0.0.1:3000/admin/leads", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    expect(await page.getByTestId("lead-mobile-row").count()).toBeGreaterThan(0);
    await expect(page.getByTestId("lead-table-header")).toBeHidden();
    await expect(page.getByRole("heading", { name: "线索中心" })).toBeVisible();
    // P0 回归：移动端卡片列表也必须能看到分页栏（修复前仅桌面表格分支渲染）。
    await expect(page.getByTestId("leads-pagination-footer")).toBeVisible();
  });
});
