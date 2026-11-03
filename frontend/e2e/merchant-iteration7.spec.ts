import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, expect, request as playwrightRequest } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 商户管理模块 迭代 7（docs/商户管理模块需求/商户管理模块-需求与迭代记录.md §13，来源 m03941）验证用例。
 *
 * 覆盖：
 * - REQ-IT7-02 公司软删除：接口删除后列表隐藏、有门店时 409、后台 UI 填原因删除
 * - REQ-IT7-01 门店软删除：后台 UI 删除后列表不再展示
 * - REQ-IT7-01 门店详情抽屉：整行/详情按钮打开抽屉 → 编辑 → 保存修改 → 接口回读
 * - REQ-IT7-03 经纪人模块设计稿：文件存在且包含 Steep 设计要素、无外部资源依赖
 * - REQ-IT7-03 经纪人管理页：KPI / 分段筛选 / 新建弹层 / 详情抽屉 / 编辑资料（设计稿落代码）
 * - REQ-IT7-08 经纪人绑定门店：扫码 / 搜索两条路径，搜索无结果可创建新门店
 * - REQ-IT7-10 经纪人推荐记录：点击跳转评估详情
 * - REQ-IT7-11 经纪人来源展示：source=self_apply 时按 bind_source 展示扫码/分享绑定
 * - REQ-IT7-12 经纪人邀请人展示：列表/抽屉展示邀请人姓名，串起 经纪人 → 门店 → 内部员工
 * - REQ-IT7-13 对接人展示：经纪人/门店的列表与抽屉展示绑定门店的负责人（内部员工）
 * - REQ-IT7-14 经纪人中心：移除绑定历史，底部展示对接人并支持一键拨号
 *
 * 串行执行：afterAll 按 MARK 清理本文件造的数据，并行会互相删除。
 */

test.describe.configure({ mode: "serial", timeout: 120_000 });

const BACKEND = path.resolve(__dirname, "../../backend");
const DESIGN = path.resolve(__dirname, "../../docs/design/admin-merchant-brokers");
const MARK = `E2EIT7${Date.now()}`;
const PHONE = `138${MARK.slice(-8)}`;

