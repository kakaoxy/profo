import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { createApiContext, loginPage } from "./helpers/auth";

/**
 * admin 线索楼栋量词展示（BR-29 同口径）E2E.
 *
 * 背景：线索列表/抽屉/详情页历史上硬编码 `${building_no}栋`；BR-29 后展示口径
 * 统一为「已自带量词原样，否则补号」（frontend/src/lib/dict-display.ts）。
 * 本用例用真实字典小区（呼玛二村 285 号）造一条 linked 线索，锁死三处展示：
 * ① 列表行 ② 详情抽屉 ③ 详情页 LeadBasicInfo。
 *
 * 工件：e2e-artifacts/lead-building-label/*.json + *.png
 */

const ARTIFACT_DIR = join(process.cwd(), "e2e-artifacts", "lead-building-label");

test.describe.configure({ mode: "serial" });

let api: Awaited<ReturnType<typeof createApiContext>>;
let leadId: string | null = null;
const communityName = `E2E楼栋量词-${Date.now()}`;

function saveArtifact(name: string, payload: unknown): void {
  mkdirSync(ARTIFACT_DIR, { recursive: true });
  writeFileSync(join(ARTIFACT_DIR, name), JSON.stringify(payload, null, 2), "utf-8");
}

test.beforeAll(async () => {
  api = await createApiContext();
  mkdirSync(ARTIFACT_DIR, { recursive: true });
});

test.afterAll(async () => {
  if (leadId) {
    await api?.ctx.delete(`/api/v1/leads/${leadId}`).catch(() => undefined);
  }
  await api?.dispose();
});

/** 定位呼玛二村 285 号楼栋（真实字典数据，与 review-building-search 用例同源） */
async function findBuilding285(): Promise<{ communityId: string; buildingId: number }> {
  const commRes = await api.ctx.get(
    "/api/v1/admin/building-dictionary/communities?keyword=%E5%91%BC%E7%8E%9B%E4%BA%8C%E6%9D%91&page=1&page_size=5",
  );
  expect(commRes.ok(), `搜小区失败：${commRes.status()} ${await commRes.text()}`).toBeTruthy();
  const comm = ((await commRes.json()) as { items: { id: string; name: string }[] }).items.find(
    (c) => c.name === "呼玛二村",
  );
  expect(comm, "本地字典应存在「呼玛二村」").toBeTruthy();

  const bldRes = await api.ctx.get(
    `/api/v1/admin/building-dictionary/communities/${comm!.id}/buildings?keyword=285&page=1&page_size=10`,
  );
  expect(bldRes.ok(), `搜楼栋失败：${bldRes.status()} ${await bldRes.text()}`).toBeTruthy();
  const items = ((await bldRes.json()) as { items: { id: number; building_no: string }[] }).items;
  const building =
    items.find((b) => b.building_no === "285") ?? items.find((b) => b.building_no.includes("285"));
  expect(building, "呼玛二村应有 285 号楼栋").toBeTruthy();
  return { communityId: comm!.id, buildingId: building!.id };
}

async function gotoLeadRow(page: Page, community: string) {
  await page.goto("/admin/leads", { waitUntil: "domcontentloaded" });
  const search = page.getByPlaceholder(/搜索/).first();
  await search.fill(community);
  await page.waitForTimeout(800);
  return page.getByRole("row", { name: new RegExp(community) }).first();
}

test("线索列表/抽屉/详情的楼栋量词统一为「号」", async ({ page }) => {
  const { communityId, buildingId } = await findBuilding285();

  const res = await api.ctx.post("/api/v1/leads", {
    data: {
      community_name: communityName,
      community_id: communityId,
      building_id: buildingId,
      dict_status: "linked",
      layout: "2室1厅",
      area: 88.5,
      total_price: 520,
      orientation: "南",
      district: "静安区",
      business_area: "彭浦",
    },
  });
  expect(res.ok(), `造线索失败：${res.status()} ${await res.text()}`).toBeTruthy();
  leadId = ((await res.json()) as { id: string }).id;
  saveArtifact("created-lead.json", { leadId, communityId, buildingId });

  await loginPage(page);

  // ① 列表行：小区名下方的字典地址行显示「285号」
  const row = await gotoLeadRow(page, communityName);
  await expect(row).toBeVisible();
  await expect(row.getByText("285号")).toBeVisible();
  await expect(row.getByText("285栋")).toHaveCount(0);
  await page.screenshot({ path: join(ARTIFACT_DIR, "list-row.png"), fullPage: false });

  // ② 详情抽屉（InfoTab）：楼栋格子显示「285号」
  await row.click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("285号")).toBeVisible({ timeout: 15000 });
  await expect(drawer.getByText("285栋")).toHaveCount(0);
  await page.screenshot({ path: join(ARTIFACT_DIR, "drawer.png"), fullPage: false });
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden({ timeout: 10000 });

  // ③ 详情页（LeadBasicInfo）：基础信息楼栋字段显示「285号」
  await page.goto(`/admin/leads/${leadId}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByText("285号").first()).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("285栋")).toHaveCount(0);
  saveArtifact("labels-ok.json", { leadId, list: "285号", drawer: "285号", detail: "285号" });
  await page.screenshot({ path: join(ARTIFACT_DIR, "detail.png"), fullPage: false });
});
