// 商户管理 · 后台线索归属三要素（经纪人/对接人/分享员工）与门店/经纪人/对接人筛选 UI E2E
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从环境变量读取。
// 造数/清理走 backend/.venv/bin/python，按 E2E_MARK 精确隔离。

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-V06-${Date.now()}`;
const PHONE = `136${String(Date.now()).slice(-8)}`;
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
    },
  });
}

const SEED_SCRIPT = `
import json, os, sys, uuid

sys.path.insert(0, ".")
from db import SessionLocal
from models import Lead, MerchantBroker, MerchantCompany, MerchantStore, Role, User
from utils.auth import get_password_hash
from utils.crypto import hash_phone

mark = os.environ["E2E_MARK"]
phone = os.environ["E2E_PHONE"]
db = SessionLocal()
try:
    role = db.query(Role).filter(Role.code == "user").one()

    def make_user(label: str) -> User:
        user = User(
            username=f"{mark}-{uuid.uuid4().hex[:6]}",
            nickname=f"{mark}{label}",
            password=get_password_hash("e2e-temp"),
            role_id=role.id,
            status="active",
        )
        db.add(user)
        db.flush()
        return user

    creator = make_user("录入人")
    share = make_user("分享人")
    owner = make_user("归属人")

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
        owner_employee_id=owner.id,
    )
    db.add(store)
    db.flush()
    broker = MerchantBroker(
        name=f"{mark}经纪人",
        phone=phone,
        phone_hash=hash_phone(phone),
        store_id=store.id,
        bind_status="bound",
        source="backoffice",
        bind_source="backoffice",
        inviter_employee_id=share.id,
    )
    db.add(broker)
    db.flush()

    lead = Lead(
        community_name=f"{mark}商圈小区",
        creator_id=creator.id,
        referrer_id=share.id,
        store_id=store.id,
        broker_id=broker.id,
        owner_employee_id=owner.id,
    )
    legacy = Lead(community_name=f"{mark}存量小区")
    db.add_all([lead, legacy])
    db.commit()
    print(json.dumps({
        "store_id": store.id,
        "store_name": store.store_name,
        "broker_name": broker.name,
        "creator_name": creator.nickname,
        "share_name": share.nickname,
        "owner_name": owner.nickname,
    }))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import Lead, MerchantBroker, MerchantCompany, MerchantStore, User

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(Lead).filter(Lead.community_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.query(MerchantBroker).filter(MerchantBroker.name.like(f"%{mark}%")).delete(synchronize_session=False)
    store_ids = [s.id for s in db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).all()]
    if store_ids:
        db.query(MerchantStore).filter(MerchantStore.id.in_(store_ids)).delete(synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    db.query(User).filter(User.username.like(f"{mark}%")).delete(synchronize_session=False)
    db.commit()
    print("cleaned")
finally:
    db.close()
`;

interface Seeded {
  store_id: string;
  store_name: string;
  broker_name: string;
  creator_name: string;
  share_name: string;
  owner_name: string;
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

test("线索列表/详情展示归属三要素，存量线索显示无归属", async ({ page }) => {
  const search = encodeURIComponent(`${MARK}商圈小区`);
  await page.goto(`/admin/leads?search=${search}`);

  const headers = await page.getByTestId("lead-table-header").innerText();
  expect(headers).toContain("房源");
  expect(headers).toContain("对接人");
  expect(headers).not.toContain("归属（门店 / 经纪人 / 分享）");
  expect(headers).not.toContain("员工归因（门店归属 / 邀请）");

  const row = page
    .locator('[data-testid="lead-row"]')
    .filter({ hasText: `${MARK}商圈小区` })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  // BR-M07-013：录入人与分享员工语义分开
  await expect(row).toContainText(seeded.creator_name);

  // 详情抽屉归属三要素卡片
  await row.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("归属信息")).toBeVisible({ timeout: 15_000 });
  await expect(drawer.getByText("推荐经纪人")).toBeVisible();
  await expect(drawer.getByText("对接人")).toBeVisible();
  await expect(drawer.getByText("分享员工")).toBeVisible();
  await expect(drawer.getByText("推荐门店")).toHaveCount(0);
  await expect(drawer.getByText("门店归属员工")).toHaveCount(0);
  await expect(drawer.getByText("归属完整")).toHaveCount(0);
  await expect(drawer.getByText(`${seeded.broker_name}（${seeded.store_name}）`)).toBeVisible();
  await expect(drawer.getByText(seeded.share_name).first()).toBeVisible();
  await expect(drawer.getByText(seeded.owner_name).first()).toBeVisible();
  await page.keyboard.press("Escape");

  // AC-V06-008：存量线索无归属字段，列表正常渲染，详情显示无归属
  await page.goto(`/admin/leads?search=${encodeURIComponent(`${MARK}存量小区`)}`);
  const legacyRow = page
    .locator('[data-testid="lead-row"]')
    .filter({ hasText: `${MARK}存量小区` })
    .first();
  await expect(legacyRow).toBeVisible({ timeout: 15_000 });
  await legacyRow.click();
  await expect(page.getByRole("dialog").getByText("无归属")).toBeVisible({ timeout: 15_000 });
});

test("录入线索：门店→经纪人二级联动，切换门店清空经纪人", async ({ page }) => {
  await page.goto("/admin/leads");
  await page.getByRole("button", { name: "录入新线索" }).click();

  const storeSelect = page.getByLabel("推荐门店", { exact: true });
  await expect(storeSelect).toBeVisible({ timeout: 15_000 });
  await expect(storeSelect.locator("option").filter({ hasText: seeded.store_name })).toHaveCount(
    1,
    { timeout: 15_000 },
  );

  // 选择门店 → 仅加载该门店有效绑定经纪人
  await storeSelect.selectOption({ label: seeded.store_name });
  const brokerSelect = page.getByLabel("推荐经纪人", { exact: true });
  await expect(brokerSelect.locator("option").filter({ hasText: seeded.broker_name })).toHaveCount(
    1,
    { timeout: 15_000 },
  );
  await brokerSelect.selectOption({ label: seeded.broker_name });

  // 切换门店 → 清空已选经纪人
  await storeSelect.selectOption("");
  await expect(brokerSelect).toHaveValue("");
});

test("按门店/经纪人/对接人筛选线索", async ({ page }) => {
  await page.goto("/admin/leads");
  const row = page
    .locator('[data-testid="lead-row"]')
    .filter({ hasText: `${MARK}商圈小区` })
    .first();

  // 门店筛选
  await page.getByRole("combobox", { name: "推荐门店筛选" }).click();
  await page.getByRole("option", { name: seeded.store_name }).click();
  await expect(page).toHaveURL(/store_id=/, { timeout: 15_000 });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // 经纪人筛选
  await page.getByRole("combobox", { name: "推荐经纪人筛选" }).click();
  await page.getByRole("option", { name: new RegExp(seeded.broker_name) }).click();
  await expect(page).toHaveURL(/broker_id=/, { timeout: 15_000 });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // 对接人筛选（门店负责人命中）
  await page.getByRole("combobox", { name: "对接人筛选" }).click();
  await page.getByRole("option", { name: seeded.owner_name }).click();
  await expect(page).toHaveURL(/owner_employee_id=/, { timeout: 15_000 });
  await expect(row).toBeVisible({ timeout: 15_000 });

  // 分享员工不是归属员工：按分享人筛选不应命中该线索
  await page.getByRole("combobox", { name: "对接人筛选" }).click();
  await page.getByRole("option", { name: seeded.share_name }).click();
  await expect(page).toHaveURL(/owner_employee_id=/, { timeout: 15_000 });
  await expect(row).toHaveCount(0);
});