async function createCompany(
  ctx: Awaited<ReturnType<typeof createApiContext>>["ctx"],
  suffix: string,
): Promise<string> {
  const res = await ctx.post("/api/v1/admin/merchant/companies", {
    data: { company_name: `${MARK}${suffix}` },
  });
  expect(res.ok(), `建公司失败 HTTP ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

async function createStore(
  ctx: Awaited<ReturnType<typeof createApiContext>>["ctx"],
  companyId: string,
  suffix: string,
): Promise<string> {
  const seq = Number(MARK.slice(-4)) % 400;
  const res = await ctx.post("/api/v1/admin/merchant/stores", {
    data: {
      company_id: companyId,
      store_name: `${MARK}${suffix}`,
      district: "浦东新区",
      business_circle: "陆家嘴商圈",
      address: `${MARK}${suffix}路 1 号`,
      lng: 121.5 + seq / 1000,
      lat: 31.2 + seq / 1200,
      contact_name: "迭代七",
      contact_phone: PHONE,
      cooperation_status: "not_cooperated",
      force_create_reason: "E2E 迭代 7 用例：坐标唯一但可能命中历史残留门店",
    },
  });
  expect(res.ok(), `建门店失败 HTTP ${res.status()}`).toBeTruthy();
  return ((await res.json()) as { store: { id: string } }).store.id;
}

let deletableCompany = "";
let companyWithStore = "";
let companyWithStoreId = "";
let uiCompany = "";
let storeForUiDelete = "";
let storeForDrawer = "";
let drawerCompany = "";
let storeForRebind = "";

test.beforeAll(async () => {
  const { ctx, dispose } = await createApiContext();
  try {
    deletableCompany = await createCompany(ctx, "可删公司");
    companyWithStore = await createCompany(ctx, "有店公司");
    companyWithStoreId = await createStore(ctx, companyWithStore, "有店门店");
    uiCompany = await createCompany(ctx, "界面删除公司");
    const storeDeleteCompany = await createCompany(ctx, "门店删除公司");
    storeForUiDelete = await createStore(ctx, storeDeleteCompany, "待删门店");
    drawerCompany = await createCompany(ctx, "抽屉公司");
    storeForDrawer = await createStore(ctx, drawerCompany, "抽屉门店");
    const rebindCompany = await createCompany(ctx, "换绑公司");
    storeForRebind = await createStore(ctx, rebindCompany, "换绑目标门店");
  } finally {
    await dispose();
  }
});

test("REQ-IT7-02 公司软删除：删除后列表隐藏，有门店时 409", async () => {
  const { ctx, dispose } = await createApiContext();
  try {
    const del = await ctx.post(`/api/v1/admin/merchant/companies/${deletableCompany}/delete`, {
      data: { reason: "E2E 迭代 7：公司软删除" },
    });
    expect(del.status(), await del.text()).toBe(200);

    const list = await ctx.get(
      `/api/v1/admin/merchant/companies?keyword=${encodeURIComponent(`${MARK}可删公司`)}&include_disabled=true&page=1&page_size=20`,
    );
    expect(list.ok()).toBeTruthy();
    const body = (await list.json()) as { items: { id: string }[]; total: number };
    expect(body.items.map((item) => item.id)).not.toContain(deletableCompany);
    expect(body.total).toBe(0);

    const blocked = await ctx.post(`/api/v1/admin/merchant/companies/${companyWithStore}/delete`, {
      data: { reason: "E2E 迭代 7：有门店应拦截" },
    });
    expect(blocked.status()).toBe(409);
    expect(((await blocked.json()) as { message: string }).message).toContain("门店");

    // 幂等：重复删除同一公司仍返回 200
    const again = await ctx.post(`/api/v1/admin/merchant/companies/${deletableCompany}/delete`, {
      data: { reason: "E2E 迭代 7：重复删除" },
    });
    expect(again.status()).toBe(200);
    expect(companyWithStoreId).toBeTruthy();
  } finally {
    await dispose();
  }
});

test("REQ-IT7-02 公司删除 UI：填写原因后从列表移除", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin/merchant/companies");
  await page.getByLabel("按公司名称搜索").fill(`${MARK}界面删除公司`);
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.getByText(`${MARK}界面删除公司`).first()).toBeVisible();

  await page.getByRole("button", { name: `删除公司 ${MARK}界面删除公司` }).click();
  await page.getByLabel("删除原因").fill("E2E 迭代 7：后台 UI 删除公司");
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText(`${MARK}界面删除公司`)).toHaveCount(0);

  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.get(
      `/api/v1/admin/merchant/companies?keyword=${encodeURIComponent(`${MARK}界面删除公司`)}&include_disabled=true&page=1&page_size=20`,
    );
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((item) => item.id)).not.toContain(uiCompany);
  } finally {
    await dispose();
  }
});

test("REQ-IT7-01 门店软删除：后台 UI 删除后列表不再展示", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin/merchant/stores");
  await page.getByLabel("搜索门店").fill(`${MARK}待删门店`);
  await page.getByRole("button", { name: "查询" }).click();
  await expect(page.getByText(`${MARK}待删门店`).first()).toBeVisible();

  await page.getByRole("button", { name: `删除门店 ${MARK}待删门店` }).click();
  await page.getByLabel("删除原因").fill("E2E 迭代 7：后台 UI 删除门店");
  await page.getByRole("button", { name: "确认删除" }).click();
  await expect(page.getByText(`${MARK}待删门店`)).toHaveCount(0);

  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.get(
      `/api/v1/admin/merchant/stores?keyword=${encodeURIComponent(`${MARK}待删门店`)}&page=1&page_size=20`,
    );
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items: { id: string }[] };
    expect(body.items.map((item) => item.id)).not.toContain(storeForUiDelete);
  } finally {
    await dispose();
  }
});

test("REQ-IT7-01 门店详情抽屉：查看 → 编辑 → 保存修改", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin/merchant/stores");
  await page.getByLabel("搜索门店").fill(`${MARK}抽屉门店`);
  await page.getByRole("button", { name: "查询" }).click();
  await page.getByRole("button", { name: "详情" }).first().click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("基础信息")).toBeVisible();
  await expect(drawer.getByText(`${MARK}抽屉门店`).first()).toBeVisible();

  await drawer.getByRole("button", { name: "编辑" }).click();
  const nameInput = drawer.getByLabel(/门店名称/);
  await expect(nameInput).toBeVisible();
  await nameInput.fill(`${MARK}抽屉门店改名`);
  await drawer.getByRole("button", { name: "保存修改" }).click();
  await expect(drawer.getByText(`${MARK}抽屉门店改名`).first()).toBeVisible();

  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.get(`/api/v1/admin/merchant/stores/${storeForDrawer}`);
    expect(res.ok()).toBeTruthy();
    const detail = (await res.json()) as { store_name: string; district: string };
    expect(detail.store_name).toBe(`${MARK}抽屉门店改名`);
    expect(detail.district).toBeTruthy();
  } finally {
    await dispose();
  }
});

test("REQ-IT7-03 经纪人管理页：KPI / 分段筛选 / 新建弹层 / 详情抽屉 / 编辑资料", async ({ page }) => {
  const phone = `137${MARK.slice(-8)}`;
  const { ctx, dispose } = await createApiContext();
  let brokerId = "";
  try {
    const res = await ctx.post("/api/v1/admin/merchant/brokers", {
      data: { name: `${MARK}经纪人`, phone, store_id: storeForDrawer, remark: "E2E 迭代 7 经纪人模块" },
    });
    expect(res.ok(), `建经纪人失败 HTTP ${res.status()}`).toBeTruthy();
    brokerId = ((await res.json()) as { id: string }).id;
  } finally {
    await dispose();
  }

  await loginPage(page);
  await page.goto("/admin/merchant/brokers");
  await expect(page.getByText("经纪人总数")).toBeVisible();
  await expect(page.getByText("待审核绑定")).toBeVisible();
  for (const label of ["全部", "已绑定", "未绑定", "待审核"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${label}`) })).toBeVisible();
  }

  const createdName = `${MARK}新建经纪人`;
  await page.getByRole("button", { name: /新建经纪人/ }).click();
  await expect(page.getByText("手机号用于绑定唯一档案")).toBeVisible();
  await page.getByLabel("经纪人姓名").fill(createdName);
  await page.getByLabel("经纪人手机号").fill(`136${MARK.slice(-8)}`);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByText(createdName)).toBeVisible();

  const { ctx: createCtx, dispose: createDispose } = await createApiContext();
  try {
    const res = await createCtx.get(`/api/v1/admin/merchant/brokers?keyword=${encodeURIComponent(createdName)}`);
    expect(res.ok()).toBeTruthy();
    expect(((await res.json()) as { total: number }).total).toBe(1);
  } finally {
    await createDispose();
  }

  await page.getByLabel("搜索经纪人").fill(`${MARK}经纪人`);
  await page.getByLabel("搜索经纪人").press("Enter");
  const row = page.getByRole("button", { name: `查看经纪人 ${MARK}经纪人` });
  await expect(row).toBeVisible();
  await expect(page.getByText(`${MARK}经纪人改名`)).toHaveCount(0);
  await row.click();

  const drawer = page.getByRole("dialog");
  await expect(drawer.getByRole("heading", { name: "绑定信息" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "基本信息" })).toBeVisible();
  await expect(drawer.getByRole("heading", { name: "绑定历史" })).toBeVisible();
  await drawer.getByRole("button", { name: /编辑资料/ }).click();
  const nameInput = page.getByLabel("经纪人姓名");
  await expect(nameInput).toBeVisible();
  await nameInput.fill(`${MARK}经纪人改名`);
  await page.getByRole("button", { name: "保存" }).click();
  await expect(page.getByRole("dialog").getByText(`${MARK}经纪人改名`).first()).toBeVisible();

  const verify = await createApiContext();
  try {
    const res = await verify.ctx.get(`/api/v1/admin/merchant/brokers/${brokerId}`);
    expect(res.ok()).toBeTruthy();
    expect(((await res.json()) as { name: string }).name).toBe(`${MARK}经纪人改名`);
  } finally {
    await verify.dispose();
  }
});

