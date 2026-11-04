import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createApiContext } from "./helpers/auth";

/**
 * 商户管理模块 迭代 4（docs/商户管理模块需求/商户管理模块-需求与迭代记录.md §10，来源 m01938）验证用例。
 *
 * 覆盖：
 * - REQ-IT4-01 底部主按钮居中（全局 box-sizing + footer flex，源码断言）
 * - REQ-IT4-02 门店列表按距离由近到远（后端 origin_lng/origin_lat + distance_m）
 * - REQ-IT4-03 照片补录可上传（存储后端 local，返回 /static/uploads/ 且可访问）
 * - REQ-IT4-04 门店详情 onShow 刷新（源码断言，小程序页面无法在 Playwright 内运行）
 * - REQ-IT4-05 合作状态可选值由后端 status-options 裁决（不再由前端复制权限规则）
 *
 * C 端（/public/**）需要 C 端令牌（aud=c），后台 admin 令牌调用会 401，故 C 端用例自取令牌。
 * 串行执行：afterAll 按 MARK 清理本文件造的数据，并行会互相删除。
 */

test.describe.configure({ mode: "serial", timeout: 120_000 });

const BACKEND = path.resolve(__dirname, "../../backend");
const MINIAPP = path.resolve(__dirname, "../../miniapp");
const API_BASE = process.env.E2E_API_BASE ?? "http://127.0.0.1:8000";
const MARK = `E2EIT4${Date.now()}`;
const PHONE = `139${MARK.slice(-8)}`;
const ORIGIN = {
  lng: 122.6 + (Number(MARK.slice(-4)) % 500) / 1000,
  lat: 32.6 + (Number(MARK.slice(-4)) % 400) / 1000,
};

let companyId = "";
let nearStoreId = "";
let farStoreId = "";
let cToken = "";

/** 1x1 透明 PNG（最小合法图片，用于验证上传链路）. */
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

async function cApi() {
  if (!cToken) {
    const ctx = await playwrightRequest.newContext();
    try {
      const res = await ctx.post(`${API_BASE}/api/v1/public/auth/token`, {
        form: {
          username: process.env.E2E_ADMIN_USER ?? "",
          password: process.env.E2E_ADMIN_PASSWORD ?? "",
        },
      });
      expect(res.ok(), `C 端令牌获取失败 HTTP ${res.status()}`).toBeTruthy();
      cToken = ((await res.json()) as { access_token: string }).access_token;
    } finally {
      await ctx.dispose();
    }
  }
  return playwrightRequest.newContext({
    baseURL: API_BASE,
    extraHTTPHeaders: { Authorization: `Bearer ${cToken}` },
  });
}

test.beforeAll(async () => {
  const { ctx, dispose } = await createApiContext();
  try {
    const company = await ctx.post("/api/v1/admin/merchant/companies", {
      data: { company_name: `${MARK}距离公司` },
    });
    expect(company.ok(), `建公司失败 HTTP ${company.status()}`).toBeTruthy();
    companyId = ((await company.json()) as { id: string }).id;

    const createStore = async (name: string, lng: number, lat: number): Promise<string> => {
      const res = await ctx.post("/api/v1/admin/merchant/stores", {
        data: {
          company_id: companyId,
          store_name: name,
          district: "浦东新区",
          business_circle: "陆家嘴商圈",
          address: `${MARK}距离测试路 1 号`,
          lng,
          lat,
          contact_name: "迭代四",
          contact_phone: PHONE,
          cooperation_status: "not_cooperated",
          // 兜底：历史残留数据可能落在 500m 查重半径内，补强制新建理由放行，避免用例假失败
          force_create_reason: "E2E 迭代 4 用例：坐标唯一但命中历史残留门店",
        },
      });
      const body = await res.text();
      expect(res.ok(), `建门店失败 HTTP ${res.status()} body=${body.slice(0, 300)}`).toBeTruthy();
      return (JSON.parse(body) as { store: { id: string } }).store.id;
    };

    // 同公司、邻近坐标：近店 ≈ 90m，远店 ≈ 4.7km（避免命中 500m 查重半径）
    nearStoreId = await createStore(`${MARK}近店`, ORIGIN.lng + 0.001, ORIGIN.lat);
    farStoreId = await createStore(`${MARK}远店`, ORIGIN.lng + 0.05, ORIGIN.lat);
  } finally {
    await dispose();
  }
});

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

