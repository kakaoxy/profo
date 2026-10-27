import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 线索列表增量迭代（跟进进表格）admin E2E.
 *
 * Spec：docs/To-Do/2026-10-27-线索列表跟进迭代-SPEC.md
 * 设计稿：docs/design/线索跟进列表-线索中心迭代-hifi.html（①②③）
 *
 * 覆盖（spec §5.1 验收点）：
 * C1 表头 11 列顺序 + 评估单价 = 评估价 ÷ 面积（2 位）；
 * C2 无跟进线索行：结论列「未记录」、内容列「—」+「尚未跟进」，不塌行；
 * C3 有跟进行渲染最近一条 + 抽屉登记后列表两列即时更新；
 * C4 响应式：1280px 结论列可见；768px 隐藏；
 * C5 键盘：行 Tab 可达 + Enter 开抽屉。
 *
 * 造数：API 建线索（带 eval_price 便于单价断言）→ API 造跟进 → UI 断言 → afterAll 软删。
 * 工件：e2e-artifacts/lead-list-followup-columns/*.json + *.png
 */

const ARTIFACT_DIR = join(process.cwd(), "e2e-artifacts", "lead-list-followup-columns");

/** 串行执行：依赖后台登录（限流 5次/分钟），同进程复用 token 缓存 */
test.describe.configure({ mode: "serial" });

let api: Awaited<ReturnType<typeof createApiContext>>;
const createdLeadIds: string[] = [];

function saveArtifact(name: string, payload: unknown): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, name), JSON.stringify(payload, null, 2), "utf-8");
}

/** 预期列头（11 列，顺序即设计稿 01 节「改动后」表头；价格列含单位副行文本） */
const EXPECTED_HEADERS = [
  "小区 / 房源",
  "区域",
  "户型 / 楼层",
  "业主报价 / 单价 万 · 万/㎡",
  "评估价 / 单价 万 · 万/㎡",
  "状态",
  "跟进结论",
  "最后一条跟进内容",
  "录入人",
  "创建 / 更新",
  "操作",
];