test("REQ-IT7-05 换绑门店改为关键词搜索选择（万级门店可用）", async ({ page }) => {
  const phone = `139${MARK.slice(-8)}`;
  const brokerName = `${MARK}换绑经纪人`;
  let brokerId = "";
  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.post("/api/v1/admin/merchant/brokers", {
      data: { name: brokerName, phone, store_id: storeForDrawer, remark: "E2E 迭代 7 换绑搜索" },
    });
    expect(res.ok(), `建经纪人失败 HTTP ${res.status()}`).toBeTruthy();
    brokerId = ((await res.json()) as { id: string }).id;
  } finally {
    await dispose();
  }

  await loginPage(page);
  await page.goto("/admin/merchant/brokers");
  await page.getByLabel("搜索经纪人").fill(brokerName);
  await page.getByLabel("搜索经纪人").press("Enter");
  await page.getByRole("button", { name: `查看经纪人 ${brokerName}` }).click();

  const drawer = page.getByRole("dialog").first();
  await drawer.getByRole("button", { name: "换绑" }).click();
  const rebind = page.getByRole("dialog").last();
  await rebind.getByLabel("搜索新门店").fill(`${MARK}换绑目标门店`);
  await rebind
    .getByRole("option")
    .filter({ hasText: `${MARK}换绑目标门店` })
    .first()
    .click();
  await rebind.getByLabel("换绑原因").fill("E2E 迭代 7：换绑到目标门店");
  await rebind.getByRole("button", { name: "确认换绑" }).click();
  await expect(page.getByRole("button", { name: "确认换绑" })).toHaveCount(0);

  const verify = await createApiContext();
  try {
    await expect
      .poll(
        async () => {
          const res = await verify.ctx.get(`/api/v1/admin/merchant/brokers/${brokerId}?t=${Date.now()}`);
          if (!res.ok()) return "";
          const body = (await res.json()) as { store_id: string | null };
          return body.store_id ?? "";
        },
        { timeout: 10_000 },
      )
      .toBe(storeForRebind);
    const res = await verify.ctx.get(`/api/v1/admin/merchant/brokers/${brokerId}?t=${Date.now()}`);
    const body = (await res.json()) as { store_name: string | null };
    expect(body.store_name).toContain(`${MARK}换绑目标门店`);
  } finally {
    await verify.dispose();
  }
});