test("REQ-IT4-02 门店列表按距离由近到远，未传原点时无距离", async () => {
  const ctx = await cApi();
  try {
    const withOrigin = await ctx.get(
      `/api/v1/public/merchant/stores?page=1&page_size=50&origin_lng=${ORIGIN.lng}&origin_lat=${ORIGIN.lat}`,
    );
    expect(withOrigin.ok(), `带原点查询失败 HTTP ${withOrigin.status()}`).toBeTruthy();
    const list = (await withOrigin.json()) as {
      items: Array<{ id: string; store_name: string; distance_m: number | null }>;
    };
    const distances = list.items.map((item) => item.distance_m);
    // 有坐标的门店必须回填距离，且整体升序（无坐标的排最后，distance_m 为 null）
    const numeric = distances.filter((value): value is number => value !== null);
    expect(numeric.length).toBeGreaterThan(0);
    expect([...numeric].sort((a, b) => a - b)).toEqual(numeric);

    const nearIndex = list.items.findIndex((item) => item.id === nearStoreId);
    const farIndex = list.items.findIndex((item) => item.id === farStoreId);
    expect(nearIndex, "近店不在列表中").toBeGreaterThanOrEqual(0);
    expect(farIndex, "远店不在列表中").toBeGreaterThanOrEqual(0);
    expect(nearIndex).toBeLessThan(farIndex);
    expect(numeric[nearIndex]).toBeLessThan(500);

    const withoutOrigin = await ctx.get("/api/v1/public/merchant/stores?page=1&page_size=5");
    expect(withoutOrigin.ok()).toBeTruthy();
    const plain = (await withoutOrigin.json()) as { items: Array<{ distance_m: number | null }> };
    expect(plain.items.every((item) => item.distance_m === null)).toBe(true);
  } finally {
    await ctx.dispose();
  }
});

test("REQ-IT4-05 合作状态可选值由后端裁决：排除当前状态，员工仅洽谈中", async () => {
  const ctx = await cApi();
  try {
    const res = await ctx.get(`/api/v1/public/merchant/stores/${nearStoreId}/status-options`);
    expect(res.ok(), `status-options 失败 HTTP ${res.status()}`).toBeTruthy();
    const body = (await res.json()) as {
      current_status: string;
      current_status_label: string;
      items: Array<{ code: string; label: string }>;
      reason: string | null;
    };
    // 当前门店为未合作 → 可选项里不应再出现未合作
    expect(body.current_status).toBe("not_cooperated");
    expect(body.items.length, "可选状态为空，用户会看到「没有状态可选」").toBeGreaterThan(0);
    expect(body.items.some((item) => item.code === "not_cooperated")).toBe(false);
    // 可选项来自系统字典，不是前端硬编码
    const dict = await ctx.get("/api/v1/public/dicts/merchant_cooperation_status");
    expect(dict.ok()).toBeTruthy();
    const codes = ((await dict.json()) as { items: Array<{ code: string }> }).items.map((item) => item.code);
    for (const item of body.items) {
      expect(codes).toContain(item.code);
      expect(item.label).not.toBe("");
    }
  } finally {
    await ctx.dispose();
  }
});

test("REQ-IT4-03 照片补录上传走本地存储并可访问", async () => {
  const ctx = await cApi();
  try {
    const res = await ctx.post("/api/v1/public/files/upload", {
      multipart: {
        file: { name: "e2e-it4.png", mimeType: "image/png", buffer: PNG_BYTES },
      },
    });
    const body = await res.text();
    expect(res.ok(), `上传失败 HTTP ${res.status()} body=${body.slice(0, 300)}`).toBeTruthy();
    const uploaded = JSON.parse(body) as { url: string; thumbnail_url: string | null };
    // .env STORAGE_BACKEND=local 时返回相对路径，由前端/小程序拼 origin
    expect(uploaded.url).toContain("/static/uploads/");

    const fetched = await ctx.get(`${API_BASE}${uploaded.url}`);
    expect(fetched.status(), `静态文件不可访问 ${uploaded.url}`).toBe(200);
    expect(fetched.headers()["content-type"] ?? "").toContain("image");
  } finally {
    await ctx.dispose();
  }
});

