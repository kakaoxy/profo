import { execFileSync } from "node:child_process";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 楼盘字典 · 区域/商圈字典维护（REQ-IT3-01，源自 REQ-IT2-01）验证用例。
 *
 * 归属变更：区域与商圈属于楼盘字典的一部分，维护入口在 `/admin/building-dictionary/region-dicts`，
 * 商户门店只是复用其候选值（`/admin/merchant/districts`、`/admin/merchant/business-circles`）。
 *
 * 覆盖：
 * - 新增区域/商圈字典项 → 分页列表可见（契约带 page/page_size）
 * - 重命名 → 同步门店业务数据上的同值记录
 * - 停用 → 从门店表单候选移除
 */

// serial：两个用例共用同一个 MARK，afterAll 按 MARK 模糊删除。
// 并行时两个 worker 的 afterAll 会互相删掉对方用例正在使用的字典项（表现为 PUT 404「字典项不存在」）。
test.describe.configure({ mode: "serial", timeout: 120_000 });

const BACKEND = path.resolve(__dirname, "../../backend");
const MARK = `E2EIT3${Date.now()}`;
const DISTRICT = `${MARK}区域A`;
const DISTRICT_RENAMED = `${MARK}区域B`;
const CIRCLE = `${MARK}商圈`;
const STORE = `${MARK}门店`;
// 手机号/坐标按 MARK 派生：避免上一轮残留数据（异常中断未清理）命中后端查重半径
const PHONE = `139${MARK.slice(-8)}`;
const LG = 121.9 + (Number(MARK.slice(-4)) % 900) / 1000;
const LT = 31.9 + (Number(MARK.slice(-4)) % 700) / 1000;

const DICT_API = "/api/v1/admin/building-dictionary/region-dicts";

type DictListResp = {
  items: { id: string; name: string; district: string | null; status: string }[];
  total: number;
  page: number;
  page_size: number;
};

type StoreResp = {
  id: string;
  store_name: string;
  district: string;
  business_circle: string;
};