test("REQ-IT7-03 经纪人模块设计稿存在且遵循 Steep 规范", () => {
  const htmlPath = path.join(DESIGN, "index.html");
  const metaPath = path.join(DESIGN, "_d_meta.json");
  expect(fs.existsSync(htmlPath), `缺少设计稿 ${htmlPath}`).toBeTruthy();
  expect(fs.existsSync(metaPath), `缺少设计资产登记 ${metaPath}`).toBeTruthy();

  const html = fs.readFileSync(htmlPath, "utf8");
  expect(html).toContain("经纪人管理");
  expect(html).toContain("新建经纪人");
  expect(html).toContain("#17191c");
  expect(html).toMatch(/--font-serif/);
  // 自包含：不得引用外部脚本/样式/字体/图片（评审环境可能离线）
  expect(html).not.toMatch(/<script[^>]+src=/i);
  expect(html).not.toMatch(/<link[^>]+href=["']https?:/i);
  expect(html).not.toMatch(/url\(["']?https?:/i);

  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as {
    type: string;
    assets: Record<string, { versions: { path: string; status: string }[] }>;
  };
  expect(meta.type).toBe("design");
  expect(meta.assets["经纪人管理"]?.versions[0]?.path).toBe("index.html");
  expect(meta.assets["经纪人管理"]?.versions[0]?.status).toBe("needs-review");
});

test("REQ-IT7-07 经纪人建店页公司搜索有可见反馈且接口可查", async () => {
  const pageDir = path.resolve(__dirname, "../../miniapp/pages/merchant/broker/store-create");
  const pageTs = fs.readFileSync(path.join(pageDir, "index.ts"), "utf8");
  const pageWxml = fs.readFileSync(path.join(pageDir, "index.wxml"), "utf8");
  const pageWxss = fs.readFileSync(path.join(pageDir, "index.wxss"), "utf8");

  // 进页面自动带出候选 + 输入防抖自动搜索：不依赖用户点按钮才发现「没反应」
  expect(pageTs).toMatch(/void this\.searchCompanies\(\);/);
  expect(pageTs).toContain("companyTimer");
  expect(pageTs).toContain("setTimeout");
  // 三种可见反馈缺一不可
  expect(pageTs).toContain("companiesLoading");
  expect(pageTs).toContain("companiesSearched");
  expect(pageTs).toContain("companiesError");
  expect(pageWxml).toContain("正在搜索公司");
  expect(pageWxml).toContain("没有找到匹配的公司");
  expect(pageWxml).toContain("company-status");
  expect(pageWxss).toContain(".company-status");

  // 接口连通性：C 端令牌按关键词能查到新建公司，查不到时返回空数组
  const { ctx: adminCtx, dispose } = await createApiContext();
  const companyName = `${MARK}搜索目标公司`;
  try {
    const created = await adminCtx.post("/api/v1/admin/merchant/companies", {
      data: { company_name: companyName },
    });
    expect(created.ok(), `建公司失败 HTTP ${created.status()}`).toBeTruthy();
  } finally {
    await dispose();
  }

  const tokenCtx = await playwrightRequest.newContext();
  let cToken = "";
  try {
    const res = await tokenCtx.post(`${process.env.E2E_API_BASE ?? "http://127.0.0.1:8000"}/api/v1/public/auth/token`, {
      form: {
        username: process.env.E2E_ADMIN_USER ?? "",
        password: process.env.E2E_ADMIN_PASSWORD ?? "",
      },
    });
    expect(res.ok(), `C 端令牌获取失败 HTTP ${res.status()}`).toBeTruthy();
    cToken = ((await res.json()) as { access_token: string }).access_token;
  } finally {
    await tokenCtx.dispose();
  }

  const cCtx = await playwrightRequest.newContext({
    baseURL: process.env.E2E_API_BASE ?? "http://127.0.0.1:8000",
    extraHTTPHeaders: { Authorization: `Bearer ${cToken}` },
  });
  try {
    const matched = await cCtx.get(
      `/api/v1/public/merchant/broker-companies?keyword=${encodeURIComponent(`${MARK}搜索目标`)}`,
    );
    expect(matched.ok(), `公司搜索失败 HTTP ${matched.status()}`).toBeTruthy();
    const matchedBody = (await matched.json()) as { items: { company_name: string }[] };
    expect(matchedBody.items.map((item) => item.company_name)).toContain(companyName);

    const empty = await cCtx.get(
      `/api/v1/public/merchant/broker-companies?keyword=${encodeURIComponent(`${MARK}不存在的公司`)}`,
    );
    expect(empty.ok()).toBeTruthy();
    const emptyBody = (await empty.json()) as { items: unknown[] };
    expect(emptyBody.items).toHaveLength(0);
  } finally {
    await cCtx.dispose();
  }
});

test("REQ-IT7-08 经纪人绑定门店：扫码 + 搜索两条路径，搜索无结果可创建", () => {
  const pageDir = path.resolve(__dirname, "../../miniapp/pages/merchant/broker");
  const ts = fs.readFileSync(path.join(pageDir, "index.ts"), "utf8");
  const wxml = fs.readFileSync(path.join(pageDir, "index.wxml"), "utf8");

  // 未绑定卡：扫码 + 搜索（页脚主 CTA）+ 创建 / 暂不绑定兜底，不能只剩「创建新门店」
  expect(wxml).toContain("扫码绑定门店");
  expect(wxml).toContain('bindtap="onScanBind"');
  expect(wxml).toContain("搜索绑定门店");
  expect(wxml).toContain('bindtap="onOpenBind"');
  expect(wxml).toContain("找不到自己的门店");
  expect(wxml).toContain('bindtap="onCreateStore"');

  // 认证页也能扫码识别门店，并可先搜索门店（认证后自动绑定）
  expect(wxml).toContain("扫码识别门店");
  expect(wxml).toContain("搜索门店（认证后绑定）");
  expect(wxml).toContain('bindtap="onOpenBindForRegister"');
  expect(ts).toContain("onOpenBindForRegister");
  // REQ-IT7-09：wx.scanCode 不能传 scanType，否则真机相机无法识别小程序码
  expect(ts).toContain("wx.scanCode({");
  expect(ts).not.toMatch(/scanType:\s*\[/);
  // 扫本小程序小程序码时 result 为空或 "*"，path 才有 scene；两个字段都尝试解析
  expect(ts).toContain("for (const candidate of [res.path, res.result])");
  expect(ts).toContain("pendingStoreId");

  // 搜索弹层：加载中 / 无结果 + 创建入口
  expect(wxml).toContain("门店搜索中");
  expect(wxml).toContain("找不到？创建新门店");
  expect(wxml).toContain('bindtap="onCreateStoreFromPanel"');

  // 扫码实现：解析小程序码 scene 短码 → 已认证直接绑定
  expect(ts).toContain("wx.scanCode");
  expect(ts).toContain("extractStoreQrCode");
  expect(ts).toMatch(/\[\?&\]scene=/);
  expect(ts).toContain("/public/merchant/brokers/me/bind");
  expect(ts).toContain("onCreateStoreFromPanel");
  expect(ts).toContain("storeSearching");
  expect(ts).toContain("storeSearched");
});

test("REQ-IT7-09 门店邀请二维码：主包落地页 + 冷/热启动都能解析 scene", async () => {
  const miniappDir = path.resolve(__dirname, "../../miniapp");
  const homeTs = fs.readFileSync(path.join(miniappDir, "pages/merchant/home/index.ts"), "utf8");
  const brokerTs = fs.readFileSync(path.join(miniappDir, "pages/merchant/broker/index.ts"), "utf8");
  const inviteTs = fs.readFileSync(path.join(miniappDir, "pages/merchant-invite/index.ts"), "utf8");
  const storeDetailTs = fs.readFileSync(
    path.join(miniappDir, "pages/merchant/store/detail/index.ts"),
    "utf8",
  );
  const appJson = JSON.parse(fs.readFileSync(path.join(miniappDir, "app.json"), "utf8")) as {
    pages: string[];
    subPackages?: { root: string; pages: string[] }[];
  };
  const qrService = fs.readFileSync(
    path.resolve(BACKEND, "services/merchant/broker_qr.py"),
    "utf8",
  );

  // 二维码落地页在主包，避免分包页面冷启动 scene 丢失
  expect(qrService).toContain('QR_PAGE = "pages/merchant-invite/index"');
  expect(qrService).toContain("env_version=env_version");

  // REQ-IT7-09：按当前运行版本生成小程序码（develop/trial/release），
  // 否则开发/体验阶段扫码会打开正式版，正式版没有新落地页时「没有任何反应」
  expect(storeDetailTs).toContain("getAccountInfoSync");
  expect(storeDetailTs).toContain("miniProgram.envVersion");
  expect(storeDetailTs).toContain("broker-qrcode?env_version=${envVersion}");
  expect(appJson.pages).toContain("pages/merchant-invite/index");
  const merchantSub = appJson.subPackages?.find((item) => item.root === "pages/merchant");
  expect(merchantSub?.pages ?? []).not.toContain("merchant-invite/index");

  // 落地页：冷启动 onLoad + 热启动 onShow 都解析 scene，并跳经纪人中心
  expect(inviteTs).toContain("getEnterOptionsSync");
  expect(inviteTs).toContain("parseSceneCode");
  expect(inviteTs).toContain("pages/merchant/broker/index?code=");
  expect(inviteTs).toContain("邀请链接无效");

  // 旧码兼容：首页 onShow 也处理 scene，且同一短码不重复跳转
  expect(homeTs).toContain("extractSceneCode");
  expect(homeTs).toContain("lastHandledSceneCode");
  expect(homeTs).toMatch(/onShow\(\)[\s\S]{0,400}getEnterOptionsSync/);

  // 经纪人页也可直接接收 scene（分享路径 / 未来改 page 不影响）
  expect(brokerTs).toContain("parseSceneCode");
  expect(brokerTs).toContain("options.scene");

  // 接口契约：生成的小程序码指向主包落地页，短码可解析回同一门店
  const tokenCtx = await playwrightRequest.newContext();
  let cToken = "";
  try {
    const res = await tokenCtx.post(
      `${process.env.E2E_API_BASE ?? "http://127.0.0.1:8000"}/api/v1/public/auth/token`,
      {
        form: {
          username: process.env.E2E_ADMIN_USER ?? "",
          password: process.env.E2E_ADMIN_PASSWORD ?? "",
        },
      },
    );
    expect(res.ok(), `C 端令牌获取失败 HTTP ${res.status()}`).toBeTruthy();
    cToken = ((await res.json()) as { access_token: string }).access_token;
  } finally {
    await tokenCtx.dispose();
  }

  const cCtx = await playwrightRequest.newContext({
    baseURL: process.env.E2E_API_BASE ?? "http://127.0.0.1:8000",
    extraHTTPHeaders: { Authorization: `Bearer ${cToken}` },
  });
  try {
    const gen = await cCtx.post(
      `/api/v1/public/merchant/stores/${storeForDrawer}/broker-qrcode?env_version=develop`,
    );
    expect(gen.ok(), await gen.text()).toBeTruthy();
    const qr = (await gen.json()) as {
      code: string;
      page: string;
      image_base64: string;
      env_version: string;
    };
    expect(qr.page).toBe("pages/merchant-invite/index");
    expect(qr.env_version).toBe("develop");
    expect(qr.image_base64.length).toBeGreaterThan(1000);

    const resolved = await cCtx.get(
      `/api/v1/public/merchant/broker-qrcodes/${encodeURIComponent(qr.code)}`,
    );
    expect(resolved.ok()).toBeTruthy();
    const resolvedBody = (await resolved.json()) as { valid: boolean; store_id: string };
    expect(resolvedBody.valid).toBe(true);
    expect(resolvedBody.store_id).toBe(storeForDrawer);
  } finally {
    await cCtx.dispose();
  }
});

test("REQ-IT7-10 经纪人我的推荐记录可点击进入评估详情", async () => {
  const miniappDir = path.resolve(__dirname, "../../miniapp");
  const brokerTs = fs.readFileSync(path.join(miniappDir, "pages/merchant/broker/index.ts"), "utf8");
  const brokerWxml = fs.readFileSync(
    path.join(miniappDir, "pages/merchant/broker/index.wxml"),
    "utf8",
  );
  const brokerWxss = fs.readFileSync(
    path.join(miniappDir, "pages/merchant/broker/index.wxss"),
    "utf8",
  );
  const appJson = JSON.parse(fs.readFileSync(path.join(miniappDir, "app.json"), "utf8")) as {
    pages: string[];
    subPackages?: { root: string; pages: string[] }[];
  };

  // 评估详情页已注册（跳转目标存在）
  const allPages = [
    ...appJson.pages,
    ...(appJson.subPackages ?? []).flatMap((pkg) => pkg.pages.map((page) => `${pkg.root}/${page}`)),
  ];
  expect(allPages).toContain("pages/valuation/detail/index");

  // 推荐记录行可点击：绑定事件 + data-id + 点击态 + 右侧箭头
  expect(brokerWxml).toContain('bindtap="onOpenLeadDetail"');
  expect(brokerWxml).toContain('data-id="{{item.id}}"');
  expect(brokerWxml).toContain('hover-class="hoverable"');
  expect(brokerWxml).toContain('class="entry__arrow"');
  expect(brokerWxss).toContain(".entry__arrow");

  // 跳转评估详情并携带线索 id
  expect(brokerTs).toContain("onOpenLeadDetail(e: WechatMiniprogram.BaseEvent)");
  expect(brokerTs).toContain("pages/valuation/detail/index?id=${id}");
});

test("REQ-IT7-11 经纪人列表来源正确展示扫码/分享绑定渠道", async () => {
  const brokersDir = path.resolve(__dirname, "../src/app/(main)/admin/merchant/brokers");
  const labels = fs.readFileSync(path.join(brokersDir, "_components/broker-labels.ts"), "utf8");
  const pageTs = fs.readFileSync(path.join(brokersDir, "page.tsx"), "utf8");
  const drawerTs = fs.readFileSync(
    path.join(brokersDir, "_components/broker-detail-drawer.tsx"),
    "utf8",
  );

  // 注册入口统一写 source=self_apply，真实渠道在 bind_source；列表/抽屉需优先展示绑定渠道
  expect(labels).toContain("BIND_SOURCE_LABELS");
  expect(labels).toContain('qrcode: "扫码绑定"');
  expect(labels).toContain('share: "分享绑定"');
  expect(labels).toContain("export function brokerSourceLabel(source: string, bindSource?: string | null)");
  expect(pageTs).toContain("brokerSourceLabel(item.source, item.bind_source)");
  // REQ-IT7-12：列表与抽屉展示邀请人（经纪人 → 门店 → 内部员工 全链路）
  expect(pageTs).toContain("邀请人");
  expect(pageTs).toContain("item.inviter_employee_name");
  expect(drawerTs).toContain('邀请人：{broker.inviter_employee_name || "—"}');
  expect(drawerTs).toContain("brokerSourceLabel(broker.source, broker.bind_source)");
  expect(pageTs).not.toContain("BROKER_SOURCE_LABELS[item.source] || item.source");

  // 扫码绑定必须把 qrcode_code 传给后端，否则绑定记录只能记成 manual
  const brokerIndexTs = fs.readFileSync(
    path.resolve(__dirname, "../../miniapp/pages/merchant/broker/index.ts"),
    "utf8",
  );
  expect(brokerIndexTs).toContain("qrcode_code: code");
});

test("REQ-IT7-13 经纪人列表/抽屉与门店列表/抽屉展示对接人（内部员工）", async () => {
  const brokersDir = path.resolve(__dirname, "../src/app/(main)/admin/merchant/brokers");
  const storePage = fs.readFileSync(
    path.resolve(__dirname, "../src/app/(main)/admin/merchant/stores/page.tsx"),
    "utf8",
  );
  const storeDrawer = fs.readFileSync(
    path.resolve(__dirname, "../src/app/(main)/admin/merchant/stores/_components/store-drawer.tsx"),
    "utf8",
  );
  const brokerPage = fs.readFileSync(path.join(brokersDir, "page.tsx"), "utf8");
  const brokerDrawer = fs.readFileSync(
    path.join(brokersDir, "_components/broker-detail-drawer.tsx"),
    "utf8",
  );

  // 经纪人列表/抽屉：绑定门店的负责人即对接人
  expect(brokerPage).toContain(">对接人<");
  expect(brokerPage).toContain("item.owner_employee_name");
  expect(brokerDrawer).toContain('对接人：{broker.owner_employee_name || "—"}');
  // 门店列表/抽屉：负责人列与抽屉展示（优先使用接口返回的姓名）
  expect(storePage).toContain("item.owner_employee_name");
  expect(storeDrawer).toContain("store.owner_employee_name");
});

test("REQ-IT7-14 经纪人中心移除绑定历史，底部展示联系对接人并可拨号", async () => {
  const pageDir = path.resolve(__dirname, "../../miniapp/pages/merchant/broker");
  const pageTs = fs.readFileSync(path.join(pageDir, "index.ts"), "utf8");
  const pageWxml = fs.readFileSync(path.join(pageDir, "index.wxml"), "utf8");

  // 绑定历史整块移除
  expect(pageWxml).not.toContain("绑定历史");
  expect(pageTs).not.toContain("loadBindings");
  expect(pageTs).not.toContain("BINDING_STATUS_LABELS");

  // 推荐记录在前，联系对接人在页面最底部
  const leadsIndex = pageWxml.indexOf("<!-- 我的推荐记录 -->");
  const contactIndex = pageWxml.indexOf("<!-- 联系对接人");
  expect(leadsIndex).toBeGreaterThan(-1);
  expect(contactIndex).toBeGreaterThan(leadsIndex);
  expect(pageWxml.trimEnd().split("</block>").length).toBeGreaterThan(1);

  // 对接人姓名 + 电话 + 直接拨号
  expect(pageWxml).toContain("联系对接人");
  expect(pageWxml).toContain("{{myStore.owner_employee_name}}");
  expect(pageWxml).toContain("{{myStore.owner_employee_phone}}");
  expect(pageWxml).toContain('bindtap="onCallContact"');
  expect(pageTs).toContain("onCallContact()");
  expect(pageTs).toContain("wx.makePhoneCall({");
  expect(pageTs).toContain("owner_employee_phone");
});

test.afterAll(() => {
  execFileSync(
    path.resolve(BACKEND, ".venv/bin/python"),
    [
      "-c",
      `
import os, sys
sys.path.insert(0, ".")
from sqlalchemy import or_
from db import SessionLocal
from models import (
    MerchantBroker,
    MerchantBrokerBinding,
    MerchantCompany,
    MerchantStore,
    MerchantStoreQRCode,
)
mark = os.environ["E2E_MARK"]
db = SessionLocal()
try:
    store_ids = [
        row.id
        for row in db.query(MerchantStore.id).filter(MerchantStore.store_name.like(f"%{mark}%")).all()
    ]
    # REQ-IT5-06：建店会自动生成联系人占位经纪人，按门店归属一并清理
    store_filter = MerchantBroker.store_id.in_(store_ids) if store_ids else False
    broker_ids = [
        row.id
        for row in db.query(MerchantBroker.id)
        .filter(or_(MerchantBroker.name.like(f"%{mark}%"), store_filter))
        .all()
    ]
    if broker_ids or store_ids:
        db.query(MerchantBrokerBinding).filter(
            (MerchantBrokerBinding.broker_id.in_(broker_ids))
            | (MerchantBrokerBinding.store_id.in_(store_ids))
        ).delete(synchronize_session=False)
    if broker_ids:
        db.query(MerchantBroker).filter(MerchantBroker.id.in_(broker_ids)).delete(
            synchronize_session=False
        )
    if store_ids:
        db.query(MerchantStoreQRCode).filter(MerchantStoreQRCode.store_id.in_(store_ids)).delete(
            synchronize_session=False
        )
    db.query(MerchantStore).filter(MerchantStore.store_name.like(f"%{mark}%")).delete(
        synchronize_session=False
    )
    db.query(MerchantCompany).filter(MerchantCompany.company_name.like(f"%{mark}%")).delete(
        synchronize_session=False
    )
    db.commit()
finally:
    db.close()
`,
    ],
    { cwd: BACKEND, env: { ...process.env, E2E_MARK: MARK } },
  );
});
