import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * 线索跟进结论（合作模式 / 价格 / 两者均未谈拢）admin E2E.
 *
 * 需求（2026-10-26）：跟进登记除「跟进方式」外新增**选填**的「跟进结论」，
 * 并同步到线索详情抽屉与小程序评估详情/授权页。
 *
 * 本用例覆盖 admin 侧两条真实入口（其余层由单测 + 后端 API e2e 覆盖）：
 * 1. 线索列表 → 详情抽屉「登记最新动态」：三枚结论 chip 可选/可取消，提交后
 *    时间线立即出现结论徽标（走真实 Server Action → 后端 → 重拉列表）；
 * 2. 线索详情页 `/[leadId]`：登记表单同样带结论 chip，提交后轨迹时间线渲染徽标；
 * 3. 不选结论时提交：时间线不渲染徽标（选填语义，不能伪造结论）。
 *
 * 造数：API 建线索 → UI 断言 → afterAll 软删，可重复执行。
 * 工件：e2e-artifacts/lead-followup-conclusion/*.json + *.png
 */

const ARTIFACT_DIR = join(process.cwd(), "e2e-artifacts", "lead-followup-conclusion");

/**
 * 串行执行：本文件 3 个用例都依赖后台登录（限流 5次/分钟）。
 * Playwright 默认 fullyParallel，多个 worker 冷启动同时登录会互相挤占额度
 * （helpers/auth.ts 的重试会退避 20s/40s，叠加后超过 beforeAll 的 30s 上限）。
 * 串行后同进程复用模块级 token 缓存，全程只登录一次。
 */
test.describe.configure({ mode: "serial" });

let api: Awaited<ReturnType<typeof createApiContext>>;
const createdLeadIds: string[] = [];

function saveArtifact(name: string, payload: unknown): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, name), JSON.stringify(payload, null, 2), "utf-8");
}

async function createLead(suffix: string): Promise<{ id: string; community: string }> {
  const community = `E2E跟进结论-${suffix}-${Date.now()}`;
  const res = await api.ctx.post("/api/v1/leads", {
    data: {
      community_name: community,
      floor_info: "12/18层",
      layout: "2室1厅",
      area: 88.5,
      total_price: 520,
      orientation: "南",
      district: "浦东新区",
      business_area: "金杨",
    },
  });
  expect(res.ok(), `造线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
  const body = (await res.json()) as { id: string };
  createdLeadIds.push(body.id);
  return { id: body.id, community };
}

/** 打开抽屉并定位「登记最新动态」区（线索列表页） */
async function openDrawerFollowUpBlock(page: Page, community: string) {
  await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
  // 搜索定位刚造的线索，避免在长列表里翻页
  const search = page.getByPlaceholder(/搜索/).first();
  await search.fill(community);
  await page.waitForTimeout(800);
  await page.getByText(community, { exact: false }).first().click();
  await expect(page.getByText("登记最新动态")).toBeVisible({ timeout: 15000 });
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

test("C1 抽屉登记跟进：结论 chip 可选可取消，提交后时间线出现徽标", async ({ page }) => {
  const lead = await createLead("c1");
  await loginPage(page);
  await openDrawerFollowUpBlock(page, lead.community);

  // 三枚结论 chip 均在，且默认未选中（选填）
  const modeChip = page.getByRole("button", { name: "合作模式未谈拢" });
  const priceChip = page.getByRole("button", { name: "价格未谈拢" });
  const bothChip = page.getByRole("button", { name: "价格与合作模式均未谈拢" });
  await expect(modeChip).toBeVisible();
  await expect(priceChip).toBeVisible();
  await expect(bothChip).toBeVisible();
  await expect(modeChip).toHaveAttribute("aria-pressed", "false");

  // 点选 → 选中；再点 → 取消（互斥单选 + 可撤销）
  await modeChip.click();
  await expect(modeChip).toHaveAttribute("aria-pressed", "true");
  await modeChip.click();
  await expect(modeChip).toHaveAttribute("aria-pressed", "false");

  // 选「价格未谈拢」并填写内容后提交
  await priceChip.click();
  await page.getByPlaceholder("输入跟进摘要...").fill("业主希望再涨 10 万，价格未谈拢");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  // 时间线出现该记录，且带结论徽标
  await expect(page.getByText("业主希望再涨 10 万，价格未谈拢")).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("价格未谈拢").last()).toBeVisible();

  await page.screenshot({ path: join(ARTIFACT_DIR, "c1-drawer-conclusion.png"), fullPage: true });
  saveArtifact("c1-drawer-conclusion.json", { leadId: lead.id, leadCommunity: lead.community });

  // 结论 chip 提交后复位（避免下一条跟进误带上次结论）
  await expect(priceChip).toHaveAttribute("aria-pressed", "false");
});

test("C2 不选结论提交：记录正常入库但时间线不渲染徽标（选填语义）", async ({ page }) => {
  const lead = await createLead("c2");
  await loginPage(page);
  await openDrawerFollowUpBlock(page, lead.community);

  await page.getByPlaceholder("输入跟进摘要...").fill("常规回访，无分歧");
  await page.getByRole("button", { name: "记录", exact: true }).click();
  await expect(page.getByText("常规回访，无分歧")).toBeVisible({ timeout: 15000 });

  // 后端落库校验：conclusion 必须为空，而不是默认值
  const res = await api.ctx.get(`/api/v1/leads/${lead.id}/follow-ups`);
  expect(res.ok()).toBeTruthy();
  const rows = (await res.json()) as { content: string; conclusion?: string | null }[];
  const row = rows.find((r) => r.content === "常规回访，无分歧");
  expect(row, "跟进记录未落库").toBeTruthy();
  expect(row?.conclusion ?? null).toBeNull();

  saveArtifact("c2-no-conclusion.json", { leadId: lead.id, row });
});

test("C3 详情页登记表单带结论 chip，提交后轨迹时间线渲染徽标", async ({ page }) => {
  const lead = await createLead("c3");
  await loginPage(page);
  await page.goto(`/admin/leads/${lead.id}`, { waitUntil: "domcontentloaded" });

  await expect(page.getByText("登记最新动态").first()).toBeVisible({ timeout: 15000 });
  const bothChip = page.getByRole("button", { name: "价格与合作模式均未谈拢" });
  await expect(bothChip).toBeVisible();
  await bothChip.click();
  await page.getByPlaceholder("输入跟进摘要...").fill("业主既不接受代理模式，也嫌价格低");
  await page.getByRole("button", { name: "记录", exact: true }).click();

  await expect(page.getByText("业主既不接受代理模式，也嫌价格低")).toBeVisible({
    timeout: 15000,
  });
  // 轨迹时间线徽标
  await expect(page.getByText("价格与合作模式均未谈拢").last()).toBeVisible();

  await page.screenshot({ path: join(ARTIFACT_DIR, "c3-detail-conclusion.png"), fullPage: true });
  saveArtifact("c3-detail-conclusion.json", { leadId: lead.id });
});