async function read<T>(ctx: Awaited<ReturnType<typeof createApiContext>>["ctx"], url: string): Promise<T> {
  const res = await ctx.get(url);
  expect(res.ok(), `${url} -> HTTP ${res.status()} ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

test.afterAll(() => {
  execFileSync(
    path.resolve(BACKEND, ".venv/bin/python"),
    [
      "-c",
      `
import os, sys
sys.path.insert(0, ".")
from db import SessionLocal
from models import MerchantCompany, MerchantStore, RegionDict
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.query(RegionDict).filter(RegionDict.name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.commit()
finally:
    db.close()
`,
    ],
    { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK } },
  );
});

test("REQ-IT3-01 楼盘字典区域商圈页：新增/重命名同步业务数据/停用后移出候选", async ({ page }) => {
  let districtId = "";
  let companyId = "";
  let storeId = "";

  const { ctx, dispose } = await createApiContext();
  try {
    // 区域 + 商圈字典项
    const createdDistrict = await ctx.post(DICT_API, {
      data: { dict_type: "district", name: DISTRICT, sort_order: 100, remark: MARK },
    });
    expect(createdDistrict.ok(), `新增区域字典失败 ${await createdDistrict.text()}`).toBeTruthy();
    districtId = ((await createdDistrict.json()) as { id: string }).id;
    const createdCircle = await ctx.post(DICT_API, {
      data: { dict_type: "business_circle", name: CIRCLE, district: DISTRICT },
    });
    expect(createdCircle.ok(), `新增商圈字典失败 ${await createdCircle.text()}`).toBeTruthy();

    // 契约：新增项出现在分页列表里
    const listed = await read<DictListResp>(
      ctx,
      `${DICT_API}?dict_type=district&keyword=${encodeURIComponent(MARK)}&page=1&page_size=20`,
    );
    expect(listed.items.map((item) => item.name)).toContain(DISTRICT);
    expect(listed.page).toBe(1);
    expect(listed.page_size).toBe(20);

    // 建一个使用该区域的门店，用于验证「重命名同步业务数据」
    const createdCompany = await ctx.post("/api/v1/admin/merchant/companies", {
      data: { company_name: `${MARK}公司` },
    });
    companyId = ((await createdCompany.json()) as { id: string }).id;
    const createdStore = await ctx.post("/api/v1/admin/merchant/stores", {
      data: {
        company_id: companyId,
        store_name: STORE,
        district: DISTRICT,
        business_circle: CIRCLE,
        address: `${DISTRICT}${CIRCLE}${MARK}测试路 9 号`,
        lng: LG,
        lat: LT,
        contact_name: "字典同步",
        contact_phone: PHONE,
        cooperation_status: "not_cooperated",
      },
    });
    expect(createdStore.ok(), `新建门店失败 ${await createdStore.text()}`).toBeTruthy();
    storeId = ((await createdStore.json()) as { store: StoreResp }).store.id;
  } finally {
    await dispose();
  }

  await loginPage(page);
  await page.goto("/admin/building-dictionary/region-dicts");
  await expect(page.getByRole("heading", { name: "区域商圈" })).toBeVisible();

  await test.step("列表中能查到新增区域", async () => {
    await page.getByLabel("按名称搜索").fill(MARK);
    await page.getByRole("button", { name: "查询" }).click();
    await expect(page.locator("tr").filter({ hasText: DISTRICT })).toBeVisible();
  });

  await test.step("重命名区域并同步门店业务数据", async () => {
    const rename = page.waitForResponse(
      (res) => res.request().method() === "PUT" && res.url().includes(`/region-dicts/${districtId}`),
    );
    await page.locator("tr").filter({ hasText: DISTRICT }).getByRole("button", { name: "重命名" }).click();
    const nameInput = page.getByLabel("区域名称");
    await nameInput.fill(DISTRICT_RENAMED);
    await page.getByRole("button", { name: "保存" }).click();
    await rename;
    await expect(page.getByText("已改名，并同步更新小区主数据与门店上的同值记录")).toBeVisible();
    await expect(page.locator("tr").filter({ hasText: DISTRICT_RENAMED })).toBeVisible();
  });

  await test.step("门店上的旧区域值被同步为新名称", async () => {
    const { ctx: verifyCtx, dispose: disposeVerify } = await createApiContext();
    try {
      const store = await read<StoreResp>(verifyCtx, `/api/v1/admin/merchant/stores/${storeId}`);
      expect(store.district).toBe(DISTRICT_RENAMED);
      expect(store.business_circle).toBe(CIRCLE);
    } finally {
      await disposeVerify();
    }
  });

  await test.step("商圈的所属区域随区域改名同步：新区域下仍能看到该商圈候选", async () => {
    const { ctx: verifyCtx, dispose: disposeVerify } = await createApiContext();
    try {
      const circles = await read<{ items: string[] }>(
        verifyCtx,
        `/api/v1/admin/merchant/business-circles?district=${encodeURIComponent(DISTRICT_RENAMED)}`,
      );
      expect(circles.items).toContain(CIRCLE);
    } finally {
      await disposeVerify();
    }
  });

  await test.step("停用后不再出现在门店表单候选", async () => {
    const disabled = page.waitForResponse(
      (res) => res.request().method() === "POST" && res.url().includes(`/region-dicts/${districtId}/status`),
    );
    await page.locator("tr").filter({ hasText: DISTRICT_RENAMED }).getByRole("button", { name: "停用" }).click();
    await disabled;
    await expect(page.locator("tr").filter({ hasText: DISTRICT_RENAMED })).toContainText("停用");

    const { ctx: verifyCtx, dispose: disposeVerify } = await createApiContext();
    try {
      // 商户门店表单仍从商户域端点读候选（复用字典启用项）
      const candidates = await read<{ items: string[] }>(verifyCtx, "/api/v1/admin/merchant/districts");
      expect(candidates.items).not.toContain(DISTRICT_RENAMED);
    } finally {
      await disposeVerify();
    }
  });
});

test("REQ-IT3-01 导航归属：区域商圈入口出现在楼盘字典分组下", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin/building-dictionary/region-dicts");
  await expect(page.getByRole("heading", { name: "区域商圈" })).toBeVisible();
  // 旧入口下线：商户管理分组下不再有「区域商圈」
  await page.goto("/admin/merchant/stores");
  const navLink = page.getByRole("link", { name: "区域商圈" });
  if (await navLink.count()) {
    await expect(navLink.first()).toHaveAttribute("href", "/admin/building-dictionary/region-dicts");
  }
});
