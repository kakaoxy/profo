// 工作台「项目全流程」时间轴 Playwright E2E（SPEC §7 验收 1–9）.
//
// 覆盖（逐条对应 SPEC §7 验收表）：
//  1. 卡位置：紧随 4 张 span3 卡之后、满宽（与其它 span12 卡等宽）
//  2. 默认「最新 10」行数 = min(10, 可绘制项目数)；「全部」展开后行数 = 可绘制项目数
//  3. 图例即筛选：点选某阶段 → 行数 = 该阶段计数；再点一次清除
//  4. 缩放：+ 号 → 110%；滑块拉到 300% → 画布变宽；「适应」→ 回到左端
//  5. 悬浮提示：4 阶段日期 + 签约价/成交价（或挂牌价）
//  6. 键盘：行 focus 出提示、Enter 进入项目详情、图表方向键平移
//  7. 轴吸顶：纵向滚到底部，轴仍在视口顶部
//  8. 空态/错误态契约（本环境走真实数据，只断言正常态下二者不出现）+ 页脚口径 + 产出工件
//  9. 整页版式：卡夹在 KPI 四卡与获客概览之间（整页截图）
//
// 期望值不写死：beforeAll 用 admin token 直接查 `/api/v1/projects?signing_sort=true`
// 复算「可绘制项目数」（有签约日期且状态 ≠ ended），与页面渲染对账。
//
// 可复验工件：docs/design/qa-2026-10-31-workbench-roadmap/
//   - workbench-roadmap-card.png（整卡）
//   - workbench-roadmap-tooltip.png（悬浮提示）
//   - workbench-fullpage.png（整页版式）
//   - roadmap-e2e-evidence.json（实测计数与缩放/滚动指标）
//
// 前置：后端 :8000 + 前端 :3000；E2E_ADMIN_USER/PASSWORD 由 .env.local 提供。
// 运行：
//   cd frontend && npx playwright test e2e/workbench-project-roadmap.spec.ts --reporter=line

import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);

const WIDGET_KEY = "project_roadmap";
const WIDGET = `[data-widget="${WIDGET_KEY}"]`;
const ARTIFACT_DIR = path.resolve(
  __dirname,
  "../../docs/design/qa-2026-10-31-workbench-roadmap",
);

interface ProjectRow {
  id: string;
  name: string | null;
  status: string;
  signing_date: string | null;
  planned_handover_date: string | null;
  listing_date: string | null;
  sold_date: string | null;
}

/** 可绘制口径：有签约日期且状态不是 ended（SPEC D2/D6） */
let apiRows: ProjectRow[] = [];
let drawableCount = 0;

test.beforeAll(async () => {
  fs.mkdirSync(ARTIFACT_DIR, { recursive: true });
  const { ctx, dispose } = await createApiContext();
  try {
    const res = await ctx.get("/api/v1/projects?page=1&page_size=200&signing_sort=true");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { items: ProjectRow[]; total: number };
    apiRows = body.items;
    drawableCount = apiRows.filter((p) => p.status !== "ended" && Boolean(p.signing_date)).length;
  } finally {
    await dispose();
  }
});

const rows = (page: Page) => page.locator("[data-roadmap-row]");
const chip = (page: Page, stage: string) => page.locator(`[data-roadmap-chip="${stage}"]`);
const zoomLabel = (page: Page) => page.locator("[data-roadmap-zoom-label]");

/** 芯片文案形如「在售12」，末尾数字即当前视图内该阶段计数 */
async function chipCount(page: Page, stage: string): Promise<number> {
  const text = (await chip(page, stage).innerText()).trim();
  const match = text.match(/(\d+)\s*$/);
  expect(match, `芯片文案应带计数：${text}`).not.toBeNull();
  return Number(match![1]);
}

test("卡位置与卡头：紧随 4 张 span3 卡之后，满宽 12 栏", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  const card = page.locator(WIDGET);
  await expect(card).toBeVisible({ timeout: 30_000 });
  // 等数据到达（行渲染出来）
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });

  // 1) 卡头：标题 + 「新增」徽标 + 计数徽标
  const title = card.locator('[data-widget-title="项目全流程"]').first();
  await expect(title).toBeVisible();
  await expect(title).toHaveCSS("font-size", "15px");
  await expect(card.getByText("新增", { exact: true })).toBeVisible();
  await expect(card.getByText(`${drawableCount} 个项目`, { exact: true })).toBeVisible();
  await expect(card.locator('[data-widget-link="项目列表"]')).toBeVisible();

  // 2) 位于第 4 张 span3 卡（项目待办）之后
  const todoBox = await page.locator('[data-widget="todo_board_summary"]').boundingBox();
  const cardBox = await card.boundingBox();
  expect(todoBox && cardBox).toBeTruthy();
  expect(cardBox!.y).toBeGreaterThan(todoBox!.y + todoBox!.height - 1);

  // 3) 满宽：与另一张 span12 卡（重点监控项目）等宽
  const monitorBox = await page.locator('[data-widget="monitor_projects"]').boundingBox();
  expect(monitorBox).toBeTruthy();
  expect(Math.abs(cardBox!.width - monitorBox!.width)).toBeLessThanOrEqual(1);
});

