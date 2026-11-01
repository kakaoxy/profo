// 商户管理 V07 · 门店停用/启用 UI E2E（REQ-M11-003 / AC-V04-004）
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从环境变量读取。
// 造数/清理走 backend/.venv/bin/python，按 E2E_MARK 精确隔离。

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-ACT-${Date.now()}`;
const BACKEND_DIR = path.resolve(__dirname, "../../backend");

function backendPython(script: string): string {
  return execFileSync(path.resolve(BACKEND_DIR, ".venv/bin/python"), ["-c", script], {
    cwd: BACKEND_DIR,
    stdio: "pipe",
    encoding: "utf-8",
    env: { ...process.env, E2E_MARK: MARK },
  });
}

const SEED_SCRIPT = `
import json, os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    company = MerchantCompany(company_name=f"{mark}公司", contact_name="联系人", contact_phone="13800008888")
    db.add(company)
    db.flush()
    store = MerchantStore(
        company_id=company.id,
        company_name=company.company_name,
        store_name=f"{mark}门店",
        province="上海市",
        city="上海市",
        district="黄浦区",
        business_circle="南京东路",
        address=f"{mark}地址",
        contact_name="王店长",
        contact_phone="13700007777",
        cooperation_status="not_cooperated",
        status="normal",
        review_status="approved",
        source="admin",
    )
    db.add(store)
    db.commit()
    print(json.dumps({"store_id": store.id, "store_name": store.store_name}, ensure_ascii=False))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.commit()
    print("cleaned")
finally:
    db.close()
`;

interface Seeded {
  store_id: string;
  store_name: string;
}

let seeded: Seeded;

test.beforeAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
  seeded = JSON.parse(backendPython(SEED_SCRIPT)) as Seeded;
});

test.afterAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await loginPage(page);
});

test("门店详情可停用并再次启用，状态徽标随之变化", async ({ page }) => {
  await page.goto(`/admin/merchant/stores/${seeded.store_id}`);

  // 初始：正常状态徽标 + 门店状态卡可见
  await expect(page.getByText(seeded.store_name).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("门店状态", { exact: true })).toBeVisible();
  await expect(page.getByText("正常", { exact: true }).first()).toBeVisible();

  // 目标状态未选时提交按钮禁用
  const submit = page.getByRole("button", { name: "提交", exact: true });
  await expect(submit).toBeDisabled();

  // 停用
  await page.getByRole("combobox", { name: "目标门店状态" }).click();
  await page.getByRole("option", { name: "停用" }).click();
  await page.getByRole("textbox", { name: "门店状态变更原因" }).fill("E2E 停用验证");
  await expect(submit).toBeEnabled();
  await submit.click();

  await expect(page.getByText("停用", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("正常", { exact: true })).toHaveCount(0);

  // 已停用门店：目标状态选「停用」时提交按钮禁用（无变化不允许提交）
  await page.getByRole("combobox", { name: "目标门店状态" }).click();
  await page.getByRole("option", { name: "停用" }).click();
  await expect(submit).toBeDisabled();

  // 重新启用
  await page.getByRole("combobox", { name: "目标门店状态" }).click();
  await page.getByRole("option", { name: "正常" }).click();
  await page.getByRole("textbox", { name: "门店状态变更原因" }).fill("E2E 启用验证");
  await submit.click();

  await expect(page.getByText("正常", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("停用", { exact: true })).toHaveCount(0);
});
