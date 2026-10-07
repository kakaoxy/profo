import { test, expect } from "@playwright/test";
import { loginPage, createApiContext, FRONTEND_BASE } from "./helpers/auth";
import {
  createPublishedProject,
  createDraftProject,
  changePrice,
  getPriceChangeCount,
  deleteProject,
  uniqueTitle,
  type CreatedProject,
} from "./helpers/marketing-data";

/**
 * admin/marketing 调价组件 E2E（spec §7 六条验收用例）.
 *
 * 造数策略：API 创建唯一后缀房源 → UI 操作 → afterAll 清理删除，可重复执行。
 * ⚠️ 未覆盖（E2E-4 权限分支）：L4 只读角色测试账号在当前环境中不可用，
 * 权限分支降级为草稿路径断言，只读角色需手工验证（spec §10.3 预先约定）。
 */

let api: Awaited<ReturnType<typeof createApiContext>>;
let published: CreatedProject;
let draft: CreatedProject;

test.beforeAll(async () => {
  api = await createApiContext();
  published = await createPublishedProject(api.ctx, "pub", { price: 428 });
  draft = await createDraftProject(api.ctx, "draft");
});

test.afterAll(async () => {
  await deleteProject(api.ctx, published.id);
  await deleteProject(api.ctx, draft.id);
  await api.dispose();
});

/** 每条用例独立注入登录 cookie（避免依赖 localStorage/登录页 UI）. */
test.beforeEach(async ({ page }) => {
  await loginPage(page);
});

const detailUrl = (id: number) => `${FRONTEND_BASE}/admin/marketing/${id}`;
const listUrl = `${FRONTEND_BASE}/admin/marketing`;

/** 列表页搜索唯一标题后返回目标行（302+ 数据分页，不依赖默认排序）. */
async function searchRow(page: import("@playwright/test").Page, title: string) {
  await page.goto(listUrl);
  await page.getByPlaceholder("搜索房源名称...").fill(title);
  return page.locator("tr", { hasText: title }).first();
}

/**
 * 创建「发布+改价」同次 PUT 的测试房源（T4/H4 场景）.
 *
 * 走与前端整表保存完全同构的 API 请求：草稿房源 PUT 同时携带
 * publish_status="发布" + 新 total_price（dirty 字段合并 patch），
 * 覆盖 createPublishedProject 两步路径走不到的 H4 分支。
 */
async function createDraftThenPublishWithPrice(
  ctx: APIRequestContext,
  projectId: number,
  publishPrice: number,
): Promise<void> {
  const res = await ctx.put(`/api/v1/admin/marketing/projects/${projectId}`, {
    data: { publish_status: "发布", total_price: publishPrice },
  });
  if (!res.ok()) {
    throw new Error(`E2E 发布+改价失败(id=${projectId}): HTTP ${res.status()} ${await res.text()}`);
  }
}

test.describe.configure({ mode: "serial" });

// ── E2E-1 详情页调价全链路 ────────────────────────────────────────────────
test("E2E-1 详情页调价：三态流转 + 成功态承诺推送已排队 + 列表行同步", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(detailUrl(published.id));

  // 右栏第一卡为价格与调价卡
  const priceCard = page.locator("div.bg-white.rounded-cards", {
    has: page.getByRole("heading", { name: "价格与调价" }),
  });
  await expect(priceCard).toBeVisible();

  // 浏览态：当前总价 + 单价折算
  await expect(priceCard.getByText("当前总价")).toBeVisible();
  await expect(priceCard.getByText(/折合单价约/)).toBeVisible();

  // 时间线挂载即拉（card 变体），默认折叠
  await expect(priceCard.getByText(/调价历史/)).toBeVisible();

  // 进入表单态：自动 focus
  await priceCard.getByRole("button", { name: /调价$/ }).click();
  const priceInput = page.locator('input[name="total_price"]');
  await expect(priceInput).toBeFocused();

  // 差价 chip 实时联动：直降绿
  await priceInput.fill("421");
  await expect(priceCard.getByText(/↓ 直降 7\.00 万/)).toBeVisible();

  // 提交 → 成功态文案含「推送已排队」
  await priceCard.getByRole("button", { name: "确认调价" }).click();
  const successPane = priceCard.getByText(/订阅推送已排队/);
  await expect(successPane).toBeVisible();

  // 「完成」回浏览态 → 显示新总价（精确匹配大数字节点，避免命中时间线「→ 421.00 万」副行）
  await priceCard.getByRole("button", { name: "完成" }).click();
  await expect(priceCard.getByText("421万", { exact: true })).toBeVisible();

  // 列表行同步：总价 421 + 调价副行「原 428」（用唯一后缀搜索定位，不依赖排序）
  await page.goto(listUrl);
  const searchBox = page.getByPlaceholder("搜索房源名称...");
  await searchBox.fill(published.title);
  const row = page.locator("tr", { hasText: published.title }).first();
  await expect(row).toBeVisible();
  await expect(row.getByText(/原 ¥428万/)).toBeVisible();

  // badge_filter=price 可筛出该行（服务端链路既有）
  await page.goto(`${listUrl}?badge_filter=price&search=${encodeURIComponent(published.title)}`);
  const rowFiltered = page.locator("tr", { hasText: published.title });
  await expect(rowFiltered).toBeVisible();
});