test("REQ-IT4-01 底部主按钮撑满：按钮类补 box-sizing，footer 用 flex 分配宽度（源码断言）", () => {
  const appWxss = fs.readFileSync(path.resolve(MINIAPP, "app.wxss"), "utf8");
  const btnPrimary = appWxss.slice(appWxss.indexOf(".btn-primary {"), appWxss.indexOf(".btn-primary::after"));
  expect(btnPrimary).toContain("box-sizing: border-box");
  const btnSecondary = appWxss.slice(appWxss.indexOf(".btn-secondary {"), appWxss.indexOf(".btn-secondary::after"));
  expect(btnSecondary).toContain("box-sizing: border-box");

  // 底栏与按钮样式已收敛到共享主题：.foot 为 flex，.foot .mbtn 由父级分配宽度
  const themeWxss = fs.readFileSync(path.resolve(MINIAPP, "styles/merchant-theme.wxss"), "utf8");
  const footer = themeWxss.slice(themeWxss.indexOf(".foot {"), themeWxss.indexOf(".foot .mbtn"));
  expect(footer, "共享主题的 .foot 未使用 flex").toContain("display: flex");
  expect(footer).toContain("align-items: center");
  const footerBtn = themeWxss.slice(themeWxss.indexOf(".foot .mbtn {"));
  expect(footerBtn.slice(0, footerBtn.indexOf("}")), "共享主题的底栏按钮未撑满").toContain("flex: 1");
});

test("REQ-IT4-02 小程序首页：进入/刷新重新定位并带原点请求（源码断言）", () => {
  const homeTs = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/home/index.ts"), "utf8");
  const homeWxml = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/home/index.wxml"), "utf8");

  expect(homeTs).toContain("getCurrentLocation");
  expect(homeTs).toContain("refreshLocationAndLoad");
  expect(homeTs).toMatch(/origin_lng: origin\?\.lng/);
  // onShow 先处理扫码进入的 scene（REQ-IT7-09），再刷新定位与列表
  expect(homeTs).toMatch(/onShow\(\) \{[\s\S]*?getEnterOptionsSync[\s\S]*?void this\.refreshLocationAndLoad\(\);/);
  expect(homeWxml).toMatch(/bindtap="onRefresh"/);
  expect(homeWxml).toContain("store__distance");
});

test("REQ-IT4-04/05 小程序门店详情：onShow 静默刷新 + 消费 status-options（源码断言）", () => {
  const detailTs = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/store/detail/index.ts"), "utf8");
  const detailWxml = fs.readFileSync(path.resolve(MINIAPP, "pages/merchant/store/detail/index.wxml"), "utf8");

  // REQ-IT4-04：返回详情页也要刷新，否则拜访时间线不更新
  expect(detailTs).toContain("onShow()");
  expect(detailTs).toContain("silent: Boolean(self.loadedOnce)");
  // REQ-IT4-05：可选状态来自后端，前端不再用 role/additional_roles 自行判定
  expect(detailTs).toContain("/status-options");
  expect(detailTs).not.toContain("additional_roles");
  expect(detailWxml).toContain("statusHint");
});

test("REQ-IT4-06 表单主操作按钮铺满父容器：共享主题 .mbtn--cta 宽度 100%（全仓回归）", () => {
  // 按钮体系已收敛到 styles/merchant-theme.wxss：主操作统一 .mbtn--cta，
  // 底栏 .foot 为 flex，按钮不应再依赖各页 `.submit-btn` 样式。
  const theme = fs.readFileSync(path.resolve(MINIAPP, "styles/merchant-theme.wxss"), "utf8");
  const ctaStart = theme.indexOf(".mbtn--cta {");
  expect(ctaStart, "共享主题缺少 .mbtn--cta").toBeGreaterThanOrEqual(0);
  const ctaBlock = theme.slice(ctaStart, theme.indexOf("}", ctaStart));
  expect(ctaBlock).toContain("width: 100% !important");

  // 商户端四个表单页的主操作必须使用 .mbtn--cta（宽度由主题保证，不再贴左）
  for (const page of ["agreement/create", "agreement/sign", "broker", "broker/store-create"]) {
    const wxml = fs.readFileSync(path.resolve(MINIAPP, `pages/merchant/${page}/index.wxml`), "utf8");
    expect(wxml, `${page} 的主操作未使用 .mbtn--cta`).toContain("mbtn--cta");
  }
});