test("默认「最新 10」与「全部」：行数与接口可绘制数对账", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });

  const expectedRecent = Math.min(10, drawableCount);
  await expect(rows(page)).toHaveCount(expectedRecent);
  await expect(page.locator('[data-roadmap-view="recent"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText(`共 ${drawableCount} 个项目`)).toBeVisible();

  // 切「全部」：行数 = 可绘制总数，且页脚显示同一数字
  await page.locator('[data-roadmap-view="all"]').click();
  await expect(rows(page)).toHaveCount(drawableCount);
  await expect(page.locator('[data-roadmap-view="all"]')).toHaveAttribute("aria-pressed", "true");

  // 行序 = 签约日期降序（与后端 signing_sort 一致）
  const dates = await page.locator("[data-roadmap-row]").evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute("data-roadmap-row") ?? ""),
  );
  const apiOrder = apiRows
    .filter((p) => p.status !== "ended" && p.signing_date)
    .map((p) => p.id);
  expect(dates).toEqual(apiOrder.slice(0, dates.length));
});

test("图例即筛选：点选阶段 → 行数 = 该阶段计数，再点清除", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });

  // 选当前视图内计数最大的阶段，避免依赖某阶段是否有数据
  const stages = ["sign", "handover", "listing", "sold"] as const;
  const counts = await Promise.all(stages.map((stage) => chipCount(page, stage)));
  const max = Math.max(...counts);
  expect(max).toBeGreaterThan(0);
  const target = stages[counts.indexOf(max)];

  await chip(page, target).click();
  await expect(chip(page, target)).toHaveAttribute("aria-pressed", "true");
  await expect(rows(page)).toHaveCount(max);
  // 图表 aria-label 跟随筛选后的行数
  await expect(page.locator("[data-roadmap-chart]")).toHaveAttribute(
    "aria-label",
    new RegExp(`共 ${max} 个项目`),
  );

  // 再点一次清除
  await chip(page, target).click();
  await expect(chip(page, target)).toHaveAttribute("aria-pressed", "false");
  await expect(rows(page)).toHaveCount(Math.min(10, drawableCount));
});

test("缩放：+ 号、滑块、适应 都作用于同一 ppd", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });

  const chart = page.locator("[data-roadmap-chart]");
  // 画布宽 = 左列(208) + 绘图区(总天数×ppd+24)：用画布而非滚动容器量（容器宽度会被 clientWidth 钳制）
  const canvas = chart.locator("> div").first();
  await expect(zoomLabel(page)).toHaveText("100%");
  const widthAt100 = await canvas.evaluate((el) => el.getBoundingClientRect().width);

  // + 号 → 110%
  await page.getByRole("button", { name: "放大时间轴" }).click();
  await expect(zoomLabel(page)).toHaveText("110%");

  // 滑块拉到 300%
  await page.locator("[data-roadmap-zoom]").fill("300");
  await expect(zoomLabel(page)).toHaveText("300%");
  const widthAt300 = await canvas.evaluate((el) => el.getBoundingClientRect().width);
  // 扣掉「左列 208 + 绘图区右侧留白 24」的固定部分后，绘图区宽度应精确 ×3
  const plotAt = (width: number) => width - 232;
  expect(plotAt(widthAt300) / plotAt(widthAt100)).toBeCloseTo(3, 1);
  // 300% 下必然横向溢出
  expect(await chart.evaluate((el) => el.scrollWidth)).toBeGreaterThan(
    await chart.evaluate((el) => el.clientWidth),
  );

  // 适应：回到左端，且不再有横向滚动条
  await page.locator("[data-roadmap-fit]").click();
  const scrollLeft = await chart.evaluate((el) => el.scrollLeft);
  expect(scrollLeft).toBe(0);
  const fittedScroll = await chart.evaluate((el) => el.scrollWidth);
  const fittedClient = await chart.evaluate((el) => el.clientWidth);
  expect(fittedScroll).toBeLessThanOrEqual(fittedClient + 1);
  const fitted = (await zoomLabel(page).innerText()).replace("%", "");
  expect(Number(fitted)).toBeGreaterThanOrEqual(35);
  expect(Number(fitted)).toBeLessThanOrEqual(300);
});

test("悬浮提示：4 阶段日期 + 签约价/成交价（或挂牌价）", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  const firstRow = rows(page).first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });

  await firstRow.hover();
  const tip = page.locator("[data-roadmap-tooltip]");
  await expect(tip).toBeVisible();

  for (const label of ["签约", "交房", "上架", "成交"]) {
    await expect(tip.getByText(label, { exact: true })).toBeVisible();
  }
  // 页脚是「签约价 115.0 万」同节点拼接文案，用前缀正则而非 exact
  await expect(tip.getByText(/^签约价/)).toBeVisible();
  await expect(tip.getByText(/^(成交价|挂牌价)/)).toBeVisible();

  // 提示框不出视口
  const box = await tip.boundingBox();
  const viewport = page.viewportSize();
  expect(box && viewport).toBeTruthy();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport!.width + 1);
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "workbench-roadmap-tooltip.png"),
    clip: { x: 0, y: Math.max(0, box!.y - 220), width: viewport!.width, height: 520 },
  });

  // 移开后关闭
  await page.mouse.move(4, 4);
  await expect(tip).toBeHidden();
});

