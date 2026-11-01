import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 商户管理模块 迭代 2（docs/商户管理模块需求/商户管理模块-需求与迭代记录.md §8）验证用例。
 *
 * 覆盖：
 * - REQ-IT2-01 门店表单：区域未选择不允许建店（必填拦截）
 * - REQ-IT2-02 小程序建店页源码断言：无「首次拜访」区块与首访请求（后端放宽由
 *   backend/tests/test_merchant_store_visit.py::test_employee_create_store_without_first_visit 覆盖）
 * - REQ-IT2-03 小程序拜访页源码断言：拜访人改为门店经纪人选择器
 *
 * 注：区域/商圈字典维护页已随 REQ-IT3-01 迁到楼盘字典模块，
 * 其用例见 `e2e/building-dict-region-dicts.spec.ts`。
 *
 * ⚠️ 小程序页面无法在 Playwright 中运行，故小程序部分以源码断言锁住回归点；
 * C 端（/public/merchant/**）需要 C 端令牌，后台 admin 令牌调用会 401，因此接口层验证不放这里。
 */

test.describe.configure({ timeout: 120_000 });

const BACKEND = path.resolve(__dirname, "../../backend");
const MINIAPP = path.resolve(__dirname, "../../miniapp");
const MARK = `E2EIT2${Date.now()}`;

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

test("REQ-IT2-01 门店表单：城市字段下线，区域/商圈未选不允许建店", async ({ page }) => {
  const { ctx, dispose } = await createApiContext();
  try {
    const created = await ctx.post("/api/v1/admin/merchant/companies", {
      data: { company_name: `${MARK}表单公司` },
    });
    expect(created.ok()).toBeTruthy();
  } finally {
    await dispose();
  }

  await loginPage(page);
  await page.goto("/admin/merchant/stores/new");
  await expect(page.getByLabel("省份")).toHaveCount(0);
  await expect(page.getByLabel("城市")).toHaveCount(0);

  await page.getByPlaceholder("输入公司名称搜索").fill(`${MARK}表单公司`);
  await page.getByRole("button", { name: "搜索" }).click();
  await page.getByRole("button", { name: new RegExp(`${MARK}表单公司`) }).click();

  const offset = test.info().parallelIndex * 0.02 + Math.random() * 0.005;
  await page.getByLabel("门店名称").fill(`${MARK}待校验门店`);
  await page.getByLabel("经度（GCJ-02）").fill((122.4 + offset).toFixed(5));
  await page.getByLabel("纬度（GCJ-02）").fill((32.4 + offset).toFixed(5));
  await page.getByLabel("详细地址").fill(`${MARK}未选区域测试路`);
  await page.getByLabel("联系人").fill("迭代二");
  await page.getByLabel("联系电话").fill("13800000002");

  // REQ-IT2-01：区域为必填，未选择直接拦在建店前
  await page.getByRole("button", { name: "保存门店" }).click();
  await expect(page.getByText("请选择或填写区域")).toBeVisible();
});

test("REQ-IT2-02/03 小程序源码断言：建店页无首访、拜访页拜访人从经纪人选择", () => {
  const createTs = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/store/create/index.ts"), "utf8");
  const createWxml = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/store/create/index.wxml"), "utf8");
  const visitTs = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/visit/create/index.ts"), "utf8");
  const visitWxml = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/visit/create/index.wxml"), "utf8");

  // REQ-IT2-02：首访模块与相关请求全部下线
  expect(createWxml).not.toContain("首次拜访");
  expect(createWxml).not.toContain("firstVisit");
  expect(createWxml).not.toContain("拜访结果");
  expect(createTs).not.toContain("firstVisit");
  expect(createTs).not.toContain("first_visit");
  expect(createTs).not.toContain("merchant_visit_result");

  // REQ-IT2-03：拜访人来自门店经纪人，兜底手填
  expect(visitWxml).toContain("拜访人");
  expect(visitWxml).toMatch(/range="\{\{brokerLabels\}\}"/);
  expect(visitWxml).toMatch(/bindchange="onSelectBroker"/);
  expect(visitWxml).toContain("门店暂无经纪人，可填写联系人");
  expect(visitTs).toContain("loadBrokers");
  expect(visitTs).toContain("/brokers`");
});

test("REQ-IT2-01 门店表单区域候选为空时提供手填降级（源码断言）", () => {
  const formTs = fs.readFileSync(
    path.resolve(__dirname, "../src/app/(main)/admin/merchant/stores/new/page.tsx"),
    "utf8",
  );
  // 有候选 → Select；无候选 → Input 手填（Q3=A：仅候选为空时允许手填）
  expect(formTs).toMatch(/districtOptions\.length \?/);
  expect(formTs).toContain("系统暂无区域候选，请手工填写区域");
  // 必填校验在前端也拦一次
  expect(formTs).toContain("请选择或填写区域");
  expect(formTs).toContain("请选择或填写商圈");
});
