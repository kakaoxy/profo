import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 商户管理模块 迭代 1（docs/商户管理模块需求/商户管理模块-需求与迭代记录.md）验证用例。
 *
 * 覆盖：
 * - REQ-IT1-05 后台公司列表：默认展示最新创建 + 分页（页大小可选）
 * - REQ-IT1-03 后台门店表单不再有省/市；后端统一补齐（小程序侧为静态断言）
 * - REQ-IT1-04 区域/商圈改系统列表选择、字段顺序
 * - Q4 后台门店列表移除省/市筛选控件
 * - REQ-IT1-01/02 小程序静态断言（WXML 条件渲染 / WXSS box-sizing）
 *
 * 小程序页面无法在 Playwright 中运行，故小程序部分以源码断言锁住回归点，
 * 真机/开发者工具复测步骤见 verification 工件。
 */

// 登录助手在后端 429 限流时会退避重试（最长 20s），单测超时放宽到 120s，避免误判用例失败
test.describe.configure({ timeout: 120_000 });

const BACKEND = path.resolve(__dirname, "../../backend");
const MINIAPP = path.resolve(__dirname, "../../miniapp");
const MARK = `E2EIT1${Date.now()}`;
const OLDER = `${MARK}A老公司`;
const NEWER = `${MARK}B新公司`;

type CompanyListResp = {
  items: { id: string; company_name: string; created_at: string }[];
  total: number;
  page: number;
  page_size: number;
};

type StoreResp = {
  id: string;
  store_name: string;
  province: string;
  city: string;
  district: string;
  business_circle: string;
};