test("键盘：行 focus 出提示、方向键平移、Enter 进入详情", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  const firstRow = rows(page).first();
  await expect(firstRow).toBeVisible({ timeout: 30_000 });

  // focus → 出提示（与 hover 同源，位置在行左侧）
  await firstRow.focus();
  await expect(page.locator("[data-roadmap-tooltip]")).toBeVisible();

  // 方向键平移：先放大到 300% 保证横向溢出（否则 scrollLeft 恒为 0，断言无意义）
  const chart = page.locator("[data-roadmap-chart]");
  await page.locator("[data-roadmap-zoom]").fill("300");
  await expect(zoomLabel(page)).toHaveText("300%");
  await chart.focus();
  await expect(page.locator("[data-roadmap-tooltip]")).toBeHidden();
  const before = await chart.evaluate((el) => el.scrollLeft);
  expect(before).toBeGreaterThan(0);
  await page.keyboard.press("ArrowLeft");
  const afterLeft = await chart.evaluate((el) => el.scrollLeft);
  expect(afterLeft).toBeLessThan(before);
  await page.keyboard.press("ArrowRight");
  expect(await chart.evaluate((el) => el.scrollLeft)).toBe(before);

  // Enter 进入项目详情
  const targetId = await firstRow.getAttribute("data-roadmap-row");
  expect(targetId).toBeTruthy();
  await firstRow.focus();
  await page.keyboard.press("Enter");
  await page.waitForURL(`**/admin/projects/${targetId}`, { timeout: 30_000 });
});

test("轴吸顶：纵向滚动到底部，轴仍在滚动区顶部", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-roadmap-view="all"]').click();
  await expect(rows(page)).toHaveCount(drawableCount);

  const chart = page.locator("[data-roadmap-chart]");
  const chartBox = await chart.boundingBox();
  expect(chartBox).toBeTruthy();

  await chart.evaluate((el) => {
    el.scrollTop = el.scrollHeight;
  });
  // 轴是滚动区第一个 sticky 元素（其内 .rm-corner 亦为 sticky，取 first）
  const axisBox = await chart.locator("div.sticky").first().boundingBox();
  expect(axisBox).toBeTruthy();
  expect(Math.abs(axisBox!.y - chartBox!.y)).toBeLessThanOrEqual(2);

  // 今天线贯穿可见区域（rust 虚线）；角标按设计稿只给 MM.DD，年份由轴上年份刻度承载
  await expect(chart.getByText(/今天 \d{2}\.\d{2}$/)).toBeVisible();
});

test("错误态/空态不出现（真实数据下的正常态）", async ({ page }) => {
  await loginPage(page);
  await page.goto("/admin");
  const card = page.locator(WIDGET);
  await expect(card).toBeVisible({ timeout: 30_000 });
  // 必须等数据渲染完成再截图：Suspense fallback 阶段 [data-widget] 容器已在，截到的是骨架
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-roadmap-error]")).toHaveCount(0);
  await expect(page.locator("[data-roadmap-empty]")).toHaveCount(0);
  await expect(page.locator("[data-roadmap-filtered-empty]")).toHaveCount(0);

  // 工件：整卡截图 + 实测证据
  await card.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "workbench-roadmap-card.png"),
    clip: (await card.boundingBox()) ?? undefined,
  });

  const evidence = {
    generatedAt: new Date().toISOString(),
    apiTotal: apiRows.length,
    drawableCount,
    renderedRowsRecent: await rows(page).count(),
    chips: {
      sign: await chipCount(page, "sign"),
      handover: await chipCount(page, "handover"),
      listing: await chipCount(page, "listing"),
      sold: await chipCount(page, "sold"),
    },
    zoomLabel: await zoomLabel(page).innerText(),
    footer: await card.getByText(/共 \d+ 个项目/).first().innerText(),
  };
  fs.writeFileSync(
    path.join(ARTIFACT_DIR, "roadmap-e2e-evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf-8",
  );
});

test("整页版式：卡夹在 KPI 四卡与获客概览之间（整页截图）", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await loginPage(page);
  await page.goto("/admin");
  const card = page.locator(WIDGET);
  await expect(rows(page).first()).toBeVisible({ timeout: 30_000 });

  const cardBox = await card.boundingBox();
  const growthBox = await page.locator('[data-widget="growth_overview"]').boundingBox();
  const todoBox = await page.locator('[data-widget="todo_board_summary"]').boundingBox();
  expect(cardBox && growthBox && todoBox).toBeTruthy();
  // 上界：4 张 span3 卡（项目待办）之下；下界：获客概览之上
  expect(cardBox!.y).toBeGreaterThan(todoBox!.y + todoBox!.height - 1);
  expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(growthBox!.y + 1);

  await page.screenshot({
    path: path.join(ARTIFACT_DIR, "workbench-fullpage.png"),
    fullPage: true,
  });
});
