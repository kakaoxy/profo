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
  await page.getByRole("button", { name: /高级筛选/ }).click();
  await page.getByLabel("按区县筛选").fill(DISTRICT);
  await page.getByLabel("按负责人筛选").click();
  await page.getByRole("option", { name: seeded.owner_name }).click();
  await page.getByRole("button", { name: "查询" }).click();

  await expect(page.getByText(seeded.normal_store_name).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(seeded.broker_store_name)).toHaveCount(0);

  // 清空负责人后按关键词看来源列与审核标识
  await page.getByLabel("按负责人筛选").click();
  await page.getByRole("option", { name: "全部负责人" }).click();
  await page.getByLabel("搜索门店").fill(MARK);
  await page.getByRole("button", { name: "查询" }).click();

  await expect(page.getByText(seeded.broker_store_name).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("待审核").first()).toBeVisible();
  const row = page.locator("tbody tr").filter({ hasText: seeded.broker_store_name });
  await row.getByRole("cell").nth(1).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("经纪人创建")).toBeVisible();
});

test("门店列表符合 DESIGN 版式与响应式契约", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/admin/merchant/stores");
  await expect(page.getByText(seeded.normal_store_name).first()).toBeVisible({ timeout: 15_000 });

  const desktop = await page.evaluate(() => {
    const bodyFont = getComputedStyle(document.body).fontFamily;
    const h1 = document.querySelector("h1");
    const h1Style = h1 ? getComputedStyle(h1) : null;
    const container = document.querySelector<HTMLElement>('[data-page="merchant-stores"] > div');
    const table = document.querySelector("table");
    const primaryCount = Array.from(
      document.querySelectorAll<HTMLElement>('[data-slot="steep-button"]'),
    ).filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && getComputedStyle(element).backgroundColor === "rgb(23, 25, 28)";
    }).length;
    const minFontSize = Math.min(
      ...Array.from(document.querySelectorAll<HTMLElement>('[data-page="merchant-stores"] *'))
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            element.childElementCount === 0 &&
            (element.textContent ?? "").trim().length > 0
          );
        })
        .map((element) => parseFloat(getComputedStyle(element).fontSize))
        .filter((size) => Number.isFinite(size)),
    );
    return {
      bodyFont,
      interLoaded: document.fonts.check("16px Inter"),
      h1FontSize: h1Style?.fontSize ?? "",
      h1FontWeight: h1Style?.fontWeight ?? "",
      h1LetterSpacing: h1Style?.letterSpacing ?? "",
      containerWidth: container?.getBoundingClientRect().width ?? 0,
      primaryCount,
      tableVisible: Boolean(table && table.getBoundingClientRect().height > 0),
      headerHeights: Array.from(document.querySelectorAll("th")).map(
        (element) => element.getBoundingClientRect().height,
      ),
      minFontSize,
    };
  });

  expect(desktop.bodyFont.toLowerCase()).toContain("inter");
  expect(desktop.interLoaded).toBe(true);
  expect(desktop.h1FontSize).toBe("44px");
  expect(desktop.h1FontWeight).toBe("400");
  expect(parseFloat(desktop.h1LetterSpacing)).toBeCloseTo(-0.66, 1);
  expect(desktop.containerWidth).toBeLessThanOrEqual(1200.5);
  expect(desktop.primaryCount).toBe(1);
  expect(desktop.tableVisible).toBe(true);
  expect(desktop.headerHeights.every((height) => height <= 49)).toBe(true);
  expect(desktop.minFontSize).toBeGreaterThanOrEqual(14);

  await page.getByRole("button", { name: /高级筛选/ }).click();
  await expect(page.getByLabel("按区县筛选")).toBeVisible();
  await expect(page.getByLabel("按商圈筛选")).toBeVisible();
  await expect(page.getByPlaceholder("开始日期")).toBeVisible();
  await expect(page.getByPlaceholder("结束日期")).toBeVisible();
  await page.getByRole("button", { name: /高级筛选/ }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("store-card").first()).toBeVisible();
  const mobile = await page.evaluate(() => {
    const h1 = document.querySelector("h1");
    return {
      h1FontSize: h1 ? getComputedStyle(h1).fontSize : "",
      cardCount: document.querySelectorAll('[data-testid="store-card"]').length,
      tableVisible: Array.from(document.querySelectorAll("table")).some(
        (table) => table.getBoundingClientRect().height > 0,
      ),
      scrollWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      actionCount: Array.from(
        document.querySelectorAll<HTMLElement>('button[aria-label^="更多操作"]'),
      ).filter((element) => element.getBoundingClientRect().width > 0).length,
    };
  });
  expect(mobile.h1FontSize).toBe("44px");
  expect(mobile.cardCount).toBeGreaterThanOrEqual(3);
  expect(mobile.tableVisible).toBe(false);
  expect(mobile.scrollWidth).toBeLessThanOrEqual(mobile.viewportWidth + 1);
  expect(mobile.actionCount).toBeGreaterThanOrEqual(3);

  await page.getByTestId("store-card").first().locator("dl").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
});

test("已合并门店详情只读并展示合并去向", async ({ page }) => {
  await page.goto(`/admin/merchant/stores/${seeded.merged_store_id}`);

  await expect(page.getByText("已合并").first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("该门店已合并，只读不可编辑")).toBeVisible();
  await expect(page.getByText(`原门店编号：OLD-${MARK}`)).toBeVisible();
  await expect(page.getByText("合并去向：")).toBeVisible();
  await expect(page.getByRole("link", { name: seeded.normal_store_name })).toBeVisible();
  await expect(page.getByRole("link", { name: "编辑门店" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "合并到保留门店" })).toHaveCount(0);
});
