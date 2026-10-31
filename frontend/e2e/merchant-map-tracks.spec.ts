// 商户管理 V08 · 后台门店地图（无 Key 降级）与拜访轨迹 UI E2E
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER / E2E_ADMIN_PASSWORD 从环境变量读取。
// 造数/清理走 backend/.venv/bin/python，按 E2E_MARK 精确隔离。
// 说明：本机未配置 NEXT_PUBLIC_AMAP_KEY，地图瓦片渲染（AC-V08-001/011 等）无法在本 E2E 覆盖，
// 本用例验证地图/轨迹的列表、统计、筛选、坐标缺失与时间线降级路径。

import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });

const MARK = `E2E-V08-${Date.now()}`;
const DISTRICT = `${MARK}区`;
const PHONE = `137${String(Date.now()).slice(-8)}`;
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
      E2E_PHONE: PHONE,
    },
  });
}

const SEED_SCRIPT = `
import json, os, sys, uuid
from datetime import datetime, timezone

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantBroker, MerchantCompany, MerchantStore, MerchantVisit, Role, User
from utils.auth import get_password_hash
from utils.crypto import hash_phone

mark = os.environ["E2E_MARK"]
district = os.environ["E2E_DISTRICT"]
phone = os.environ["E2E_PHONE"]
db = SessionLocal()
try:
    role = db.query(Role).filter(Role.code == "user").one()
    employee = User(
        username=f"{mark}-{uuid.uuid4().hex[:6]}",
        nickname=f"{mark}员工",
        password=get_password_hash("e2e-temp"),
        role_id=role.id,
        status="active",
    )
    db.add(employee)
    db.flush()

    company = MerchantCompany(company_name=f"{mark}公司", contact_name="联系人", contact_phone="13800009999")
    db.add(company)
    db.flush()

    store1 = MerchantStore(
        company_id=company.id,
        company_name=company.company_name,
        store_name=f"{mark}有坐标门店",
        province="上海市",
        city="上海市",
        district=district,
        business_circle="E2E商圈",
        address="E2E 路 1 号",
        lng=121.5057,
        lat=31.2453,
        contact_name="王店长",
        contact_phone="13700002222",
        cooperation_status="cooperated",
        source="backoffice",
        status="normal",
        review_status="approved",
        owner_employee_id=employee.id,
    )
    store2 = MerchantStore(
        company_id=company.id,
        company_name=company.company_name,
        store_name=f"{mark}无坐标门店",
        province="上海市",
        city="上海市",
        district=district,
        business_circle="E2E商圈",
        address="E2E 路 2 号",
        contact_name="李店长",
        contact_phone="13600003333",
        cooperation_status="not_cooperated",
        source="backoffice",
        status="normal",
        review_status="approved",
        owner_employee_id=employee.id,
    )
    db.add_all([store1, store2])
    db.flush()

    broker = MerchantBroker(
        name=f"{mark}经纪人",
        phone=phone,
        phone_hash=hash_phone(phone),
        store_id=store1.id,
        bind_status="bound",
        source="backoffice",
        bind_source="backoffice",
        inviter_employee_id=employee.id,
    )
    db.add(broker)

    now = datetime.now(timezone.utc)
    db.add_all([
        MerchantVisit(
            store_id=store1.id,
            employee_id=employee.id,
            visited_at=now,
            contact_name="王店长",
            result="interested",
            remark="E2E 有坐标拜访",
            lng=121.5057,
            lat=31.2453,
            location_status="normal",
            visit_source="regular",
            photos=[],
        ),
        MerchantVisit(
            store_id=store2.id,
            employee_id=employee.id,
            visited_at=now,
            contact_name="李店长",
            result="interested",
            remark="E2E 无坐标拜访",
            location_status="missing",
            visit_source="regular",
            photos=[],
        ),
    ])
    db.commit()
    print(json.dumps({
        "employee_id": employee.id,
        "employee_name": employee.nickname,
        "store1_name": store1.store_name,
        "store2_name": store2.store_name,
        "district": district,
    }))
finally:
    db.close()
`;

const CLEANUP_SCRIPT = `
import os, sys

sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantBroker, MerchantCompany, MerchantStore, MerchantVisit, User

mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    users = db.query(User).filter(User.username.like(f"{mark}%")).all()
    user_ids = [u.id for u in users]
    if user_ids:
        db.query(MerchantVisit).filter(MerchantVisit.employee_id.in_(user_ids)).delete(
            synchronize_session=False)
    db.query(MerchantBroker).filter(MerchantBroker.name.like(f"%{mark}%")).delete(synchronize_session=False)
    store_ids = [s.id for s in db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).all()]
    if store_ids:
        db.query(MerchantVisit).filter(MerchantVisit.store_id.in_(store_ids)).delete(synchronize_session=False)
        db.query(MerchantStore).filter(MerchantStore.id.in_(store_ids)).delete(synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False)
    if user_ids:
        db.query(User).filter(User.id.in_(user_ids)).delete(synchronize_session=False)
    db.commit()
    print("cleaned")
finally:
    db.close()
`;

interface Seeded {
  employee_id: string;
  employee_name: string;
  store1_name: string;
  store2_name: string;
  district: string;
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

test("门店地图在未配置 Key 时降级，筛选与统计/坐标缺失仍可用", async ({ page }) => {
  await page.goto("/admin/merchant/map");
  await expect(page.getByText("未配置 NEXT_PUBLIC_AMAP_KEY")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("地图未配置")).toBeVisible();

  // 按唯一区县筛选 → 统计与列表同步
  await page.getByPlaceholder("区县").fill(seeded.district);
  await page.getByRole("button", { name: "刷新" }).click();

  await expect(page.getByText("门店总数").locator("..")).toContainText("2", { timeout: 15_000 });
  await expect(page.getByText("合作中门店").locator("..")).toContainText("1");
  await expect(page.getByText("经纪人总数").locator("..")).toContainText("1");
  await expect(page.getByText(seeded.store1_name)).toBeVisible();
  await expect(page.getByText(seeded.store2_name)).toBeVisible();
  // 仅在本门店行内断言「坐标缺失」徽标，避免与其他并行用例的无坐标门店冲突
  await expect(
    page.locator("button").filter({ hasText: seeded.store2_name }).getByText("坐标缺失", {
      exact: true,
    }),
  ).toBeVisible();
});

test("拜访轨迹按员工/日期查询，时间线展示有坐标与无坐标拜访", async ({ page }) => {
  await page.goto("/admin/merchant/tracks");
  await expect(page.getByText("未配置 NEXT_PUBLIC_AMAP_KEY")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("地图未配置")).toBeVisible();

  // 等首屏自动加载完成后再切到目标员工，避免自动加载结果覆盖
  await expect(page.getByText(/拜访 \d+ 次/)).toBeVisible({ timeout: 15_000 });
  await page.getByRole("combobox").first().click();
  await page.getByRole("option", { name: seeded.employee_name }).click();
  await page.getByRole("button", { name: "查询轨迹" }).click();

  await expect(page.getByText("拜访 2 次 · 到访 2 家")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(seeded.store1_name)).toBeVisible();
  await expect(page.getByText(seeded.store2_name)).toBeVisible();
  await expect(page.getByText("无坐标", { exact: true })).toBeVisible();
  await expect(page.getByText("联系人：王店长")).toBeVisible();
  await expect(page.getByText("联系人：李店长")).toBeVisible();
});
