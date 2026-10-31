// 商户管理 V07 · 门店列表筛选/来源列与已合并门店只读详情 UI E2E
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从环境变量读取。
// 造数/清理走 backend/.venv/bin/python，按 E2E_MARK 精确隔离。

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-V07-${Date.now()}`;
const DISTRICT = `${MARK}区`;
const BACKEND_DIR = path.resolve(__dirname, "../../backend");

function backendPython(script: string): string {
  return execFileSync(path.resolve(BACKEND_DIR, ".venv/bin/python"), ["-c", script], {
    cwd: BACKEND_DIR,
    stdio: "pipe",
    encoding: "utf-8",
    env: {
      ...process.env,
      E2E_MARK: MARK,
      E2E_DISTRICT: DISTRICT,
    },
  });
}

const SEED_SCRIPT = `
import json, os, sys, uuid

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore, Role, User
from utils.auth import get_password_hash

mark = os.environ["E2E_MARK"]
district = os.environ["E2E_DISTRICT"]
db = SessionLocal()
try:
    role = db.query(Role).filter(Role.code == "user").one()
    owner = User(
        username=f"{mark}-{uuid.uuid4().hex[:6]}",
        nickname=f"{mark}负责人",
        password=get_password_hash("e2e-temp"),
        role_id=role.id,
        status="active",
    )
    db.add(owner)
    db.flush()

    company = MerchantCompany(company_name=f"{mark}公司", contact_name="联系人", contact_phone="13800009999")
    db.add(company)
    db.flush()

    def make_store(name, *, source, review, status="normal", owner_id=None):
        return MerchantStore(
            company_id=company.id,
            company_name=company.company_name,
            store_name=name,
            province="上海市",
            city="上海市",
            district=district,
            business_circle="E2E商圈",
            address="E2E 路 1 号",
            contact_name="王店长",
            contact_phone="13700002222",
            source=source,
            status=status,
            review_status=review,
            owner_employee_id=owner_id,
        )

    normal_store = make_store(
        f"{mark}后台门店", source="backoffice", review="approved", owner_id=owner.id)
    broker_store = make_store(f"{mark}经纪人门店", source="broker", review="pending")
    merged_store = make_store(f"{mark}已合并门店", source="backoffice", review="merged", status="merged")
    db.add_all([normal_store, broker_store, merged_store])
    db.flush()
    merged_store.merged_to_store_id = normal_store.id
    merged_store.former_store_no = "OLD-" + mark
    db.commit()
    print(json.dumps({
        "owner_name": owner.nickname,
        "normal_store_id": normal_store.id,
        "normal_store_name": normal_store.store_name,
        "broker_store_name": broker_store.store_name,
        "merged_store_id": merged_store.id,
        "merged_store_name": merged_store.store_name,
        "merged_to_store_id": normal_store.id,
    }))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore, User

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.query(User).filter(User.username.like(f"{mark}%")).delete(synchronize_session=False)
    db.commit()
    print("cleaned")
finally:
    db.close()
`;

interface Seeded {
  owner_name: string;
  normal_store_id: string;
  normal_store_name: string;
  broker_store_name: string;
  merged_store_id: string;
  merged_store_name: string;
  merged_to_store_id: string;
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

test("门店列表支持区县/负责人筛选，展示来源与待审核标识", async ({ page }) => {
  await page.goto("/admin/merchant/stores");

  // 区县 + 负责人筛选：仅保留该负责人门店
  await page.getByPlaceholder("区县").fill(DISTRICT);
  await page.getByRole("combobox").filter({ hasText: "负责人" }).click();
  await page.getByRole("option", { name: seeded.owner_name }).click();
  await page.getByRole("button", { name: "查询" }).click();

  await expect(page.getByText(seeded.normal_store_name)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(seeded.broker_store_name)).toHaveCount(0);

  // 清空负责人后按关键词看来源列与审核标识
  await page.getByRole("combobox").filter({ hasText: seeded.owner_name }).click();
  await page.getByRole("option", { name: "全部负责人" }).click();
  await page.getByPlaceholder("门店名称 / 地址 / 公司 / 电话").fill(MARK);
  await page.getByRole("button", { name: "查询" }).click();

  await expect(page.getByText(seeded.broker_store_name)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("经纪人创建")).toBeVisible();
  await expect(page.getByText("后台新增").first()).toBeVisible();
  await expect(page.getByText("待审核").first()).toBeVisible();
});

test("已合并门店详情只读并展示合并去向", async ({ page }) => {
  await page.goto(`/admin/merchant/stores/${seeded.merged_store_id}`);

  await expect(page.getByText("已合并").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("该门店已合并，只读不可编辑")).toBeVisible();
  await expect(page.getByText(`原门店编号：OLD-${MARK}`)).toBeVisible();
  await expect(page.getByText("合并去向：")).toBeVisible();
  await expect(page.getByRole("link", { name: seeded.merged_to_store_id })).toBeVisible();
  await expect(page.getByRole("link", { name: "编辑门店" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "合并到保留门店" })).toHaveCount(0);
});