async function read<T>(ctx: Awaited<ReturnType<typeof createApiContext>>["ctx"], url: string): Promise<T> {
  const res = await ctx.get(url);
  expect(res.ok(), `${url} -> HTTP ${res.status()}`).toBeTruthy();
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
from models import MerchantCompany, MerchantStore
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(synchronize_session=False)
    db.commit()
finally:
    db.close()
`,
    ],
    { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK } },
  );
});

test("REQ-IT1-05 公司列表默认展示最新创建并带分页", async ({ page }) => {
  const { ctx, dispose } = await createApiContext();
  try {
    for (const name of [OLDER, NEWER]) {
      const created = await ctx.post("/api/v1/admin/merchant/companies", { data: { company_name: name } });
      expect(created.ok(), `创建公司失败 HTTP ${created.status()}`).toBeTruthy();
    }

    // 契约：分页字段 + created_at desc（无需关键词，空关键词不过滤）
    const paged = await read<CompanyListResp>(ctx, "/api/v1/admin/merchant/companies?page=1&page_size=2");
    expect(paged.page).toBe(1);
    expect(paged.page_size).toBe(2);
    expect(paged.total).toBeGreaterThanOrEqual(2);
    expect(paged.items.length).toBeLessThanOrEqual(2);
    const times = paged.items.map((item) => new Date(item.created_at).getTime());
    expect(times).toEqual([...times].sort((a, b) => b - a));

    // 关键词过滤仍生效（分页不影响）
    const filtered = await read<CompanyListResp>(
      ctx,
      `/api/v1/admin/merchant/companies?keyword=${encodeURIComponent(MARK)}&page=1&page_size=20`,
    );
    expect(filtered.items.map((item) => item.company_name).sort()).toEqual([OLDER, NEWER].sort());
  } finally {
    await dispose();
  }

  await loginPage(page);
  const firstPage = page.waitForResponse(
    (res) => res.url().includes("/api/v1/admin/merchant/companies?") && res.url().includes("page=1"),
  );
  await page.goto("/admin/merchant/companies");
  await firstPage;

  // 旧行为（默认不显示、需搜索才出现）已下线
  await expect(page.getByText("输入公司名称后查询")).toHaveCount(0);
  await expect(page.locator("tbody tr").first()).toBeVisible();
  await expect(page.getByText(/共 \d+ 条/)).toBeVisible();
  await expect(page.getByText("每页")).toBeVisible();

  // 放大关键词后能定位到本轮造的两家公司
  await page.getByPlaceholder("按公司名称搜索").fill(MARK);
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.locator("tr").filter({ hasText: OLDER })).toBeVisible();
  await expect(page.locator("tr").filter({ hasText: NEWER })).toBeVisible();

  // 每页数量可切换 → 触发 page_size=10 请求并回到第 1 页
  const resized = page.waitForResponse((res) => res.url().includes("page_size=10"));
  await page.getByText("每页").locator("xpath=following-sibling::button[1]").click();
  await page.getByRole("option", { name: "10", exact: true }).click();
  await resized;
  await expect(page.getByRole("button", { name: "1", exact: true })).toBeVisible();
});

test("REQ-IT1-03/04 后台门店表单无省市、区域商圈来自系统列表、后端补齐省市", async ({ page }) => {
  const { ctx, dispose } = await createApiContext();
  let district = "";
  let circle = "";
  let createdCompanyId = "";
  try {
    const created = await ctx.post("/api/v1/admin/merchant/companies", { data: { company_name: `${MARK}门店公司` } });
    expect(created.ok()).toBeTruthy();
    createdCompanyId = ((await created.json()) as { id: string }).id;

    const districts = await read<{ items: string[] }>(ctx, "/api/v1/admin/merchant/districts");
    expect(districts.items.length).toBeGreaterThan(0);
    // 选一个存在系统商圈的区域，才能覆盖「商圈来自列表」的 picker 分支
    for (const candidate of districts.items.slice(0, 5)) {
      const circles = await read<{ items: string[] }>(
        ctx,
        `/api/v1/admin/merchant/business-circles?district=${encodeURIComponent(candidate)}`,
      );
      if (circles.items.length > 0) {
        district = candidate;
        circle = circles.items[0];
        break;
      }
    }
    expect(district, "前 5 个区域都没有系统商圈候选，无法覆盖列表选择分支").not.toBe("");
  } finally {
    await dispose();
  }

  await loginPage(page);
  await test.step("打开新建门店页", async () => {
    await page.goto("/admin/merchant/stores/new");
  });

  // REQ-IT1-03：省市字段下线
  await expect(page.getByLabel("省份")).toHaveCount(0);
  await expect(page.getByLabel("城市")).toHaveCount(0);
  await expect(page.getByPlaceholder("省份")).toHaveCount(0);
  await expect(page.getByPlaceholder("城市")).toHaveCount(0);

  await test.step("搜索并选择公司", async () => {
  await page.getByPlaceholder("输入公司名称搜索").fill(`${MARK}门店公司`);
  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByRole("button", { name: new RegExp(`${MARK}门店公司`) }).click();
  await expect(page.getByText(`${MARK}门店公司`).first()).toBeVisible();

  });

  const storeName = `${MARK}门店`;
  // 与其他用例的门店坐标保持 >500m（后端查重半径 _DISTANCE_LIMIT_M = 500），
  // 否则并行/重复执行时会命中「疑似重复门店」而要求强制新建理由。
  const coordOffset = test.info().parallelIndex * 0.02 + Math.random() * 0.005;
  const lng = (121.6 + coordOffset).toFixed(5);
  const lat = (31.3 + coordOffset).toFixed(5);
  await test.step("填写基础字段", async () => {
    await page.getByLabel("门店名称").fill(storeName);
    await page.getByLabel("经度（GCJ-02）").fill(lng);
    await page.getByLabel("纬度（GCJ-02）").fill(lat);
  });

  // REQ-IT1-04：区域只能从系统列表选择
  await page.getByRole("combobox", { name: "区域", exact: true }).click();
  await page.getByRole("option", { name: district, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "区域", exact: true })).toContainText(district);

  // 商圈来自该区域的系统商圈列表
  await page.getByRole("combobox", { name: "商圈", exact: true }).click();
  await page.getByRole("option", { name: circle, exact: true }).click();
  await expect(page.getByRole("combobox", { name: "商圈", exact: true })).toContainText(circle);

  await page.getByLabel("详细地址").fill(`${district}${circle}测试路 1 号`);
  await page.getByLabel("联系人").fill("迭代一");
  await page.getByLabel("联系电话").fill("13800000001");
  // 兜底：极端情况下仍命中查重（历史残留数据），补强制新建理由放行，避免用例假失败
  if (await page.getByText("疑似重复门店").first().isVisible()) {
    await page.getByLabel("强制新建理由").fill("E2E 迭代 1 用例：坐标唯一但命中历史残留门店");
  }
  const created = page.waitForResponse(
    (res) => res.request().method() === "POST" && res.url().endsWith("/api/v1/admin/merchant/stores"),
  );
  await page.getByRole("button", { name: "保存门店" }).click();

  const createdRes = await created;
  const createdBody = await createdRes.text();
  expect(createdRes.ok(), `新建门店失败 HTTP ${createdRes.status()} body=${createdBody.slice(0, 300)}`).toBeTruthy();
  const storeId = (JSON.parse(createdBody) as { store: StoreResp }).store.id;
  await page.waitForURL(new RegExp(`/admin/merchant/stores/${storeId}$`), { timeout: 20000 });

  const { ctx: verifyCtx, dispose: disposeVerify } = await createApiContext();
  try {
    const store = await read<StoreResp>(verifyCtx, `/api/v1/admin/merchant/stores/${storeId}`);
    // 契约：前端不传省市，后端按默认规则补齐（Q1=A）
    expect(store.province).toBe("上海市");
    expect(store.city).toBe("上海市");
    expect(store.district).toBe(district);
    expect(store.business_circle).toBe(circle);
    expect(createdCompanyId).not.toBe("");
  } finally {
    await disposeVerify();
  }
});

test("Q4 后台门店列表移除省/市筛选控件，区县/商圈筛选保留", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin/merchant/stores");
  await expect(page.getByPlaceholder("省份")).toHaveCount(0);
  await expect(page.getByPlaceholder("城市")).toHaveCount(0);
  await expect(page.getByPlaceholder("区县")).toBeVisible();
  await expect(page.getByPlaceholder("商圈")).toBeVisible();
});

test("REQ-IT1-01/02/04 小程序源码断言：新增公司入口需先搜索、按钮不超宽、区域商圈为选择器", async () => {
  const createWxml = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/store/create/index.wxml"), "utf8");
  const themeWxss = fs.readFileSync(path.resolve(MINIAPP, "styles/merchant-theme.wxss"), "utf8");
  const brokerWxml = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/broker/store-create/index.wxml"), "utf8");

  // REQ-IT1-01：入口由 companySearched 控制
  expect(createWxml).toMatch(/<view class="link-row" wx:if="\{\{companySearched\}\}">/);

  // REQ-IT1-02：按钮/容器 border-box，避免 padding 撑破 100% 宽度（样式已收敛到共享主题）
  expect(themeWxss).toMatch(/\.mbtn\s*\{[^}]*box-sizing:\s*border-box/);
  expect(themeWxss).toMatch(/\.page\s*\{[^}]*box-sizing:\s*border-box/);

  // REQ-IT1-04：字段顺序 门店名称 → 地图选点 → 区域/商圈
  const nameIndex = createWxml.indexOf("门店名称");
  const mapIndex = createWxml.indexOf("门店位置 *");
  const districtIndex = createWxml.indexOf("区域 *");
  expect(nameIndex).toBeGreaterThan(-1);
  expect(mapIndex).toBeGreaterThan(nameIndex);
  expect(districtIndex).toBeGreaterThan(mapIndex);

  // 区域/商圈改为 picker，且区域来自 districts 字典
  expect(createWxml).toMatch(/range="\{\{districts\}\}"/);
  expect(createWxml).toMatch(/bindchange="onSelectDistrict"/);
  expect(createWxml).toMatch(/bindchange="onSelectBusinessCircle"/);
  // 省/市输入项已下线
  expect(createWxml).not.toContain("form.province");
  expect(createWxml).not.toContain("form.city");
  expect(brokerWxml).not.toContain("form.province");
  expect(brokerWxml).not.toContain("form.city");
  expect(brokerWxml).toMatch(/bindchange="onSelectDistrict"/);
});
