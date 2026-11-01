import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

const BACKEND = path.resolve(__dirname, "../../backend");
const MARK = `E2E-PHOTO-${Date.now()}`;
let storeId = "";

test.beforeAll(() => {
  const out = execFileSync(path.resolve(BACKEND, ".venv/bin/python"), ["-c", `
import json, os, sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    company = MerchantCompany(company_name=f"{mark}公司", contact_name="张三", contact_phone="13800001111")
    db.add(company); db.flush()
    store = MerchantStore(company_id=company.id, company_name=company.company_name, store_name=f"{mark}门店",
        province="上海市", city="上海市", district="浦东新区", business_circle="陆家嘴", address="世纪大道 1 号",
        contact_name="张三", contact_phone="13800001111", source="backoffice", status="normal", review_status="approved")
    db.add(store); db.commit(); print(json.dumps({"id": store.id}))
finally:
    db.close()
`], { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK }, encoding: "utf-8" });
  storeId = (JSON.parse(out) as { id: string }).id;
});

test.afterAll(() => {
  execFileSync(path.resolve(BACKEND, ".venv/bin/python"), ["-c", `
import os, sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    ids = [s.id for s in db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).all()]
    db.query(MerchantStore).filter(MerchantStore.id.in_(ids)).delete(synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.commit()
finally:
    db.close()
`], { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK } });
});

test("门店照片可上传并按类型展示、二次确认删除", async ({ page }) => {
  await loginPage(page);
  await page.goto(`/admin/merchant/stores/${storeId}`);
  await expect(page.getByText("门店照片", { exact: true })).toBeVisible();

  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  // 本机 OSS 网关 502，mock 上传接口以验证前端「上传→写入门店照片→回显」接线
  await page.route("**/api/v1/files/upload", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ url: dataUrl }) }),
  );
  const png = Buffer.from(dataUrl.split(",")[1], "base64");
  const uploaded = page.waitForResponse(
    (res) => res.url().includes("/photos") && res.request().method() === "PUT",
  );
  await page.locator('input[type="file"]').setInputFiles({ name: "head.png", mimeType: "image/png", buffer: png });
  expect((await uploaded).status()).toBe(200);
  await page.reload();
  await expect(page.locator('img[alt="门头照"]')).toBeVisible();
  await page.screenshot({ path: "../tmp/ui-audit-r17/store-photo.png", fullPage: true });

  await page.getByRole("button", { name: "删除", exact: true }).click();
  const removed = page.waitForResponse(
    (res) => res.url().includes("/photos") && res.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "确认删除" }).click();
  expect((await removed).status()).toBe(200);
  await expect(page.getByText("暂无门店照片")).toBeVisible();
});