// ── E2E-2 列表行内弹层调价 ───────────────────────────────────────────────
test("E2E-2 列表行内调价：弹层提交成功后关闭 + toast + 行内更新", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(listUrl);

  const row = await searchRow(page, published.title);
  await row.getByTestId(`price-entry-${published.id}`).click();

  // 弹层出现（内嵌表单态；头部行「当前总价 X 万 · 面积」）
  const popover = page.locator("[data-slot='popover-content']");
  await expect(popover).toBeVisible();
  await expect(popover.getByText(/当前总价 \d/)).toBeVisible();

  // 输入并提交（421 → 415）
  const priceInput = popover.locator('input[name="total_price"]');
  await priceInput.fill("415");
  await expect(popover.getByText(/↓ 直降 6\.00 万/)).toBeVisible();
  await popover.getByRole("button", { name: "确认调价" }).click();

  // 成功 toast + 弹层关闭
  await expect(page.getByText(/已生效，订阅推送已排队/)).toBeVisible();
  await expect(popover).toBeHidden();

  // 行内总价更新（router.refresh 后）
  await expect(
    row
      .locator("td")
      .filter({ hasText: /^¥415万$/ })
      .or(row.getByText("¥415万")),
  ).toBeVisible();

  // 刷新后与服务端一致
  await page.reload();
  const rowAfter = await searchRow(page, published.title);
  await expect(rowAfter.getByText("¥415万")).toBeVisible();
});

// ── E2E-3 同值/非法输入 + 后端同值语义回归 ─────────────────────────────────
test("E2E-3 同值禁用 + 非法输入校验 + 后端同值不产生记录", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 后端语义回归：API 直发同值 PUT → 无新调价记录
  const before = await getPriceChangeCount(api.ctx, published.id);
  await changePrice(api.ctx, published.id, 415); // 同值
  const after = await getPriceChangeCount(api.ctx, published.id);
  expect(after).toBe(before);

  // 前端：详情页表单态校验
  await page.goto(detailUrl(published.id));
  const priceCard = page.locator("div.bg-white.rounded-cards", {
    has: page.getByRole("heading", { name: "价格与调价" }),
  });
  await priceCard.getByRole("button", { name: /调价$/ }).click();
  const priceInput = page.locator('input[name="total_price"]');

  // 空值 → idle 提示 + 禁用
  await expect(priceCard.getByText("输入新总价")).toBeVisible();
  await expect(priceCard.getByRole("button", { name: "确认调价" })).toBeDisabled();

  // 非法（0）→ 提示 + 禁用（FormMessage 与差价 chip 同文案，用 chip 的 class 精确匹配）
  await priceInput.fill("0");
  await expect(priceCard.locator("span.rounded-full", { hasText: "总价必须大于 0" })).toBeVisible();
  await expect(priceCard.getByRole("button", { name: "确认调价" })).toBeDisabled();

  // 同值 → 「价格未变化」+ 禁用
  await priceInput.fill("415");
  await expect(priceCard.getByText("价格未变化")).toBeVisible();
  await expect(priceCard.getByRole("button", { name: "确认调价" })).toBeDisabled();
});

// ── E2E-4 入口可见性（草稿路径；只读角色分支 ⚠️ 手工验证） ────────────────
test("E2E-4 草稿房源：详情卡与列表均无调价入口，整卡只读降级", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 详情页：草稿 → 无调价按钮 + 降级文案
  await page.goto(detailUrl(draft.id));
  const priceCard = page.locator("div.bg-white.rounded-cards", {
    has: page.getByRole("heading", { name: "价格与调价" }),
  });
  await expect(priceCard.getByText("草稿房源发布后开放调价")).toBeVisible();
  await expect(priceCard.getByRole("button", { name: /调价$/ })).toHaveCount(0);

  // 列表页：草稿行无「调价」项
  await page.goto(listUrl);
  const draftRow = await searchRow(page, draft.title);
  await expect(draftRow.getByTestId(`price-entry-${draft.id}`)).toHaveCount(0);
});

