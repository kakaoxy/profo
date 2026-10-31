// 商户管理 V07 · 后台新建/编辑经纪人、发起协议 UI E2E
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从环境变量读取。
// 造数/清理走 backend/.venv/bin/python，按 E2E_MARK 精确隔离。

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-MERCHANT-ADMIN-${Date.now()}`;
const PHONE = `135${String(Date.now()).slice(-8)}`;
const BACKEND_DIR = path.resolve(__dirname, "../../backend");

function backendPython(script: string): string {
  return execFileSync(path.resolve(BACKEND_DIR, ".venv/bin/python"), ["-c", script], {
    cwd: BACKEND_DIR,
    stdio: "pipe",
    encoding: "utf-8",
    env: {
      ...process.env,
      E2E_MARK: MARK,
      E2E_PHONE: PHONE,
      UPLOAD_DIR: path.resolve(BACKEND_DIR, "static/uploads"),
    },
  });
}

const SEED_SCRIPT = `
import json, os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantAgreementTemplate, MerchantCompany, MerchantStore

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    company = MerchantCompany(company_name=f"{mark}公司", contact_name="联系人", contact_phone="13800009999")
    db.add(company)
    db.flush()
    store = MerchantStore(
        company_id=company.id,
        company_name=company.company_name,
        store_name=f"{mark}门店",
        province="上海市",
        city="上海市",
        district="浦东新区",
        business_circle="陆家嘴商圈",
        address="世纪大道 100 号",
        contact_name="王店长",
        contact_phone="13700002222",
        source="backoffice",
        status="normal",
        review_status="approved",
    )
    db.add(store)
    template = MerchantAgreementTemplate(
        template_name=f"{mark}模板",
        cooperation_type="store",
        content="一、合作范围\\n二、结算方式\\n三、有效期",
        version="v1",
        status="enabled",
    )
    db.add(template)
    db.commit()
    print(json.dumps({"store_id": store.id, "store_name": store.store_name, "company_id": company.id}))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantAgreement, MerchantAgreementTemplate, MerchantBroker, MerchantCompany, MerchantStore

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    store_ids = [s.id for s in db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).all()]
    if store_ids:
        db.query(MerchantAgreement).filter(MerchantAgreement.store_id.in_(store_ids)).delete(
            synchronize_session=False)
        db.query(MerchantStore).filter(MerchantStore.id.in_(store_ids)).delete(synchronize_session=False)
    db.query(MerchantBroker).filter(MerchantBroker.name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.query(MerchantAgreementTemplate).filter(MerchantAgreementTemplate.template_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.commit()
    print("cleaned")
finally:
    db.close()
`;

let storeName = "";
let storeId = "";

test.beforeAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
  const seeded = JSON.parse(backendPython(SEED_SCRIPT)) as { store_name: string; store_id: string };
  storeName = seeded.store_name;
  storeId = seeded.store_id;
});

test.afterAll(() => {
  test.setTimeout(120_000);
  backendPython(CLEANUP_SCRIPT);
});

test.beforeEach(async ({ page }) => {
  test.setTimeout(120_000);
  await loginPage(page);
});

test("后台新建与编辑经纪人", async ({ page }) => {
  await page.goto("/admin/merchant/brokers");
  await page.getByRole("button", { name: "新建经纪人" }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill(`${MARK}经纪人`);
  await page.getByPlaceholder("手机号", { exact: true }).fill(PHONE);
  await page.getByRole("button", { name: "保存" }).click();

  const row = page.locator("tr").filter({ hasText: `${MARK}经纪人` }).first();
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "编辑" }).click();
  await page.getByPlaceholder("姓名", { exact: true }).fill(`${MARK}经纪人改`);
  await page.getByRole("button", { name: "保存" }).click();

  await expect(page.locator("tr").filter({ hasText: `${MARK}经纪人改` }).first()).toBeVisible();
});

test("后台编辑门店并留痕原因", async ({ page }) => {
  await page.goto(`/admin/merchant/stores/${storeId}`);
  await page.getByRole("link", { name: "编辑门店" }).click();
  await expect(page.getByRole("heading", { name: "编辑门店" })).toBeVisible();

  await page.getByPlaceholder("门店名称 *").fill(`${MARK}门店改`);
  await page.getByPlaceholder("变更原因 *").fill("E2E 编辑留痕");
  await page.getByRole("button", { name: "保存修改" }).click();

  await expect(page.getByText(`${MARK}门店改`).first()).toBeVisible({ timeout: 15_000 });
});

test("后台发起协议", async ({ page }) => {
  await page.goto("/admin/merchant/agreements");
  await page.getByRole("button", { name: "发起协议" }).click();

  // 第 2 个 combobox = 门店选择（第 1 个主体类型，第 3 个模板）
  await page.locator('button[role="combobox"]').nth(1).click();
  await page.getByRole("option", { name: new RegExp(storeName) }).click();

  await page.getByPlaceholder("签署人姓名").fill("王店长");
  await page.getByPlaceholder("签署人手机号").fill("13700002222");
  await page.getByRole("button", { name: "提交审核" }).click();

  await expect(page.locator("tr").filter({ hasText: storeName }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("tr").filter({ hasText: "待审核" }).first()).toBeVisible({ timeout: 15_000 });
});
