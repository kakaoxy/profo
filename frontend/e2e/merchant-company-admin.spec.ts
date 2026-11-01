import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

const BACKEND = path.resolve(__dirname, "../../backend");
const MARK = `E2E-COMPANY-${Date.now()}`;

// 并行跑 merchant 用例会撞后端登录限流（5 次/分钟），登录助手退避 20s/40s，
// 默认 30s 用例超时不够，放宽到 120s，避免把限流退避误判为用例失败。
test.describe.configure({ timeout: 120_000 });

test.afterAll(() => {
  execFileSync(path.resolve(BACKEND, ".venv/bin/python"), ["-c", `
import os, sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.commit()
finally:
    db.close()
`], { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK } });
});

test("公司管理可新建、搜索、停用，停用后不再被门店选择", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin/merchant/companies");
  await page.getByPlaceholder("按公司名称搜索").fill(MARK);
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.getByText("输入公司名称后查询").or(page.getByText("没有符合条件的公司"))).toBeVisible();

  await page.getByRole("button", { name: "新建公司" }).click();
  await page.getByPlaceholder("请输入公司名称").fill(`${MARK}公司`);
  await page.getByLabel("联系人").fill("张三");
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator("tr").filter({ hasText: `${MARK}公司` }).first()).toBeVisible();
  await expect(page.getByText("正常").first()).toBeVisible();

  const row = page.locator("tr").filter({ hasText: `${MARK}公司` }).first();
  await row.getByRole("button", { name: "编辑" }).click();
  await page.getByRole("combobox", { name: "公司状态", exact: true }).click();
  await page.getByRole("option", { name: "停用" }).click();
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.locator("tr").filter({ hasText: `${MARK}公司` }).first().getByText("已停用")).toBeVisible();
  await page.screenshot({ path: "../tmp/ui-audit-r18/companies.png", fullPage: true });

  const scoped = await page.evaluate(async (mark) => {
    const normal = await (await fetch(`/api/v1/admin/merchant/companies?keyword=${encodeURIComponent(mark)}`)).json();
    const all = await (await fetch(`/api/v1/admin/merchant/companies?keyword=${encodeURIComponent(mark)}&include_disabled=true`)).json();
    return { normalNames: normal.items.map((c: { company_name: string }) => c.company_name), allNames: all.items.map((c: { company_name: string }) => c.company_name) };
  }, MARK);
  expect(scoped.normalNames).not.toContain(`${MARK}公司`);
  expect(scoped.allNames).toContain(`${MARK}公司`);
});