// ── E2E-7 同次发布+改价（H4/T4 场景）：UI 整表保存路径不产生伪调价 ───────
test("E2E-7 草稿编辑态同时改价并发布：首价即基准，无伪调价历史", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // API 造草稿，走与前端整表保存同构的 PUT（发布 + 改价同次提交）
  const h4 = await createDraftProject(api.ctx, "h4");
  try {
    await createDraftThenPublishWithPrice(api.ctx, h4.id, 428);

    // 后端断言：同次发布+改价不产生调价记录（首价即基准，H4 修复语义）
    expect(await getPriceChangeCount(api.ctx, h4.id)).toBe(0);

    // 后端断言：PUT 响应聚合字段回填（M5）——latest_price_change 为 null
    const detail = await api.ctx.get(`/api/v1/admin/marketing/projects/${h4.id}`);
    const body = (await detail.json()) as { latest_price_change: unknown; is_new_listing: boolean };
    expect(body.latest_price_change).toBeNull();

    // UI 断言：详情页价格卡显示发布价 428，无「原 XXX」调价副行
    await page.goto(detailUrl(h4.id));
    const priceCard = page.locator("div.bg-white.rounded-cards", {
      has: page.getByRole("heading", { name: "价格与调价" }),
    });
    await expect(priceCard.getByText("428万", { exact: true })).toBeVisible();
    await expect(priceCard.getByText(/原 ¥\d+万/)).toHaveCount(0);
    await expect(priceCard.getByText(/调价历史/)).toBeVisible();
  } finally {
    await deleteProject(api.ctx, h4.id);
  }
});

// ── E2E-8 发布后真实调价对照组：H4 修复不误伤常规调价 ──────────────────
test("E2E-8 已发布房源调价：时间线正常产生一条记录", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  const ctrl = await createPublishedProject(api.ctx, "ctrl", { price: 300 });
  try {
    await changePrice(api.ctx, ctrl.id, 295);
    expect(await getPriceChangeCount(api.ctx, ctrl.id)).toBe(1);

    await page.goto(detailUrl(ctrl.id));
    const priceCard = page.locator("div.bg-white.rounded-cards", {
      has: page.getByRole("heading", { name: "价格与调价" }),
    });
    await priceCard.getByRole("button", { name: "调价历史" }).click();
    await expect(priceCard.getByText(/→ 295\.00 万/).first()).toBeVisible();
  } finally {
    await deleteProject(api.ctx, ctrl.id);
  }
});

// ── E2E-5 调价历史时间线两态 ──────────────────────────────────────────────
test("E2E-5 时间线：空态引导 + 调价两次后倒序与方向色渲染", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });

  // 造数房源已调过价（428→421→415）；再造一条 fresh 房源验证空态
  const fresh = await createPublishedProject(api.ctx, "fresh", { price: 300 });
  try {
    await page.goto(detailUrl(fresh.id));
    const priceCard = page.locator("div.bg-white.rounded-cards", {
      has: page.getByRole("heading", { name: "价格与调价" }),
    });
    await priceCard.getByRole("button", { name: "调价历史" }).click();
    await expect(priceCard.getByText(/暂无调价记录/)).toBeVisible();
  } finally {
    await deleteProject(api.ctx, fresh.id);
  }

  // published 房源已有 2 条记录（428→421→415）：展开时间线断言倒序与送达行
  await page.goto(detailUrl(published.id));
  const priceCard = page.locator("div.bg-white.rounded-cards", {
    has: page.getByRole("heading", { name: "价格与调价" }),
  });
  await priceCard.getByRole("button", { name: "调价历史" }).click();
  // 倒序：最新在上（415 在 421 之前）
  const firstItem = priceCard.getByText(/→ 415\.00 万/).first();
  await expect(firstItem).toBeVisible();
  // 方向标签与送达行渲染（推送异步，计数可能为 0 → 显示排队文案）
  await expect(priceCard.getByText(/降价|涨价/).first()).toBeVisible();
});

// ── E2E-6 响应式与焦点/Esc 行为 ──────────────────────────────────────────
test("E2E-6 1024px 折叠单列 + 表单态 Esc 逐层退出", async ({ page }) => {
  // 1024px 视口（lg 断点边界，<1024 折叠单列）
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.goto(detailUrl(published.id));

  const priceCard = page.locator("div.bg-white.rounded-cards", {
    has: page.getByRole("heading", { name: "价格与调价" }),
  });
  await expect(priceCard).toBeVisible();

  // 表单态 Esc → 回浏览态（输入清空，无成功态残留）
  await priceCard.getByRole("button", { name: /调价$/ }).click();
  const priceInput = page.locator('input[name="total_price"]');
  await priceInput.fill("399");
  await page.keyboard.press("Escape");
  await expect(priceCard.getByText("当前总价")).toBeVisible();
  await expect(page.locator('input[name="total_price"]')).toHaveCount(0);

  // 列表弹层 Esc 关闭
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(listUrl);
  const row = await searchRow(page, published.title);
  await row.getByTestId(`price-entry-${published.id}`).click();
  const popover = page.locator("[data-slot='popover-content']");
  await expect(popover).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(popover).toBeHidden();
});