/** API 造线索：eval_price=354（88.5㎡ → 评估单价 4.00）；可附带一条跟进 */
async function createLead(
  suffix: string,
  followUp?: { content: string; conclusion: string },
): Promise<{ id: string; community: string }> {
  const community = `E2E跟进列-${suffix}-${Date.now()}`;
  const res = await api.ctx.post("/api/v1/leads", {
    data: {
      community_name: community,
      floor_info: "12/18层",
      layout: "2室1厅",
      area: 88.5,
      total_price: 520,
      eval_price: 354,
      orientation: "南",
      district: "浦东新区",
      business_area: "金杨",
    },
  });
  expect(res.ok(), `造线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  createdLeadIds.push(body.id);
  if (followUp) {
    const fuRes = await api.ctx.post(`/api/v1/leads/${body.id}/follow-ups`, {
      data: { method: "phone", content: followUp.content, conclusion: followUp.conclusion },
    });
    expect(fuRes.ok(), `造跟进失败：${fuRes.status()} ${await fuRes.text()}`).toBeTruthy();
  }
  return { id: body.id, community };
}

/** 打开列表页并搜索定位目标线索所在行 */
async function gotoLeadRow(page: Page, community: string) {
  await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder(/搜索/).first();
  await search.fill(community);
  await page.waitForTimeout(800);
  return page.getByRole("row", { name: new RegExp(community) }).first();
}

test.beforeAll(async () => {
  api = await createApiContext();
  mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test.afterAll(async () => {
  for (const id of createdLeadIds) {
    await api?.ctx.delete(`/api/v1/leads/${id}`).catch(() => undefined);
  }
  await api?.dispose();
});

test("C1 表头 11 列顺序符合设计稿，评估单价 = 评估价 ÷ 面积", async ({ page }) => {
  const lead = await createLead("c1");
  await loginPage(page);
  await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });

  // 等真实数据表渲染（骨架 loading 表头与真实表头同文本会并存，不能直接全局读 th）
  const row = await gotoLeadRow(page, lead.community);
  await expect(row).toBeVisible();

  // 从目标行的祖先表读表头，避免骨架表干扰
  const headers = await row.locator("xpath=ancestor::table[1]").locator("thead th").allInnerTexts();
  const cleaned = headers.map((h) => h.replace(/\s+/g, " ").trim());
  saveArtifact("c1-headers.json", { headers: cleaned, leadId: lead.id });
  expect(cleaned, "表头应为设计稿 11 列").toEqual(EXPECTED_HEADERS);

  // 评估单价 = 354 / 88.5 = 4.00 万/㎡
  await expect(row.getByText("4.00 万/㎡")).toBeVisible();

  // 弹性列几何（防回归）：跟进内容列宽 ≥134px——table-fixed 下若表格 min-width
  // 小于固定列合计+134，唯一弹性列会被压瘪成窄条，与录入人间出现大空白
  const fuWidth = await row
    .locator("xpath=ancestor::table[1]")
    .locator("thead th")
    .nth(7)
    .evaluate((th) => th.getBoundingClientRect().width);
  expect(fuWidth, "跟进内容列应 ≥134px（设计稿弹性列下限）").toBeGreaterThanOrEqual(134);

  await page.screenshot({ path: join(ARTIFACT_DIR, "c1-table-11cols.png"), fullPage: false });
});

test("C2 无跟进行：结论「未记录」+ 内容「—」+「尚未跟进」，不报错不塌行", async ({ page }) => {
  const lead = await createLead("c2");
  await loginPage(page);
  const row = await gotoLeadRow(page, lead.community);
  await expect(row).toBeVisible();

  await expect(row.getByText("未记录")).toBeVisible();
  await expect(row.getByText("尚未跟进")).toBeVisible();

  // 行高稳定：该行高度应与有跟进行同量级（>48px，无塌陷）
  const box = await row.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThan(48);

  saveArtifact("c2-empty-followup.json", { leadId: lead.id });
  await page.screenshot({ path: join(ARTIFACT_DIR, "c2-empty-row.png"), fullPage: false });
});

test("C3 有跟进行渲染最近一条；抽屉登记后列表两列即时更新", async ({ page }) => {
  // 造一条带结论的历史跟进
  const lead = await createLead("c3", {
    content: "历史跟进：业主嫌价格低",
    conclusion: "price_disagree",
  });
  await loginPage(page);
  const row = await gotoLeadRow(page, lead.community);
  await expect(row).toBeVisible();

  // 列表行渲染结论徽标 + 内容 + meta（跟进人 · 方式）
  await expect(row.getByText("价格未谈拢")).toBeVisible();
  await expect(row.getByText("历史跟进：业主嫌价格低")).toBeVisible();

  // 行点击开抽屉 → 登记一条新跟进（带新结论）
  await row.click();
  await expect(page.getByText("登记最新动态")).toBeVisible({ timeout: 15000 });
  const bothChip = page.getByRole("button", { name: "价格与合作模式均未谈拢" });
  await bothChip.click();
  await page.getByPlaceholder("输入跟进摘要...").fill("最新跟进：模式与价格均谈崩");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  // 断言限定在抽屉内：提交后列表行同步刷新（本迭代目标行为），全局 getByText 会双命中
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("最新跟进：模式与价格均谈崩")).toBeVisible({ timeout: 15000 });

  // 关闭抽屉（Esc 归还焦点），断言列表行两列已即时更新（无手动刷新）。
  // 断言限定在行内：Radix Sheet 退出动画期间抽屉 DOM 仍存在，全局 getByText 会双命中。
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });
  const updatedRow = page.getByRole("row", { name: new RegExp(lead.community) }).first();
  await expect(updatedRow.getByText("价格与模式均未谈拢")).toBeVisible({ timeout: 15000 });
  await expect(updatedRow.getByText("最新跟进：模式与价格均谈崩")).toBeVisible();

  saveArtifact("c3-live-update.json", { leadId: lead.id });
  await page.screenshot({ path: join(ARTIFACT_DIR, "c3-live-update.png"), fullPage: false });
});

test("C4 响应式：1280px 跟进结论可见，md 以下（640px）隐藏", async ({ page }) => {
  const lead = await createLead("c4", {
    content: "断点验证：结论列可见性",
    conclusion: "both_disagree",
  });
  await loginPage(page);

  // 1280×800：xl 断点只隐藏录入人/创建更新，跟进结论列常显
  await page.setViewportSize({ width: 1280, height: 800 });
  const rowXl = await gotoLeadRow(page, lead.community);
  await expect(rowXl).toBeVisible();
  await expect(rowXl.getByText("价格与模式均未谈拢")).toBeVisible();
  await page.screenshot({ path: join(ARTIFACT_DIR, "c4-1280.png"), fullPage: false });

  // 640×900：md 断点以下隐藏跟进两列（md: ≥768px 可见，与设计稿 max-width:767px 隐藏同口径）
  await page.setViewportSize({ width: 640, height: 900 });
  const rowMd = page.getByRole("row", { name: new RegExp(lead.community) }).first();
  await expect(rowMd).toBeVisible();
  await expect(rowMd.getByText("价格与模式均未谈拢")).toBeHidden();

  saveArtifact("c4-breakpoints.json", { leadId: lead.id });
});

test("C5 键盘：行 Tab 可达，Enter 开抽屉，Esc 关闭", async ({ page }) => {
  const lead = await createLead("c5");
  await loginPage(page);
  const row = await gotoLeadRow(page, lead.community);
  await expect(row).toBeVisible();

  // 行有 tabindex=0 可聚焦；Enter 打开抽屉
  await row.focus();
  await expect(row).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByText("登记最新动态")).toBeVisible({ timeout: 15000 });

  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });

  saveArtifact("c5-keyboard.json", { leadId: lead.id });
});
